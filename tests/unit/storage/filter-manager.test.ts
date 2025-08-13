import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterManager } from '../../../src/storage/filter-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';

// Mock ManifestManager
vi.mock('../../../src/storage/manifest-manager', () => ({
  ManifestManager: {
    getInstance: vi.fn(),
  },
}));

describe('filterManager', () => {
  let filterManager: FilterManager;
  let mockManifestManager: any;
  let mockManifest: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset FilterManager singleton
    (FilterManager as any).instance = undefined;

    mockManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map(),
      filters: {},
    };

    mockManifestManager = {
      load: vi.fn().mockResolvedValue(mockManifest),
      save: vi.fn().mockResolvedValue(undefined),
    };

    (ManifestManager.getInstance as any).mockReturnValue(mockManifestManager);

    filterManager = FilterManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset FilterManager singleton
    (FilterManager as any).instance = undefined;
  });

  describe('saveFilter', () => {
    it('should save a new filter', async () => {
      const filterData = {
        query: 'test search',
        filters: {
          author: 'john.doe',
          label: ['important'],
        },
        description: 'Test filter',
      };

      await filterManager.saveFilter('my-filter', filterData);

      expect(mockManifest.filters['my-filter']).toMatchObject({
        name: 'my-filter',
        query: 'test search',
        description: 'Test filter',
        filters: {
          author: 'john.doe',
          label: ['important'],
        },
        createdAt: expect.any(String),
      });

      expect(mockManifestManager.save).toHaveBeenCalled();
    });

    it('should preserve lastUsed when updating existing filter', async () => {
      const existingLastUsed = '2025-01-01T00:00:00Z';
      mockManifest.filters.existing = {
        name: 'existing',
        lastUsed: existingLastUsed,
      };

      await filterManager.saveFilter('existing', {
        query: 'updated',
        filters: {},
      });

      expect(mockManifest.filters.existing.lastUsed).toBe(existingLastUsed);
    });

    it('should handle CQL filters', async () => {
      await filterManager.saveFilter('cql-filter', {
        cql: 'type = "page" AND space = "DEV"',
        filters: {},
      });

      expect(mockManifest.filters['cql-filter'].cql).toBe('type = "page" AND space = "DEV"');
    });
  });

  describe('getFilter', () => {
    it('should retrieve existing filter', async () => {
      mockManifest.filters['test-filter'] = {
        name: 'test-filter',
        query: 'test',
        createdAt: '2025-01-01T00:00:00Z',
        lastUsed: '2025-01-15T00:00:00Z',
      };

      const filter = await filterManager.getFilter('test-filter');

      expect(filter).toMatchObject({
        name: 'test-filter',
        query: 'test',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        lastUsed: new Date('2025-01-15T00:00:00Z'),
      });
    });

    it('should return null for non-existent filter', async () => {
      const filter = await filterManager.getFilter('non-existent');
      expect(filter).toBeNull();
    });

    it('should handle filter without lastUsed', async () => {
      mockManifest.filters['no-last-used'] = {
        name: 'no-last-used',
        createdAt: '2025-01-01T00:00:00Z',
      };

      const filter = await filterManager.getFilter('no-last-used');

      expect(filter?.lastUsed).toBeUndefined();
    });
  });

  describe('deleteFilter', () => {
    it('should delete existing filter', async () => {
      mockManifest.filters['to-delete'] = { name: 'to-delete' };

      await filterManager.deleteFilter('to-delete');

      expect(mockManifest.filters['to-delete']).toBeUndefined();
      expect(mockManifestManager.save).toHaveBeenCalled();
    });

    it('should throw error when deleting non-existent filter', async () => {
      await expect(filterManager.deleteFilter('non-existent')).rejects.toThrow(
        'Filter "non-existent" not found',
      );
    });
  });

  describe('listFilters', () => {
    it('should return all filters as array', async () => {
      mockManifest.filters = {
        filter1: {
          name: 'filter1',
          query: 'test1',
          createdAt: '2025-01-01T00:00:00Z',
        },
        filter2: {
          name: 'filter2',
          query: 'test2',
          createdAt: '2025-01-02T00:00:00Z',
          lastUsed: '2025-01-10T00:00:00Z',
        },
      };

      const filters = await filterManager.listFilters();

      expect(filters).toHaveLength(2);
      expect(filters[0]).toMatchObject({
        name: 'filter1',
        query: 'test1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });
      expect(filters[1]).toMatchObject({
        name: 'filter2',
        query: 'test2',
        createdAt: new Date('2025-01-02T00:00:00Z'),
        lastUsed: new Date('2025-01-10T00:00:00Z'),
      });
    });

    it('should return empty array when no filters exist', async () => {
      mockManifest.filters = undefined;

      const filters = await filterManager.listFilters();

      expect(filters).toEqual([]);
    });
  });

  describe('updateLastUsed', () => {
    it('should update lastUsed timestamp', async () => {
      mockManifest.filters['to-update'] = { name: 'to-update' };

      const beforeUpdate = new Date();
      await filterManager.updateLastUsed('to-update');

      const lastUsed = new Date(mockManifest.filters['to-update'].lastUsed);
      expect(lastUsed.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(mockManifestManager.save).toHaveBeenCalled();
    });

    it('should handle non-existent filter gracefully', async () => {
      await filterManager.updateLastUsed('non-existent');

      expect(mockManifestManager.save).not.toHaveBeenCalled();
    });
  });

  describe('renameFilter', () => {
    it('should rename existing filter', async () => {
      mockManifest.filters['old-name'] = {
        name: 'old-name',
        query: 'test',
        createdAt: '2025-01-01T00:00:00Z',
      };

      await filterManager.renameFilter('old-name', 'new-name');

      expect(mockManifest.filters['old-name']).toBeUndefined();
      expect(mockManifest.filters['new-name']).toMatchObject({
        name: 'new-name',
        query: 'test',
        createdAt: '2025-01-01T00:00:00Z',
      });
      expect(mockManifestManager.save).toHaveBeenCalled();
    });

    it('should throw error when renaming non-existent filter', async () => {
      await expect(filterManager.renameFilter('non-existent', 'new-name')).rejects.toThrow(
        'Filter "non-existent" not found',
      );
    });

    it('should throw error when new name already exists', async () => {
      mockManifest.filters = {
        existing1: { name: 'existing1' },
        existing2: { name: 'existing2' },
      };

      await expect(filterManager.renameFilter('existing1', 'existing2')).rejects.toThrow(
        'Filter "existing2" already exists',
      );
    });
  });
});
