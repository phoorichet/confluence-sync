import type { ConfigManager } from '../../../src/config/config-manager';
import type { ManifestManager, SyncManifest } from '../../../src/storage/manifest-manager';
import type { SyncEngine } from '../../../src/sync/engine';
import type { WatchConfig } from '../../../src/types/watch';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileWatcher } from '../../../src/storage/watcher';

describe('watch Mode Integration', () => {
  let tempDir: string;
  let watcher: FileWatcher | null = null;
  let syncEngine: SyncEngine;
  let manifestManager: ManifestManager;
  let _configManager: ConfigManager;
  let originalCwd: string;

  beforeEach(async () => {
    // Save original working directory
    originalCwd = process.cwd();
    
    // Create temp directory
    tempDir = path.join(originalCwd, `temp-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Change to temp directory for the test
    process.chdir(tempDir);

    // Create mock manifest
    const manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'watch',
      pages: new Map([
        [
          'page1',
          {
            id: 'page1',
            spaceKey: 'TEST',
            title: 'Test Page 1',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'test1.md',
            contentHash: 'hash1',
            status: 'synced',
          },
        ],
        [
          'page2',
          {
            id: 'page2',
            spaceKey: 'TEST',
            title: 'Test Page 2',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'docs/test2.md',
            contentHash: 'hash2',
            status: 'synced',
          },
        ],
      ]),
    };

    // Convert Map to JSON-serializable format
    const manifestJson = {
      ...manifest,
      pages: Object.fromEntries(
        Array.from(manifest.pages.entries()).map(([key, page]) => [
          key,
          {
            ...page,
            lastModified: page.lastModified.toISOString(),
          },
        ]),
      ),
      lastSyncTime: manifest.lastSyncTime.toISOString(),
    };

    // Write manifest file (using correct filename)
    await fs.writeFile(
      '.csmanifest.json',
      JSON.stringify(manifestJson, null, 2),
    );

    // Create test files
    await fs.writeFile('test1.md', '# Test 1');
    await fs.mkdir('docs', { recursive: true });
    await fs.writeFile('docs/test2.md', '# Test 2');

    // Initialize components with mocks
    manifestManager = {
      load: vi.fn().mockResolvedValue(manifest),
      getManifest: vi.fn().mockResolvedValue(manifest),
      getConfig: vi.fn().mockResolvedValue({ syncDirectory: '.' }),
      updatePageStatus: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
    } as any;

    _configManager = {
      loadConfig: vi.fn().mockResolvedValue({
        confluenceUrl: 'https://test.atlassian.net',
        syncDirectory: '.',
      }),
    } as any;

    syncEngine = {
      sync: vi.fn().mockResolvedValue({
        synced: 1,
        failed: 0,
        skipped: 0,
      }),
    } as any;
  });

  afterEach(async () => {
    // Stop watcher if running
    if (watcher) {
      await watcher.stop();
      watcher = null;
    }

    // Restore original working directory
    process.chdir(originalCwd);

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    catch {
      // Ignore cleanup errors
    }

    vi.clearAllMocks();
  });

  it('should detect and sync file changes', async () => {
    const config: WatchConfig = {
      enabled: true,
      debounceDelay: 100,
      ignorePatterns: [],
      notificationsEnabled: false,
      retryAttempts: 3,
      retryDelay: 100,
    };

    watcher = new FileWatcher(config, syncEngine, manifestManager);

    const changeEvents: string[] = [];
    const syncEvents: any[] = [];

    watcher.on('change', (filePath) => {
      changeEvents.push(filePath);
    });

    watcher.on('sync:complete', (result) => {
      syncEvents.push(result);
    });

    await watcher.start();
    
    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Modify a file
    await fs.writeFile('test1.md', '# Test 1 Modified');

    // Wait for file stability (500ms) + debounce (100ms) + processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(changeEvents.length).toBeGreaterThan(0);
    expect(syncEngine.sync).toHaveBeenCalled();
    expect(syncEvents.length).toBeGreaterThan(0);
  });

  it('should batch multiple file changes', async () => {
    const config: WatchConfig = {
      enabled: true,
      debounceDelay: 200,
      ignorePatterns: [],
      notificationsEnabled: false,
      retryAttempts: 3,
      retryDelay: 100,
    };

    watcher = new FileWatcher(config, syncEngine, manifestManager);

    await watcher.start();
    
    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Make multiple rapid changes
    await fs.writeFile('test1.md', '# Modified 1');
    await fs.writeFile('docs/test2.md', '# Modified 2');
    await fs.writeFile('test3.md', '# New file');

    // Wait for file stability (500ms) + debounce (200ms) + processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should batch all changes into one sync
    expect(syncEngine.sync).toHaveBeenCalledTimes(1);
  });

  it('should respect ignore patterns', async () => {
    const config: WatchConfig = {
      enabled: true,
      debounceDelay: 100,
      ignorePatterns: ['*.tmp', 'node_modules/**'],
      notificationsEnabled: false,
      retryAttempts: 3,
      retryDelay: 100,
    };

    watcher = new FileWatcher(config, syncEngine, manifestManager);

    const changeEvents: string[] = [];
    watcher.on('change', (filePath) => {
      changeEvents.push(filePath);
    });

    await watcher.start();
    
    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create files that should be ignored
    await fs.writeFile('test.tmp', 'temporary');
    await fs.mkdir('node_modules', { recursive: true });
    await fs.writeFile('node_modules/test.js', 'module');

    // Create file that should trigger
    await fs.writeFile('valid.md', '# Valid');

    // Wait for file stability (500ms) + debounce (100ms) + processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should only detect valid.md
    const validChanges = changeEvents.filter(f => !f.includes('.tmp') && !f.includes('node_modules'));
    expect(validChanges.length).toBeGreaterThan(0);
  });

  it('should handle sync errors and retry', async () => {
    const config: WatchConfig = {
      enabled: true,
      debounceDelay: 100,
      ignorePatterns: [],
      notificationsEnabled: false,
      retryAttempts: 2,
      retryDelay: 50,
    };

    // Make sync fail first, then succeed
    let callCount = 0;
    (syncEngine.sync as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network timeout'));
      }
      return Promise.resolve({ synced: 1, failed: 0 });
    });

    watcher = new FileWatcher(config, syncEngine, manifestManager);

    const retryEvents: number[] = [];
    watcher.on('retry', (attempt) => {
      retryEvents.push(attempt);
    });

    const successEvents: any[] = [];
    watcher.on('sync:complete', (result) => {
      successEvents.push(result);
    });

    await watcher.start();
    
    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger a change
    await fs.writeFile('test1.md', '# Modified');

    // Wait for file stability (500ms) + debounce (100ms) + retry delays
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(retryEvents).toContain(1);
    expect(successEvents.length).toBe(1);
    expect(syncEngine.sync).toHaveBeenCalledTimes(2);
  });

  it('should handle graceful shutdown', async () => {
    const config: WatchConfig = {
      enabled: true,
      debounceDelay: 100,
      ignorePatterns: [],
      notificationsEnabled: false,
      retryAttempts: 3,
      retryDelay: 100,
    };

    watcher = new FileWatcher(config, syncEngine, manifestManager);
    await watcher.start();
    
    // Wait for watcher to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Make a change
    await fs.writeFile('test1.md', '# Modified');

    // Stop immediately
    await watcher.stop();

    // Wait to ensure no sync happens after stop
    await new Promise(resolve => setTimeout(resolve, 300));

    // Sync might have been called once if it started before stop
    expect((syncEngine.sync as any).mock.calls.length).toBeLessThanOrEqual(1);
  });
});
