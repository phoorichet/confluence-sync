import pLimit from 'p-limit';
import { logger } from '../utils/logger';

export interface RateLimiterOptions {
  requestsPerHour?: number;
  concurrency?: number;
  warnThreshold?: number;
}

export class RateLimiter {
  private readonly requestsPerHour: number;
  private readonly concurrency: number;
  private readonly warnThreshold: number;
  private readonly limiter: ReturnType<typeof pLimit>;
  private requestCount = 0;
  private windowStart = Date.now();
  private rateLimitRemaining?: number;
  private rateLimitReset?: Date;

  constructor(options: RateLimiterOptions = {}) {
    this.requestsPerHour = options.requestsPerHour || 5000;
    this.concurrency = options.concurrency || 10;
    this.warnThreshold = options.warnThreshold || 0.8;
    this.limiter = pLimit(this.concurrency);
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter(async () => {
      await this.checkRateLimit();

      try {
        const result = await fn();
        this.incrementRequestCount();
        return result;
      }
      catch (error: any) {
        // Handle 429 Too Many Requests
        if (error.status === 429 || error.statusCode === 429) {
          await this.handleRateLimitError(error);
          // Retry once after waiting
          return fn();
        }
        throw error;
      }
    });
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    // Reset counter if window has passed
    if (now - this.windowStart > hourInMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check if we're approaching the limit
    const usage = this.requestCount / this.requestsPerHour;

    if (usage >= 1) {
      const waitTime = hourInMs - (now - this.windowStart);
      logger.error(`Rate limit exceeded. Waiting ${Math.ceil(waitTime / 1000)}s before continuing.`);
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.windowStart = Date.now();
    }
    else if (usage >= 0.95) {
      logger.warn(`Rate limit critical: ${this.requestCount}/${this.requestsPerHour} requests used (95%)`);
    }
    else if (usage >= this.warnThreshold) {
      logger.warn(`Rate limit warning: ${this.requestCount}/${this.requestsPerHour} requests used (${Math.round(usage * 100)}%)`);
    }

    // Also check server-reported rate limit if available
    if (this.rateLimitRemaining !== undefined && this.rateLimitRemaining <= 0 && this.rateLimitReset) {
      const waitTime = this.rateLimitReset.getTime() - Date.now();
      if (waitTime > 0) {
        logger.warn(`Server rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s until reset.`);
        await this.sleep(waitTime);
      }
    }
  }

  private incrementRequestCount(): void {
    this.requestCount++;

    // Log periodic updates
    if (this.requestCount % 100 === 0) {
      const usage = (this.requestCount / this.requestsPerHour) * 100;
      logger.debug(`Rate limit status: ${this.requestCount}/${this.requestsPerHour} requests (${usage.toFixed(1)}%)`);
    }
  }

  public updateFromHeaders(headers: Headers | Record<string, string>): void {
    // Parse rate limit headers from Confluence API response
    // Different instances may use different header names
    const remaining = this.getHeaderValue(headers, [
      'x-ratelimit-remaining',
      'x-rate-limit-remaining',
      'ratelimit-remaining',
    ]);

    const reset = this.getHeaderValue(headers, [
      'x-ratelimit-reset',
      'x-rate-limit-reset',
      'ratelimit-reset',
    ]);

    if (remaining !== null) {
      this.rateLimitRemaining = Number.parseInt(remaining, 10);

      if (this.rateLimitRemaining <= 10) {
        logger.warn(`Server rate limit low: ${this.rateLimitRemaining} requests remaining`);
      }
    }

    if (reset !== null) {
      // Reset time might be in seconds or milliseconds
      const resetTime = Number.parseInt(reset, 10);
      // If the number is small, it's probably seconds since epoch
      if (resetTime < 10000000000) {
        this.rateLimitReset = new Date(resetTime * 1000);
      }
      else {
        this.rateLimitReset = new Date(resetTime);
      }

      logger.debug(`Rate limit resets at ${this.rateLimitReset.toISOString()}`);
    }
  }

  private getHeaderValue(
    headers: Headers | Record<string, string>,
    names: string[],
  ): string | null {
    for (const name of names) {
      let value: string | null = null;

      if (headers instanceof Headers) {
        value = headers.get(name);
      }
      else {
        value = headers[name] || headers[name.toLowerCase()] || null;
      }

      if (value !== null) {
        return value;
      }
    }
    return null;
  }

  private async handleRateLimitError(error: any): Promise<void> {
    // Try to extract retry-after header
    const retryAfter = error.headers?.['retry-after'] || error.headers?.['Retry-After'];

    if (retryAfter) {
      const waitTime = Number.parseInt(retryAfter, 10) * 1000;
      logger.warn(`Rate limited by server. Waiting ${retryAfter}s before retry.`);
      await this.sleep(waitTime);
    }
    else {
      // Default wait time if no retry-after header
      const waitTime = 60000; // 1 minute
      logger.warn(`Rate limited by server (no retry-after). Waiting ${waitTime / 1000}s before retry.`);
      await this.sleep(waitTime);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getStats(): {
    requestCount: number;
    requestsPerHour: number;
    usage: number;
    windowStart: Date;
    rateLimitRemaining?: number;
    rateLimitReset?: Date;
  } {
    return {
      requestCount: this.requestCount,
      requestsPerHour: this.requestsPerHour,
      usage: (this.requestCount / this.requestsPerHour) * 100,
      windowStart: new Date(this.windowStart),
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
    };
  }

  public reset(): void {
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.rateLimitRemaining = undefined;
    this.rateLimitReset = undefined;
    logger.info('Rate limiter reset');
  }
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private lastRefill: number;

  constructor(capacity: number, refillPerHour: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillPerHour / (60 * 60 * 1000); // Convert to tokens per millisecond
    this.lastRefill = Date.now();
  }

  public async acquire(tokens = 1): Promise<void> {
    this.refill();

    while (this.tokens < tokens) {
      // Calculate wait time for enough tokens
      const tokensNeeded = tokens - this.tokens;
      const waitTime = Math.ceil(tokensNeeded / this.refillRate);

      logger.debug(`Token bucket: waiting ${waitTime}ms for ${tokensNeeded} tokens`);
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens -= tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  public reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}
