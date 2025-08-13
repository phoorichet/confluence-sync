import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfluenceAPIClient } from '../../../src/api/client';
import { AuthManager } from '../../../src/auth/auth-manager';

// Mock AuthManager

const server = setupServer();

describe('confluence API Integration', () => {
  let client: ConfluenceAPIClient;
  let mockAuthManager: any;

  beforeAll(() => {
    server.listen();
  });

  beforeEach(async () => {
    mockAuthManager = {
      getStoredCredentials: vi.fn().mockResolvedValue({
        url: 'http://localhost:3000',
        username: 'test@example.com',
        authType: 'cloud',
      }),
      getToken: vi.fn().mockResolvedValue('Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu'),
    };

    vi.spyOn(AuthManager, 'getInstance').mockReturnValue(mockAuthManager);

    client = new ConfluenceAPIClient();
    await client.initialize();
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('authentication', () => {
    it('should include authentication headers in requests', async () => {
      let capturedHeaders: Headers | undefined;

      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', ({ request }) => {
          capturedHeaders = request.headers;
          return HttpResponse.json({
            id: '123',
            title: 'Test Page',
            version: { number: 1 },
          });
        }),
      );

      await client.getPage('123');

      expect(capturedHeaders?.get('Authorization')).toBe('Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu');
      expect(capturedHeaders?.get('Accept')).toBe('application/json');
      expect(capturedHeaders?.get('Content-Type')).toBe('application/json');
    });
  });

  describe('error Handling', () => {
    it('should handle 401 authentication errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 401 });
        }),
      );

      await expect(client.getPage('123')).rejects.toThrow('CS-401: Authentication failed');
    });

    it('should handle 403 permission errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 403 });
        }),
      );

      await expect(client.getPage('123')).rejects.toThrow('CS-403: Permission denied');
    });

    it('should handle 404 not found errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      await expect(client.getPage('123')).rejects.toThrow('CS-404');
    });

    it('should handle 429 rate limit errors', async () => {
      let attemptCount = 0;

      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          attemptCount++;
          if (attemptCount === 1) {
            return new HttpResponse(null, {
              status: 429,
              headers: {
                'Retry-After': '1',
              },
            });
          }
          return HttpResponse.json({
            id: '123',
            title: 'Test Page',
          });
        }),
      );

      // Mock sleep to speed up test
      vi.spyOn(client.rateLimiter as any, 'sleep').mockResolvedValue(undefined);

      const result = await client.getPage('123');

      expect(result.id).toBe('123');
      expect(attemptCount).toBe(2); // Should retry once
    });

    it('should handle 500 server errors', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(client.getPage('123')).rejects.toThrow('CS-500: Internal server error');
    });
  });

  describe('aPI Operations', () => {
    it('should get a page successfully', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          return HttpResponse.json({
            id: '123',
            title: 'Test Page',
            version: { number: 1 },
            body: {
              storage: {
                value: '<p>Content</p>',
              },
            },
          });
        }),
      );

      const page = await client.getPage('123');

      expect(page.id).toBe('123');
      expect(page.title).toBe('Test Page');
      expect(page.version.number).toBe(1);
    });

    it('should update a page successfully', async () => {
      server.use(
        http.put('http://localhost:3000/api/v2/pages/:id', async ({ request }) => {
          const body = await request.json() as any;
          return HttpResponse.json({
            id: body.id,
            title: body.title,
            version: { number: body.version.number },
          });
        }),
      );

      const result = await client.updatePage('123', 'Updated Title', '<p>Updated</p>', 1);

      expect(result.title).toBe('Updated Title');
      expect(result.version.number).toBe(2);
    });

    it('should create a page successfully', async () => {
      server.use(
        http.post('http://localhost:3000/api/v2/pages', async ({ request }) => {
          const body = await request.json() as any;
          return HttpResponse.json({
            id: 'new-123',
            title: body.title,
            spaceId: body.spaceId,
          });
        }),
      );

      const result = await client.createPage('space-1', 'New Page', '<p>Content</p>');

      expect(result.id).toBe('new-123');
      expect(result.title).toBe('New Page');
    });

    it('should delete a page successfully', async () => {
      server.use(
        http.delete('http://localhost:3000/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await expect(client.deletePage('123')).resolves.toBeUndefined();
    });

    it('should get space information', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/spaces', ({ request }) => {
          const url = new URL(request.url);
          const keys = url.searchParams.get('keys');

          if (keys === 'TEST') {
            return HttpResponse.json({
              results: [{
                id: 'space-1',
                key: 'TEST',
                name: 'Test Space',
              }],
            });
          }
          return HttpResponse.json({ results: [] });
        }),
      );

      const space = await client.getSpace('TEST');

      expect(space.key).toBe('TEST');
      expect(space.name).toBe('Test Space');
    });

    it('should search pages in a space', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages', ({ request }) => {
          const url = new URL(request.url);
          const spaceKey = url.searchParams.get('spaceKey');

          if (spaceKey === 'TEST') {
            return HttpResponse.json({
              results: [
                { id: '1', title: 'Page 1' },
                { id: '2', title: 'Page 2' },
              ],
            });
          }
          return HttpResponse.json({ results: [] });
        }),
      );

      const pages = await client.searchPages('TEST');

      expect(pages).toHaveLength(2);
      expect(pages[0].title).toBe('Page 1');
      expect(pages[1].title).toBe('Page 2');
    });

    it('should get page children', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id/children', () => {
          return HttpResponse.json({
            results: [
              { id: 'child-1', title: 'Child 1' },
              { id: 'child-2', title: 'Child 2' },
            ],
          });
        }),
      );

      const children = await client.getPageChildren('parent-123');

      expect(children).toHaveLength(2);
      expect(children[0].id).toBe('child-1');
    });

    it('should get page content', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id/body', () => {
          return HttpResponse.json({
            storage: {
              value: '<p>Page content in storage format</p>',
            },
          });
        }),
      );

      const content = await client.getPageContent('123');

      expect(content).toBe('<p>Page content in storage format</p>');
    });
  });

  describe('rate Limiting', () => {
    it('should parse rate limit headers', async () => {
      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          return HttpResponse.json(
            { id: '123', title: 'Test' },
            {
              headers: {
                'x-ratelimit-remaining': '100',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
            },
          );
        }),
      );

      await client.getPage('123');

      const stats = client.rateLimiter.getStats();
      expect(stats.rateLimitRemaining).toBe(100);
      expect(stats.rateLimitReset).toBeInstanceOf(Date);
    });
  });

  describe('circuit Breaker', () => {
    it('should open circuit after multiple failures', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3000/api/v2/pages/:id', () => {
          callCount++;
          return new HttpResponse(null, { status: 500 });
        }),
      );

      // Should fail 5 times and open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await client.getPage('123');
        }
        catch {
          // Expected to fail
        }
      }

      // Circuit should be open now
      await expect(client.getPage('123')).rejects.toThrow('CS-503: Circuit breaker is open');

      // Should not make additional calls when circuit is open
      expect(callCount).toBe(5);
    });
  });
});
