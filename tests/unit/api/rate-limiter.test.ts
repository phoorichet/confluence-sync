import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter, TokenBucket } from '../../../src/api/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter = new RateLimiter({
      requestsPerHour: 100,
      concurrency: 2,
      warnThreshold: 0.8,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const limiter = new RateLimiter();
      const stats = limiter.getStats();
      
      expect(stats.requestsPerHour).toBe(5000);
      expect(stats.requestCount).toBe(0);
    });

    it('should initialize with custom values', () => {
      const stats = rateLimiter.getStats();
      
      expect(stats.requestsPerHour).toBe(100);
      expect(stats.requestCount).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute function and increment request count', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      
      const result = await rateLimiter.execute(mockFn);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
      
      const stats = rateLimiter.getStats();
      expect(stats.requestCount).toBe(1);
    });

    it('should handle concurrent requests up to limit', async () => {
      const mockFn = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('result'), 10)),
      );
      
      // Execute 3 concurrent requests (limit is 2)
      const promises = [
        rateLimiter.execute(mockFn),
        rateLimiter.execute(mockFn),
        rateLimiter.execute(mockFn),
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toEqual(['result', 'result', 'result']);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle 429 rate limit errors', async () => {
      const error = new Error('Too Many Requests');
      (error as any).status = 429;
      
      let callCount = 0;
      const mockFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });
      
      // Mock the sleep method to speed up test
      vi.spyOn(rateLimiter as any, 'sleep').mockResolvedValue(undefined);
      
      const result = await rateLimiter.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateFromHeaders', () => {
    it('should update rate limit info from headers', () => {
      const headers = {
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '1234567890',
      };
      
      rateLimiter.updateFromHeaders(headers);
      
      const stats = rateLimiter.getStats();
      expect(stats.rateLimitRemaining).toBe(50);
      expect(stats.rateLimitReset).toEqual(new Date(1234567890 * 1000));
    });

    it('should handle Headers object', () => {
      const headers = new Headers();
      headers.set('x-ratelimit-remaining', '25');
      headers.set('x-ratelimit-reset', '1234567890');
      
      rateLimiter.updateFromHeaders(headers);
      
      const stats = rateLimiter.getStats();
      expect(stats.rateLimitRemaining).toBe(25);
    });

    it('should handle missing headers gracefully', () => {
      const headers = {};
      
      rateLimiter.updateFromHeaders(headers);
      
      const stats = rateLimiter.getStats();
      expect(stats.rateLimitRemaining).toBeUndefined();
      expect(stats.rateLimitReset).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      
      await rateLimiter.execute(mockFn);
      await rateLimiter.execute(mockFn);
      
      const stats = rateLimiter.getStats();
      
      expect(stats.requestCount).toBe(2);
      expect(stats.requestsPerHour).toBe(100);
      expect(stats.usage).toBe(2);
      expect(stats.windowStart).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    it('should reset all counters', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      
      await rateLimiter.execute(mockFn);
      
      let stats = rateLimiter.getStats();
      expect(stats.requestCount).toBe(1);
      
      rateLimiter.reset();
      
      stats = rateLimiter.getStats();
      expect(stats.requestCount).toBe(0);
      expect(stats.rateLimitRemaining).toBeUndefined();
      expect(stats.rateLimitReset).toBeUndefined();
    });
  });
});

describe('TokenBucket', () => {
  let bucket: TokenBucket;

  beforeEach(() => {
    vi.clearAllMocks();
    bucket = new TokenBucket(10, 3600); // 10 tokens, refill 3600/hour
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with full capacity', () => {
      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });

  describe('acquire', () => {
    it('should consume tokens when available', async () => {
      await bucket.acquire(3);
      expect(bucket.getAvailableTokens()).toBe(7);
    });

    it('should wait when not enough tokens', async () => {
      // Mock sleep to speed up test
      vi.spyOn(bucket as any, 'sleep').mockResolvedValue(undefined);
      
      // Consume all tokens
      await bucket.acquire(10);
      expect(bucket.getAvailableTokens()).toBe(0);
      
      // Try to acquire more - should wait
      await bucket.acquire(1);
      
      // Sleep should have been called
      expect((bucket as any).sleep).toHaveBeenCalled();
    });

    it('should refill tokens over time', async () => {
      // Use all tokens
      await bucket.acquire(10);
      expect(bucket.getAvailableTokens()).toBe(0);
      
      // Simulate time passing by manually refilling
      bucket['lastRefill'] = Date.now() - 1000; // 1 second ago
      
      // Tokens should be refilled (1 token per second with 3600/hour rate)
      const available = bucket.getAvailableTokens();
      expect(available).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset to full capacity', async () => {
      await bucket.acquire(5);
      expect(bucket.getAvailableTokens()).toBe(5);
      
      bucket.reset();
      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });
});