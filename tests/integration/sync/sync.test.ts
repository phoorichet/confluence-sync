import type { Page } from '../../../src/storage/manifest-manager';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { apiClient } from '../../../src/api/client';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { SyncEngine } from '../../../src/sync/engine';
import { logger } from '../../../src/utils/logger';

describe('Sync Integration Tests', () => {
  const testDir = path.join(__dirname, 'test-workspace');
  const manifestPath = path.join(testDir, '.confluence-sync.json');
  let syncEngine: SyncEngine;
  let manifestManager: ManifestManager;

  beforeEach(() => {
    // Clear singletons
    SyncEngine.clearInstance();
    ManifestManager.clearInstance();

    // Create test directory
    mkdirSync(testDir, { recursive: true });

    // Get instances
    syncEngine = SyncEngine.getInstance();
    manifestManager = ManifestManager.getInstance();

    // Mock logger
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'warn').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});

    // Mock API client
    spyOn(apiClient, 'initialize').mockResolvedValue();
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });

    // Clear singletons
    SyncEngine.clearInstance();
    ManifestManager.clearInstance();
  });

  describe('Bi-directional sync workflow', () => {
    it('should sync local and remote changes in a single operation', async () => {
      // Setup test files
      const localFile1 = path.join(testDir, 'local-changed.md');
      const localFile2 = path.join(testDir, 'remote-changed.md');
      const localFile3 = path.join(testDir, 'unchanged.md');

      writeFileSync(localFile1, '# Local Changed Content');
      writeFileSync(localFile2, '# Original Content');
      writeFileSync(localFile3, '# Unchanged Content');

      // Setup manifest with test pages
      const testManifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual' as const,
        pages: new Map<string, Page>([
          ['page1', {
            id: 'page1',
            spaceKey: 'TEST',
            title: 'Local Changed',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'local-changed.md',
            contentHash: 'old-hash-1', // Different from actual file
            status: 'synced' as const,
          }],
          ['page2', {
            id: 'page2',
            spaceKey: 'TEST',
            title: 'Remote Changed',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'remote-changed.md',
            contentHash: 'hash-2',
            status: 'synced' as const,
          }],
          ['page3', {
            id: 'page3',
            spaceKey: 'TEST',
            title: 'Unchanged',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'unchanged.md',
            contentHash: 'hash-3',
            status: 'synced' as const,
          }],
        ]),
      };

      // Mock manifest operations
      spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      spyOn(manifestManager, 'updatePage').mockResolvedValue();

      // Mock API responses
      spyOn(apiClient, 'getPage')
        .mockImplementation(async (pageId: string) => {
          if (pageId === 'page2') {
            // Remote changed page
            return {
              id: 'page2',
              version: { number: 2 }, // Version changed
              body: { storage: { value: '<p>Remote changed content</p>' } },
            } as any;
          }
          // Other pages unchanged remotely
          return {
            id: pageId,
            version: { number: 1 },
            body: { storage: { value: '<p>Original content</p>' } },
          } as any;
        });

      spyOn(apiClient, 'updatePage').mockResolvedValue({
        id: 'page1',
        version: { number: 2 },
      } as any);

      // Execute sync
      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: true,
      });

      // Verify results
      expect(result.operation.status).toBe('completed');
      expect(result.pushed.length).toBeGreaterThan(0);
      expect(result.pulled.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect and report conflicts correctly', async () => {
      // Setup conflicted file
      const conflictFile = path.join(testDir, 'conflict.md');
      writeFileSync(conflictFile, '# Local Changed Content');

      const testManifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual' as const,
        pages: new Map<string, Page>([
          ['page1', {
            id: 'page1',
            spaceKey: 'TEST',
            title: 'Conflicted Page',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'conflict.md',
            contentHash: 'base-hash',
            status: 'synced' as const,
          }],
        ]),
      };

      spyOn(manifestManager, 'load').mockResolvedValue(testManifest);

      // Mock both local and remote changes
      spyOn(apiClient, 'getPage').mockResolvedValue({
        id: 'page1',
        version: { number: 2 }, // Remote changed
        body: { storage: { value: '<p>Remote changed content</p>' } },
      } as any);

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      // Should detect conflict
      expect(result.conflicted.length).toBeGreaterThan(0);
      expect(result.pushed).toHaveLength(0);
      expect(result.pulled).toHaveLength(0);
    });

    it('should respect dry-run mode and not make changes', async () => {
      const testFile = path.join(testDir, 'test.md');
      writeFileSync(testFile, '# Test Content');

      const testManifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual' as const,
        pages: new Map<string, Page>([
          ['page1', {
            id: 'page1',
            spaceKey: 'TEST',
            title: 'Test Page',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'test.md',
            contentHash: 'old-hash',
            status: 'synced' as const,
          }],
        ]),
      };

      spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      const updateSpy = spyOn(apiClient, 'updatePage');
      const manifestUpdateSpy = spyOn(manifestManager, 'updatePage');

      const result = await syncEngine.sync({
        dryRun: true,
        maxConcurrent: 5,
        verbose: false,
      });

      // Should not call actual update methods
      expect(updateSpy).not.toHaveBeenCalled();
      expect(manifestUpdateSpy).not.toHaveBeenCalled();
      expect(result.pushed.length).toBeGreaterThan(0); // Should still report what would be pushed
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[DRY-RUN]'));
    });

    it('should handle errors gracefully', async () => {
      const testFile = path.join(testDir, 'error.md');
      writeFileSync(testFile, '# Error Test');

      const testManifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual' as const,
        pages: new Map<string, Page>([
          ['page1', {
            id: 'page1',
            spaceKey: 'TEST',
            title: 'Error Page',
            version: 1,
            parentId: null,
            lastModified: new Date(),
            localPath: 'error.md',
            contentHash: 'old-hash',
            status: 'synced' as const,
          }],
        ]),
      };

      spyOn(manifestManager, 'load').mockResolvedValue(testManifest);

      // Mock API error
      spyOn(apiClient, 'updatePage').mockRejectedValue(new Error('API Error'));

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.operation.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('CS-703');
    });

    it('should handle concurrent operations with rate limiting', async () => {
      // Create multiple test files
      const files = [];
      for (let i = 1; i <= 10; i++) {
        const filePath = path.join(testDir, `file${i}.md`);
        writeFileSync(filePath, `# File ${i} Content`);
        files.push(filePath);
      }

      // Create manifest with multiple pages
      const pages = new Map<string, Page>();
      for (let i = 1; i <= 10; i++) {
        pages.set(`page${i}`, {
          id: `page${i}`,
          spaceKey: 'TEST',
          title: `Page ${i}`,
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: `file${i}.md`,
          contentHash: 'old-hash',
          status: 'synced' as const,
        });
      }

      const testManifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual' as const,
        pages,
      };

      spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      spyOn(manifestManager, 'updatePage').mockResolvedValue();

      let concurrentCalls = 0;
      let maxConcurrent = 0;

      spyOn(apiClient, 'updatePage').mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 10));

        concurrentCalls--;
        return { id: 'page', version: { number: 2 } } as any;
      });

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 3, // Limit concurrency
        verbose: false,
      });

      // Should respect concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(result.pushed.length).toBeGreaterThan(0);
    });
  });
});
