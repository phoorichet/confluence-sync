import chalk from 'chalk';
import { logger } from './logger';

export type OutputFormat = 'text' | 'json';

export interface OutputOptions {
  readonly format: OutputFormat;
  readonly colors: boolean;
  readonly verbose: boolean;
}

/**
 * Base interface for JSON output
 */
export interface JsonOutput {
  readonly success: boolean;
  readonly timestamp: string;
  readonly data?: unknown;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly suggestions?: readonly string[];
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Output formatter for consistent CLI output
 */
export class OutputFormatter {
  private static instance: OutputFormatter;
  private options: Readonly<OutputOptions> = Object.freeze({
    format: 'text',
    colors: true,
    verbose: false,
  });

  private constructor() {}

  public static getInstance(): OutputFormatter {
    if (!OutputFormatter.instance) {
      OutputFormatter.instance = new OutputFormatter();
    }
    return OutputFormatter.instance;
  }

  public setOptions(options: Partial<OutputOptions>): void {
    const newOptions = { ...this.options, ...options };

    // Disable colors for JSON output
    if (newOptions.format === 'json') {
      newOptions.colors = false;
      logger.setColors(false);
    }

    this.options = Object.freeze(newOptions);
  }

  public getOptions(): Readonly<OutputOptions> {
    return this.options;
  }

  public isJsonMode(): boolean {
    return this.options.format === 'json';
  }

  /**
   * Format success output
   */
  public success(message: string, data?: unknown): void {
    if (this.options.format === 'json') {
      const output: JsonOutput = {
        success: true,
        timestamp: new Date().toISOString(),
        data,
      };
      console.log(JSON.stringify(output, null, 2));
    }
    else {
      logger.success(message);
      if (data && this.options.verbose) {
        console.log(data);
      }
    }
  }

  /**
   * Format error output
   */
  public error(code: string, message: string, suggestions?: readonly string[]): void {
    if (this.options.format === 'json') {
      const output: JsonOutput = {
        success: false,
        timestamp: new Date().toISOString(),
        error: {
          code,
          message,
          suggestions,
        },
      };
      console.error(JSON.stringify(output, null, 2));
    }
    else {
      console.error(chalk.red(`Error ${code}: ${message}`));
      if (suggestions && suggestions.length > 0) {
        console.error(chalk.yellow('\nSuggestions:'));
        suggestions.forEach((s: string) => console.error(chalk.gray(`  • ${s}`)));
      }
    }
  }

  /**
   * Format data output
   */
  public data(data: unknown, metadata?: Readonly<Record<string, unknown>>): void {
    if (this.options.format === 'json') {
      const output: JsonOutput = {
        success: true,
        timestamp: new Date().toISOString(),
        data,
        metadata,
      };
      console.log(JSON.stringify(output, null, 2));
    }
    else {
      console.log(data);
    }
  }

  /**
   * Format table output
   */
  public table(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): void {
    if (this.options.format === 'json') {
      const data = rows.map((row) => {
        return headers.reduce((obj, header, index) => {
          obj[header] = row[index] || '';
          return obj;
        }, {} as Record<string, string>);
      });
      this.data(data);
    }
    else {
      // Calculate column widths
      const widths = headers.map((h, i) => {
        const values = [h, ...rows.map(r => r[i] || '')];
        return Math.max(...values.map(v => v.length));
      });

      // Print header
      const headerRow = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join(' | ');
      console.log(chalk.bold(headerRow));
      console.log(widths.map(w => '-'.repeat(w)).join('-+-'));

      // Print rows
      rows.forEach((row) => {
        const rowStr = row.map((cell, i) => (cell || '').padEnd(widths[i] ?? 0)).join(' | ');
        console.log(rowStr);
      });
    }
  }

  /**
   * Format list output
   */
  public list(items: readonly string[], title?: string): void {
    if (this.options.format === 'json') {
      this.data({ items, title });
    }
    else {
      if (title) {
        console.log(chalk.cyan(title));
      }
      items.forEach(item => console.log(`  • ${item}`));
    }
  }

  /**
   * Format progress output (no-op in JSON mode)
   */
  public progress(message: string): void {
    if (this.options.format !== 'json') {
      // Only show progress in text mode
      console.log(message);
    }
  }
}

export const outputFormatter = OutputFormatter.getInstance();

/**
 * Format a timestamp for display
 */
export function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now';
  }
  else if (minutes < 60) {
    return `${minutes}m ago`;
  }
  else if (hours < 24) {
    return `${hours}h ago`;
  }
  else if (days < 7) {
    return `${days}d ago`;
  }
  else {
    return date.toLocaleDateString();
  }
}

/**
 * JSON Schema definitions for output types
 */
export const JSON_SCHEMAS = {
  authStatus: {
    type: 'object',
    properties: {
      authenticated: { type: 'boolean' },
      user: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          displayName: { type: 'string' },
        },
      },
      instance: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          type: { type: 'string', enum: ['cloud', 'server'] },
        },
      },
    },
  },

  syncStatus: {
    type: 'object',
    properties: {
      synced: { type: 'number' },
      modified: { type: 'number' },
      conflicted: { type: 'number' },
      pending: { type: 'number' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            title: { type: 'string' },
            localPath: { type: 'string' },
            status: { type: 'string' },
            lastModified: { type: 'string' },
          },
        },
      },
    },
  },

  pullResult: {
    type: 'object',
    properties: {
      pulled: { type: 'number' },
      skipped: { type: 'number' },
      failed: { type: 'number' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            title: { type: 'string' },
            result: { type: 'string', enum: ['success', 'skipped', 'failed'] },
            error: { type: 'string' },
          },
        },
      },
    },
  },

  pushResult: {
    type: 'object',
    properties: {
      pushed: { type: 'number' },
      skipped: { type: 'number' },
      failed: { type: 'number' },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            title: { type: 'string' },
            result: { type: 'string', enum: ['success', 'skipped', 'failed'] },
            error: { type: 'string' },
          },
        },
      },
    },
  },

  configList: {
    type: 'object',
    properties: {
      confluence: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          username: { type: 'string' },
          authType: { type: 'string' },
        },
      },
      sync: {
        type: 'object',
        properties: {
          directory: { type: 'string' },
          patterns: { type: 'array', items: { type: 'string' } },
        },
      },
      options: {
        type: 'object',
        properties: {
          interactive: { type: 'boolean' },
          colors: { type: 'boolean' },
          progressBars: { type: 'boolean' },
          jsonOutput: { type: 'boolean' },
        },
      },
    },
  },
};

/**
 * Decorator to add JSON output support to commands
 */
export function withJsonOutput(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const options = args[args.length - 1];

    if (options?.json) {
      outputFormatter.setOptions({ format: 'json', colors: false });
    }

    try {
      const result = await originalMethod.apply(this, args);
      return result;
    }
    catch (error) {
      if (outputFormatter.isJsonMode()) {
        const err = error as any;
        outputFormatter.error(
          err.code || 'CS-001',
          err.message || 'Unknown error',
          err.suggestions,
        );
        throw error;
      }
      throw error;
    }
  };
}
