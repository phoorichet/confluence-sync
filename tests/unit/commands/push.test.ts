import type { SyncManifest } from '../../../src/storage/manifest-manager';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, type Mock, spyOn } from 'bun:test';
import { apiClient } from '../../../src/api/client';
import { pushCommand } from '../../../src/commands/push';
import { MarkdownToConfluenceConverter } from '../../../src/converters/markdown-to-confluence';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';

describe('Push Command', () => {
  let manifestSpy: Mock<any>;
  let apiClientSpy: Mock<any>;
  let consoleLogSpy: Mock<any>;
  let consoleErrorSpy: Mock<any>;
  let processExitSpy: Mock<any>;

  const mockManifest: SyncManifest = {
    version: '1.0.0',
    confluenceUrl: 'https://example.atlassian.net',
    lastSyncTime: new Date(),
    pages: new Map([
      ['123', {
        id: '123',
        spaceKey: 'TEST',
        title: 'Test Page',
        version: 1,
        parentId: null,
        lastModified: new Date(),
        localPath: 'test.md',
        contentHash: 'abc123',
        status: 'synced',
      }],
    ]),
  };

  const mockPageResponse = {
    id: '123',
    title: 'Test Page',
    status: 'current',
    version: {
      number: 1,
      when: new Date().toISOString(),
    },
    body: {
      storage: {
        value: '<p>Old content</p>',
        representation: 'storage',
      },
    },
  };

  beforeEach(() => {
    // Mock ManifestManager
    manifestSpy = spyOn(ManifestManager.prototype, 'load').mockResolvedValue(mockManifest);
    spyOn(ManifestManager.prototype, 'updatePage').mockResolvedValue();

    // Mock API client initialization
    spyOn(apiClient, 'initialize').mockResolvedValue();

    // Mock API client
    apiClientSpy = spyOn(apiClient, 'getPage').mockResolvedValue(mockPageResponse);
    spyOn(apiClient, 'updatePage').mockResolvedValue({
      ...mockPageResponse,
      version: { number: 2, when: new Date().toISOString() },
    });

    // Mock file system
    spyOn(fs, 'existsSync').mockReturnValue(true);
    spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any);

    // Mock FileManager
    spyOn(FileManager.prototype, 'readFile').mockResolvedValue('# Test Content\n\nThis is a test.');
    spyOn(FileManager.prototype, 'createBackup').mockResolvedValue('test.md.backup');

    // Mock console
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });
  });

  afterEach(() => {
    manifestSpy.mockRestore();
    apiClientSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    // Clear all mocks
    spyOn(apiClient, 'updatePage').mockRestore();
  });

  it('should validate file exists', async () => {
    spyOn(fs, 'existsSync').mockReturnValue(false);

    try {
      await pushCommand.parseAsync(['node', 'push', 'nonexistent.md']);
    }
    catch (e: any) {
      expect(e.message).toBe('Process exit');
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CS-404: File not found'));
  });

  it('should validate file is a markdown file', async () => {
    try {
      await pushCommand.parseAsync(['node', 'push', 'test.txt']);
    }
    catch (e: any) {
      expect(e.message).toBe('Process exit');
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CS-400: File must be a Markdown file'));
  });

  it('should check if file is tracked in manifest', async () => {
    // Mock empty manifest
    manifestSpy.mockResolvedValue({
      ...mockManifest,
      pages: new Map(),
    });

    try {
      await pushCommand.parseAsync(['node', 'push', 'untracked.md']);
    }
    catch (e: any) {
      expect(e.message).toBe('Process exit');
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CS-404: File not tracked in manifest'));
  });

  it('should detect when no changes need to be pushed', async () => {
    // Mock content hash matching (SHA-256 of "# Test Content\n\nThis is a test.")
    const matchingHash = '042f6db18ee03d86fe9ff053bf6934b59c7fdf5bb000a3d11f304790e55c3f13';
    manifestSpy.mockResolvedValue({
      ...mockManifest,
      pages: new Map([
        ['123', {
          ...mockManifest.pages.get('123')!,
          contentHash: matchingHash,
        }],
      ]),
    });

    await pushCommand.parseAsync(['node', 'push', 'test.md']);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No changes to push - file is already in sync'),
    );
  });

  it('should detect conflicts when remote version is newer', async () => {
    apiClientSpy.mockResolvedValue({
      ...mockPageResponse,
      version: { number: 3 },
    });

    try {
      await pushCommand.parseAsync(['node', 'push', 'test.md']);
    }
    catch (e: any) {
      expect(e.message).toBe('Process exit');
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CS-409: Conflict detected'));
    expect(FileManager.prototype.createBackup).toHaveBeenCalled();
  });

  it('should support dry-run mode', async () => {
    await pushCommand.parseAsync(['node', 'push', 'test.md', '--dry-run']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String), '123');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String), 2);
    expect(apiClient.updatePage).not.toHaveBeenCalled();
  });

  it('should successfully push changes', async () => {
    await pushCommand.parseAsync(['node', 'push', 'test.md']);

    expect(apiClient.updatePage).toHaveBeenCalledWith(
      '123',
      expect.stringContaining('<h1>Test Content</h1>'),
      2,
      'Test Page',
    );
    expect(ManifestManager.prototype.updatePage).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully pushed'));
  });

  it('should display the Confluence URL after successful push', async () => {
    await pushCommand.parseAsync(['node', 'push', 'test.md']);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://example.atlassian.net/wiki/spaces/TEST/pages/123'),
    );
  });

  it('should handle API errors gracefully', async () => {
    spyOn(apiClient, 'updatePage').mockRejectedValue(new Error('Network error'));

    try {
      await pushCommand.parseAsync(['node', 'push', 'test.md']);
    }
    catch (e: any) {
      expect(e.message).toBe('Process exit');
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CS-503: Failed to update page'));
  });

  it('should convert markdown content to Confluence format', async () => {
    const converterSpy = spyOn(MarkdownToConfluenceConverter.prototype, 'convert');
    converterSpy.mockResolvedValue('<h1>Converted</h1>');

    await pushCommand.parseAsync(['node', 'push', 'test.md']);

    expect(converterSpy).toHaveBeenCalledWith('# Test Content\n\nThis is a test.');
    expect(apiClient.updatePage).toHaveBeenCalledWith(
      '123',
      '<h1>Converted</h1>',
      2,
      'Test Page',
    );

    converterSpy.mockRestore();
  });

  it('should show diff summary in dry-run mode', async () => {
    await pushCommand.parseAsync(['node', 'push', 'test.md', '--dry-run']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Changes:'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\+.*lines added/));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/-.*lines removed/));
  });

  it('should show content preview in dry-run mode', async () => {
    await pushCommand.parseAsync(['node', 'push', 'test.md', '--dry-run']);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Preview'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('<h1>Test Content</h1>'));
  });
});
