import type { paths } from './types';
import createClient from 'openapi-fetch';
import { AuthManager } from '../auth/auth-manager';
import { CircuitBreaker, ErrorMapper, isTransientError, RetryHandler } from './circuit-breaker';
import { RateLimiter } from './rate-limiter';

export class ConfluenceAPIClient {
  private client: ReturnType<typeof createClient<paths>>;
  private authManager: AuthManager;
  private baseUrl: string = '';
  private circuitBreaker: CircuitBreaker;
  private retryHandler: RetryHandler;
  private rateLimiter: RateLimiter;

  constructor() {
    this.authManager = AuthManager.getInstance();
    this.client = createClient<paths>({
      baseUrl: '',
    });

    // Initialize circuit breaker with 5 failures threshold, 30s reset timeout
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 2,
    });

    // Initialize retry handler with exponential backoff and jitter
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
      jitter: true,
    });

    // Initialize rate limiter for Cloud instances (5000 requests/hour)
    this.rateLimiter = new RateLimiter({
      requestsPerHour: 5000,
      concurrency: 10,
      warnThreshold: 0.8,
    });
  }

  public async initialize(): Promise<void> {
    const credentials = await this.authManager.getStoredCredentials();
    if (!credentials?.url) {
      throw new Error('CS-401: No stored credentials found. Please authenticate first.');
    }

    // Convert URL to V2 API format if needed
    this.baseUrl = this.normalizeApiUrl(credentials.url);

    // Recreate client with proper base URL
    this.client = createClient<paths>({
      baseUrl: this.baseUrl,
    });

    // Set up middleware for authentication and response handling
    this.client.use({
      onRequest: async ({ request }) => {
        const authToken = await this.authManager.getToken();
        request.headers.set('Authorization', authToken);
        request.headers.set('Accept', 'application/json');
        request.headers.set('Content-Type', 'application/json');
        return request;
      },
      onResponse: async ({ response }) => {
        // Update rate limiter with response headers
        this.rateLimiter.updateFromHeaders(response.headers);

        // Handle errors
        if (!response.ok) {
          const error = ErrorMapper.mapHttpError(response.status, response.statusText);
          throw error;
        }

        return response;
      },
    });
  }

  private normalizeApiUrl(url: string): string {
    // Remove trailing slash
    url = url.replace(/\/$/, '');

    // Check if it's a Cloud instance
    if (url.includes('.atlassian.net')) {
      // Ensure it points to v2 API
      if (!url.includes('/wiki/api/v2')) {
        if (url.includes('/wiki/rest/api')) {
          return url.replace('/wiki/rest/api', '/wiki/api/v2');
        }
        return `${url}/wiki/api/v2`;
      }
      return url;
    }

    // For Server instances, use v2 API if available
    if (!url.includes('/api/v2')) {
      if (url.includes('/rest/api')) {
        return url.replace('/rest/api', '/api/v2');
      }
      return `${url}/api/v2`;
    }

    return url;
  }

  public async getPage(pageId: string, expand?: string[]): Promise<any> {
    return this.executeWithProtection(async () => {
      const response = await this.client.GET('/pages/{id}', {
        params: {
          path: { id: pageId },
          query: expand ? { expand: expand.join(',') } : {},
        },
      });

      if (response.error) {
        throw new Error(`CS-404: Failed to get page ${pageId}: ${response.error}`);
      }

      return response.data;
    }, { timeout: 30000 }); // 30s timeout for single page
  }

  public async updatePage(pageId: string, title: string, body: string, version: number): Promise<any> {
    return this.executeWithProtection(async () => {
      const response = await this.client.PUT('/pages/{id}', {
        params: {
          path: { id: pageId },
        },
        body: {
          id: pageId,
          status: 'current',
          title,
          body: {
            representation: 'storage',
            value: body,
          },
          version: {
            number: version + 1,
            message: 'Updated via confluence-sync',
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to update page ${pageId}: ${response.error}`);
      }

      return response.data;
    }, { timeout: 30000 }); // 30s timeout for single page
  }

  public async getSpace(spaceKey: string): Promise<any> {
    return this.executeWithProtection(async () => {
      const response = await this.client.GET('/spaces', {
        params: {
          query: {
            keys: [spaceKey],
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-404: Failed to get space ${spaceKey}: ${response.error}`);
      }

      const spaces = response.data?.results || [];
      return spaces.length > 0 ? spaces[0] : null;
    }, { timeout: 30000 });
  }

  public async searchPages(spaceKey: string, _query?: string): Promise<any[]> {
    return this.executeWithProtection(async () => {
      // Note: cql would be used for V1 API, but V2 uses different query params
      // const cql = query
      //   ? `space.key="${spaceKey}" AND title~"${query}"`
      //   : `space.key="${spaceKey}"`;

      const response = await this.client.GET('/pages', {
        params: {
          query: {
            spaceKey: [spaceKey],
            limit: 250,
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to search pages: ${response.error}`);
      }

      return response.data?.results || [];
    }, { timeout: 300000 }); // 5min timeout for bulk operations
  }

  public async createPage(spaceId: string, title: string, body: string, parentId?: string): Promise<any> {
    return this.executeWithProtection(async () => {
      const requestBody: any = {
        spaceId,
        status: 'current',
        title,
        body: {
          representation: 'storage',
          value: body,
        },
      };

      if (parentId) {
        requestBody.parentId = parentId;
      }

      const response = await this.client.POST('/pages', {
        body: requestBody,
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to create page: ${response.error}`);
      }

      return response.data;
    }, { timeout: 30000 });
  }

  public async deletePage(pageId: string): Promise<void> {
    return this.executeWithProtection(async () => {
      const response = await this.client.DELETE('/pages/{id}', {
        params: {
          path: { id: pageId },
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to delete page ${pageId}: ${response.error}`);
      }
    }, { timeout: 30000 });
  }

  public async getPageChildren(pageId: string): Promise<any[]> {
    return this.executeWithProtection(async () => {
      const response = await this.client.GET('/pages/{id}/children', {
        params: {
          path: { id: pageId },
          query: {
            limit: 250,
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to get page children: ${response.error}`);
      }

      return response.data?.results || [];
    }, { timeout: 300000 }); // 5min timeout for bulk operations
  }

  public async getPageContent(pageId: string): Promise<string> {
    return this.executeWithProtection(async () => {
      const response = await this.client.GET('/pages/{id}/body', {
        params: {
          path: { id: pageId },
          query: {
            body_format: 'storage',
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-404: Failed to get page content: ${response.error}`);
      }

      return response.data?.storage?.value || '';
    }, { timeout: 30000 });
  }

  private async executeWithProtection<T>(
    fn: () => Promise<T>,
    options: { timeout?: number } = {},
  ): Promise<T> {
    const timeout = options.timeout || 30000; // Default 30s timeout

    // Execute with rate limiting
    return this.rateLimiter.execute(async () => {
      // Execute with circuit breaker
      return this.circuitBreaker.execute(async () => {
        // Execute with retry logic
        return this.retryHandler.execute(
          async () => {
            // Add timeout wrapper
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
              const result = await fn();
              clearTimeout(timeoutId);
              return result;
            }
            catch (error: any) {
              clearTimeout(timeoutId);

              if (error.name === 'AbortError') {
                throw new Error(`CS-504: Request timeout after ${timeout / 1000}s`);
              }

              // Sanitize error before rethrowing
              throw ErrorMapper.sanitizeError(error);
            }
          },
          isTransientError,
        );
      });
    });
  }
}

export const apiClient = new ConfluenceAPIClient();
