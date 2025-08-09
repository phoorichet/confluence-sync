import { logger } from './logger';

export interface CacheEntry {
  key: string;
  data: any;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  hits: number;
  type: 'page' | 'metadata' | 'content';
}

export interface CacheOptions {
  maxSize?: number; // Maximum cache size in bytes
  defaultTTL?: number; // Default time-to-live in milliseconds
  maxEntries?: number; // Maximum number of entries
}

export class Cache {
  private static instance: Cache | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private readonly maxEntries: number;
  private currentSize = 0;
  private hits = 0;
  private misses = 0;

  private constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
    this.defaultTTL = options.defaultTTL || 15 * 60 * 1000; // 15 minutes default
    this.maxEntries = options.maxEntries || 1000;

    // Start periodic cleanup of expired entries
    this.startCleanupTimer();
  }

  /**
   * Periodically clean up expired entries to prevent memory leaks
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Run every minute
  }


  static getInstance(options?: CacheOptions): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache(options);
    }
    return Cache.instance;
  }

  /**
   * Get an item from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      logger.debug(`Cache miss for key: ${key}`);
      return null;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      logger.debug(`Cache expired for key: ${key}`);
      return null;
    }

    // Update hits and access time for LRU
    entry.hits++;
    this.hits++;
    logger.debug(`Cache hit for key: ${key} (${entry.hits} hits)`);

    // Move to end for LRU (delete and re-add)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Set an item in cache
   */
  set(
    key: string,
    data: any,
    type: 'page' | 'metadata' | 'content' = 'metadata',
    ttl?: number,
  ): void {
    const size = this.calculateSize(data);

    // Check if item is too large
    if (size > this.maxSize) {
      logger.warn(`Item too large for cache: ${key} (${size} bytes)`);
      return;
    }

    // Make room if needed
    while (this.currentSize + size > this.maxSize || this.cache.size >= this.maxEntries) {
      if (!this.evictLRU()) {
        logger.warn('Unable to make room in cache');
        return;
      }
    }

    const entry: CacheEntry = {
      key,
      data,
      size,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (ttl || this.defaultTTL)),
      hits: 0,
      type,
    };

    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    this.cache.set(key, entry);
    this.currentSize += size;
    logger.debug(`Cached ${type} for key: ${key} (${size} bytes, expires: ${entry.expiresAt.toISOString()})`);
  }

  /**
   * Delete an item from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentSize -= entry.size;
    logger.debug(`Deleted cache entry: ${key}`);
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
    logger.info('Cache cleared');
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidate(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const [key, _entry] of this.cache.entries()) {
      if (regex.test(key)) {
        this.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`Invalidated ${count} cache entries matching pattern: ${pattern}`);
    }
    return count;
  }

  /**
   * Invalidate cache for a specific page
   */
  invalidatePage(pageId: string): void {
    // Invalidate all cache entries related to this page
    this.invalidate(`^(page|content|metadata):${pageId}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    sizeByType: Record<string, number>;
  } {
    const sizeByType: Record<string, number> = {
      page: 0,
      metadata: 0,
      content: 0,
    };

    for (const entry of this.cache.values()) {
      sizeByType[entry.type] = (sizeByType[entry.type] || 0) + entry.size;
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      entries: this.cache.size,
      size: this.currentSize,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      sizeByType,
    };
  }

  /**
   * Generate cache key
   */
  static generateKey(type: string, id: string, version?: number): string {
    if (version !== undefined) {
      return `${type}:${id}:v${version}`;
    }
    return `${type}:${id}`;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): boolean {
    // Map maintains insertion order, so first entry is oldest
    const firstKey = this.cache.keys().next().value;
    if (!firstKey) {
      return false;
    }

    const entry = this.cache.get(firstKey);
    if (entry) {
      logger.debug(`Evicting LRU cache entry: ${firstKey} (${entry.hits} hits)`);
      this.delete(firstKey);
      return true;
    }
    return false;
  }

  /**
   * Calculate approximate size of data in bytes
   */
  private calculateSize(data: any): number {
    if (typeof data === 'string') {
      return data.length * 2; // Approximate UTF-16 size
    }

    try {
      const json = JSON.stringify(data);
      return json.length * 2;
    }
    catch {
      // If can't stringify, estimate based on object keys
      return 1024; // Default 1KB for unknown objects
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): number {
    const now = new Date();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`Cleaned up ${count} expired cache entries`);
    }
    return count;
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmup(loader: () => Promise<Array<{ key: string; data: any; type: CacheEntry['type'] }>>): Promise<void> {
    try {
      const items = await loader();
      for (const item of items) {
        this.set(item.key, item.data, item.type);
      }
      logger.info(`Cache warmed up with ${items.length} items`);
    }
    catch (error) {
      logger.error('Failed to warm up cache', error);
    }
  }
}
