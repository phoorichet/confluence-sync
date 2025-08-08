import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { healthCommand } from '../../../src/commands/health';

describe('health Command', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should register health command', () => {
    program.addCommand(healthCommand);
    const foundHealthCommand = program.commands.find(cmd => cmd.name() === 'health');
    expect(foundHealthCommand).toBeDefined();
    expect(foundHealthCommand?.description()).toBe('Check the health status of confluence-sync');
  });

  it('should output correct health status message', () => {
    program.addCommand(healthCommand);
    program.parse(['node', 'test', 'health']);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^Confluence Sync v\d+\.\d+\.\d+ - OK$/),
    );
  });
});
