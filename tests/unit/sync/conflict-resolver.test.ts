import type { Page } from '../../../src/storage/manifest-manager';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { BackupManager } from '../../../src/storage/backup-manager';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { ConflictResolver } from '../../../src/sync/conflict-resolver';

describe('ConflictResolver', () => {
  let conflictResolver: ConflictResolver;
  let manifestManager: ManifestManager;
  let fileManager: FileManager;
  let backupManager: BackupManager;

  beforeEach(() => {
    // Clear singleton instances
    ConflictResolver.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    BackupManager.clearInstance();

    // Get new instances
    conflictResolver = ConflictResolver.getInstance();
    manifestManager = ManifestManager.getInstance();
    fileManager = FileManager.getInstance();
    backupManager = BackupManager.getInstance();

    // Set managers
    conflictResolver.setManagers(manifestManager, fileManager, backupManager);
  });

  afterEach(() => {
    ConflictResolver.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    BackupManager.clearInstance();
  });

  describe('detectConflict', () => {
    it('should detect conflict when both local and remote hashes differ from base', async () => {
      const pageId = 'page1';
      const basePage: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-base',
        status: 'synced',
      };

      // Mock manifest load
      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, basePage]]),
      });

      // Mock updatePage
      const updateSpy = spyOn(manifestManager, 'updatePage').mockResolvedValue();

      const conflict = await conflictResolver.detectConflict(
        pageId,
        'hash-local',
        'hash-remote',
        2,
        3,
      );

      expect(conflict).toBeTruthy();
      expect(conflict?.pageId).toBe(pageId);
      expect(conflict?.localHash).toBe('hash-local');
      expect(conflict?.remoteHash).toBe('hash-remote');
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: pageId,
        status: 'conflicted',
      }));
    });

    it('should return null when only local changed', async () => {
      const pageId = 'page1';
      const basePage: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-base',
        status: 'synced',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, basePage]]),
      });

      const conflict = await conflictResolver.detectConflict(
        pageId,
        'hash-local',
        'hash-base', // Remote same as base
        1,
        1,
      );

      expect(conflict).toBeNull();
    });

    it('should return null when only remote changed', async () => {
      const pageId = 'page1';
      const basePage: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-base',
        status: 'synced',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, basePage]]),
      });

      const conflict = await conflictResolver.detectConflict(
        pageId,
        'hash-base', // Local same as base
        'hash-remote',
        1,
        2,
      );

      expect(conflict).toBeNull();
    });

    it('should throw error if page not found in manifest', async () => {
      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map(),
      });

      await expect(
        conflictResolver.detectConflict('nonexistent', 'hash1', 'hash2'),
      ).rejects.toThrow('CS-605');
    });
  });

  describe('generateConflictMarkers', () => {
    it('should generate Git-style conflict markers', () => {
      const localContent = 'Local version of content';
      const remoteContent = 'Remote version of content';

      const result = conflictResolver.generateConflictMarkers(
        localContent,
        remoteContent,
        'test.md',
      );

      expect(result).toContain('<<<<<<< LOCAL');
      expect(result).toContain('=======');
      expect(result).toContain('>>>>>>> REMOTE');
      expect(result).toContain(localContent);
      expect(result).toContain(remoteContent);
    });

    it('should handle multiline content', () => {
      const localContent = 'Line 1\nLine 2\nLine 3';
      const remoteContent = 'Remote Line 1\nRemote Line 2';

      const result = conflictResolver.generateConflictMarkers(
        localContent,
        remoteContent,
      );

      expect(result).toContain('<<<<<<< LOCAL');
      expect(result).toContain(localContent);
      expect(result).toContain('=======');
      expect(result).toContain(remoteContent);
      expect(result).toContain('>>>>>>> REMOTE');
    });
  });

  describe('writeConflictFile', () => {
    it('should create backup and write conflict file', async () => {
      const filePath = '/test/file.md';
      const localContent = 'Local content';
      const remoteContent = 'Remote content';

      const backupSpy = spyOn(backupManager, 'createBackup').mockResolvedValue('/test/file.md.backup');
      const writeSpy = spyOn(fileManager, 'writeFile').mockResolvedValue('/test/file.md');

      await conflictResolver.writeConflictFile(filePath, localContent, remoteContent);

      expect(backupSpy).toHaveBeenCalledWith(expect.stringContaining('file.md'));
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('file.md'),
        expect.stringContaining('<<<<<<< LOCAL'),
      );
    });

    it('should handle write errors', async () => {
      spyOn(backupManager, 'createBackup').mockResolvedValue('/test/file.md.backup');
      spyOn(fileManager, 'writeFile').mockRejectedValue(new Error('Write failed'));

      await expect(
        conflictResolver.writeConflictFile('/test/file.md', 'local', 'remote'),
      ).rejects.toThrow('CS-606');
    });
  });

  describe('resolveConflict', () => {
    it('should resolve conflict with local-first strategy', async () => {
      const pageId = 'page1';
      const page: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-old',
        status: 'conflicted',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, page]]),
      });

      const backupSpy = spyOn(backupManager, 'createBackup').mockResolvedValue('/backup');
      const writeSpy = spyOn(fileManager, 'writeFile').mockResolvedValue('/test/path.md');
      const updateSpy = spyOn(manifestManager, 'updatePage').mockResolvedValue();

      const localContent = 'Local content to keep';
      await conflictResolver.resolveConflict(pageId, 'local-first', localContent);

      expect(backupSpy).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('path.md'),
        localContent,
      );
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: pageId,
        status: 'synced',
        resolutionHistory: expect.arrayContaining([
          expect.objectContaining({
            strategy: 'local-first',
          }),
        ]),
      }));
    });

    it('should resolve conflict with remote-first strategy', async () => {
      const pageId = 'page1';
      const page: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-old',
        status: 'conflicted',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, page]]),
      });

      const backupSpy = spyOn(backupManager, 'createBackup').mockResolvedValue('/backup');
      const writeSpy = spyOn(fileManager, 'writeFile').mockResolvedValue('/test/path.md');
      const updateSpy = spyOn(manifestManager, 'updatePage').mockResolvedValue();

      const remoteContent = 'Remote content to keep';
      await conflictResolver.resolveConflict(pageId, 'remote-first', undefined, remoteContent);

      expect(backupSpy).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('path.md'),
        remoteContent,
      );
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: pageId,
        status: 'synced',
      }));
    });

    it('should handle manual resolution without writing file', async () => {
      const pageId = 'page1';
      const page: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-old',
        status: 'conflicted',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, page]]),
      });

      const backupSpy = spyOn(backupManager, 'createBackup').mockResolvedValue('/backup');
      const writeSpy = spyOn(fileManager, 'writeFile').mockResolvedValue('/test/path.md');
      const updateSpy = spyOn(manifestManager, 'updatePage').mockResolvedValue();

      await conflictResolver.resolveConflict(pageId, 'manual');

      expect(backupSpy).toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled(); // File not written for manual
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: pageId,
        status: 'synced',
      }));
    });

    it('should skip resolution if page not conflicted', async () => {
      const pageId = 'page1';
      const page: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-old',
        status: 'synced', // Not conflicted
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, page]]),
      });

      const backupSpy = spyOn(backupManager, 'createBackup').mockResolvedValue('/backup');
      const updateSpy = spyOn(manifestManager, 'updatePage').mockResolvedValue();

      await conflictResolver.resolveConflict(pageId, 'local-first', 'content');

      expect(backupSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should throw error for unknown strategy', async () => {
      const pageId = 'page1';
      const page: Page = {
        id: pageId,
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/path.md',
        contentHash: 'hash-old',
        status: 'conflicted',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([[pageId, page]]),
      });

      spyOn(backupManager, 'createBackup').mockResolvedValue('/backup');

      await expect(
        conflictResolver.resolveConflict(pageId, 'invalid' as any),
      ).rejects.toThrow('CS-610');
    });
  });

  describe('getConflictedPages', () => {
    it('should return all pages with conflicted status', async () => {
      const page1: Page = {
        id: 'page1',
        spaceKey: 'TEST',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/page1.md',
        contentHash: 'hash1',
        status: 'conflicted',
      };

      const page2: Page = {
        id: 'page2',
        spaceKey: 'TEST',
        title: 'Page 2',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/page2.md',
        contentHash: 'hash2',
        status: 'synced',
      };

      const page3: Page = {
        id: 'page3',
        spaceKey: 'TEST',
        title: 'Page 3',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: '/test/page3.md',
        contentHash: 'hash3',
        status: 'conflicted',
      };

      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map([
          ['page1', page1],
          ['page2', page2],
          ['page3', page3],
        ]),
      });

      const conflictedPages = await conflictResolver.getConflictedPages();

      expect(conflictedPages).toHaveLength(2);
      expect(conflictedPages).toContainEqual(expect.objectContaining({
        pageId: 'page1',
        localPath: '/test/page1.md',
      }));
      expect(conflictedPages).toContainEqual(expect.objectContaining({
        pageId: 'page3',
        localPath: '/test/page3.md',
      }));
    });

    it('should return empty array when no conflicts', async () => {
      spyOn(manifestManager, 'load').mockResolvedValue({
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date(),
        syncMode: 'manual',
        pages: new Map(),
      });

      const conflictedPages = await conflictResolver.getConflictedPages();
      expect(conflictedPages).toHaveLength(0);
    });
  });

  describe('formatDiff', () => {
    it('should format diff output', () => {
      const localContent = 'Line 1\nLine 2\nLine 3';
      const remoteContent = 'Line 1\nLine 2 modified\nLine 3';

      const diff = conflictResolver.formatDiff(localContent, remoteContent);

      expect(diff).toContain('LOCAL');
      expect(diff).toContain('REMOTE');
      expect(diff).toContain('@@');
    });
  });

  describe('isPreviouslyResolved', () => {
    it('should detect previously resolved conflicts', () => {
      const resolutionHistory = [
        {
          timestamp: new Date(),
          strategy: 'local-first' as const,
          previousLocalHash: 'hash1',
          previousRemoteHash: 'hash2',
        },
      ];

      const isResolved = conflictResolver.isPreviouslyResolved(
        'page1',
        'hash1',
        'hash2',
        resolutionHistory,
      );

      expect(isResolved).toBe(true);
    });

    it('should return false for new conflicts', () => {
      const resolutionHistory = [
        {
          timestamp: new Date(),
          strategy: 'local-first' as const,
          previousLocalHash: 'hash1',
          previousRemoteHash: 'hash2',
        },
      ];

      const isResolved = conflictResolver.isPreviouslyResolved(
        'page1',
        'hash3',
        'hash4',
        resolutionHistory,
      );

      expect(isResolved).toBe(false);
    });

    it('should handle empty resolution history', () => {
      const isResolved = conflictResolver.isPreviouslyResolved(
        'page1',
        'hash1',
        'hash2',
        undefined,
      );

      expect(isResolved).toBe(false);
    });
  });
});
