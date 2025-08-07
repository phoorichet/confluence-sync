import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerHealthCommand } from '../../../src/commands/health';

describe('Health Command', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should register health command', () => {
    registerHealthCommand(program);
    const healthCommand = program.commands.find(cmd => cmd.name() === 'health');
    expect(healthCommand).toBeDefined();
    expect(healthCommand?.description()).toBe('Check the health status of confluence-sync');
  });

  it('should output correct health status message', () => {
    registerHealthCommand(program);
    program.parse(['node', 'test', 'health']);
    
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^Confluence Sync v\d+\.\d+\.\d+ - OK$/),
    );
  });
});