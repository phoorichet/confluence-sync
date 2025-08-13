import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultSyncignore,
  loadIgnorePatterns,
  parseIgnoreFile,
  shouldIgnore,
} from '../../../src/utils/ignore-patterns';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('ignore-patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadIgnorePatterns', () => {
    it('should return default patterns when no .syncignore exists', async () => {
      (fs.readFile as any).mockRejectedValue({ code: 'ENOENT' });

      const patterns = await loadIgnorePatterns();

      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('.git/**');
      expect(patterns).toContain('*.tmp');
      expect(patterns).toContain('.DS_Store');
    });

    it('should combine default and custom patterns', async () => {
      const customContent = `
# Custom patterns
custom/**
*.backup
      `;
      (fs.readFile as any).mockResolvedValue(customContent);

      const patterns = await loadIgnorePatterns();

      expect(patterns).toContain('node_modules/**');
      expect(patterns).toContain('**/custom/**');
      expect(patterns).toContain('*.backup');
    });

    it('should handle read errors gracefully', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('Permission denied'));

      const patterns = await loadIgnorePatterns();

      expect(patterns).toContain('node_modules/**');
    });
  });

  describe('parseIgnoreFile', () => {
    it('should parse simple patterns', () => {
      const content = `
*.tmp
node_modules/
dist/
      `;

      const patterns = parseIgnoreFile(content);

      expect(patterns).toEqual([
        '*.tmp',
        '**/node_modules/**',
        '**/dist/**',
      ]);
    });

    it('should skip comments and empty lines', () => {
      const content = `
# This is a comment
*.tmp

# Another comment
node_modules/
      `;

      const patterns = parseIgnoreFile(content);

      expect(patterns).toEqual([
        '*.tmp',
        '**/node_modules/**',
      ]);
    });

    it('should handle patterns starting with /', () => {
      const content = `
/build
/dist/
      `;

      const patterns = parseIgnoreFile(content);

      expect(patterns).toEqual([
        'build',
        'dist/**',
      ]);
    });

    it('should skip negation patterns', () => {
      const content = `
*.log
!important.log
node_modules/
      `;

      const patterns = parseIgnoreFile(content);

      expect(patterns).toEqual([
        '*.log',
        '**/node_modules/**',
      ]);
    });

    it('should handle patterns with wildcards', () => {
      const content = `
*.test.*
**/*.spec.js
*/temp/*
      `;

      const patterns = parseIgnoreFile(content);

      expect(patterns).toEqual([
        '*.test.*',
        '**/*.spec.js',
        '*/temp/*',
      ]);
    });
  });

  describe('shouldIgnore', () => {
    const patterns = [
      'node_modules/*',
      'node_modules/*/*',
      '*.tmp',
      '*/*.tmp',
      '*/*/*.tmp',
      'dist/*',
      'dist/*/*',
      '.git/*',
      '.git/*/*',
      '*/.git/*/*',
      '*.swp',
    ];

    it('should match files in node_modules', () => {
      expect(shouldIgnore('node_modules/package/index.js', patterns)).toBe(true);
      // This won't match because it's nested - the pattern would need to be */node_modules/*
      expect(shouldIgnore('src/node_modules/test.js', patterns)).toBe(false);
    });

    it('should match tmp files', () => {
      expect(shouldIgnore('file.tmp', patterns)).toBe(true);
      expect(shouldIgnore('src/temp/file.tmp', patterns)).toBe(true);
    });

    it('should match dist directory', () => {
      expect(shouldIgnore('dist/bundle.js', patterns)).toBe(true);
      expect(shouldIgnore('dist/css/styles.css', patterns)).toBe(true);
    });

    it('should not match non-ignored files', () => {
      expect(shouldIgnore('src/index.ts', patterns)).toBe(false);
      expect(shouldIgnore('README.md', patterns)).toBe(false);
      expect(shouldIgnore('docs/guide.md', patterns)).toBe(false);
    });

    it('should handle Windows paths', () => {
      expect(shouldIgnore('node_modules\\package\\index.js', patterns)).toBe(true);
      expect(shouldIgnore('dist\\bundle.js', patterns)).toBe(true);
    });

    it('should match .git directories', () => {
      expect(shouldIgnore('.git/config', patterns)).toBe(true);
      expect(shouldIgnore('src/.git/hooks/pre-commit', patterns)).toBe(true);
    });

    it('should match swap files', () => {
      expect(shouldIgnore('file.swp', patterns)).toBe(true);
      expect(shouldIgnore('.file.swp', patterns)).toBe(true);
    });
  });

  describe('createDefaultSyncignore', () => {
    it('should create .syncignore file with default content', async () => {
      (fs.writeFile as any).mockResolvedValue(undefined);

      await createDefaultSyncignore('/test/dir');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/dir/.syncignore',
        expect.stringContaining('# Confluence Sync Ignore Patterns'),
        'utf-8',
      );

      const call = (fs.writeFile as any).mock.calls[0];
      const content = call[1];

      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      expect(content).toContain('.env');
      expect(content).toContain('*.log');
    });

    it('should use current directory if no path provided', async () => {
      (fs.writeFile as any).mockResolvedValue(undefined);

      await createDefaultSyncignore();

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.syncignore'),
        expect.any(String),
        'utf-8',
      );
    });

    it('should throw error if write fails', async () => {
      const error = new Error('Permission denied');
      (fs.writeFile as any).mockRejectedValue(error);

      await expect(createDefaultSyncignore()).rejects.toThrow('Permission denied');
    });
  });
});
