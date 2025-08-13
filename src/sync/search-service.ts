import { ApiClient } from '../api/client.js';
import { Cache } from '../utils/cache.js';
import { CQLBuilder } from '../utils/cql-builder.js';
import { logger } from '../utils/logger.js';

export interface SearchOptions {
  query?: string;
  author?: string;
  modifiedAfter?: string;
  labels?: string[];
  spaces?: string[];
  cql?: string;
  limit?: number;
  start?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'page' | 'blogpost';
  spaceKey: string;
  spaceName: string;
  lastModified: Date;
  author: string;
  contentSnippet: string;
  url: string;
  score?: number;
}

export class SearchService {
  private static instance: SearchService;
  private apiClient: any; // ApiClient instance
  private cache: Cache;

  private constructor() {
    this.apiClient = ApiClient.getInstance();
    this.cache = Cache.getInstance();
  }

  public static getInstance(): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService();
    }
    return SearchService.instance;
  }

  public async search(options: SearchOptions): Promise<SearchResult[]> {
    // Initialize API client if needed
    await this.apiClient.initialize();

    // Check cache first
    const cacheKey = this.getCacheKey(options);
    const cachedResults = this.cache.get(cacheKey);
    if (cachedResults) {
      logger.debug('Returning cached search results');
      return cachedResults as SearchResult[];
    }

    let cqlQuery: string;

    if (options.cql) {
      // Use raw CQL if provided
      cqlQuery = options.cql;
    }
    else {
      // Build CQL from options
      const cqlBuilder = new CQLBuilder();

      if (options.query) {
        cqlBuilder.addTextSearch(options.query);
      }

      if (options.author) {
        cqlBuilder.addAuthorFilter(options.author);
      }

      if (options.modifiedAfter) {
        cqlBuilder.addDateFilter('lastmodified', '>', options.modifiedAfter);
      }

      if (options.labels && options.labels.length > 0) {
        cqlBuilder.addLabelFilter(options.labels);
      }

      if (options.spaces && options.spaces.length > 0) {
        cqlBuilder.addSpaceFilter(options.spaces);
      }

      cqlQuery = cqlBuilder.build();
    }

    logger.debug(`Executing CQL query: ${cqlQuery}`);

    try {
      const results = await this.searchByCQL(cqlQuery, options.limit || 25, options.start || 0);

      // Cache results for 5 minutes
      this.cache.set(cacheKey, results);

      return results;
    }
    catch (error) {
      logger.error('Search failed:', error);
      throw new Error(`Search failed: ${error}`);
    }
  }

  public async searchByText(query: string, limit = 25, start = 0): Promise<SearchResult[]> {
    const cqlQuery = `text ~ "${query.replace(/"/g, '\\"')}"`;
    return this.searchByCQL(cqlQuery, limit, start);
  }

  public async searchByCQL(cql: string, limit = 25, start = 0): Promise<SearchResult[]> {
    try {
      const response = await this.apiClient.searchContent({
        cql,
        limit,
        start,
        expand: ['space', 'version', 'body.view'],
      });

      if (!response || !response.results) {
        return [];
      }

      const results: SearchResult[] = response.results.map((item: any) => ({
        id: item.id,
        title: item.title,
        type: item.type as 'page' | 'blogpost',
        spaceKey: item.space?.key || '',
        spaceName: item.space?.name || '',
        lastModified: new Date(item.version?.when || item.history?.lastUpdated?.when || Date.now()),
        author: item.version?.by?.displayName || item.history?.lastUpdated?.by?.displayName || 'Unknown',
        contentSnippet: this.extractSnippet(item.body?.view?.value || ''),
        url: `${this.apiClient.getBaseUrl()}${item._links?.webui || ''}`,
        score: item.score,
      }));

      return results;
    }
    catch (error: any) {
      if (error.response?.status === 400) {
        throw new Error(`Invalid CQL query: ${error.response.data?.message || 'Bad request'}`);
      }
      throw error;
    }
  }

  private extractSnippet(htmlContent: string): string {
    // Remove HTML tags and get first 100 characters
    // Security: Sanitize HTML to prevent XSS in display
    const textContent = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove style tags
      .replace(/<[^>]*>/g, ' ') // Remove remaining HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    return textContent.length > 100 ? textContent.substring(0, 100) : textContent;
  }

  private getCacheKey(options: SearchOptions): string {
    const key = {
      query: options.query,
      author: options.author,
      modifiedAfter: options.modifiedAfter,
      labels: options.labels?.sort(),
      spaces: options.spaces?.sort(),
      cql: options.cql,
      limit: options.limit,
      start: options.start,
    };
    return `search:${JSON.stringify(key)}`;
  }

  public async validateCQL(cql: string): Promise<boolean> {
    try {
      // Test the CQL with limit 1 to validate syntax
      await this.searchByCQL(cql, 1, 0);
      return true;
    }
    catch (error: any) {
      if (error.message?.includes('Invalid CQL')) {
        return false;
      }
      // Other errors might be network/auth issues, not CQL syntax
      throw error;
    }
  }
}
