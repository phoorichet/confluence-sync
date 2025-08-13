import type { PageSingle } from '../../../src/api/client';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../src/api/client';

describe('Batch API Operations', () => {
  describe('batchGetPages', () => {
    it('should fetch multiple pages in a single request', async () => {
      const mockPages: PageSingle[] = [
        {
          id: '123',
          status: 'current',
          title: 'Page 1',
          spaceId: 'TEST',
          version: { number: 1, createdAt: '' },
          createdAt: '',
          createdBy: '',
        },
        {
          id: '456',
          status: 'current',
          title: 'Page 2',
          spaceId: 'TEST',
          version: { number: 1, createdAt: '' },
          createdAt: '',
          createdBy: '',
        },
      ];

      // Mock the GET /pages endpoint
      const getSpy = vi.spyOn(apiClient as any, 'client').mockImplementation({
        GET: async (path: string, _options: any) => {
          if (path === '/pages') {
            return {
              data: { results: mockPages },
              error: null,
            };
          }
          return { error: 'Not found' };
        },
      } as any);

      const result = await apiClient.batchGetPages(['123', '456']);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('123');
      expect(result[1].id).toBe('456');

      getSpy.mockRestore();
    });

    it('should handle batches larger than 250 IDs', async () => {
      // Create 300 page IDs
      const pageIds = Array.from({ length: 300 }, (_, i) => `${i + 1}`);

      // Mock pages for response
      const mockPages = pageIds.map(id => ({
        id,
        status: 'current' as const,
        title: `Page ${id}`,
        spaceId: 'TEST',
        version: { number: 1, createdAt: '' },
        createdAt: '',
        createdBy: '',
      }));

      let callCount = 0;
      const getSpy = vi.spyOn(apiClient as any, 'client').mockImplementation({
        GET: async (path: string, options: any) => {
          if (path === '/pages') {
            callCount++;
            const ids = options.params.query.id as number[];
            const batch = ids.length <= 250
              ? mockPages.filter(p => ids.includes(Number.parseInt(p.id, 10)))
              : mockPages.slice(0, 250);
            return {
              data: { results: batch },
              error: null,
            };
          }
          return { error: 'Not found' };
        },
      } as any);

      const result = await apiClient.batchGetPages(pageIds);

      // Should make 2 calls (250 + 50)
      expect(callCount).toBe(2);
      expect(result.length).toBeGreaterThanOrEqual(250);

      getSpy.mockRestore();
    });

    it('should handle partial failures gracefully', async () => {
      const getSpy = vi.spyOn(apiClient as any, 'client').mockImplementation({
        GET: async (path: string, _options: any) => {
          if (path === '/pages') {
            return {
              error: 'Some pages not found',
              data: null,
            };
          }
          return { error: 'Not found' };
        },
      } as any);

      const result = await apiClient.batchGetPages(['123', '456']);

      // Should return empty array on error
      expect(result).toEqual([]);

      getSpy.mockRestore();
    });

    it('should include body content when requested', async () => {
      const mockPage: PageSingle = {
        id: '123',
        status: 'current',
        title: 'Page with Body',
        spaceId: 'TEST',
        version: { number: 1, createdAt: '' },
        body: {
          storage: {
            value: '<p>Page content</p>',
            representation: 'storage',
          },
        },
        createdAt: '',
        createdBy: '',
      };

      const getSpy = vi.spyOn(apiClient as any, 'client').mockImplementation({
        GET: async (path: string, options: any) => {
          if (path === '/pages' && options.params.query['body-format'] === 'storage') {
            return {
              data: { results: [mockPage] },
              error: null,
            };
          }
          return { error: 'Not found' };
        },
      } as any);

      const result = await apiClient.batchGetPages(['123'], true);

      expect(result).toHaveLength(1);
      expect(result[0].body?.storage?.value).toBe('<p>Page content</p>');

      getSpy.mockRestore();
    });
  });

  describe('batchCreatePages', () => {
    it('should create multiple pages concurrently', async () => {
      const pages = [
        { spaceId: 'TEST', title: 'Page 1', body: '<p>Content 1</p>' },
        { spaceId: 'TEST', title: 'Page 2', body: '<p>Content 2</p>' },
      ];

      let createCount = 0;
      const createSpy = vi.spyOn(apiClient, 'createPage').mockImplementation(
        async (_spaceId: string, title: string, _body: string, _parentId?: string) => {
          createCount++;
          return {
            id: `${createCount}00`,
            status: 'current',
            title,
            spaceId: 'TEST',
            version: { number: 1, createdAt: '' },
            createdAt: '',
            createdBy: '',
          } as PageSingle;
        },
      );

      const result = await apiClient.batchCreatePages(pages);

      expect(result.successes).toHaveLength(2);
      expect(result.failures).toHaveLength(0);
      expect(createCount).toBe(2);

      createSpy.mockRestore();
    });

    it('should handle partial failures in batch creation', async () => {
      const pages = [
        { spaceId: 'TEST', title: 'Page 1', body: '<p>Content 1</p>' },
        { spaceId: 'TEST', title: 'Duplicate Page', body: '<p>Content 2</p>' },
        { spaceId: 'TEST', title: 'Page 3', body: '<p>Content 3</p>' },
      ];

      const createSpy = vi.spyOn(apiClient, 'createPage').mockImplementation(
        async (_spaceId: string, title: string, _body: string, _parentId?: string) => {
          if (title === 'Duplicate Page') {
            throw new Error('CS-409: Page already exists');
          }
          return {
            id: title.replace('Page ', ''),
            status: 'current',
            title,
            spaceId: 'TEST',
            version: { number: 1, createdAt: '' },
            createdAt: '',
            createdBy: '',
          } as PageSingle;
        },
      );

      const result = await apiClient.batchCreatePages(pages);

      expect(result.successes).toHaveLength(2);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].index).toBe(1);
      expect(result.failures[0].error).toContain('CS-409');

      createSpy.mockRestore();
    });
  });

  describe('batchUpdatePages', () => {
    it('should update multiple pages concurrently', async () => {
      const updates = [
        { pageId: '123', title: 'Updated 1', body: '<p>New 1</p>', version: 2 },
        { pageId: '456', title: 'Updated 2', body: '<p>New 2</p>', version: 3 },
      ];

      const updateSpy = vi.spyOn(apiClient, 'updatePage').mockImplementation(
        async (pageId: string, _body: string, version: number, title: string) => {
          return {
            id: pageId,
            status: 'current',
            title,
            spaceId: 'TEST',
            version: { number: version, createdAt: '' },
            createdAt: '',
            createdBy: '',
          } as PageSingle;
        },
      );

      const result = await apiClient.batchUpdatePages(updates);

      expect(result.successes).toHaveLength(2);
      expect(result.failures).toHaveLength(0);

      updateSpy.mockRestore();
    });

    it('should handle version conflicts in batch updates', async () => {
      const updates = [
        { pageId: '123', title: 'Updated 1', body: '<p>New 1</p>', version: 2 },
        { pageId: '456', title: 'Updated 2', body: '<p>New 2</p>', version: 999 },
      ];

      const updateSpy = vi.spyOn(apiClient, 'updatePage').mockImplementation(
        async (pageId: string, _body: string, version: number, title: string) => {
          if (version === 999) {
            throw new Error('CS-409: Version conflict');
          }
          return {
            id: pageId,
            status: 'current',
            title,
            spaceId: 'TEST',
            version: { number: version, createdAt: '' },
            createdAt: '',
            createdBy: '',
          } as PageSingle;
        },
      );

      const result = await apiClient.batchUpdatePages(updates);

      expect(result.successes).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].error).toContain('CS-409');

      updateSpy.mockRestore();
    });
  });

  describe('batchDeletePages', () => {
    it('should delete multiple pages concurrently', async () => {
      const pageIds = ['123', '456', '789'];

      const deleteSpy = vi.spyOn(apiClient, 'deletePage').mockImplementation(
        async (_pageId: string) => { /* Success */ },
      );

      const result = await apiClient.batchDeletePages(pageIds);

      expect(result.successes).toHaveLength(3);
      expect(result.failures).toHaveLength(0);

      deleteSpy.mockRestore();
    });

    it('should handle partial failures in batch deletion', async () => {
      const pageIds = ['123', '404', '789'];

      const deleteSpy = vi.spyOn(apiClient, 'deletePage').mockImplementation(
        async (pageId: string) => {
          if (pageId === '404') {
            throw new Error('CS-404: Page not found');
          }
        },
      );

      const result = await apiClient.batchDeletePages(pageIds);

      expect(result.successes).toHaveLength(2);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].pageId).toBe('404');
      expect(result.failures[0].error).toContain('CS-404');

      deleteSpy.mockRestore();
    });
  });
});
