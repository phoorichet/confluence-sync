import type { Page } from '../../../src/storage/manifest-manager';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../src/api/client';
import { ConfluenceToMarkdownConverter } from '../../../src/converters/confluence-to-markdown';
import { MarkdownToConfluenceConverter } from '../../../src/converters/markdown-to-confluence';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { ChangeDetector } from '../../../src/sync/change-detector';
import { SyncEngine } from '../../../src/sync/engine';
import { logger } from '../../../src/utils/logger';

describe('sync Integration Tests', () => {
  const testDir = path.join(__dirname, 'test-workspace');
  const _manifestPath = path.join(testDir, '.confluence-sync.json');
  let syncEngine: SyncEngine;
  let manifestManager: ManifestManager;
  let originalCwd: string;

  beforeEach(() => {
    // Save original working directory
    originalCwd = process.cwd();
    // Clear all singletons
    SyncEngine.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    ChangeDetector.clearInstance();

    // Create test directory
    mkdirSync(testDir, { recursive: true });
    
    // Change to test directory
    process.chdir(testDir);

    // Get instances
    syncEngine = SyncEngine.getInstance();
    manifestManager = ManifestManager.getInstance();

    // Mock logger
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Mock API client
    vi.spyOn(apiClient, 'initialize').mockResolvedValue();
  });

  afterEach(() => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });

    // Clear all singletons
    SyncEngine.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    ChangeDetector.clearInstance();
    
    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe('bi-directional sync workflow', () => {
    it('should sync local and remote changes in a single operation', async () => {
      // Setup test files
      const localFile1 = path.join(testDir, 'local-changed.md');
      const localFile2 = path.join(testDir, 'remote-changed.md');
      const localFile3 = path.join(testDir, 'unchanged.md');

      writeFileSync(localFile1, '# Local Changed Content');
      writeFileSync(localFile2, '# Original Content');
      writeFileSync(localFile3, '# Unchanged Content');
      
      // Mock FileManager
      const fileManager = FileManager.getInstance();
      vi.spyOn(fileManager, 'readFile').mockImplementation((filePath: string) => {
        // Check if it's already an absolute path
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(testDir, filePath);
        return Promise.resolve(readFileSync(fullPath, 'utf-8'));
      });
      vi.spyOn(fileManager, 'writeFile').mockResolvedValue(path.join(testDir, 'test.md'));

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
      vi.spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      vi.spyOn(manifestManager, 'updatePage').mockResolvedValue();
      vi.spyOn(manifestManager, 'save').mockResolvedValue();
      
      // Mock ChangeDetector
      const changeDetector = ChangeDetector.getInstance();
      vi.spyOn(changeDetector, 'getChangeState').mockImplementation(async (page: Page) => {
        if (page.id === 'page1') {
          return 'local-only'; // Local changes
        } else if (page.id === 'page2') {
          return 'remote-only'; // Remote changes
        } else {
          return 'unchanged'; // No changes
        }
      });

      // Mock API responses
      vi.spyOn(apiClient, 'getPage')
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

      vi.spyOn(apiClient, 'updatePage').mockResolvedValue({
        id: 'page1',
        version: { number: 2 },
      } as any);
      
      // Mock converters
      vi.spyOn(MarkdownToConfluenceConverter.prototype, 'convert').mockResolvedValue('<p>Converted HTML</p>');
      vi.spyOn(ConfluenceToMarkdownConverter.prototype, 'convert').mockResolvedValue('# Converted Markdown');

      // Execute sync
      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: true,
      });

      // Verify results
      if (result.errors.length > 0) {
        console.log('Sync errors:', result.errors);
      }
      expect(result.operation.status).toBe('completed');
      expect(result.pushed.length).toBeGreaterThan(0);
      expect(result.pulled.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect and report conflicts correctly', async () => {
      // Setup conflicted file
      const conflictFile = path.join(testDir, 'conflict.md');
      writeFileSync(conflictFile, '# Local Changed Content');
      
      // Mock FileManager
      const fileManager = FileManager.getInstance();
      vi.spyOn(fileManager, 'readFile').mockImplementation((filePath: string) => {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(testDir, filePath);
        return Promise.resolve(readFileSync(fullPath, 'utf-8'));
      });

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

      vi.spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      vi.spyOn(manifestManager, 'save').mockResolvedValue();
      
      // Mock ChangeDetector to return conflict
      const changeDetector = ChangeDetector.getInstance();
      vi.spyOn(changeDetector, 'getChangeState').mockResolvedValue('both-changed');

      // Mock both local and remote changes
      vi.spyOn(apiClient, 'getPage').mockResolvedValue({
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
      
      // Mock FileManager
      const fileManager = FileManager.getInstance();
      vi.spyOn(fileManager, 'readFile').mockImplementation((filePath: string) => {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(testDir, filePath);
        return Promise.resolve(readFileSync(fullPath, 'utf-8'));
      });

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

      vi.spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      vi.spyOn(manifestManager, 'save').mockResolvedValue();
      
      // Mock ChangeDetector to return local changes
      const changeDetector = ChangeDetector.getInstance();
      vi.spyOn(changeDetector, 'getChangeState').mockResolvedValue('local-only');
      
      // Mock converters
      vi.spyOn(MarkdownToConfluenceConverter.prototype, 'convert').mockResolvedValue('<p>Converted HTML</p>');
      
      const updateSpy = vi.spyOn(apiClient, 'updatePage');
      const manifestUpdateSpy = vi.spyOn(manifestManager, 'updatePage');

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
      
      // Mock FileManager
      const fileManager = FileManager.getInstance();
      vi.spyOn(fileManager, 'readFile').mockImplementation((filePath: string) => {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(testDir, filePath);
        return Promise.resolve(readFileSync(fullPath, 'utf-8'));
      });

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

      vi.spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      vi.spyOn(manifestManager, 'save').mockResolvedValue();
      
      // Mock ChangeDetector to return local changes
      const changeDetector = ChangeDetector.getInstance();
      vi.spyOn(changeDetector, 'getChangeState').mockResolvedValue('local-only');
      
      // Mock converters
      vi.spyOn(MarkdownToConfluenceConverter.prototype, 'convert').mockResolvedValue('<p>Converted HTML</p>');

      // Mock API error
      vi.spyOn(apiClient, 'updatePage').mockRejectedValue(new Error('API Error'));

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
      
      // Mock FileManager
      const fileManager = FileManager.getInstance();
      vi.spyOn(fileManager, 'readFile').mockImplementation((filePath: string) => {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(testDir, filePath);
        return Promise.resolve(readFileSync(fullPath, 'utf-8'));
      });

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

      vi.spyOn(manifestManager, 'load').mockResolvedValue(testManifest);
      vi.spyOn(manifestManager, 'updatePage').mockResolvedValue();
      vi.spyOn(manifestManager, 'save').mockResolvedValue();
      
      // Mock ChangeDetector to return local changes for all pages
      const changeDetector = ChangeDetector.getInstance();
      vi.spyOn(changeDetector, 'getChangeState').mockResolvedValue('local-only');
      
      // Mock converters
      vi.spyOn(MarkdownToConfluenceConverter.prototype, 'convert').mockResolvedValue('<p>Converted HTML</p>');

      let concurrentCalls = 0;
      let maxConcurrent = 0;

      vi.spyOn(apiClient, 'updatePage').mockImplementation(async () => {
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
