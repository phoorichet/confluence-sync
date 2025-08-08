import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  ErrorMapper,
  isTransientError,
  RetryHandler,
} from '../../../src/api/circuit-breaker';

describe('circuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100, // Short timeout for testing
      successThreshold: 2,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    it('should execute function when circuit is closed', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('failure'));

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        }
        catch {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Should reject immediately when open
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('CS-503: Circuit breaker is open');
      expect(mockFn).toHaveBeenCalledTimes(3); // Not called on 4th attempt
    });

    it('should enter half-open state after reset timeout', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        }
        catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow one attempt in half-open state
      const result = await circuitBreaker.execute(mockFn);
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after success threshold in half-open', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      // Manually set to half-open state
      circuitBreaker.state = CircuitState.HALF_OPEN;

      // Succeed twice (threshold)
      await circuitBreaker.execute(mockFn);
      await circuitBreaker.execute(mockFn);

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('failure'));

      // Manually set to half-open state
      circuitBreaker.state = CircuitState.HALF_OPEN;

      try {
        await circuitBreaker.execute(mockFn);
      }
      catch {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        }
        catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });
});

describe('retryHandler', () => {
  let retryHandler: RetryHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    retryHandler = new RetryHandler({
      maxRetries: 3,
      initialDelay: 10,
      maxDelay: 100,
      factor: 2,
      jitter: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await retryHandler.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValue('success');

      // Mock sleep to speed up test
      vi.spyOn(retryHandler as any, 'sleep').mockResolvedValue(undefined);

      const result = await retryHandler.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should respect max retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('failure'));

      // Mock sleep to speed up test
      vi.spyOn(retryHandler as any, 'sleep').mockResolvedValue(undefined);

      await expect(retryHandler.execute(mockFn)).rejects.toThrow('failure');
      expect(mockFn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should use exponential backoff', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('failure'));
      const sleepSpy = vi.spyOn(retryHandler as any, 'sleep').mockResolvedValue(undefined);

      try {
        await retryHandler.execute(mockFn);
      }
      catch {
        // Expected
      }

      // Check delays: 10ms, 20ms, 40ms
      expect(sleepSpy).toHaveBeenCalledTimes(3);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 10);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 20);
      expect(sleepSpy).toHaveBeenNthCalledWith(3, 40);
    });

    it('should check if error is retryable', async () => {
      const nonRetryableError = new Error('not retryable');
      const mockFn = vi.fn().mockRejectedValue(nonRetryableError);
      const isRetryable = vi.fn().mockReturnValue(false);

      await expect(retryHandler.execute(mockFn, isRetryable)).rejects.toThrow('not retryable');
      expect(mockFn).toHaveBeenCalledTimes(1); // No retries
      expect(isRetryable).toHaveBeenCalledWith(nonRetryableError);
    });
  });
});

describe('isTransientError', () => {
  it('should identify network errors as transient', () => {
    const error: any = { code: 'ECONNRESET' };
    expect(isTransientError(error)).toBe(true);

    error.code = 'ETIMEDOUT';
    expect(isTransientError(error)).toBe(true);

    error.code = 'ENOTFOUND';
    expect(isTransientError(error)).toBe(true);
  });

  it('should identify HTTP status codes as transient', () => {
    expect(isTransientError({ status: 429 })).toBe(true);
    expect(isTransientError({ status: 502 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 504 })).toBe(true);
  });

  it('should identify error messages as transient', () => {
    expect(isTransientError({ message: 'Connection timeout' })).toBe(true);
    expect(isTransientError({ message: 'ECONNREFUSED: Connection refused' })).toBe(true);
    expect(isTransientError({ message: 'socket hang up' })).toBe(true);
  });

  it('should not identify other errors as transient', () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ message: 'Invalid request' })).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe('errorMapper', () => {
  describe('mapHttpError', () => {
    it('should map HTTP status codes to error messages', () => {
      expect(ErrorMapper.mapHttpError(400).message).toContain('CS-400: Bad request');
      expect(ErrorMapper.mapHttpError(401).message).toContain('CS-401: Authentication failed');
      expect(ErrorMapper.mapHttpError(403).message).toContain('CS-403: Permission denied');
      expect(ErrorMapper.mapHttpError(404).message).toContain('CS-404: Resource not found');
      expect(ErrorMapper.mapHttpError(409).message).toContain('CS-409: Conflict');
      expect(ErrorMapper.mapHttpError(429).message).toContain('CS-429: Rate limit exceeded');
      expect(ErrorMapper.mapHttpError(500).message).toContain('CS-500: Internal server error');
      expect(ErrorMapper.mapHttpError(502).message).toContain('CS-502: Bad gateway');
      expect(ErrorMapper.mapHttpError(503).message).toContain('CS-503: Service unavailable');
      expect(ErrorMapper.mapHttpError(504).message).toContain('CS-504: Gateway timeout');
    });

    it('should handle unknown status codes', () => {
      expect(ErrorMapper.mapHttpError(418).message).toContain('CS-418:');
    });

    it('should include custom message if provided', () => {
      const error = ErrorMapper.mapHttpError(404, 'Page not found');
      expect(error.message).toContain('Page not found');
    });
  });

  describe('sanitizeError', () => {
    it('should remove sensitive information from URLs', () => {
      const error = new Error('Failed to connect to https://user:password123@example.com');
      const sanitized = ErrorMapper.sanitizeError(error);
      expect(sanitized.message).toBe('Failed to connect to https://***@example.com');
    });

    it('should remove API tokens', () => {
      const error = new Error('Request failed with api_token=secret123');
      const sanitized = ErrorMapper.sanitizeError(error);
      expect(sanitized.message).toBe('Request failed with api_token=***');
    });

    it('should remove passwords', () => {
      const error = new Error('Auth failed with password=secret123');
      const sanitized = ErrorMapper.sanitizeError(error);
      expect(sanitized.message).toBe('Auth failed with password=***');
    });

    it('should remove Bearer tokens', () => {
      const error = new Error('Authorization: Bearer abc123def456');
      const sanitized = ErrorMapper.sanitizeError(error);
      expect(sanitized.message).toBe('Authorization: Bearer ***');
    });

    it('should remove Basic auth', () => {
      const error = new Error('Authorization: Basic dXNlcjpwYXNz');
      const sanitized = ErrorMapper.sanitizeError(error);
      expect(sanitized.message).toBe('Authorization: Basic ***');
    });

    it('should preserve error code', () => {
      const error: any = new Error('Test error');
      error.code = 'ECONNREFUSED';
      const sanitized = ErrorMapper.sanitizeError(error);
      expect((sanitized as any).code).toBe('ECONNREFUSED');
    });
  });
});
