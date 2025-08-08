import type { Ora } from 'ora';
import process from 'node:process';
import chalk from 'chalk';
import ora from 'ora';

export interface Progress {
  start: (text: string) => void;
  update: (text: string) => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
  warn: (text?: string) => void;
  info: (text?: string) => void;
  stop: () => void;
}

class OraProgress implements Progress {
  private spinner: Ora;

  constructor() {
    this.spinner = ora({
      color: 'cyan',
      spinner: 'dots',
    });
  }

  start(text: string): void {
    this.spinner.start(text);
  }

  update(text: string): void {
    this.spinner.text = text;
  }

  succeed(text?: string): void {
    if (text) {
      this.spinner.succeed(text);
    }
    else {
      this.spinner.succeed();
    }
  }

  fail(text?: string): void {
    if (text) {
      this.spinner.fail(text);
    }
    else {
      this.spinner.fail();
    }
  }

  warn(text?: string): void {
    if (text) {
      this.spinner.warn(text);
    }
    else {
      this.spinner.warn();
    }
  }

  info(text?: string): void {
    if (text) {
      this.spinner.info(text);
    }
    else {
      this.spinner.info();
    }
  }

  stop(): void {
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
 * Simple progress bar for batch operations
 */
export class ProgressBar {
  private current: number = 0;
  private total: number;
  private width: number = 40;
  private description: string;

  constructor(total: number, description: string = 'Progress') {
    this.total = total;
    this.description = description;
  }

  update(current: number): void {
    this.current = Math.min(current, this.total);
    this.render();
  }

  increment(): void {
    this.update(this.current + 1);
  }

  complete(): void {
    this.update(this.total);
    console.log(); // New line after completion
  }

  private render(): void {
    const percent = this.current / this.total;
    const filled = Math.floor(this.width * percent);
    const empty = this.width - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const percentText = `${Math.floor(percent * 100)}%`;
    const countText = `${this.current}/${this.total}`;

    process.stdout.write(`\r${this.description}: ${bar} ${percentText} (${countText})`);
  }
}
