import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../../src/api/client';
import { SearchService } from '../../../src/sync/search-service';
import { Cache } from '../../../src/utils/cache';

// Mock ApiClient and Cache before importing them
vi.mock('../../../src/api/client', () => ({
  ApiClient: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../../src/utils/cache', () => ({
  Cache: {
    getInstance: vi.fn(),
  },
}));

describe('searchService', () => {
  let searchService: SearchService;
  let mockApiClient: any;
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear singleton instance
    (SearchService as any).instance = undefined;

    mockApiClient = {
      initialize: vi.fn().mockResolvedValue(undefined),
      searchContent: vi.fn().mockResolvedValue({
        results: [
          {
            id: '123',
            title: 'Test Page',
            type: 'page',
            space: { key: 'TEST', name: 'Test Space' },
            version: { when: '2025-01-01T00:00:00Z', by: { displayName: 'John Doe' } },
            body: { view: { value: '<p>Test content</p>' } },
            _links: { webui: '/pages/123' },
          },
        ],
      }),
      getBaseUrl: vi.fn().mockReturnValue('https://test.atlassian.net'),
    };

    mockCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };

    (ApiClient.getInstance as any).mockReturnValue(mockApiClient);
    (Cache.getInstance as any).mockReturnValue(mockCache);

    searchService = SearchService.getInstance();
  });

  afterEach(() => {
    // Clean up singleton instance
    (SearchService as any).instance = undefined;
  });

  describe('search', () => {
    it('should search by text query', async () => {
      const results = await searchService.search({ query: 'test' });

      expect(mockApiClient.searchContent).toHaveBeenCalledWith({
        cql: 'text ~ "test"',
        limit: 25,
        start: 0,
        expand: ['space', 'version', 'body.view'],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: '123',
        title: 'Test Page',
        type: 'page',
        spaceKey: 'TEST',
        spaceName: 'Test Space',
        author: 'John Doe',
      });
    });

    it('should use cached results if available', async () => {
      const cachedResults = [{ id: 'cached', title: 'Cached Page' }];
      mockCache.get.mockReturnValue(cachedResults);

      const results = await searchService.search({ query: 'test' });

      expect(mockApiClient.searchContent).not.toHaveBeenCalled();
      expect(results).toBe(cachedResults);
    });

    it('should build CQL with multiple filters', async () => {
      await searchService.search({
        query: 'test',
        author: 'john',
        modifiedAfter: '2025-01-01',
        labels: ['important', 'urgent'],
        spaces: ['DEV', 'PROD'],
      });

      expect(mockApiClient.searchContent).toHaveBeenCalledWith({
        cql: expect.stringContaining('text ~ "test"'),
        limit: 25,
        start: 0,
        expand: ['space', 'version', 'body.view'],
      });

      const cql = mockApiClient.searchContent.mock.calls[0][0].cql;
      expect(cql).toContain('creator = "john"');
      expect(cql).toContain('lastmodified > "2025-01-01"');
      expect(cql).toContain('label = "important"');
      expect(cql).toContain('label = "urgent"');
      expect(cql).toContain('space = "DEV"');
      expect(cql).toContain('space = "PROD"');
    });

    it('should use raw CQL if provided', async () => {
      await searchService.search({
        cql: 'type = "page" AND space = "TEST"',
      });

      expect(mockApiClient.searchContent).toHaveBeenCalledWith({
        cql: 'type = "page" AND space = "TEST"',
        limit: 25,
        start: 0,
        expand: ['space', 'version', 'body.view'],
      });
    });

    it('should cache results after successful search', async () => {
      await searchService.search({ query: 'test' });

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('search:'),
        expect.any(Array),
      );
    });
  });

  describe('searchByText', () => {
    it('should escape quotes in search text', async () => {
      await searchService.searchByText('test "quoted" text');

      expect(mockApiClient.searchContent).toHaveBeenCalledWith({
        cql: 'text ~ "test \\"quoted\\" text"',
        limit: 25,
        start: 0,
        expand: ['space', 'version', 'body.view'],
      });
    });
  });

  describe('searchByCQL', () => {
    it('should handle pagination parameters', async () => {
      await searchService.searchByCQL('type = "page"', 50, 100);

      expect(mockApiClient.searchContent).toHaveBeenCalledWith({
        cql: 'type = "page"',
        limit: 50,
        start: 100,
        expand: ['space', 'version', 'body.view'],
      });
    });

    it('should handle invalid CQL errors', async () => {
      mockApiClient.searchContent.mockRejectedValue(
        new Error('CS-1001: Search failed: Invalid CQL query'),
      );

      await expect(searchService.searchByCQL('invalid cql')).rejects.toThrow('Invalid CQL');
    });
  });

  describe('validateCQL', () => {
    it('should return true for valid CQL', async () => {
      const isValid = await searchService.validateCQL('type = "page"');
      expect(isValid).toBe(true);
    });

    it('should return false for invalid CQL', async () => {
      mockApiClient.searchContent.mockRejectedValue(
        new Error('CS-1001: Search failed: Invalid CQL query'),
      );

      const isValid = await searchService.validateCQL('invalid');
      expect(isValid).toBe(false);
    });
  });
});
