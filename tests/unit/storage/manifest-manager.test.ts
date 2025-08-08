import type { Page } from '../../../src/storage/manifest-manager';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../../../src/auth/auth-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';

describe('manifestManager', () => {
  let manifestManager: ManifestManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton instance
    (ManifestManager as any).instance = undefined;

    // Mock AuthManager
    vi.spyOn(AuthManager, 'getInstance').mockReturnValue({
      getStoredCredentials: vi.fn().mockResolvedValue({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        authType: 'cloud',
      }),
    } as any);

    manifestManager = ManifestManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ManifestManager.getInstance();
      const instance2 = ManifestManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('load', () => {
    it('should create new manifest if file does not exist', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Act
      const manifest = await manifestManager.load();

      // Assert
      expect(manifest).toEqual({
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: expect.any(Date),
        pages: new Map(),
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.confluence-sync.json'),
        expect.any(String),
        'utf-8',
      );
    });

    it('should load existing manifest from file', async () => {
      // Arrange
      const existingManifest = {
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: '2024-01-15T10:00:00Z',
        pages: [
          ['page1', {
            id: 'page1',
            spaceKey: 'SPACE',
            title: 'Page 1',
            version: 1,
            parentId: null,
            lastModified: '2024-01-15T09:00:00Z',
            localPath: 'page1.md',
            contentHash: 'hash123',
            status: 'synced',
          }],
        ],
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(existingManifest));

      // Act
      const manifest = await manifestManager.load();

      // Assert
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.confluenceUrl).toBe('https://test.atlassian.net');
      expect(manifest.lastSyncTime).toBeInstanceOf(Date);
      expect(manifest.pages).toBeInstanceOf(Map);
      expect(manifest.pages.size).toBe(1);
      expect(manifest.pages.get('page1')).toEqual({
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date('2024-01-15T09:00:00Z'),
        localPath: 'page1.md',
        contentHash: 'hash123',
        status: 'synced',
      });
    });

    it('should handle manifest with pages as object (backwards compatibility)', async () => {
      // Arrange
      const existingManifest = {
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: '2024-01-15T10:00:00Z',
        pages: {
          page1: {
            id: 'page1',
            spaceKey: 'SPACE',
            title: 'Page 1',
            version: 1,
            parentId: null,
            lastModified: '2024-01-15T09:00:00Z',
            localPath: 'page1.md',
            contentHash: 'hash123',
            status: 'synced',
          },
        },
      };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(existingManifest));

      // Act
      const manifest = await manifestManager.load();

      // Assert
      expect(manifest.pages).toBeInstanceOf(Map);
      expect(manifest.pages.size).toBe(1);
      expect(manifest.pages.get('page1')).toBeDefined();
    });

    it('should create new manifest if existing one is corrupted', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json }');
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Act
      const manifest = await manifestManager.load();

      // Assert
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.pages).toBeInstanceOf(Map);
      expect(manifest.pages.size).toBe(0);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('should save manifest to file', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      await manifestManager.load();

      // Act
      await manifestManager.save();

      // Assert
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.confluence-sync.json'),
        expect.stringContaining('"version": "1.0.0"'),
        'utf-8',
      );
    });

    it('should convert Map to array for JSON serialization', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      let savedContent = '';
      vi.spyOn(fs, 'writeFileSync').mockImplementation((path, content) => {
        savedContent = content as string;
      });

      await manifestManager.load();
      await manifestManager.updatePage({
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date('2024-01-15T09:00:00Z'),
        localPath: 'page1.md',
        contentHash: 'hash123',
        status: 'synced',
      });

      // Act
      await manifestManager.save();

      // Assert
      const parsed = JSON.parse(savedContent);
      expect(Array.isArray(parsed.pages)).toBe(true);
      expect(parsed.pages).toHaveLength(1);
      expect(parsed.pages[0][0]).toBe('page1');
    });
  });

  describe('updatePage', () => {
    it('should add new page to manifest', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const newPage: Page = {
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'New Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'new-page.md',
        contentHash: 'hash123',
        status: 'synced',
      };

      // Act
      await manifestManager.updatePage(newPage);

      // Assert
      const page = await manifestManager.getPage('page1');
      expect(page).toEqual(newPage);
    });

    it('should update existing page in manifest', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const originalPage: Page = {
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Original',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'original.md',
        contentHash: 'hash123',
        status: 'synced',
      };

      await manifestManager.updatePage(originalPage);

      const updatedPage: Page = {
        ...originalPage,
        title: 'Updated',
        version: 2,
        contentHash: 'hash456',
        status: 'modified',
      };

      // Act
      await manifestManager.updatePage(updatedPage);

      // Assert
      const page = await manifestManager.getPage('page1');
      expect(page?.title).toBe('Updated');
      expect(page?.version).toBe(2);
      expect(page?.contentHash).toBe('hash456');
      expect(page?.status).toBe('modified');
    });

    it('should update lastSyncTime when updating page', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const beforeUpdate = new Date();

      // Act
      await manifestManager.updatePage({
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page.md',
        contentHash: 'hash',
        status: 'synced',
      });

      // Assert
      const manifest = await manifestManager.load();
      expect(manifest.lastSyncTime.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });

  describe('getPage', () => {
    it('should return page if exists', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const page: Page = {
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'test.md',
        contentHash: 'hash',
        status: 'synced',
      };

      await manifestManager.updatePage(page);

      // Act
      const result = await manifestManager.getPage('page1');

      // Assert
      expect(result).toEqual(page);
    });

    it('should return undefined if page does not exist', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Act
      const result = await manifestManager.getPage('nonexistent');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('getAllPages', () => {
    it('should return all pages', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const page1: Page = {
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'synced',
      };

      const page2: Page = {
        id: 'page2',
        spaceKey: 'SPACE',
        title: 'Page 2',
        version: 1,
        parentId: 'page1',
        lastModified: new Date(),
        localPath: 'page2.md',
        contentHash: 'hash2',
        status: 'modified',
      };

      await manifestManager.updatePage(page1);
      await manifestManager.updatePage(page2);

      // Act
      const allPages = await manifestManager.getAllPages();

      // Assert
      expect(allPages).toBeInstanceOf(Map);
      expect(allPages.size).toBe(2);
      expect(allPages.get('page1')).toEqual(page1);
      expect(allPages.get('page2')).toEqual(page2);
    });
  });

  describe('removePage', () => {
    it('should remove page from manifest', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const page: Page = {
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Page to Remove',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'remove.md',
        contentHash: 'hash',
        status: 'synced',
      };

      await manifestManager.updatePage(page);

      // Act
      await manifestManager.removePage('page1');

      // Assert
      const result = await manifestManager.getPage('page1');
      expect(result).toBeUndefined();
    });
  });

  describe('clearPages', () => {
    it('should clear all pages from manifest', async () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      await manifestManager.updatePage({
        id: 'page1',
        spaceKey: 'SPACE',
        title: 'Page 1',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page1.md',
        contentHash: 'hash1',
        status: 'synced',
      });

      await manifestManager.updatePage({
        id: 'page2',
        spaceKey: 'SPACE',
        title: 'Page 2',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'page2.md',
        contentHash: 'hash2',
        status: 'synced',
      });

      // Act
      await manifestManager.clearPages();

      // Assert
      const allPages = await manifestManager.getAllPages();
      expect(allPages.size).toBe(0);
    });
  });
});
