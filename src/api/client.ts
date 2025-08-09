import type { components, paths } from './types';
import createClient from 'openapi-fetch';
import { AuthManager } from '../auth/auth-manager';
import { logger } from '../utils/logger';
import { CircuitBreaker, ErrorMapper, isTransientError, RetryHandler } from './circuit-breaker';
import { RateLimiter } from './rate-limiter';

// Define response types for better type safety
export type PageBulk = components['schemas']['PageBulk'];
export type PageSingle = components['schemas']['PageSingle'];
export type ChildPage = components['schemas']['ChildPage'];
export type SpaceBulk = components['schemas']['SpaceBulk'];
export type ChildrenResponse = components['schemas']['ChildrenResponse'];
export type FolderSingle = components['schemas']['FolderSingle'];

export class ConfluenceAPIClient {
  private static instance: ConfluenceAPIClient;
  private client: ReturnType<typeof createClient<paths>>;
  private authManager: AuthManager;
  private baseUrl: string = '';
  private circuitBreaker: CircuitBreaker;
  private retryHandler: RetryHandler;
  private rateLimiter: RateLimiter;
  private initialized = false;

  private constructor() {
    this.authManager = AuthManager.getInstance();

    // Configure fetch with connection pooling (keep-alive enabled by default in Bun)
    this.client = createClient<paths>({
      baseUrl: '',
      fetch: (input: string | URL | Request, init?: RequestInit) => {
        // Add keep-alive headers for connection pooling
        const headers = new Headers(init?.headers);
        headers.set('Connection', 'keep-alive');
        headers.set('Keep-Alive', 'timeout=30, max=10');

        return fetch(input, {
          ...init,
          headers,
          // Set request timeout to 30 seconds
          signal: init?.signal || AbortSignal.timeout(30000),
        });
      },
    });

    // Initialize circuit breaker with singleton pattern
    this.circuitBreaker = CircuitBreaker.getInstance({
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

    // Initialize rate limiter with singleton pattern
    this.rateLimiter = RateLimiter.getInstance({
      requestsPerHour: 5000,
      concurrency: 10,
      readConcurrency: 10,
      writeConcurrency: 3,
      warnThreshold: 0.8,
    });
  }

  public static getInstance(): ConfluenceAPIClient {
    if (!ConfluenceAPIClient.instance) {
      ConfluenceAPIClient.instance = new ConfluenceAPIClient();
    }
    return ConfluenceAPIClient.instance;
  }

  public async initialize(): Promise<void> {
    // Prevent double initialization
    if (this.initialized) {
      return;
    }
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

    this.initialized = true;
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

  public async getPage(pageId: string, includeBody = false): Promise<PageSingle > {
    return this.executeWithProtection(async () => {
      // Convert string ID to number as required by the API
      const numericId = Number.parseInt(pageId, 10);
      if (Number.isNaN(numericId)) {
        throw new TypeError(`CS-400: Invalid page ID: ${pageId}`);
      }

      const response = await this.client.GET('/pages/{id}', {
        params: {
          path: { id: numericId },
          query: includeBody
            ? {
                'body-format': 'storage',
                'include-direct-children': true,
              }
            : {},
        },
      });

      if (response.error || !response.data) {
        throw new Error(`CS-404: Failed to get page ${pageId}: ${response.error || 'No data returned'}`);
      }

      return {
        ...response.data,
        // @ts-expect-error Direct children may not be present in all responses
        directChildren: response.data.directChildren || { results: [] }, // Ensure directChildren is always present
      };
    }, { timeout: 30000 }); // 30s timeout for single page
  }

  public async updatePage(pageId: string, body: string, version: number, title: string): Promise<PageSingle> {
    return this.executeWithProtection(async () => {
      // Convert string ID to number as required by the API
      const numericId = Number.parseInt(pageId, 10);
      if (Number.isNaN(numericId)) {
        throw new TypeError(`CS-400: Invalid page ID: ${pageId}`);
      }

      const response = await this.client.PUT('/pages/{id}', {
        params: {
          path: { id: numericId },
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
            number: version,
            message: 'Updated via confluence-sync',
          },
        },
      });

      if (response.error || !response.data) {
        throw new Error(`CS-500: Failed to update page ${pageId}: ${response.error || 'No data returned'}`);
      }

      return response.data;
    }, { timeout: 30000 }); // 30s timeout for single page
  }

  public async getSpace(spaceKey: string) {
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
      return spaces[0];
    }, { timeout: 30000 });
  }

  public async searchPages(spaceKey: string, query?: string): Promise<PageSingle[]> {
    return this.executeWithProtection(async () => {
      // Build query parameters based on V2 API structure
      const queryParams: any = {
        spaceKey: [spaceKey],
        limit: 250,
      };

      // Add title filtering if query is provided
      if (query) {
        queryParams.title = query;
      }

      const response = await this.client.GET('/pages', {
        params: {
          query: queryParams,
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to search pages: ${response.error}`);
      }

      return (response.data?.results || []) as PageSingle[];
    }, { timeout: 300000 }); // 5min timeout for bulk operations
  }

  public async createPage(spaceId: string, title: string, body: string, parentId?: string): Promise<PageSingle> {
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

      if (response.error || !response.data) {
        throw new Error(`CS-500: Failed to create page: ${response.error || 'No data returned'}`);
      }

      return response.data as PageSingle;
    }, { timeout: 30000 });
  }

  public async deletePage(pageId: string): Promise<void> {
    return this.executeWithProtection(async () => {
      // Convert string ID to number as required by the API
      const numericId = Number.parseInt(pageId, 10);
      if (Number.isNaN(numericId)) {
        throw new TypeError(`CS-400: Invalid page ID: ${pageId}`);
      }

      const response = await this.client.DELETE('/pages/{id}', {
        params: {
          path: { id: numericId },
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to delete page ${pageId}: ${response.error}`);
      }
    }, { timeout: 30000 });
  }

  public async getPageChildren(pageId: string): Promise<ChildPage[]> {
    return this.executeWithProtection(async () => {
      // Convert string ID to number as required by the API
      const numericId = Number.parseInt(pageId, 10);
      if (Number.isNaN(numericId)) {
        throw new TypeError(`CS-400: Invalid page ID: ${pageId}`);
      }

      const response = await this.client.GET('/pages/{id}/children', {
        params: {
          path: { id: numericId },
          query: {
            limit: 250,
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-500: Failed to get page children: ${response.error}`);
      }

      return (response.data?.results || []);
    }, { timeout: 300000 }); // 5min timeout for bulk operations
  }

  public async getPageContent(pageId: string): Promise<string> {
    const page = await this.getPage(pageId, true);
    return page.body?.storage?.value || '';
  }

  public async getSpaceDetails(spaceKey: string): Promise<SpaceBulk | null> {
    return this.executeWithProtection(async () => {
      const response = await this.client.GET('/spaces', {
        params: {
          query: {
            keys: [spaceKey],
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-805: Failed to get space ${spaceKey}: ${response.error}`);
      }

      const spaces = response.data?.results || [];
      if (spaces.length === 0) {
        return null;
      }

      // Return enriched space data
      const space = spaces[0];
      if (!space) {
        throw new Error(`CS-404: Space ${spaceKey} not found`);
      }

      return space;
    }, { timeout: 30000 });
  }

  public async getSpacePages(spaceId: number, options: { limit?: number } = {}) {
    return this.executeWithProtection(async () => {
      const { limit = 250 } = options;

      const response = await this.client.GET('/pages', {
        params: {
          query: {
            'space-id': [spaceId],
            limit,
            'sort': 'id',
            'body-format': 'storage',
          },
        },
      });

      if (response.error) {
        throw new Error(`CS-806: Failed to get pages from space ${spaceId}: ${response.error}`);
      }
      if (!response.data) {
        throw new Error(`CS-404: No pages found in space ${spaceId}`);
      }

      return response.data;
    }, { timeout: 300000 }); // 5min timeout for bulk operations
  }

  public async getFolder(folderId: string): Promise<FolderSingle> {
    return this.executeWithProtection(async () => {
      // Convert string ID to number as required by the API
      const numericId = Number.parseInt(folderId, 10);
      if (Number.isNaN(numericId)) {
        throw new TypeError(`CS-400: Invalid folder ID: ${folderId}`);
      }

      const response = await this.client.GET('/folders/{id}', {
        params: {
          path: { id: numericId },
        },
      });

      if (response.error || !response.data) {
        throw new Error(`CS-404: Failed to get folder ${folderId}: ${response.error || 'No data returned'}`);
      }

      return response.data;
    }, { timeout: 30000 }); // 30s timeout for single folder
  }

  /**
   * Get multiple pages by their IDs in a single batch request.
   * Confluence API supports up to 250 page IDs per request.
   * @param pageIds Array of page IDs to fetch
   * @param includeBody Whether to include page body content
   * @returns Array of pages that were found (may be partial if some IDs don't exist)
   */
  public async batchGetPages(pageIds: string[], includeBody = false): Promise<PageSingle[]> {
    return this.executeWithProtection(async () => {
      if (pageIds.length === 0) {
        return [];
      }

      // Confluence API has a limit of 250 IDs per request
      const MAX_BATCH_SIZE = 250;
      const batches: string[][] = [];

      // Split into batches if necessary
      for (let i = 0; i < pageIds.length; i += MAX_BATCH_SIZE) {
        batches.push(pageIds.slice(i, i + MAX_BATCH_SIZE));
      }

      // Process each batch
      const allPages: PageSingle[] = [];

      for (const batch of batches) {
        // Convert string IDs to numbers as required by the API
        const numericIds = batch.map((id) => {
          const numId = Number.parseInt(id, 10);
          if (Number.isNaN(numId)) {
            throw new TypeError(`CS-400: Invalid page ID in batch: ${id}`);
          }
          return numId;
        });

        const response = await this.client.GET('/pages', {
          params: {
            query: {
              'id': numericIds,
              'limit': MAX_BATCH_SIZE,
              'body-format': includeBody ? 'storage' : undefined,
            },
          },
        });

        if (response.error) {
          // Log error but continue with partial results
          logger.error(`CS-901: Batch request failed for IDs ${batch.join(',')}: ${response.error}`);
          continue;
        }

        const pages = response.data?.results || [];
        allPages.push(...pages);
      }

      return allPages;
    }, { timeout: 300000 }); // 5min timeout for batch operations
  }

  /**
   * Create multiple pages in batch.
   * Note: Confluence doesn't have a native batch create endpoint,
   * so this method uses concurrent requests with rate limiting.
   * @param pages Array of page data to create
   * @returns Array of created pages and errors
   */
  public async batchCreatePages(
    pages: Array<{
      spaceId: string;
      title: string;
      body: string;
      parentId?: string;
    }>,
  ): Promise<{
      successes: PageSingle[];
      failures: Array<{ index: number; error: string }>;
    }> {
    return this.executeWithProtection(async () => {
      const successes: PageSingle[] = [];
      const failures: Array<{ index: number; error: string }> = [];

      // Use Promise.allSettled for concurrent creation with error handling
      const results = await Promise.allSettled(
        pages.map((page, index) =>
          this.createPage(page.spaceId, page.title, page.body, page.parentId)
            .then(result => ({ index, result }))
            .catch((error) => {
              failures.push({ index, error: error.message });
              throw error;
            }),
        ),
      );

      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          successes.push(result.value.result);
        }
      }

      return { successes, failures };
    }, { timeout: 600000 }); // 10min timeout for large batch operations
  }

  /**
   * Update multiple pages in batch.
   * Note: Confluence doesn't have a native batch update endpoint,
   * so this method uses concurrent requests with rate limiting.
   * @param updates Array of page updates
   * @returns Array of updated pages and errors
   */
  public async batchUpdatePages(
    updates: Array<{
      pageId: string;
      body: string;
      version: number;
      title: string;
    }>,
  ): Promise<{
      successes: PageSingle[];
      failures: Array<{ index: number; error: string }>;
    }> {
    return this.executeWithProtection(async () => {
      const successes: PageSingle[] = [];
      const failures: Array<{ index: number; error: string }> = [];

      // Use Promise.allSettled for concurrent updates with error handling
      const results = await Promise.allSettled(
        updates.map((update, index) =>
          this.updatePage(update.pageId, update.body, update.version, update.title)
            .then(result => ({ index, result }))
            .catch((error) => {
              failures.push({ index, error: error.message });
              throw error;
            }),
        ),
      );

      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          successes.push(result.value.result);
        }
      }

      return { successes, failures };
    }, { timeout: 600000 }); // 10min timeout for large batch operations
  }

  /**
   * Delete multiple pages in batch.
   * Note: Confluence doesn't have a native batch delete endpoint,
   * so this method uses concurrent requests with rate limiting.
   * @param pageIds Array of page IDs to delete
   * @returns Deletion results with successes and failures
   */
  public async batchDeletePages(
    pageIds: string[],
  ): Promise<{
      successes: string[];
      failures: Array<{ pageId: string; error: string }>;
    }> {
    return this.executeWithProtection(async () => {
      const successes: string[] = [];
      const failures: Array<{ pageId: string; error: string }> = [];

      // Use Promise.allSettled for concurrent deletion with error handling
      const results = await Promise.allSettled(
        pageIds.map(pageId =>
          this.deletePage(pageId)
            .then(() => ({ pageId, success: true }))
            .catch((error) => {
              failures.push({ pageId, error: error.message });
              throw error;
            }),
        ),
      );

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const pageId = pageIds[i];
        if (result && pageId && result.status === 'fulfilled') {
          successes.push(pageId);
        }
      }

      return { successes, failures };
    }, { timeout: 600000 }); // 10min timeout for large batch operations
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

// Export singleton instance
export const apiClient = ConfluenceAPIClient.getInstance();
