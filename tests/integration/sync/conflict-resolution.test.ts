import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupManager } from '../../../src/storage/backup-manager';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { ConflictResolver } from '../../../src/sync/conflict-resolver';
import { promptManager } from '../../../src/utils/prompts';

describe('interactive Conflict Resolution', () => {
  let conflictResolver: ConflictResolver;
  let manifestManager: ManifestManager;
  let fileManager: FileManager;
  let backupManager: BackupManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'conflict-test-'));

    // Change to temp directory for manifest file
    process.chdir(tempDir);

    manifestManager = ManifestManager.getInstance();
    fileManager = FileManager.getInstance();
    backupManager = BackupManager.getInstance();
    conflictResolver = ConflictResolver.getInstance();

    conflictResolver.setManagers(manifestManager, fileManager, backupManager);

    // Load manifest (it will create a new one if doesn't exist)
    await manifestManager.load();
  });

  afterEach(() => {
    ConflictResolver.clearInstance();
    ManifestManager.clearInstance();
    FileManager.clearInstance();
    BackupManager.clearInstance();
  });

  describe('formatColoredDiff', () => {
    it('should format diff with colors', () => {
      const localContent = 'Line 1\nLine 2\nLine 3';
      const remoteContent = 'Line 1\nLine 2 modified\nLine 3\nLine 4';

      const diff = conflictResolver.formatColoredDiff(localContent, remoteContent);

      expect(diff).toContain('Line');
      expect(diff).toBeDefined();
    });
  });

  describe('resolveConflictInteractive', () => {
    it('should handle user cancellation gracefully', async () => {
      // Setup test page
      await manifestManager.addPage({
        pageId: 'test-page',
        localPath: path.join(tempDir, 'test.md'),
        title: 'Test Page',
        spaceKey: 'TEST',
        status: 'conflicted',
        contentHash: 'hash1',
        remoteHash: 'hash2',
      });

      // Mock prompt cancellation
      const confirmSpy = vi.spyOn(promptManager, 'confirm').mockRejectedValue(
        new Error('CS-1002: User cancelled prompt'),
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await conflictResolver.resolveConflictInteractive(
        'test-page',
        'local content',
        'remote content',
        'Test Page',
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));

      confirmSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should show diff when requested', async () => {
      // Setup test page
      await manifestManager.addPage({
        pageId: 'test-page',
        localPath: path.join(tempDir, 'test.md'),
        title: 'Test Page',
        spaceKey: 'TEST',
        status: 'conflicted',
        contentHash: 'hash1',
        remoteHash: 'hash2',
      });

      // Mock prompts
      const confirmSpy = vi.spyOn(promptManager, 'confirm')
        .mockResolvedValueOnce(true); // Show diff

      const selectSpy = vi.spyOn(promptManager, 'select')
        .mockResolvedValue('local-first' as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await conflictResolver.resolveConflictInteractive(
        'test-page',
        'local content',
        'remote content',
        'Test Page',
      );

      expect(confirmSpy).toHaveBeenCalledWith('Would you like to see the differences?', true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Differences'));

      confirmSpy.mockRestore();
      selectSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should write conflict markers for manual resolution', async () => {
      // Setup test page
      const testFile = path.join(tempDir, 'test.md');
      await fileManager.writeFile(testFile, 'original content');

      await manifestManager.addPage({
        pageId: 'test-page',
        localPath: testFile,
        title: 'Test Page',
        spaceKey: 'TEST',
        status: 'conflicted',
        contentHash: 'hash1',
        remoteHash: 'hash2',
      });

      // Mock prompts for manual resolution
      const confirmSpy = vi.spyOn(promptManager, 'confirm')
        .mockResolvedValueOnce(false); // Don't show diff

      const selectSpy = vi.spyOn(promptManager, 'select')
        .mockResolvedValue('manual' as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await conflictResolver.resolveConflictInteractive(
        'test-page',
        'local content',
        'remote content',
        'Test Page',
      );

      // Check that conflict markers were written
      const content = await fileManager.readFile(testFile);
      expect(content).toContain('<<<<<<< LOCAL');
      expect(content).toContain('>>>>>>> REMOTE');
      expect(content).toContain('=======');

      confirmSpy.mockRestore();
      selectSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});
