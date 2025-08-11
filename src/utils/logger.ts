import process from 'node:process';
import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  colors: boolean;
  logLevel: LogLevel;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private colorsEnabled: boolean = true;

  private constructor() {
    // Detect if colors should be disabled
    if (process.env.NO_COLOR || process.env.CI === 'true' || !process.stdout.isTTY) {
      this.colorsEnabled = false;
    }
    else {
      // Check if terminal supports color
      this.colorsEnabled = process.stdout.isTTY || false;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public setColors(enabled: boolean): void {
    this.colorsEnabled = enabled;
  }

  private colorize(text: string, colorFn: typeof chalk.blue): string {
    return this.colorsEnabled ? colorFn(text) : text;
  }

  public debug(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(this.colorize(`[DEBUG] ${message}`, chalk.gray), ...args);
    }
  }

  public info(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(this.colorize(`[INFO] ${message}`, chalk.blue), ...args);
    }
  }

  public warn(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.colorize(`[WARN] ${message}`, chalk.yellow), ...args);
    }
  }

  public error(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      const sanitizedArgs = args.map(arg => this.sanitizeForLogging(arg));
      console.error(this.colorize(`[ERROR] ${message}`, chalk.red), ...sanitizedArgs);
    }
  }

  public success(message: string, ...args: any[]): void {
    console.log(this.colorize(`✅ ${message}`, chalk.green), ...args);
  }

  private sanitizeForLogging(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/Bearer\s+[\w-]+|Basic\s+[\w=+/]+|apiToken":\s*"[^"]+"/gi, '[REDACTED]');
    }
    if (typeof value === 'object' && value !== null) {
      const sanitized: any = {};
      for (const key in value) {
        if (key.toLowerCase().includes('token')
          || key.toLowerCase().includes('password')
          || key.toLowerCase().includes('secret')
          || key.toLowerCase().includes('key')) {
          sanitized[key] = '[REDACTED]';
        }
        else {
          sanitized[key] = this.sanitizeForLogging(value[key]);
        }
      }
      return sanitized;
    }
    return value;
  }
}

export const logger = Logger.getInstance();
