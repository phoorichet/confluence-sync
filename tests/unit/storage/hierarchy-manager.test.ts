import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchyManager } from '../../../src/storage/hierarchy-manager';

describe('HierarchyManager', () => {
  let hierarchyManager: HierarchyManager;

  beforeEach(() => {
    hierarchyManager = HierarchyManager.getInstance();
  });

  afterEach(() => {
    HierarchyManager.clearInstance();
  });

  describe('buildHierarchyPath', () => {
    it('should build path for root level page without children', () => {
      const result = hierarchyManager.buildHierarchyPath('Test Page', undefined, false);
      expect(result).toBe('test-page.md');
    });

    it('should build path for root level page with children', () => {
      const result = hierarchyManager.buildHierarchyPath('Parent Page', undefined, true);
      expect(result).toBe('parent-page/_index.md');
    });

    it('should build path for child page without children', () => {
      const result = hierarchyManager.buildHierarchyPath('Child Page', 'parent-folder', false);
      expect(result).toBe('parent-folder/child-page.md');
    });

    it('should build path for child page with children', () => {
      const result = hierarchyManager.buildHierarchyPath('Child Page', 'parent-folder', true);
      // When both parent and children exist, title is not sanitized
      expect(result).toBe('parent-folder/Child Page/_index.md');
    });

    it('should sanitize special characters in title', () => {
      const result = hierarchyManager.buildHierarchyPath('Test: Page/With*Special?Chars', undefined, false);
      expect(result).toBe('test-page-with-special-chars.md');
    });

    it('should handle very long titles', () => {
      const longTitle = 'a'.repeat(150);
      const result = hierarchyManager.buildHierarchyPath(longTitle, undefined, false);
      expect(result.length).toBeLessThanOrEqual(104); // 100 chars + .md extension
    });

    it('should handle reserved Windows names', () => {
      const result = hierarchyManager.buildHierarchyPath('CON', undefined, false);
      expect(result).toBe('page-con.md');
    });
  });

  describe('ensureDirectoryStructure', () => {
    it('should create directory if it does not exist', async () => {
      const fs = await import('node:fs');
      const originalExists = fs.existsSync;
      const originalMkdir = fs.mkdirSync;
      
      let existsCalled = false;
      let mkdirCalled = false;
      let mkdirPath = '';
      
      (fs as any).existsSync = () => {
        existsCalled = true;
        return false;
      };
      (fs as any).mkdirSync = (path: string, options: any) => {
        mkdirCalled = true;
        mkdirPath = path;
        return undefined;
      };

      await hierarchyManager.ensureDirectoryStructure('/test/path/file.md');

      expect(existsCalled).toBe(true);
      expect(mkdirCalled).toBe(true);
      expect(mkdirPath).toBe('/test/path');

      // Restore
      (fs as any).existsSync = originalExists;
      (fs as any).mkdirSync = originalMkdir;
    });

    it('should not create directory if it exists', async () => {
      const fs = await import('node:fs');
      const originalExists = fs.existsSync;
      const originalMkdir = fs.mkdirSync;
      
      let mkdirCalled = false;
      
      (fs as any).existsSync = () => true;
      (fs as any).mkdirSync = () => {
        mkdirCalled = true;
        return undefined;
      };

      await hierarchyManager.ensureDirectoryStructure('/test/path/file.md');

      expect(mkdirCalled).toBe(false);

      // Restore
      (fs as any).existsSync = originalExists;
      (fs as any).mkdirSync = originalMkdir;
    });

    it('should handle directory creation errors', async () => {
      const fs = await import('node:fs');
      const originalExists = fs.existsSync;
      const originalMkdir = fs.mkdirSync;
      
      (fs as any).existsSync = () => false;
      (fs as any).mkdirSync = () => {
        throw new Error('Permission denied');
      };

      await expect(
        hierarchyManager.ensureDirectoryStructure('/test/path/file.md'),
      ).rejects.toThrow('CS-807');

      // Restore
      (fs as any).existsSync = originalExists;
      (fs as any).mkdirSync = originalMkdir;
    });
  });

  describe('buildHierarchyTree', () => {
    it('should build hierarchy tree from flat list', () => {
      const pages = [
        { id: '1', title: 'Root', parentId: null },
        { id: '2', title: 'Child 1', parentId: '1' },
        { id: '3', title: 'Child 2', parentId: '1' },
        { id: '4', title: 'Grandchild', parentId: '2' },
      ];

      const tree = hierarchyManager.buildHierarchyTree(pages);

      expect(tree.size).toBe(1);
      expect(tree.has('1')).toBe(true);

      const root = tree.get('1')!;
      expect(root.children.length).toBe(2);
      expect(root.children[0].title).toBe('Child 1');
      expect(root.children[0].children.length).toBe(1);
      expect(root.children[0].children[0].title).toBe('Grandchild');
    });

    it('should handle multiple root nodes', () => {
      const pages = [
        { id: '1', title: 'Root 1', parentId: null },
        { id: '2', title: 'Root 2', parentId: null },
        { id: '3', title: 'Child', parentId: '1' },
      ];

      const tree = hierarchyManager.buildHierarchyTree(pages);

      expect(tree.size).toBe(2);
      expect(tree.has('1')).toBe(true);
      expect(tree.has('2')).toBe(true);
    });

    it('should handle orphaned nodes', () => {
      const pages = [
        { id: '1', title: 'Root', parentId: null },
        { id: '2', title: 'Orphan', parentId: 'non-existent' },
      ];

      const tree = hierarchyManager.buildHierarchyTree(pages);

      expect(tree.size).toBe(2);
      expect(tree.has('1')).toBe(true);
      expect(tree.has('2')).toBe(true); // Orphan becomes root
    });

    it('should sort children alphabetically', () => {
      const pages = [
        { id: '1', title: 'Root', parentId: null },
        { id: '2', title: 'Zebra', parentId: '1' },
        { id: '3', title: 'Apple', parentId: '1' },
        { id: '4', title: 'Banana', parentId: '1' },
      ];

      const tree = hierarchyManager.buildHierarchyTree(pages);
      const root = tree.get('1')!;

      expect(root.children[0].title).toBe('Apple');
      expect(root.children[1].title).toBe('Banana');
      expect(root.children[2].title).toBe('Zebra');
    });
  });

  describe('detectCircularReferences', () => {
    it('should detect circular references', () => {
      const pages = [
        { id: '1', parentId: '3' },
        { id: '2', parentId: '1' },
        { id: '3', parentId: '2' },
      ];

      const circular = hierarchyManager.detectCircularReferences(pages);

      expect(circular.length).toBeGreaterThan(0);
    });

    it('should handle normal hierarchy without circular references', () => {
      const pages = [
        { id: '1', parentId: null },
        { id: '2', parentId: '1' },
        { id: '3', parentId: '2' },
      ];

      const circular = hierarchyManager.detectCircularReferences(pages);

      expect(circular.length).toBe(0);
    });

    it('should handle self-referencing pages', () => {
      const pages = [
        { id: '1', parentId: '1' },
      ];

      const circular = hierarchyManager.detectCircularReferences(pages);

      expect(circular.length).toBe(1);
      expect(circular[0]).toBe('1');
    });
  });

  describe('parseDirectoryStructure', () => {
    it('should parse flat structure', () => {
      const files = [
        '/base/page1.md',
        '/base/page2.md',
      ];

      const structure = hierarchyManager.parseDirectoryStructure('/base', files);

      expect(structure.size).toBe(2);
      expect(structure.get('/base/page1.md')?.isIndex).toBe(false);
      expect(structure.get('/base/page1.md')?.parentPath).toBeUndefined();
    });

    it('should parse hierarchical structure with index files', () => {
      const files = [
        '/base/parent/_index.md',
        '/base/parent/child1.md',
        '/base/parent/child2/_index.md',
        '/base/parent/child2/grandchild.md',
      ];

      const structure = hierarchyManager.parseDirectoryStructure('/base', files);

      expect(structure.size).toBe(4);
      expect(structure.get('/base/parent/_index.md')?.isIndex).toBe(true);
      expect(structure.get('/base/parent/_index.md')?.parentPath).toBe('parent');
      expect(structure.get('/base/parent/child1.md')?.isIndex).toBe(false);
      expect(structure.get('/base/parent/child1.md')?.parentPath).toBe('parent');
    });
  });

  describe('getParentPath', () => {
    it('should get parent path for index file', () => {
      const result = hierarchyManager.getParentPath('/base/parent/child/_index.md');
      expect(result).toBe('/base/parent');
    });

    it('should get parent path for regular file', () => {
      const result = hierarchyManager.getParentPath('/base/parent/child.md');
      expect(result).toBe('/base/parent');
    });

    it('should return null for root level file', () => {
      const result = hierarchyManager.getParentPath('file.md');
      expect(result).toBeNull();
    });

    it('should return null for root level index', () => {
      const result = hierarchyManager.getParentPath('_index.md');
      expect(result).toBeNull();
    });
  });
});
