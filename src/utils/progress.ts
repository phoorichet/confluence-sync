import type { Ora } from 'ora';
import process from 'node:process';
import chalk from 'chalk';
import ora from 'ora';

export interface Progress {
  readonly start: (text: string) => void;
  readonly update: (text: string) => void;
  readonly succeed: (text?: string) => void;
  readonly fail: (text?: string) => void;
  readonly warn: (text?: string) => void;
  readonly info: (text?: string) => void;
  readonly stop: () => void;
}

class OraProgress implements Progress {
  private readonly spinner: Ora;

  constructor() {
    this.spinner = ora({
      color: 'cyan',
      spinner: 'dots',
    });
  }

  public start(text: string): void {
    this.spinner.start(text);
  }

  public update(text: string): void {
    this.spinner.text = text;
  }

  public succeed(text?: string): void {
    text ? this.spinner.succeed(text) : this.spinner.succeed();
  }

  public fail(text?: string): void {
    text ? this.spinner.fail(text) : this.spinner.fail();
  }

  public warn(text?: string): void {
    text ? this.spinner.warn(text) : this.spinner.warn();
  }

  public info(text?: string): void {
    text ? this.spinner.info(text) : this.spinner.info();
  }

  public stop(): void {
    if (this.spinner.isSpinning) {
      this.spinner.stop();
    }
  }
}

/**
 * Create a new progress indicator
 */
export function createProgress(): Progress {
  return new OraProgress();
}

/**
 * Simple progress bar for batch operations with ETA
 */
export class ProgressBar {
  private current = 0;
  private readonly total: number;
  private readonly width = 40;
  private readonly description: string;
  private readonly startTime: number;
  private readonly operationTimes: number[] = [];
  private lastUpdateTime: number;

  constructor(total: number, description: string = 'Progress') {
    this.total = total;
    this.description = description;
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
  }

  public update(current: number): void {
    const now = Date.now();
    if (this.current > 0) {
      // Track time for this operation
      this.operationTimes.push(now - this.lastUpdateTime);
      // Keep only last 10 operation times for rolling average
      if (this.operationTimes.length > 10) {
        this.operationTimes.shift();
      }
    }

    this.current = Math.min(current, this.total);
    this.lastUpdateTime = now;
    this.render();
  }

  public increment(): void {
    this.update(this.current + 1);
  }

  public complete(): void {
    this.update(this.total);
    const totalTime = Date.now() - this.startTime;
    const formattedTime = this.formatDuration(totalTime);
    console.log(chalk.gray(` (completed in ${formattedTime})`));
  }

  private calculateETA(): string {
    if (this.current === 0 || this.operationTimes.length === 0) {
      return 'calculating...';
    }

    // Calculate average time per operation
    const sum = this.operationTimes.reduce((a, b) => a + b, 0);
    const avgTimePerOp = sum / this.operationTimes.length;
    const remainingOps = this.total - this.current;
    const estimatedMs = Math.round(avgTimePerOp * remainingOps);

    return this.formatDuration(estimatedMs);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    else {
      return `${seconds}s`;
    }
  }

  private render(): void {
    const percent = this.current / this.total;
    const filled = Math.floor(this.width * percent);
    const empty = this.width - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const percentText = `${Math.floor(percent * 100)}%`;
    const countText = `${this.current}/${this.total}`;
    const eta = this.current < this.total ? ` | ETA: ${this.calculateETA()}` : '';

    process.stdout.write(`\r${this.description}: ${bar} ${percentText} (${countText})${eta}`);
  }
}

/**
 * Enhanced progress with operation history for better ETA calculation
 */
export class EnhancedProgress {
  private readonly spinner: Ora;
  private readonly operationHistory = new Map<string, number[]>();
  private currentOperation?: string;
  private startTime?: number;

  constructor() {
    this.spinner = ora({
      color: 'cyan',
      spinner: 'dots',
    });
  }

  public startOperation(operation: string, text: string): void {
    this.currentOperation = operation;
    this.startTime = Date.now();
    this.spinner.start(text);
  }

  public updateWithETA(current: number, total: number, text?: string): void {
    if (!this.currentOperation || !this.startTime) {
      return;
    }

    const elapsed = Date.now() - this.startTime;
    const avgTime = elapsed / current;
    const remaining = Math.round((total - current) * avgTime);
    const eta = this.formatDuration(remaining);

    const progress = `${current}/${total}`;
    const percent = Math.floor((current / total) * 100);
    const fullText = text ?? this.spinner.text;

    this.spinner.text = `${fullText} - ${percent}% (${progress}) ETA: ${eta}`;
  }

  public completeOperation(): void {
    if (!this.currentOperation || !this.startTime) {
      return;
    }

    const duration = Date.now() - this.startTime;

    // Store operation time for future ETA calculations
    let history = this.operationHistory.get(this.currentOperation);
    if (!history) {
      history = [];
      this.operationHistory.set(this.currentOperation, history);
    }

    history.push(duration);

    // Keep only last 20 operations for average
    if (history.length > 20) {
      history.shift();
    }

    this.spinner.succeed();
    this.currentOperation = undefined;
    this.startTime = undefined;
  }

  public getAverageTime(operation: string): number | null {
    const history = this.operationHistory.get(operation);
    if (!history || history.length === 0) {
      return null;
    }

    const sum = history.reduce((a, b) => a + b, 0);
    return Math.round(sum / history.length);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}
