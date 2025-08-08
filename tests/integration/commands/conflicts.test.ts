import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Command } from 'commander';
import { conflictsCommand } from '../../../src/commands/conflicts';
import { BackupManager } from '../../../src/storage/backup-manager';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { ConflictResolver } from '../../../src/sync/conflict-resolver';
import { logger } from '../../../src/utils/logger';

describe('conflictsCommand', () => {
  let consoleSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    // Mock console and process
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    // Silence logger during tests
    spyOn(logger, 'error').mockImplementation(() => {});
    spyOn(logger, 'warn').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});
  });

  it('should list conflicted files', async () => {
    const conflictedPages = [
      {
        pageId: 'page1',
        localPath: '/path/to/file1.md',
        timestamp: new Date('2024-01-01'),
      },
      {
        pageId: 'page2',
        localPath: '/path/to/file2.md',
        timestamp: new Date('2024-01-02'),
      },
    ];

    // Mock ConflictResolver
    const mockResolver = {
      getConflictedPages: () => Promise.resolve(conflictedPages),
      setManagers: () => {},
    };

    spyOn(ConflictResolver, 'getInstance').mockReturnValue(mockResolver as any);
    spyOn(ManifestManager, 'getInstance').mockReturnValue({} as any);
    spyOn(FileManager, 'getInstance').mockReturnValue({} as any);
    spyOn(BackupManager, 'getInstance').mockReturnValue({} as any);

    // Create a test program to capture output
    const program = new Command();
    program.addCommand(conflictsCommand);

    // Run the command
    await program.parseAsync(['node', 'test', 'conflicts'], { from: 'user' });

    // Check console output
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 conflicted file(s)'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/path/to/file1.md'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/path/to/file2.md'));
  });

  it('should show no conflicts message when none exist', async () => {
    // Mock ConflictResolver with no conflicts
    const mockResolver = {
      getConflictedPages: () => Promise.resolve([]),
      setManagers: () => {},
    };

    spyOn(ConflictResolver, 'getInstance').mockReturnValue(mockResolver as any);
    spyOn(ManifestManager, 'getInstance').mockReturnValue({} as any);
    spyOn(FileManager, 'getInstance').mockReturnValue({} as any);
    spyOn(BackupManager, 'getInstance').mockReturnValue({} as any);

    // Create a test program
    const program = new Command();
    program.addCommand(conflictsCommand);

    // Run the command
    await program.parseAsync(['node', 'test', 'conflicts'], { from: 'user' });

    // Should succeed with no conflicts message
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Found'));
  });

  it('should handle errors gracefully', async () => {
    // Mock ConflictResolver to throw error
    const mockResolver = {
      getConflictedPages: () => Promise.reject(new Error('Test error')),
      setManagers: () => {},
    };

    spyOn(ConflictResolver, 'getInstance').mockReturnValue(mockResolver as any);
    spyOn(ManifestManager, 'getInstance').mockReturnValue({} as any);
    spyOn(FileManager, 'getInstance').mockReturnValue({} as any);
    spyOn(BackupManager, 'getInstance').mockReturnValue({} as any);

    // Create a test program
    const program = new Command();
    program.addCommand(conflictsCommand);

    // Run the command and expect it to fail
    try {
      await program.parseAsync(['node', 'test', 'conflicts'], { from: 'user' });
    }
    catch (error: any) {
      expect(error.message).toBe('Process exit');
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should reject invalid resolution strategy', async () => {
    const conflictedPages = [
      {
        pageId: 'page1',
        localPath: '/path/to/file1.md',
        timestamp: new Date(),
      },
    ];

    // Mock ConflictResolver
    const mockResolver = {
      getConflictedPages: () => Promise.resolve(conflictedPages),
      setManagers: () => {},
    };

    spyOn(ConflictResolver, 'getInstance').mockReturnValue(mockResolver as any);
    spyOn(ManifestManager, 'getInstance').mockReturnValue({} as any);
    spyOn(FileManager, 'getInstance').mockReturnValue({} as any);
    spyOn(BackupManager, 'getInstance').mockReturnValue({} as any);

    // Create a test program
    const program = new Command();
    program.addCommand(conflictsCommand);

    // Run with invalid strategy
    await program.parseAsync(['node', 'test', 'conflicts', '--resolve-all', 'invalid'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid strategy'));
  });
});
