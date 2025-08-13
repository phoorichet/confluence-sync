import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestManager } from '../../../src/storage/manifest-manager';

describe('manifest Migration', () => {
  let manifestManager: ManifestManager;
  const testManifestPath = path.resolve('.csmanifest.json');

  beforeEach(() => {
    // Get a fresh instance
    manifestManager = ManifestManager.getInstance();
    // Clear the cached manifest to force reload
    (manifestManager as any).manifest = null;

    // Clean up any existing manifest
    if (fs.existsSync(testManifestPath)) {
      fs.unlinkSync(testManifestPath);
    }
  });

  afterEach(() => {
    // Clean up test manifest
    if (fs.existsSync(testManifestPath)) {
      fs.unlinkSync(testManifestPath);
    }
  });

  describe('v1 to v2 migration', () => {
    it('should migrate v1 manifest to v2 format', async () => {
      // Create a v1 manifest
      const v1Manifest = {
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        pages: [
          ['123', {
            id: '123',
            spaceKey: 'TEST',
            title: 'Test Page',
            version: 1,
            parentId: null,
            lastModified: new Date().toISOString(),
            localPath: 'test.md',
            contentHash: 'abc123',
            status: 'synced',
          }],
        ],
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(v1Manifest, null, 2));

      // Load manifest (should trigger migration)
      const manifest = await manifestManager.load();

      // Check v2 fields
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.syncMode).toBe('manual');
      // Config is now managed by ConfigManager, not in manifest
      expect(manifest.operations).toBeDefined();
      expect(manifest.operations).toEqual([]);

      // Check that pages were preserved
      expect(manifest.pages.size).toBe(1);
      const page = manifest.pages.get('123');
      expect(page).toBeDefined();
      expect(page?.title).toBe('Test Page');
      expect(page?.children).toEqual([]);
    });

    it('should handle v1 manifest with object-style pages', async () => {
      // Create a v1 manifest with object-style pages
      const v1Manifest = {
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        pages: {
          123: {
            id: '123',
            spaceKey: 'TEST',
            title: 'Test Page',
            version: 1,
            parentId: null,
            lastModified: new Date().toISOString(),
            localPath: 'test.md',
            contentHash: 'abc123',
            status: 'synced',
          },
        },
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(v1Manifest, null, 2));

      const manifest = await manifestManager.load();

      expect(manifest.version).toBe('2.0.0');
      expect(manifest.pages.size).toBe(1);
      expect(manifest.pages.get('123')).toBeDefined();
    });

    it('should build parent-child relationships during migration', async () => {
      // Create a v1 manifest with parent-child relationships
      const v1Manifest = {
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        pages: [
          ['parent', {
            id: 'parent',
            spaceKey: 'TEST',
            title: 'Parent Page',
            version: 1,
            parentId: null,
            lastModified: new Date().toISOString(),
            localPath: 'parent.md',
            contentHash: 'parent123',
            status: 'synced',
          }],
          ['child1', {
            id: 'child1',
            spaceKey: 'TEST',
            title: 'Child 1',
            version: 1,
            parentId: 'parent',
            lastModified: new Date().toISOString(),
            localPath: 'child1.md',
            contentHash: 'child1123',
            status: 'synced',
          }],
          ['child2', {
            id: 'child2',
            spaceKey: 'TEST',
            title: 'Child 2',
            version: 1,
            parentId: 'parent',
            lastModified: new Date().toISOString(),
            localPath: 'child2.md',
            contentHash: 'child2123',
            status: 'synced',
          }],
        ],
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(v1Manifest, null, 2));

      const manifest = await manifestManager.load();

      // Check parent has children references
      const parent = manifest.pages.get('parent');
      expect(parent?.children).toBeDefined();
      expect(parent?.children).toContain('child1');
      expect(parent?.children).toContain('child2');

      // Check children still have parentId
      const child1 = manifest.pages.get('child1');
      expect(child1?.parentId).toBe('parent');
    });

    it('should handle manifest without version field as v1', async () => {
      // Create a manifest without version field (implicit v1)
      const v1Manifest = {
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        pages: [],
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(v1Manifest, null, 2));

      const manifest = await manifestManager.load();

      expect(manifest.version).toBe('2.0.0');
      expect(manifest.syncMode).toBe('manual');
      // Config is now managed by ConfigManager, not in manifest
    });

    it('should preserve v2 manifest without migration', async () => {
      // Create a v2 manifest
      const v2Manifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        syncMode: 'watch',
        pages: [],
        operations: [],
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(v2Manifest, null, 2));

      const manifest = await manifestManager.load();

      // Should preserve all v2 fields
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.syncMode).toBe('watch');
      // Config is now managed by ConfigManager, not in manifest
    });

    it('should handle corrupted manifest with migration attempt', async () => {
      // Create a corrupted but recoverable v1 manifest
      const corruptedManifest = {
        version: '1.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        pages: [
          ['123', {
            id: '123',
            spaceKey: 'TEST',
            title: 'Test Page',
            version: 1,
            parentId: null,
            lastModified: new Date().toISOString(),
            localPath: 'test.md',
            contentHash: 'abc123',
            status: 'synced',
          }],
        ],
        // Add some corrupt field that would fail v2 validation
        invalidField: undefined,
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(corruptedManifest, null, 2));

      const manifest = await manifestManager.load();

      // Should successfully migrate despite corruption
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.pages.size).toBe(1);
    });
  });

  describe('new manifest methods', () => {
    beforeEach(async () => {
      // Create a v2 manifest with test data
      const testManifest = {
        version: '2.0.0',
        confluenceUrl: 'https://test.atlassian.net',
        lastSyncTime: new Date().toISOString(),
        syncMode: 'manual',
        pages: [
          ['page1', {
            id: 'page1',
            spaceKey: 'SPACE1',
            title: 'Page 1',
            version: 1,
            parentId: null,
            lastModified: new Date().toISOString(),
            localPath: 'page1.md',
            contentHash: 'hash1',
            status: 'synced',
            children: ['page2'],
          }],
          ['page2', {
            id: 'page2',
            spaceKey: 'SPACE1',
            title: 'Page 2',
            version: 1,
            parentId: 'page1',
            lastModified: new Date().toISOString(),
            localPath: 'page2.md',
            contentHash: 'hash2',
            status: 'synced',
            children: [],
          }],
          ['page3', {
            id: 'page3',
            spaceKey: 'SPACE2',
            title: 'Page 3',
            version: 1,
            parentId: null,
            lastModified: new Date().toISOString(),
            localPath: 'page3.md',
            contentHash: 'hash3',
            status: 'synced',
            children: [],
          }],
        ],
        operations: [],
      };

      fs.writeFileSync(testManifestPath, JSON.stringify(testManifest, null, 2));
      await manifestManager.load();
    });

    it('should get pages by space', async () => {
      const space1Pages = await manifestManager.getPagesBySpace('SPACE1');
      const space2Pages = await manifestManager.getPagesBySpace('SPACE2');
      const space3Pages = await manifestManager.getPagesBySpace('SPACE3');

      expect(space1Pages).toHaveLength(2);
      expect(space1Pages[0].spaceKey).toBe('SPACE1');
      expect(space1Pages[1].spaceKey).toBe('SPACE1');

      expect(space2Pages).toHaveLength(1);
      expect(space2Pages[0].spaceKey).toBe('SPACE2');

      expect(space3Pages).toHaveLength(0);
    });

    it('should get page hierarchy', async () => {
      const hierarchy = await manifestManager.getPageHierarchy();

      expect(hierarchy.has('root')).toBe(true);
      expect(hierarchy.has('page1')).toBe(true);

      const rootPages = hierarchy.get('root');
      expect(rootPages).toHaveLength(2); // page1 and page3 have no parent

      const page1Children = hierarchy.get('page1');
      expect(page1Children).toHaveLength(1);
      expect(page1Children![0].id).toBe('page2');
    });

    it('should get page hierarchy for subtree', async () => {
      const subtree = await manifestManager.getPageHierarchy('page1');

      expect(subtree.size).toBe(1);
      expect(subtree.has('page1')).toBe(true);

      const children = subtree.get('page1');
      expect(children).toHaveLength(1);
      expect(children![0].id).toBe('page2');
    });
  });
});
