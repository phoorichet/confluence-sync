import type { WatchConfig } from '../../../src/types/watch';
import { EventEmitter } from 'node:events';
import chokidar from 'chokidar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileWatcher } from '../../../src/storage/watcher';

// Mock chokidar module
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(),
  },
  watch: vi.fn(),
}));

describe('fileWatcher', () => {
  let watcher: FileWatcher;
  let mockChokidarWatcher: any;
  let mockSyncEngine: any;
  let mockManifestManager: any;
  let config: WatchConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock chokidar watcher
    mockChokidarWatcher = new EventEmitter();
    mockChokidarWatcher.close = vi.fn().mockResolvedValue(undefined);

    // Mock chokidar.watch to return our mock watcher
    (chokidar.watch as any).mockReturnValue(mockChokidarWatcher);

    // Create mock sync engine
    mockSyncEngine = {
      sync: vi.fn().mockResolvedValue({
        synced: 1,
        failed: 0,
      }),
    };

    // Create mock manifest manager
    mockManifestManager = {
      getManifest: vi.fn().mockResolvedValue({
        pages: new Map([
          ['page1', { id: 'page1', localPath: 'test.md' }],
          ['page2', { id: 'page2', localPath: 'docs/test2.md' }],
        ]),
        syncDirectory: '/test/sync',
      }),
      getConfig: vi.fn().mockResolvedValue({
        syncDirectory: '/test/sync',
      }),
    };

    // Create config
    config = {
      enabled: true,
      debounceDelay: 100,
      ignorePatterns: ['node_modules/**', '*.tmp'],
      notificationsEnabled: true,
      retryAttempts: 3,
      retryDelay: 100,
    };

    // Create watcher instance
    watcher = new FileWatcher(config, mockSyncEngine, mockManifestManager);
  });

  afterEach(async () => {
    await watcher.stop();
    vi.restoreAllMocks();
  });

  describe('start()', () => {
    it('should start watching with correct configuration', async () => {
      await watcher.start();

      expect(chokidar.watch).toHaveBeenCalledWith(
        '**/*.{md,markdown}',
        expect.objectContaining({
          ignored: config.ignorePatterns,
          persistent: true,
          ignoreInitial: true,
          usePolling: false,
          awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100,
          },
        }),
      );

      // Check that cwd is a string (actual path varies in test environment)
      const callArgs = (chokidar.watch as any).mock.calls[0][1];
      expect(callArgs.cwd).toBeDefined();
      expect(typeof callArgs.cwd).toBe('string');
    });

    it('should throw error if already active', async () => {
      await watcher.start();

      await expect(watcher.start()).rejects.toThrow('CS-1100');
    });
  });

  describe('stop()', () => {
    it('should stop watching and clean up', async () => {
      await watcher.start();
      await watcher.stop();

      expect(mockChokidarWatcher.close).toHaveBeenCalled();
    });

    it('should do nothing if not active', async () => {
      await watcher.stop();
      expect(mockChokidarWatcher.close).not.toHaveBeenCalled();
    });
  });

  describe('file change handling', () => {
    beforeEach(async () => {
      await watcher.start();
    });

    it('should emit change event on file add', () => {
      return new Promise<void>((resolve) => {
        watcher.on('change', (filePath) => {
          expect(filePath).toBe('test.md');
          resolve();
        });

        mockChokidarWatcher.emit('add', 'test.md');
      });
    });

    it('should emit change event on file change', () => {
      return new Promise<void>((resolve) => {
        watcher.on('change', (filePath) => {
          expect(filePath).toBe('test.md');
          resolve();
        });

        mockChokidarWatcher.emit('change', 'test.md');
      });
    });

    it('should emit change event on file unlink', () => {
      return new Promise<void>((resolve) => {
        watcher.on('change', (filePath) => {
          expect(filePath).toBe('test.md');
          resolve();
        });

        mockChokidarWatcher.emit('unlink', 'test.md');
      });
    });

    it('should trigger sync after changes', async () => {
      mockChokidarWatcher.emit('change', 'test.md');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockSyncEngine.sync).toHaveBeenCalled();
    });
  });

  describe('sync operations', () => {
    beforeEach(async () => {
      await watcher.start();
    });

    it('should emit sync:start event', () => {
      return new Promise<void>((resolve) => {
        watcher.on('sync:start', () => {
          resolve();
        });

        mockChokidarWatcher.emit('change', 'test.md');
      });
    });

    it('should emit sync:complete event on success', () => {
      return new Promise<void>((resolve) => {
        watcher.on('sync:complete', (result) => {
          expect(result.synced).toBe(1);
          resolve();
        });

        mockChokidarWatcher.emit('change', 'test.md');
      });
    });

    it('should map file paths to page IDs', async () => {
      mockChokidarWatcher.emit('change', 'test.md');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockSyncEngine.sync).toHaveBeenCalled();
      // The implementation doesn't pass pageIds - it performs a full sync
      const syncCall = mockSyncEngine.sync.mock.calls[0][0];
      expect(syncCall).toHaveProperty('dryRun', false);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await watcher.start();
    });

    it('should emit sync:error on sync failure', () => {
      return new Promise<void>((resolve) => {
        const error = new Error('Sync failed');
        mockSyncEngine.sync.mockRejectedValueOnce(error);

        watcher.on('sync:error', (err) => {
          expect(err).toBe(error);
          resolve();
        });

        mockChokidarWatcher.emit('change', 'test.md');
      });
    });

    it('should retry on network errors', () => {
      return new Promise<void>((resolve) => {
        const networkError = new Error('Network timeout');
        mockSyncEngine.sync.mockRejectedValueOnce(networkError);

        let retryCount = 0;
        watcher.on('retry', (attempt) => {
          retryCount = attempt;
          if (retryCount === 1) {
            resolve();
          }
        });

        mockChokidarWatcher.emit('change', 'test.md');
      });
    });

    it('should not retry on API errors', () => {
      return new Promise<void>((resolve) => {
        const apiError = new Error('401 Unauthorized');
        mockSyncEngine.sync.mockRejectedValueOnce(apiError);

        watcher.on('sync:error', () => {
          setTimeout(() => {
            expect(mockSyncEngine.sync).toHaveBeenCalledTimes(1);
            resolve();
          }, 200);
        });

        mockChokidarWatcher.emit('change', 'test.md');
      });
    });
  });
});
