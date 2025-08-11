import type { WatchConfig } from '../../../src/types/watch';
import { EventEmitter } from 'node:events';
import * as chokidar from 'chokidar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileWatcher } from '../../../src/storage/watcher';

vi.mock('chokidar');
vi.mock('../../../src/utils/logger');
vi.mock('../../../src/utils/debounce', () => ({
  // eslint-disable-next-line ts/no-unsafe-function-type
  debounce: (fn: Function, _delay: number) => {
    const debounced = (...args: any[]) => {
      return fn(...args);
    };
    debounced.cancel = vi.fn();
    return debounced;
  },
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

    (chokidar.watch as any) = vi.fn().mockReturnValue(mockChokidarWatcher);

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
        pages: [
          { id: 'page1', localPath: 'test.md' },
          { id: 'page2', localPath: 'docs/test2.md' },
        ],
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
          cwd: '/test/sync',
          ignored: config.ignorePatterns,
          persistent: true,
          ignoreInitial: true,
          usePolling: false,
        }),
      );
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

    it('should emit change event on file add', (done) => {
      watcher.on('change', (filePath) => {
        expect(filePath).toBe('test.md');
        done();
      });

      mockChokidarWatcher.emit('add', 'test.md');
    });

    it('should emit change event on file change', (done) => {
      watcher.on('change', (filePath) => {
        expect(filePath).toBe('test.md');
        done();
      });

      mockChokidarWatcher.emit('change', 'test.md');
    });

    it('should emit change event on file unlink', (done) => {
      watcher.on('change', (filePath) => {
        expect(filePath).toBe('test.md');
        done();
      });

      mockChokidarWatcher.emit('unlink', 'test.md');
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

    it('should emit sync:start event', (done) => {
      watcher.on('sync:start', () => {
        done();
      });

      mockChokidarWatcher.emit('change', 'test.md');
    });

    it('should emit sync:complete event on success', (done) => {
      watcher.on('sync:complete', (result) => {
        expect(result.synced).toBe(1);
        done();
      });

      mockChokidarWatcher.emit('change', 'test.md');
    });

    it('should map file paths to page IDs', async () => {
      mockChokidarWatcher.emit('change', 'test.md');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockSyncEngine.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          pageIds: ['page1'],
        }),
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await watcher.start();
    });

    it('should emit sync:error on sync failure', (done) => {
      const error = new Error('Sync failed');
      mockSyncEngine.sync.mockRejectedValueOnce(error);

      watcher.on('sync:error', (err) => {
        expect(err).toBe(error);
        done();
      });

      mockChokidarWatcher.emit('change', 'test.md');
    });

    it('should retry on network errors', (done) => {
      const networkError = new Error('Network timeout');
      mockSyncEngine.sync.mockRejectedValueOnce(networkError);

      let retryCount = 0;
      watcher.on('retry', (attempt) => {
        retryCount = attempt;
        if (retryCount === 1) {
          done();
        }
      });

      mockChokidarWatcher.emit('change', 'test.md');
    });

    it('should not retry on API errors', (done) => {
      const apiError = new Error('401 Unauthorized');
      mockSyncEngine.sync.mockRejectedValueOnce(apiError);

      watcher.on('sync:error', () => {
        setTimeout(() => {
          expect(mockSyncEngine.sync).toHaveBeenCalledTimes(1);
          done();
        }, 200);
      });

      mockChokidarWatcher.emit('change', 'test.md');
    });
  });
});
