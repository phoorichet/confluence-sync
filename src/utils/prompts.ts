import process from 'node:process';
import prompts from 'prompts';
import { ConfluenceSyncError } from './errors';

export interface PromptConfig {
  readonly interactive: boolean;
  readonly noColors?: boolean;
}

export interface TextPromptOptions {
  readonly defaultValue?: string;
  readonly validate?: (value: string) => boolean | string;
}

export interface SelectChoice<T = string> {
  readonly title: string;
  readonly value: T;
  readonly description?: string;
}

export interface MultiSelectChoice<T = string> {
  readonly title: string;
  readonly value: T;
  readonly selected?: boolean;
}

class PromptManager {
  private static instance: PromptManager;
  private config: PromptConfig;

  private constructor() {
    // Check if TTY is available
    const hasStdinTTY = Boolean(process.stdin.isTTY);
    const hasStdoutTTY = Boolean(process.stdout.isTTY);
    
    // Some environments (like VS Code terminal) might not set TTY correctly
    // Also check if we're explicitly forcing interactive mode
    const forceInteractive = process.env.FORCE_INTERACTIVE === 'true';
    const isInteractive = forceInteractive || (hasStdinTTY && hasStdoutTTY);

    // Disable interactive mode in CI environments
    const isCI = process.env.CI === 'true' || process.env.NO_INTERACTIVE === 'true';

    this.config = Object.freeze({
      interactive: isInteractive && !isCI,
    });
  }

  public static getInstance(): PromptManager {
    if (!PromptManager.instance) {
      PromptManager.instance = new PromptManager();
    }
    return PromptManager.instance;
  }

  public setInteractive(interactive: boolean): void {
    this.config = Object.freeze({
      ...this.config,
      interactive,
    });
  }

  public isInteractive(): boolean {
    return this.config.interactive;
  }

  public async text(message: string, options?: TextPromptOptions): Promise<string> {
    if (!this.config.interactive) {
      if (options?.defaultValue !== undefined) {
        return options.defaultValue;
      }
      throw new ConfluenceSyncError('CS-1001', `Interactive prompt required but TTY not available: ${message}`);
    }

    try {
      // Cancel any previous prompts to avoid conflicts
      prompts.inject([]);
      
      const response = await prompts({
        type: 'text',
        name: 'value',
        message,
        initial: options?.defaultValue,
        validate: options?.validate,
      }, {
        onCancel: () => {
          throw new ConfluenceSyncError('CS-1002', 'User cancelled prompt');
        },
      });

      if (response.value === undefined || response.value === '') {
        // If no value and there's a default, use it
        if (options?.defaultValue !== undefined) {
          return options.defaultValue;
        }
        throw new ConfluenceSyncError('CS-1002', 'No value provided');
      }

      return String(response.value);
    } catch (error) {
      // If it's already our error, rethrow it
      if (error instanceof ConfluenceSyncError) {
        throw error;
      }
      // If prompts fails and we have a default, use it
      if (options?.defaultValue !== undefined) {
        return options.defaultValue;
      }
      throw new ConfluenceSyncError('CS-1001', `Failed to get input: ${error}`);
    }
  }

  public async password(message: string): Promise<string> {
    if (!this.config.interactive) {
      throw new ConfluenceSyncError('CS-1003', 'Password prompt required but TTY not available');
    }

    try {
      prompts.inject([]);
      
      const response = await prompts({
        type: 'password',
        name: 'value',
        message,
      }, {
        onCancel: () => {
          throw new ConfluenceSyncError('CS-1002', 'User cancelled prompt');
        },
      });

      if (response.value === undefined || response.value === '') {
        throw new ConfluenceSyncError('CS-1002', 'Password is required');
      }

      return String(response.value);
    } catch (error) {
      if (error instanceof ConfluenceSyncError) {
        throw error;
      }
      throw new ConfluenceSyncError('CS-1003', `Failed to get password: ${error}`);
    }
  }

  public async confirm(message: string, defaultValue = false): Promise<boolean> {
    if (!this.config.interactive) {
      return defaultValue;
    }

    try {
      prompts.inject([]);
      
      const response = await prompts({
        type: 'confirm',
        name: 'value',
        message,
        initial: defaultValue,
      }, {
        onCancel: () => {
          return defaultValue;
        },
      });

      if (response.value === undefined) {
        return defaultValue;
      }

      return Boolean(response.value);
    } catch {
      return defaultValue;
    }
  }

  public async select<T extends string>(
    message: string,
    choices: ReadonlyArray<SelectChoice<T>>,
    defaultValue?: T,
  ): Promise<T> {
    if (!this.config.interactive) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new ConfluenceSyncError('CS-1004', `Selection prompt required but TTY not available: ${message}`);
    }

    const response = await prompts({
      type: 'select',
      name: 'value',
      message,
      choices: choices as any[], // prompts doesn't have proper readonly types
      initial: defaultValue ? choices.findIndex(c => c.value === defaultValue) : 0,
    });

    if (response.value === undefined) {
      throw new ConfluenceSyncError('CS-1002', 'User cancelled prompt');
    }

    return response.value as T;
  }

  public async multiselect<T extends string>(
    message: string,
    choices: ReadonlyArray<MultiSelectChoice<T>>,
  ): Promise<readonly T[]> {
    if (!this.config.interactive) {
      return Object.freeze(choices.filter(c => c.selected).map(c => c.value));
    }

    const response = await prompts({
      type: 'multiselect',
      name: 'value',
      message,
      choices: choices as any[], // prompts doesn't have proper readonly types
    });

    if (response.value === undefined) {
      throw new ConfluenceSyncError('CS-1002', 'User cancelled prompt');
    }

    return Object.freeze(response.value as T[]);
  }
}

export const promptManager = PromptManager.getInstance();
