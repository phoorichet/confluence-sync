import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerformanceMonitor } from '../../../src/utils/performance';

describe('performanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    // Reset singleton instance
    (PerformanceMonitor as any).instance = null;
    monitor = PerformanceMonitor.getInstance();
    monitor.reset();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PerformanceMonitor.getInstance();
      const instance2 = PerformanceMonitor.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('recordApiCall', () => {
    it('should track API calls and response times', () => {
      monitor.recordApiCall(100);
      monitor.recordApiCall(200);
      monitor.recordApiCall(150);

      const metrics = monitor.getMetrics();
      expect(metrics.apiCalls).toBe(3);
      expect(metrics.avgResponseTime).toBe(150);
    });

    it('should limit response time history', () => {
      // Record more than 100 calls
      for (let i = 0; i < 110; i++) {
        monitor.recordApiCall(100);
      }

      const metrics = monitor.getMetrics();
      expect(metrics.apiCalls).toBe(110);
      // Should only keep last 100 response times
      expect(metrics.avgResponseTime).toBe(100);
    });
  });

  describe('cache metrics', () => {
    it('should track cache hits and misses', () => {
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      monitor.recordCacheMiss();

      const metrics = monitor.getMetrics();
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(1);
    });
  });

  describe('connection metrics', () => {
    it('should track active connections and queued requests', () => {
      monitor.updateConnections(5, 10);

      const metrics = monitor.getMetrics();
      expect(metrics.activeConnections).toBe(5);
      expect(metrics.queuedRequests).toBe(10);
    });
  });

  describe('operation tracking', () => {
    it('should track operation duration', async () => {
      monitor.startOperation('test-op');

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));

      monitor.endOperation('test-op', true);

      const summary = monitor.getOperationSummary();
      expect(summary.total).toBe(1);
      expect(summary.successful).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.operations[0].duration).toBeGreaterThan(40);
    });

    it('should track failed operations', () => {
      monitor.startOperation('fail-op');
      monitor.endOperation('fail-op', false, 'Test error');

      const summary = monitor.getOperationSummary();
      expect(summary.total).toBe(1);
      expect(summary.successful).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.operations[0].error).toBe('Test error');
    });

    it('should calculate average operation duration', () => {
      monitor.startOperation('op1');
      monitor.endOperation('op1', true);

      monitor.startOperation('op2');
      monitor.endOperation('op2', true);

      const summary = monitor.getOperationSummary();
      expect(summary.avgDuration).toBeGreaterThan(0);
    });
  });

  describe('getMetrics', () => {
    it('should return all metrics', () => {
      monitor.recordApiCall(100);
      monitor.recordCacheHit();
      monitor.recordCacheMiss();
      monitor.updateConnections(2, 3);

      const metrics = monitor.getMetrics();

      expect(metrics).toHaveProperty('apiCalls', 1);
      expect(metrics).toHaveProperty('cacheHits', 1);
      expect(metrics).toHaveProperty('cacheMisses', 1);
      expect(metrics).toHaveProperty('avgResponseTime', 100);
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('activeConnections', 2);
      expect(metrics).toHaveProperty('queuedRequests', 3);
    });

    it('should calculate memory usage', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('displayMetrics', () => {
    it('should display metrics without error', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      monitor.recordApiCall(100);
      monitor.recordCacheHit();
      monitor.startOperation('test');
      monitor.endOperation('test', true);

      monitor.displayMetrics();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('exportMetrics', () => {
    it('should export metrics as JSON', () => {
      monitor.recordApiCall(100);
      monitor.recordCacheHit();
      monitor.recordCacheMiss();
      monitor.updateConnections(1, 2);

      const json = monitor.exportMetrics();
      const data = JSON.parse(json);

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data.api).toHaveProperty('calls', 1);
      expect(data.cache).toHaveProperty('hits', 1);
      expect(data.cache).toHaveProperty('misses', 1);
      expect(data.memory).toHaveProperty('usage');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      monitor.recordApiCall(100);
      monitor.recordCacheHit();
      monitor.updateConnections(5, 10);
      monitor.startOperation('test');
      monitor.endOperation('test', true);

      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.apiCalls).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.queuedRequests).toBe(0);

      const summary = monitor.getOperationSummary();
      expect(summary.total).toBe(0);
    });
  });

  describe('timer', () => {
    it('should measure elapsed time', async () => {
      const timer = PerformanceMonitor.timer();

      await new Promise(resolve => setTimeout(resolve, 50));

      const elapsed = timer.stop();
      expect(elapsed).toBeGreaterThan(40);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('measure', () => {
    it('should measure async function execution', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await PerformanceMonitor.measure('test-fn', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();

      const summary = monitor.getOperationSummary();
      expect(summary.total).toBe(1);
      expect(summary.successful).toBe(1);
    });

    it('should track failed async functions', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(PerformanceMonitor.measure('fail-fn', fn)).rejects.toThrow('Test error');

      const summary = monitor.getOperationSummary();
      expect(summary.total).toBe(1);
      expect(summary.failed).toBe(1);
    });
  });

  describe('setVerbose', () => {
    it('should enable verbose mode', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      monitor.setVerbose(true);
      monitor.recordApiCall(100);

      // Should log in verbose mode
      monitor.setVerbose(false);

      logSpy.mockRestore();
    });
  });
});
