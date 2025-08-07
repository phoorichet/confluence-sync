import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public debug(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }

  public info(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(chalk.blue(`[INFO] ${message}`), ...args);
    }
  }

  public warn(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(chalk.yellow(`[WARN] ${message}`), ...args);
    }
  }

  public error(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      const sanitizedArgs = args.map(arg => this.sanitizeForLogging(arg));
      console.error(chalk.red(`[ERROR] ${message}`), ...sanitizedArgs);
    }
  }

  public success(message: string, ...args: any[]): void {
    console.log(chalk.green(`[SUCCESS] ${message}`), ...args);
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
