import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promptManager } from '../../../src/utils/prompts';

describe('promptManager', () => {
  let originalTTY: boolean | undefined;
  let originalCI: string | undefined;

  beforeEach(() => {
    originalTTY = process.stdin.isTTY;
    originalCI = process.env.CI;
  });

  afterEach(() => {
    process.stdin.isTTY = originalTTY;
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    }
    else {
      delete process.env.CI;
    }
  });

  describe('isInteractive', () => {
    it('should detect TTY availability', () => {
      process.stdin.isTTY = true;
      process.stdout.isTTY = true;
      delete process.env.CI;

      const manager = promptManager;
      manager.setInteractive(true);
      expect(manager.isInteractive()).toBe(true);
    });

    it('should disable interactive mode in CI', () => {
      process.env.CI = 'true';
      const manager = promptManager;
      manager.setInteractive(false);
      expect(manager.isInteractive()).toBe(false);
    });

    it('should disable interactive mode when NO_INTERACTIVE is set', () => {
      process.env.NO_INTERACTIVE = 'true';
      const manager = promptManager;
      manager.setInteractive(false);
      expect(manager.isInteractive()).toBe(false);
      delete process.env.NO_INTERACTIVE;
    });
  });

  describe('text prompt', () => {
    it('should throw error when TTY not available and no default', async () => {
      promptManager.setInteractive(false);

      await expect(
        promptManager.text('Enter value:'),
      ).rejects.toThrow('CS-1001: Interactive prompt required but TTY not available');
    });

    it('should return default value when TTY not available', async () => {
      promptManager.setInteractive(false);

      const result = await promptManager.text('Enter value:', { defaultValue: 'default' });
      expect(result).toBe('default');
    });
  });

  describe('password prompt', () => {
    it('should throw error when TTY not available', async () => {
      promptManager.setInteractive(false);

      await expect(
        promptManager.password('Enter password:'),
      ).rejects.toThrow('CS-1003: Password prompt required but TTY not available');
    });
  });

  describe('confirm prompt', () => {
    it('should return default value when TTY not available', async () => {
      promptManager.setInteractive(false);

      const result = await promptManager.confirm('Continue?', true);
      expect(result).toBe(true);
    });
  });

  describe('select prompt', () => {
    it('should throw error when TTY not available and no default', async () => {
      promptManager.setInteractive(false);

      await expect(
        promptManager.select('Choose option:', [
          { title: 'Option 1', value: 'opt1' },
          { title: 'Option 2', value: 'opt2' },
        ]),
      ).rejects.toThrow('CS-1004: Selection prompt required but TTY not available');
    });

    it('should return default value when TTY not available', async () => {
      promptManager.setInteractive(false);

      const result = await promptManager.select(
        'Choose option:',
        [
          { title: 'Option 1', value: 'opt1' },
          { title: 'Option 2', value: 'opt2' },
        ],
        'opt2',
      );
      expect(result).toBe('opt2');
    });
  });

  describe('multiselect prompt', () => {
    it('should return selected values when TTY not available', async () => {
      promptManager.setInteractive(false);

      const result = await promptManager.multiselect('Choose options:', [
        { title: 'Option 1', value: 'opt1', selected: true },
        { title: 'Option 2', value: 'opt2', selected: false },
        { title: 'Option 3', value: 'opt3', selected: true },
      ]);
      expect(result).toEqual(['opt1', 'opt3']);
    });
  });
});
