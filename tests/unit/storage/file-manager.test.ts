import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileManager } from '../../../src/storage/file-manager';

describe('fileManager', () => {
  let fileManager: FileManager;

  beforeEach(() => {
    fileManager = new FileManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeFile', () => {
    it('should write a file successfully', async () => {
      // Arrange
      const outputDir = '/test/dir';
      const filename = 'test-file';
      const content = 'Test content';
      const expectedPath = path.join(path.resolve(outputDir), `${filename}.md`);

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Act
      const result = await fileManager.writeFile(outputDir, filename, content);

      // Assert
      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.resolve(outputDir), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, content, 'utf-8');
    });

    it('should create backup if file exists', async () => {
      // Arrange
      const outputDir = '/test/dir';
      const filename = 'existing-file';
      const content = 'New content';
      const oldContent = 'Old content';

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path.toString().endsWith('.md');
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(oldContent);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Mock Date for consistent backup filename
      const mockDate = new Date('2024-01-15T10:30:00Z');
      vi.spyOn(globalThis, 'Date').mockImplementation(() => mockDate as any);

      // Act
      await fileManager.writeFile(outputDir, filename, content);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // Once for backup, once for new file
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('backup'),
        oldContent,
        'utf-8',
      );
    });

    it('should handle write errors', async () => {
      // Arrange
      const outputDir = '/test/dir';
      const filename = 'test-file';
      const content = 'Test content';

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Act & Assert
      await expect(fileManager.writeFile(outputDir, filename, content))
        .rejects
        .toThrow('CS-502: Failed to write file: Write failed');
    });
  });

  describe('sanitizeFilename', () => {
    it('should sanitize invalid characters', () => {
      expect(fileManager.sanitizeFilename('File<>Name')).toBe('file-name');
      expect(fileManager.sanitizeFilename('Path/To\\File')).toBe('path-to-file');
      expect(fileManager.sanitizeFilename('File:Name*?.md')).toBe('file-name-.md');
    });

    it('should replace spaces with dashes', () => {
      expect(fileManager.sanitizeFilename('My Test File')).toBe('my-test-file');
      expect(fileManager.sanitizeFilename('Multiple   Spaces')).toBe('multiple-spaces');
    });

    it('should remove leading and trailing dashes', () => {
      expect(fileManager.sanitizeFilename('-Leading Dash')).toBe('leading-dash');
      expect(fileManager.sanitizeFilename('Trailing Dash-')).toBe('trailing-dash');
      expect(fileManager.sanitizeFilename('---Both---')).toBe('both');
    });

    it('should convert to lowercase', () => {
      expect(fileManager.sanitizeFilename('UPPERCASE')).toBe('uppercase');
      expect(fileManager.sanitizeFilename('MixedCase')).toBe('mixedcase');
    });

    it('should handle empty or invalid names', () => {
      expect(fileManager.sanitizeFilename('')).toBe('untitled');
      expect(fileManager.sanitizeFilename('***')).toBe('untitled');
      expect(fileManager.sanitizeFilename('   ')).toBe('untitled');
    });

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(300);
      const result = fileManager.sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should handle complex cases', () => {
      expect(fileManager.sanitizeFilename('My File (2024) - Version 1.0!'))
        .toBe('my-file-(2024)-version-1.0!');
      expect(fileManager.sanitizeFilename('Feature/Branch: Issue #123'))
        .toBe('feature-branch-issue-#123');
    });
  });

  describe('calculateHash', () => {
    it('should calculate SHA-256 hash', async () => {
      // Arrange
      const content = 'Test content for hashing';
      const expectedHash = crypto.createHash('sha256')
        .update(content, 'utf-8')
        .digest('hex');

      // Act
      const result = await fileManager.calculateHash(content);

      // Assert
      expect(result).toBe(expectedHash);
      expect(result).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should produce different hashes for different content', async () => {
      const hash1 = await fileManager.calculateHash('Content 1');
      const hash2 = await fileManager.calculateHash('Content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce same hash for same content', async () => {
      const content = 'Same content';
      const hash1 = await fileManager.calculateHash(content);
      const hash2 = await fileManager.calculateHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should handle empty content', async () => {
      const result = await fileManager.calculateHash('');
      expect(result).toHaveLength(64);
    });
  });

  describe('createBackup', () => {
    it('should create backup successfully', async () => {
      // Arrange
      const originalPath = '/test/file.md';
      const backupPath = '/test/file.backup.md';
      const content = 'File content';

      vi.spyOn(fs, 'readFileSync').mockReturnValue(content);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      // Act
      await fileManager.createBackup(originalPath, backupPath);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith(originalPath, 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(backupPath, content, 'utf-8');
    });

    it('should handle backup errors', async () => {
      // Arrange
      const originalPath = '/test/file.md';
      const backupPath = '/test/file.backup.md';

      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read failed');
      });

      // Act & Assert
      await expect(fileManager.createBackup(originalPath, backupPath))
        .rejects
        .toThrow('CS-502: Failed to create backup: Read failed');
    });
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      // Arrange
      const filePath = '/test/file.md';
      const content = 'File content';

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(content);

      // Act
      const result = await fileManager.readFile(filePath);

      // Assert
      expect(result).toBe(content);
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(filePath), 'utf-8');
    });

    it('should throw error if file not found', async () => {
      // Arrange
      const filePath = '/test/nonexistent.md';

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Act & Assert
      await expect(fileManager.readFile(filePath))
        .rejects
        .toThrow('CS-404: File not found: /test/nonexistent.md');
    });

    it('should handle read errors', async () => {
      // Arrange
      const filePath = '/test/file.md';

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Act & Assert
      await expect(fileManager.readFile(filePath))
        .rejects
        .toThrow('CS-502: Failed to read file: Permission denied');
    });
  });
});
