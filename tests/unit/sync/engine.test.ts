import type { Page } from '../../../src/storage/manifest-manager';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { apiClient } from '../../../src/api/client';
import { ConfluenceToMarkdownConverter } from '../../../src/converters/confluence-to-markdown';
import { MarkdownToConfluenceConverter } from '../../../src/converters/markdown-to-confluence';
import { BackupManager } from '../../../src/storage/backup-manager';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { ChangeDetector } from '../../../src/sync/change-detector';
import { ConflictResolver } from '../../../src/sync/conflict-resolver';
import { SyncEngine } from '../../../src/sync/engine';
import { logger } from '../../../src/utils/logger';

describe('SyncEngine', () => {
  let syncEngine: SyncEngine;
  let manifestManager: ManifestManager;
  let fileManager: FileManager;
  let changeDetector: ChangeDetector;
  let conflictResolver: ConflictResolver;
  let backupManager: BackupManager;

  beforeEach(() => {
    // Clear singletons
    SyncEngine.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    ChangeDetector.clearInstance();
    ConflictResolver.clearInstance();
    BackupManager.clearInstance();

    // Get instances
    syncEngine = SyncEngine.getInstance();
    manifestManager = ManifestManager.getInstance();
    fileManager = FileManager.getInstance();
    changeDetector = ChangeDetector.getInstance();
    conflictResolver = ConflictResolver.getInstance();
    backupManager = BackupManager.getInstance();

    // Mock logger
    spyOn(logger, 'info').mockImplementation(() => {});
    spyOn(logger, 'warn').mockImplementation(() => {});
    spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    SyncEngine.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    ChangeDetector.clearInstance();
    ConflictResolver.clearInstance();
    BackupManager.clearInstance();
  });

  describe('detectChanges', () => {
    it('should categorize changes correctly', async () => {
      const mockPages = new Map<string, Page>([
        ['page1', {
          id: 'page1',
          spaceKey: 'TEST',
          title: 'Page 1',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page1.md',
          contentHash: 'hash1',
          status: 'synced',
        }],
        ['page2', {
          id: 'page2',
          spaceKey: 'TEST',
          title: 'Page 2',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page2.md',
          contentHash: 'hash2',
          status: 'synced',
        }],
        ['page3', {
          id: 'page3',
          spaceKey: 'TEST',
          title: 'Page 3',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page3.md',
          contentHash: 'hash3',
          status: 'synced',
        }],
      ]);

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: mockPages,
      });

      // Mock change detection
      const detectSpy = spyOn(changeDetector, 'getChangeState');
      detectSpy.mockResolvedValueOnce('local-only'); // page1
      detectSpy.mockResolvedValueOnce('remote-only'); // page2
      detectSpy.mockResolvedValueOnce('conflicted'); // page3

      const changes = await syncEngine.detectChanges();

      expect(changes.localOnly.size).toBe(1);
      expect(changes.localOnly.has('page1')).toBe(true);
      expect(changes.remoteOnly.size).toBe(1);
      expect(changes.remoteOnly.has('page2')).toBe(true);
      expect(changes.conflicts.size).toBe(1);
      expect(changes.conflicts.has('page3')).toBe(true);
    });

    it('should handle change detection errors', async () => {
      const mockPages = new Map<string, Page>([
        ['page1', {
          id: 'page1',
          spaceKey: 'TEST',
          title: 'Page 1',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page1.md',
          contentHash: 'hash1',
          status: 'synced',
        }],
      ]);

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: mockPages,
      });

      spyOn(changeDetector, 'getChangeState').mockRejectedValue(new Error('Detection failed'));

      await expect(syncEngine.detectChanges()).rejects.toThrow('CS-702');
    });
  });

  describe('sync', () => {
    it('should handle successful sync with no changes', async () => {
      spyOn(apiClient, 'initialize').mockResolvedValue();

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map(),
      });

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.operation.status).toBe('completed');
      expect(result.pushed).toHaveLength(0);
      expect(result.pulled).toHaveLength(0);
      expect(result.conflicted).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should process local changes for push', async () => {
      const mockPage: Page = {
        id: 'page1',
        spaceKey: 'TEST',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'modified',
      };

      spyOn(apiClient, 'initialize').mockResolvedValue();
      spyOn(apiClient, 'updatePage').mockResolvedValue({
        id: 'page1',
        version: { number: 2 },
      } as any);

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([['page1', mockPage]]),
      });

      spyOn(manifestManager, 'updatePage').mockResolvedValue();
      spyOn(changeDetector, 'getChangeState').mockResolvedValue('local-only');
      spyOn(fileManager, 'readFile').mockResolvedValue('# Test Content');
      spyOn(fileManager, 'calculateHash').mockResolvedValue('new-hash');

      const convertSpy = spyOn(MarkdownToConfluenceConverter.prototype, 'convert')
        .mockResolvedValue('<p>Test Content</p>');

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.pushed).toContain('page1.md');
      expect(result.operation.status).toBe('completed');
      expect(convertSpy).toHaveBeenCalledWith('# Test Content');
      expect(apiClient.updatePage).toHaveBeenCalledWith('page1', '<p>Test Content</p>', 2);
    });

    it('should process remote changes for pull', async () => {
      const mockPage: Page = {
        id: 'page1',
        spaceKey: 'TEST',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'synced',
      };

      spyOn(apiClient, 'initialize').mockResolvedValue();
      spyOn(apiClient, 'getPage').mockResolvedValue({
        id: 'page1',
        version: { number: 2 },
        body: { storage: { value: '<p>Remote content</p>' } },
      } as any);

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([['page1', mockPage]]),
      });

      spyOn(manifestManager, 'updatePage').mockResolvedValue();
      spyOn(changeDetector, 'getChangeState').mockResolvedValue('remote-only');
      spyOn(fileManager, 'writeFile').mockResolvedValue('page1.md');
      spyOn(fileManager, 'readFile').mockResolvedValue('old content');
      spyOn(fileManager, 'calculateHash').mockResolvedValue('new-hash');
      spyOn(backupManager, 'createBackup').mockResolvedValue('page1.md.backup');

      const convertSpy = spyOn(ConfluenceToMarkdownConverter.prototype, 'convert')
        .mockResolvedValue('# Remote content');

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.pulled).toContain('page1');
      expect(result.operation.status).toBe('completed');
      expect(convertSpy).toHaveBeenCalledWith('<p>Remote content</p>');
      expect(fileManager.writeFile).toHaveBeenCalled();
    });

    it('should handle conflicts correctly', async () => {
      const mockPage: Page = {
        id: 'page1',
        spaceKey: 'TEST',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'conflicted',
      };

      spyOn(apiClient, 'initialize').mockResolvedValue();

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([['page1', mockPage]]),
      });

      spyOn(changeDetector, 'getChangeState').mockResolvedValue('conflicted');

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.conflicted).toContain('page1.md');
      expect(result.pushed).toHaveLength(0);
      expect(result.pulled).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith('Conflict detected for page1.md');
    });

    it('should respect dry-run mode', async () => {
      const mockPage: Page = {
        id: 'page1',
        spaceKey: 'TEST',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'modified',
      };

      spyOn(apiClient, 'initialize').mockResolvedValue();
      const updateSpy = spyOn(apiClient, 'updatePage');

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([['page1', mockPage]]),
      });

      spyOn(changeDetector, 'getChangeState').mockResolvedValue('local-only');

      const result = await syncEngine.sync({
        dryRun: true,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.pushed).toContain('page1.md');
      expect(updateSpy).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('[DRY-RUN] Would push page1.md');
    });

    it('should handle errors during push', async () => {
      const mockPage: Page = {
        id: 'page1',
        spaceKey: 'TEST',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'modified',
      };

      spyOn(apiClient, 'initialize').mockResolvedValue();
      spyOn(apiClient, 'updatePage').mockRejectedValue(new Error('API error'));

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([['page1', mockPage]]),
      });

      spyOn(changeDetector, 'getChangeState').mockResolvedValue('local-only');
      spyOn(fileManager, 'readFile').mockResolvedValue('content');
      spyOn(MarkdownToConfluenceConverter.prototype, 'convert').mockResolvedValue('<p>content</p>');

      const result = await syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      expect(result.pushed).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toContain('CS-703');
      expect(result.operation.status).toBe('failed');
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = SyncEngine.getInstance();
      const instance2 = SyncEngine.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after clearing', () => {
      const instance1 = SyncEngine.getInstance();
      SyncEngine.clearInstance();
      const instance2 = SyncEngine.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });
});
