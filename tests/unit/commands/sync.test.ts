import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Command } from 'commander';
import { syncCommand } from '../../../src/commands/sync';
import { SyncEngine } from '../../../src/sync/engine';
import { logger } from '../../../src/utils/logger';

describe('syncCommand', () => {
  let program: Command;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    // Clear singleton
    SyncEngine.clearInstance();

    // Create new program for testing
    program = new Command();
    program.addCommand(syncCommand);

    // Mock console and process
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    // Mock logger
    spyOn(logger, 'error').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
  });

  it('should execute sync with default options', async () => {
    const mockResult = {
      operation: {
        id: 'test-id',
        type: 'sync' as const,
        pageIds: [],
        status: 'completed' as const,
        changes: [],
        startTime: new Date(),
        endTime: new Date(),
      },
      pushed: ['file1.md'],
      pulled: ['page1'],
      conflicted: [],
      unchanged: ['file2.md'],
      errors: [],
    };

    const syncSpy = spyOn(SyncEngine.prototype, 'sync').mockResolvedValue(mockResult);

    await program.parseAsync(['node', 'test', 'sync']);

    expect(syncSpy).toHaveBeenCalledWith({
      dryRun: false,
      maxConcurrent: 5,
      verbose: false,
    });

    // Check summary was displayed
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync Summary'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Pushed: '));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync completed successfully'));
  });

  it('should handle dry-run mode', async () => {
    const mockResult = {
      operation: {
        id: 'test-id',
        type: 'sync' as const,
        pageIds: [],
        status: 'completed' as const,
        changes: [],
        startTime: new Date(),
        endTime: new Date(),
      },
      pushed: ['file1.md'],
      pulled: [],
      conflicted: [],
      unchanged: [],
      errors: [],
    };

    const syncSpy = spyOn(SyncEngine.prototype, 'sync').mockResolvedValue(mockResult);

    await program.parseAsync(['node', 'test', 'sync', '--dry-run']);

    expect(syncSpy).toHaveBeenCalledWith({
      dryRun: true,
      maxConcurrent: 5,
      verbose: false,
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('dry-run mode'));
  });

  it('should handle custom max concurrent option', async () => {
    const mockResult = {
      operation: {
        id: 'test-id',
        type: 'sync' as const,
        pageIds: [],
        status: 'completed' as const,
        changes: [],
        startTime: new Date(),
        endTime: new Date(),
      },
      pushed: [],
      pulled: [],
      conflicted: [],
      unchanged: [],
      errors: [],
    };

    const syncSpy = spyOn(SyncEngine.prototype, 'sync').mockResolvedValue(mockResult);

    await program.parseAsync(['node', 'test', 'sync', '--max-concurrent', '10']);

    expect(syncSpy).toHaveBeenCalledWith({
      dryRun: false,
      maxConcurrent: 10,
      verbose: false,
    });
  });

  it('should display conflicts in summary', async () => {
    const mockResult = {
      operation: {
        id: 'test-id',
        type: 'sync' as const,
        pageIds: [],
        status: 'completed' as const,
        changes: [],
        startTime: new Date(),
        endTime: new Date(),
      },
      pushed: [],
      pulled: [],
      conflicted: ['conflict1.md', 'conflict2.md'],
      unchanged: [],
      errors: [],
    };

    spyOn(SyncEngine.prototype, 'sync').mockResolvedValue(mockResult);

    await program.parseAsync(['node', 'test', 'sync']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Conflicts detected'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('conflict1.md'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('confluence-sync conflicts'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync completed with conflicts'));
  });

  it('should display errors in summary', async () => {
    const mockResult = {
      operation: {
        id: 'test-id',
        type: 'sync' as const,
        pageIds: [],
        status: 'failed' as const,
        changes: [],
        startTime: new Date(),
        endTime: new Date(),
      },
      pushed: [],
      pulled: [],
      conflicted: [],
      unchanged: [],
      errors: [new Error('Test error 1'), new Error('Test error 2')],
    };

    spyOn(SyncEngine.prototype, 'sync').mockResolvedValue(mockResult);

    try {
      await program.parseAsync(['node', 'test', 'sync']);
    }
    catch {
      // Expected to throw due to process.exit mock
    }

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Errors encountered'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test error 1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync completed with errors'));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle sync failure', async () => {
    const error = new Error('Sync failed');
    spyOn(SyncEngine.prototype, 'sync').mockRejectedValue(error);

    try {
      await program.parseAsync(['node', 'test', 'sync']);
    }
    catch {
      // Expected to throw due to process.exit mock
    }

    expect(logger.error).toHaveBeenCalledWith('Sync command failed', error);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), 'Sync failed');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should show verbose information when flag is set', async () => {
    const mockResult = {
      operation: {
        id: 'test-id',
        type: 'sync' as const,
        pageIds: ['page1', 'page2'],
        status: 'completed' as const,
        changes: [],
        startTime: new Date(),
        endTime: new Date(),
      },
      pushed: ['file1.md'],
      pulled: ['page1'],
      conflicted: [],
      unchanged: ['file2.md'],
      errors: [],
    };

    const syncSpy = spyOn(SyncEngine.prototype, 'sync').mockResolvedValue(mockResult);

    await program.parseAsync(['node', 'test', 'sync', '--verbose']);

    expect(syncSpy).toHaveBeenCalledWith({
      dryRun: false,
      maxConcurrent: 5,
      verbose: true,
    });
  });
});
