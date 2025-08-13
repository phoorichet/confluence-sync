import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache } from '../../../src/utils/cache';

describe('cache', () => {
  let cache: Cache;

  beforeEach(() => {
    // Reset singleton instance
    (Cache as any).instance = null;
    cache = Cache.getInstance({
      maxSize: 1024 * 1024, // 1MB for testing
      defaultTTL: 1000, // 1 second for testing
      maxEntries: 10,
    });
  });

  afterEach(() => {
    // Properly destroy the cache singleton to stop timers
    Cache.destroy();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = Cache.getInstance();
      const instance2 = Cache.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('get/set', () => {
    it('should store and retrieve data', () => {
      const data = { test: 'value' };
      cache.set('test-key', data);

      const retrieved = cache.get('test-key');
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should respect TTL', async () => {
      cache.set('temp-key', 'value', 'metadata', 100); // 100ms TTL

      expect(cache.get('temp-key')).toBe('value');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('temp-key')).toBeNull();
    });

    it('should update hits counter', () => {
      cache.set('hit-key', 'value');

      cache.get('hit-key');
      cache.get('hit-key');
      cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should handle different data types', () => {
      cache.set('page:123', { id: '123', content: 'page data' }, 'page');
      cache.set('metadata:456', { version: 1, author: 'user' }, 'metadata');
      cache.set('content:789', '<p>HTML content</p>', 'content');

      expect(cache.get('page:123')).toHaveProperty('id', '123');
      expect(cache.get('metadata:456')).toHaveProperty('version', 1);
      expect(cache.get('content:789')).toBe('<p>HTML content</p>');
    });
  });

  describe('delete', () => {
    it('should remove item from cache', () => {
      cache.set('delete-key', 'value');
      expect(cache.get('delete-key')).toBe('value');

      const deleted = cache.delete('delete-key');
      expect(deleted).toBe(true);
      expect(cache.get('delete-key')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should update size when deleting', () => {
      cache.set('size-key', 'test value');
      const statsBefor

 = cache.getStats();
      const sizeBefore = statsBefor

        .size;

      cache.delete('size-key');
      const statsAfter = cache.getStats();
      expect(statsAfter.size).toBeLessThan(sizeBefore);
    });
  });

  describe('invalidate', () => {
    it('should invalidate by string pattern', () => {
      cache.set('page:1', 'data1');
      cache.set('page:2', 'data2');
      cache.set('metadata:1', 'meta1');

      const count = cache.invalidate('^page:');
      expect(count).toBe(2);

      expect(cache.get('page:1')).toBeNull();
      expect(cache.get('page:2')).toBeNull();
      expect(cache.get('metadata:1')).toBe('meta1');
    });

    it('should invalidate by regex pattern', () => {
      cache.set('test-1', 'data1');
      cache.set('test-2', 'data2');
      cache.set('prod-1', 'prod1');

      const count = cache.invalidate(/test-\d+/);
      expect(count).toBe(2);

      expect(cache.get('test-1')).toBeNull();
      expect(cache.get('test-2')).toBeNull();
      expect(cache.get('prod-1')).toBe('prod1');
    });
  });

  describe('invalidatePage', () => {
    it('should invalidate all entries for a page', () => {
      const pageId = '12345';
      cache.set(`page:${pageId}`, 'page data');
      cache.set(`content:${pageId}`, 'content data');
      cache.set(`metadata:${pageId}`, 'metadata');
      cache.set('page:67890', 'other page');

      cache.invalidatePage(pageId);

      expect(cache.get(`page:${pageId}`)).toBeNull();
      expect(cache.get(`content:${pageId}`)).toBeNull();
      expect(cache.get(`metadata:${pageId}`)).toBeNull();
      expect(cache.get('page:67890')).toBe('other page');
    });
  });

  describe('lRU eviction', () => {
    it('should evict least recently used when max entries reached', () => {
      // Fill cache to max (10 entries)
      for (let i = 0; i < 10; i++) {
        cache.set(`key-${i}`, `value-${i}`);
      }

      // Access some entries to make them more recent
      cache.get('key-5');
      cache.get('key-7');

      // Add new entry, should evict key-0 (least recently used)
      cache.set('key-new', 'new value');

      expect(cache.get('key-0')).toBeNull(); // Evicted
      expect(cache.get('key-5')).toBe('value-5'); // Still there
      expect(cache.get('key-new')).toBe('new value');
    });

    it('should evict when max size reached', () => {
      // Create large data that fills most of cache
      const largeData = 'x'.repeat(500 * 1024); // 500KB * 2 bytes = ~1MB
      cache.set('large-1', largeData);

      // Try to add another large item
      cache.set('large-2', largeData);

      // First should be evicted
      expect(cache.get('large-1')).toBeNull();
      expect(cache.get('large-2')).toBe(largeData);
    });

    it('should not cache items larger than max size', () => {
      const hugeData = 'x'.repeat(2 * 1024 * 1024); // 4MB (2MB * 2 bytes)
      cache.set('huge', hugeData);

      expect(cache.get('huge')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
      expect(cache.get('key1')).toBeNull();
    });

    it('should reset statistics', () => {
      cache.set('key', 'value');
      cache.get('key');
      cache.get('non-existent');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('page:1', { data: 'page' }, 'page');
      cache.set('metadata:1', { data: 'meta' }, 'metadata');
      cache.set('content:1', 'content', 'content');

      cache.get('page:1'); // hit
      cache.get('non-existent'); // miss

      const stats = cache.getStats();

      expect(stats.entries).toBe(3);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(50, 0);
      expect(stats.sizeByType).toHaveProperty('page');
      expect(stats.sizeByType).toHaveProperty('metadata');
      expect(stats.sizeByType).toHaveProperty('content');
    });
  });

  describe('generateKey', () => {
    it('should generate cache key without version', () => {
      const key = Cache.generateKey('page', '123');
      expect(key).toBe('page:123');
    });

    it('should generate cache key with version', () => {
      const key = Cache.generateKey('page', '123', 5);
      expect(key).toBe('page:123:v5');
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired entries', async () => {
      cache.set('short-1', 'value1', 'metadata', 50); // 50ms TTL
      cache.set('short-2', 'value2', 'metadata', 50); // 50ms TTL
      cache.set('long', 'value3', 'metadata', 1000); // 1s TTL

      await new Promise(resolve => setTimeout(resolve, 100));

      const cleaned = cache.cleanupExpired();

      expect(cleaned).toBe(2);
      expect(cache.get('short-1')).toBeNull();
      expect(cache.get('short-2')).toBeNull();
      expect(cache.get('long')).toBe('value3');
    });
  });

  describe('warmup', () => {
    it('should preload cache with data', async () => {
      const loader = vi.fn().mockResolvedValue([
        { key: 'pre-1', data: 'data1', type: 'metadata' as const },
        { key: 'pre-2', data: 'data2', type: 'page' as const },
      ]);

      await cache.warmup(loader);

      expect(loader).toHaveBeenCalled();
      expect(cache.get('pre-1')).toBe('data1');
      expect(cache.get('pre-2')).toBe('data2');
    });

    it('should handle warmup errors gracefully', async () => {
      const loader = vi.fn().mockRejectedValue(new Error('Load failed'));

      await cache.warmup(loader);

      expect(loader).toHaveBeenCalled();
      // Should not throw, just log error
      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
    });
  });
});
