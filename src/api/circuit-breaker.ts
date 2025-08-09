import { logger } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  successThreshold?: number;
  monitoringPeriod?: number;
}

export class CircuitBreaker {
  private static instance: CircuitBreaker | null = null;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly monitoringPeriod: number;
  private resetTimer: Timer | null = null;

  private constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.successThreshold = options.successThreshold || 2;
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
  }

  static getInstance(options?: CircuitBreakerOptions): CircuitBreaker {
    if (!CircuitBreaker.instance) {
      CircuitBreaker.instance = new CircuitBreaker(options);
    }
    return CircuitBreaker.instance;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const now = new Date();
      const timeSinceLastFailure = this.lastFailureTime
        ? now.getTime() - this.lastFailureTime.getTime()
        : Number.POSITIVE_INFINITY;

      if (timeSinceLastFailure >= this.resetTimeout) {
        logger.info('Circuit breaker entering half-open state');
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      }
      else {
        const waitTime = Math.ceil((this.resetTimeout - timeSinceLastFailure) / 1000);
        throw new Error(`CS-901: Circuit breaker is open. Service unavailable. Retry in ${waitTime} seconds.`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    }
    catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        logger.info('Circuit breaker closed after successful recovery');
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn('Circuit breaker reopening due to failure in half-open state');
      this.state = CircuitState.OPEN;
      this.failureCount = 0;
      this.successCount = 0;
    }
    else if (this.failureCount >= this.failureThreshold) {
      logger.error(`Circuit breaker opening after ${this.failureCount} consecutive failures`);
      this.state = CircuitState.OPEN;
      this.failureCount = 0;
    }
  }

  public getState(): CircuitState {
    return this.state;
  }

  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    logger.info('Circuit breaker manually reset');
  }

  public getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: Date;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  jitter?: boolean;
}

export class RetryHandler {
  private readonly maxRetries: number;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly factor: number;
  private readonly jitter: boolean;

  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.jitter = options.jitter !== false;
  }

  public async execute<T>(
    fn: () => Promise<T>,
    isRetryable?: (error: any) => boolean,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      }
      catch (error) {
        lastError = error;

        // Check if error is retryable
        if (isRetryable && !isRetryable(error)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.maxRetries) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        logger.debug(`Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    let delay = Math.min(
      this.initialDelay * this.factor ** attempt,
      this.maxDelay,
    );

    if (this.jitter) {
      // Add random jitter (±25%)
      const jitterAmount = delay * 0.25;
      delay = delay + (Math.random() * 2 - 1) * jitterAmount;
    }

    return Math.round(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export function isTransientError(error: any): boolean {
  if (!error)
    return false;

  // Network errors
  const networkErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'];
  if (error.code && networkErrorCodes.includes(error.code)) {
    return true;
  }

  // HTTP status codes that are retryable
  const status = error.status || error.statusCode;
  if (status) {
    // 408 Request Timeout
    // 429 Too Many Requests
    // 502 Bad Gateway
    // 503 Service Unavailable
    // 504 Gateway Timeout
    return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
  }

  // Check error message for transient patterns
  const message = error.message || '';
  const transientPatterns = [
    'timeout',
    'ECONNREFUSED',
    'socket hang up',
    'ECONNRESET',
    'Service Unavailable',
    'Gateway Timeout',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ];

  return transientPatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

export class ErrorMapper {
  public static mapHttpError(status: number, message?: string): Error {
    const baseMessage = message || 'API request failed';

    switch (status) {
      case 400:
        return new Error(`CS-400: Bad request - ${baseMessage}`);
      case 401:
        return new Error(`CS-401: Authentication failed - please check your credentials`);
      case 403:
        return new Error(`CS-403: Permission denied - you don't have access to this resource`);
      case 404:
        return new Error(`CS-404: Resource not found - ${baseMessage}`);
      case 409:
        return new Error(`CS-409: Conflict - the resource was modified by another user`);
      case 429:
        return new Error(`CS-429: Rate limit exceeded - please wait before retrying`);
      case 500:
        return new Error(`CS-500: Internal server error - ${baseMessage}`);
      case 502:
        return new Error(`CS-502: Bad gateway - Confluence server is having issues`);
      case 503:
        return new Error(`CS-503: Service unavailable - Confluence is temporarily down`);
      case 504:
        return new Error(`CS-504: Gateway timeout - request took too long to complete`);
      default:
        return new Error(`CS-${status}: ${baseMessage}`);
    }
  }

  public static sanitizeError(error: any): Error {
    // Remove any sensitive information from error messages
    let message = error.message || 'Unknown error';

    // Remove potential tokens or passwords from URLs
    message = message.replace(/https?:\/\/[^@]+@/g, 'https://***@');
    message = message.replace(/api[_-]?token[=:]["']?[\w-]+/gi, 'api_token=***');
    message = message.replace(/password[=:]["']?[\w-]+/gi, 'password=***');
    message = message.replace(/bearer\s+[\w-]+/gi, 'Bearer ***');
    message = message.replace(/basic\s+[\w+/=]+/gi, 'Basic ***');

    const sanitizedError = new Error(message);
    sanitizedError.name = error.name || 'Error';

    // Preserve error code if present
    if (error.code) {
      (sanitizedError as any).code = error.code;
    }

    return sanitizedError;
  }
}
