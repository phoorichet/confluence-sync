import { performance } from 'node:perf_hooks';
import { memoryUsage } from 'node:process';
import { getHeapStatistics } from 'node:v8';
import chalk from 'chalk';
import { logger } from './logger';

export interface PerformanceMetrics {
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  avgResponseTime: number;
  memoryUsage: number;
  activeConnections: number;
  queuedRequests: number;
}

export interface OperationMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private apiCalls = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private responseTimes: number[] = [];
  private activeConnections = 0;
  private queuedRequests = 0;
  private operations: Map<string, OperationMetrics> = new Map();
  private startTime = performance.now();
  private verbose = false;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    this.startTime = performance.now();
    this.verbose = true;
    logger.debug('Performance monitoring started');
  }

  /**
   * Enable verbose output
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
    if (verbose) {
      logger.info('Performance monitoring enabled (verbose mode)');
    }
  }

  /**
   * Record an API call
   */
  recordApiCall(responseTime: number): void {
    this.apiCalls++;
    this.responseTimes.push(responseTime);

    // Keep only last 100 response times to avoid memory issues
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    if (this.verbose && this.apiCalls % 10 === 0) {
      logger.debug(`API calls: ${this.apiCalls}, Avg response: ${this.getAverageResponseTime().toFixed(0)}ms`);
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Update connection metrics
   */
  updateConnections(active: number, queued: number): void {
    this.activeConnections = active;
    this.queuedRequests = queued;
  }

  /**
   * Start tracking an operation
   */
  startOperation(name: string): void {
    this.operations.set(name, {
      name,
      startTime: performance.now(),
      success: false,
    });

    if (this.verbose) {
      logger.debug(`Started operation: ${name}`);
    }
  }

  /**
   * End tracking an operation
   */
  endOperation(name: string, success = true, error?: string): void {
    const operation = this.operations.get(name);
    if (!operation) {
      return;
    }

    operation.endTime = performance.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.success = success;
    operation.error = error;

    if (this.verbose) {
      const status = success ? chalk.green('✓') : chalk.red('✗');
      const duration = chalk.cyan(`${operation.duration.toFixed(0)}ms`);
      logger.debug(`${status} Completed operation: ${name} (${duration})`);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return {
      apiCalls: this.apiCalls,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      avgResponseTime: this.getAverageResponseTime(),
      memoryUsage: this.getMemoryUsage(),
      activeConnections: this.activeConnections,
      queuedRequests: this.queuedRequests,
    };
  }

  /**
   * Get operation summary
   */
  getOperationSummary(): {
    total: number;
    successful: number;
    failed: number;
    avgDuration: number;
    operations: OperationMetrics[];
  } {
    const operations = Array.from(this.operations.values());
    const completed = operations.filter(op => op.duration !== undefined);
    const successful = completed.filter(op => op.success);
    const failed = completed.filter(op => !op.success);

    const totalDuration = completed.reduce((sum, op) => sum + (op.duration || 0), 0);
    const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0;

    return {
      total: operations.length,
      successful: successful.length,
      failed: failed.length,
      avgDuration,
      operations: completed,
    };
  }

  /**
   * Display metrics (for --verbose flag)
   */
  displayMetrics(): void {
    const metrics = this.getMetrics();
    const summary = this.getOperationSummary();
    const uptime = ((performance.now() - this.startTime) / 1000).toFixed(1);

    console.log(chalk.bold('\n📊 Performance Metrics:'));
    console.log(chalk.gray('─'.repeat(50)));

    // API Performance
    console.log(chalk.bold('API Performance:'));
    console.log(`  API Calls: ${chalk.cyan(metrics.apiCalls)}`);
    console.log(`  Avg Response Time: ${chalk.cyan(`${metrics.avgResponseTime.toFixed(0)}ms`)}`);
    console.log(`  Active Connections: ${chalk.cyan(metrics.activeConnections)}`);
    console.log(`  Queued Requests: ${chalk.cyan(metrics.queuedRequests)}`);

    // Cache Performance
    const cacheTotal = metrics.cacheHits + metrics.cacheMisses;
    const cacheHitRate = cacheTotal > 0 ? (metrics.cacheHits / cacheTotal * 100) : 0;
    console.log(chalk.bold('\nCache Performance:'));
    console.log(`  Cache Hits: ${chalk.green(metrics.cacheHits)}`);
    console.log(`  Cache Misses: ${chalk.red(metrics.cacheMisses)}`);
    console.log(`  Hit Rate: ${chalk.cyan(`${cacheHitRate.toFixed(1)}%`)}`);

    // Memory Usage
    console.log(chalk.bold('\nMemory Usage:'));
    console.log(`  Current: ${chalk.cyan(`${metrics.memoryUsage}MB`)}`);
    const heapStats = getHeapStatistics();
    const heapUsed = (heapStats.used_heap_size / 1024 / 1024).toFixed(1);
    const heapTotal = (heapStats.total_heap_size / 1024 / 1024).toFixed(1);
    console.log(`  Heap: ${chalk.cyan(`${heapUsed}MB`)} / ${chalk.gray(`${heapTotal}MB`)}`);

    // Operations Summary
    console.log(chalk.bold('\nOperations Summary:'));
    console.log(`  Total: ${chalk.cyan(summary.total)}`);
    console.log(`  Successful: ${chalk.green(summary.successful)}`);
    console.log(`  Failed: ${chalk.red(summary.failed)}`);
    console.log(`  Avg Duration: ${chalk.cyan(`${summary.avgDuration.toFixed(0)}ms`)}`);

    // Top 5 slowest operations
    if (summary.operations.length > 0) {
      const slowest = summary.operations
        .filter(op => op.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 5);

      if (slowest.length > 0) {
        console.log(chalk.bold('\nSlowest Operations:'));
        slowest.forEach((op) => {
          const status = op.success ? chalk.green('✓') : chalk.red('✗');
          const duration = chalk.yellow(`${op.duration?.toFixed(0)}ms`);
          console.log(`  ${status} ${op.name}: ${duration}`);
        });
      }
    }

    console.log(chalk.bold('\nSystem:'));
    console.log(`  Uptime: ${chalk.cyan(`${uptime}s`)}`);
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    const metrics = this.getMetrics();
    const summary = this.getOperationSummary();
    const heapStats = getHeapStatistics();

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      uptime: performance.now() - this.startTime,
      api: {
        calls: metrics.apiCalls,
        avgResponseTime: metrics.avgResponseTime,
        activeConnections: metrics.activeConnections,
        queuedRequests: metrics.queuedRequests,
      },
      cache: {
        hits: metrics.cacheHits,
        misses: metrics.cacheMisses,
        hitRate: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) * 100,
      },
      memory: {
        usage: metrics.memoryUsage,
        heapUsed: heapStats.used_heap_size,
        heapTotal: heapStats.total_heap_size,
      },
      operations: {
        total: summary.total,
        successful: summary.successful,
        failed: summary.failed,
        avgDuration: summary.avgDuration,
        details: summary.operations,
      },
    }, null, 2);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.apiCalls = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.responseTimes = [];
    this.activeConnections = 0;
    this.queuedRequests = 0;
    this.operations.clear();
    this.startTime = performance.now();
    logger.info('Performance metrics reset');
  }

  /**
   * Calculate average response time
   */
  private getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) {
      return 0;
    }
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const mem = memoryUsage();
    return Math.round(mem.rss / 1024 / 1024);
  }

  /**
   * Create a timer for measuring operation duration
   */
  static timer(): { stop: () => number } {
    const start = performance.now();
    return {
      stop: () => performance.now() - start,
    };
  }

  /**
   * Measure async function execution time
   */
  static async measure<T>(
    name: string,
    fn: () => Promise<T>,
    _verbose = false,
  ): Promise<T> {
    const monitor = PerformanceMonitor.getInstance();
    monitor.startOperation(name);

    try {
      const result = await fn();
      monitor.endOperation(name, true);
      return result;
    }
    catch (error) {
      monitor.endOperation(name, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
}
