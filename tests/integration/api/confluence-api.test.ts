import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../src/api/client';
import { AuthManager } from '../../../src/auth/auth-manager';

// Mock AuthManager

const server = setupServer();

describe('confluence API Integration', () => {
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

    // Reset circuit breaker state before each test
    if ((apiClient as any).circuitBreaker) {
      (apiClient as any).circuitBreaker.reset();
    }

    // Reset rate limiter state before each test
    if ((apiClient as any).rateLimiter) {
      (apiClient as any).rateLimiter.reset();
    }

    await apiClient.initialize();
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
        http.get('*/api/v2/pages/:id', ({ request }) => {
          capturedHeaders = request.headers;
          return HttpResponse.json({
            id: '123',
            title: 'Test Page',
            version: { number: 1 },
          });
        }),
      );

      await apiClient.getPage('123');

      expect(capturedHeaders?.get('Authorization')).toBeTruthy();
      expect(capturedHeaders?.get('Authorization')).toMatch(/^Basic .+/);
      expect(capturedHeaders?.get('Accept')).toBe('application/json');
      expect(capturedHeaders?.get('Content-Type')).toBe('application/json');
    });
  });

  describe('error Handling', () => {
    it('should handle 401 authentication errors', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 401 });
        }),
      );

      await expect(apiClient.getPage('123')).rejects.toThrow('CS-401: Authentication failed');
    });

    it('should handle 403 permission errors', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 403 });
        }),
      );

      await expect(apiClient.getPage('123')).rejects.toThrow('CS-403: Permission denied');
    });

    it('should handle 404 not found errors', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      await expect(apiClient.getPage('123')).rejects.toThrow('CS-404');
    });

    it('should handle 429 rate limit errors', async () => {
      let attemptCount = 0;

      server.use(
        http.get('*/api/v2/pages/:id', () => {
          attemptCount++;
          if (attemptCount <= 2) {
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
            version: { number: 1 },
          });
        }),
      );

      // Mock the rate limiter's sleep method to speed up test
      const rateLimiter = (apiClient as any).rateLimiter;
      if (rateLimiter) {
        vi.spyOn(rateLimiter, 'sleep').mockResolvedValue(undefined);
      }

      // Since the rate limiter will throw after retrying, we expect the error
      await expect(apiClient.getPage('123')).rejects.toThrow('CS-429');
      expect(attemptCount).toBeGreaterThanOrEqual(1); // Should have attempted at least once
    });

    it('should handle 500 server errors', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(apiClient.getPage('123')).rejects.toThrow('CS-500: Internal server error');
    });
  });

  describe('test API Operations', () => {
    it('should get a page successfully', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', () => {
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

      const page = await apiClient.getPage('123');

      expect(page.id).toBe('123');
      expect(page.title).toBe('Test Page');
      expect(page.version.number).toBe(1);
    });

    it('should update a page successfully', async () => {
      server.use(
        http.put('*/api/v2/pages/:id', async ({ request }) => {
          const body = await request.json() as any;
          return HttpResponse.json({
            id: body.id,
            title: body.title,
            version: { number: body.version.number },
          });
        }),
      );

      const result = await apiClient.updatePage('123', '<p>Updated</p>', 2, 'Updated Title');

      expect(result.title).toBe('Updated Title');
      expect(result.version.number).toBe(2);
    });

    it('should create a page successfully', async () => {
      server.use(
        http.post('*/api/v2/pages', async ({ request }) => {
          const body = await request.json() as any;
          return HttpResponse.json({
            id: 'new-123',
            title: body.title,
            spaceId: body.spaceId,
          });
        }),
      );

      const result = await apiClient.createPage('space-1', 'New Page', '<p>Content</p>');

      expect(result.id).toBe('new-123');
      expect(result.title).toBe('New Page');
    });

    it('should delete a page successfully', async () => {
      server.use(
        http.delete('*/api/v2/pages/:id', () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      await expect(apiClient.deletePage('123')).resolves.toBeUndefined();
    });

    it('should get space information', async () => {
      server.use(
        http.get('*/api/v2/spaces', ({ request }) => {
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

      const space = await apiClient.getSpace('TEST');

      expect(space.key).toBe('TEST');
      expect(space.name).toBe('Test Space');
    });

    it('should search pages in a space', async () => {
      server.use(
        http.get('*/api/v2/pages', ({ request }) => {
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

      const pages = await apiClient.searchPages('TEST');

      expect(pages).toHaveLength(2);
      expect(pages[0].title).toBe('Page 1');
      expect(pages[1].title).toBe('Page 2');
    });

    it('should get page children', async () => {
      server.use(
        http.get('*/api/v2/pages/:id/children', ({ params }) => {
          const { id } = params;
          if (id === '123') {
            return HttpResponse.json({
              results: [
                { id: 'child-1', title: 'Child 1' },
                { id: 'child-2', title: 'Child 2' },
              ],
            });
          }
          return HttpResponse.json({ results: [] });
        }),
      );

      const children = await apiClient.getPageChildren('123');

      expect(children).toHaveLength(2);
      expect(children[0].id).toBe('child-1');
    });

    it('should get page content', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.has('body-format')) {
            return HttpResponse.json({
              id: '123',
              title: 'Test Page',
              body: {
                storage: {
                  value: '<p>Page content in storage format</p>',
                  representation: 'storage',
                },
              },
            });
          }
          return HttpResponse.json({ id: '123' });
        }),
      );

      const content = await apiClient.getPageContent('123');

      expect(content).toBe('<p>Page content in storage format</p>');
    });
  });

  describe('rate Limiting', () => {
    it('should parse rate limit headers', async () => {
      server.use(
        http.get('*/api/v2/pages/:id', () => {
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

      await apiClient.getPage('123');

      const stats = (apiClient as any).rateLimiter.getStats();
      expect(stats.rateLimitRemaining).toBe(100);
      expect(stats.rateLimitReset).toBeInstanceOf(Date);
    });
  });

  describe('circuit Breaker', () => {
    it('should open circuit after multiple failures', async () => {
      let callCount = 0;

      server.use(
        http.get('*/api/v2/pages/:id', () => {
          callCount++;
          return new HttpResponse(null, { status: 500 });
        }),
      );

      // Should fail 5 times and open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await apiClient.getPage('123');
        }
        catch {
          // Expected to fail
        }
      }

      // Circuit should be open now
      await expect(apiClient.getPage('123')).rejects.toThrow('CS-901: Circuit breaker is open');

      // Should not make additional calls when circuit is open
      expect(callCount).toBe(5);
    });
  });
});
