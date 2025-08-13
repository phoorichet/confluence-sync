import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileManager } from '../../../src/storage/file-manager';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('fileManager', () => {
  let fileManager: FileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear singleton instance
    (FileManager as any).instance = undefined;
    fileManager = FileManager.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clear singleton instance
    (FileManager as any).instance = undefined;
  });

  describe('writeFile', () => {
    it('should write a file successfully', async () => {
      // Arrange
      const filePath = '/test/dir/test-file.md';
      const content = 'Test content';
      const expectedPath = path.resolve(filePath);

      (fs.existsSync as any).mockReturnValue(false);
      (fs.mkdirSync as any).mockImplementation(() => undefined);
      (fs.writeFileSync as any).mockImplementation(() => {});

      // Act
      const result = await fileManager.writeFile(filePath, content);

      // Assert
      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, content, 'utf-8');
    });

    it('should not create directory if it exists', async () => {
      // Arrange
      const filePath = '/test/dir/existing-file.md';
      const content = 'New content';

      (fs.existsSync as any).mockReturnValue(true);
      (fs.writeFileSync as any).mockImplementation(() => {});

      // Act
      await fileManager.writeFile(filePath, content);

      // Assert
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle write errors', async () => {
      // Arrange
      const filePath = '/test/dir/test-file.md';
      const content = 'Test content';

      (fs.existsSync as any).mockReturnValue(false);
      (fs.mkdirSync as any).mockImplementation(() => undefined);
      (fs.writeFileSync as any).mockImplementation(() => {
        throw new Error('Write failed');
      });

      // Act & Assert
      await expect(fileManager.writeFile(filePath, content))
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

      (fs.readFileSync as any).mockReturnValue(content);
      (fs.existsSync as any).mockReturnValue(false);
      (fs.mkdirSync as any).mockImplementation(() => {});
      (fs.writeFileSync as any).mockImplementation(() => {});

      // Act
      await fileManager.createBackup(originalPath, backupPath);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith(originalPath, 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.resolve(backupPath), content, 'utf-8');
    });

    it('should handle backup errors', async () => {
      // Arrange
      const originalPath = '/test/file.md';
      const backupPath = '/test/file.backup.md';

      (fs.readFileSync as any).mockImplementation(() => {
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

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(content);

      // Act
      const result = await fileManager.readFile(filePath);

      // Assert
      expect(result).toBe(content);
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(filePath), 'utf-8');
    });

    it('should throw error if file not found', async () => {
      // Arrange
      const filePath = '/test/nonexistent.md';

      (fs.existsSync as any).mockReturnValue(false);

      // Act & Assert
      await expect(fileManager.readFile(filePath))
        .rejects
        .toThrow('CS-404: File not found: /test/nonexistent.md');
    });

    it('should handle read errors', async () => {
      // Arrange
      const filePath = '/test/file.md';

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Act & Assert
      await expect(fileManager.readFile(filePath))
        .rejects
        .toThrow('CS-502: Failed to read file: Permission denied');
    });
  });

  describe('writeFileWithDir (deprecated)', () => {
    it('should write file using deprecated method', async () => {
      const outputDir = '/test/dir';
      const filename = 'test-file';
      const content = 'Test content';
      const expectedPath = path.join(path.resolve(outputDir), `${filename}.md`);

      (fs.existsSync as any).mockImplementation((_p: string) => {
        // Directory doesn't exist, file doesn't exist
        return false;
      });
      (fs.mkdirSync as any).mockImplementation(() => undefined);
      (fs.writeFileSync as any).mockImplementation(() => {});

      const result = await fileManager.writeFileWithDir(outputDir, filename, content);

      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.resolve(outputDir), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, content, 'utf-8');
    });

    it('should create backup with deprecated method if file exists', async () => {
      const outputDir = '/test/dir';
      const filename = 'existing-file';
      const content = 'New content';
      const oldContent = 'Old content';

      (fs.existsSync as any).mockImplementation((_p: string) => {
        return _p.toString().endsWith('.md');
      });
      (fs.readFileSync as any).mockReturnValue(oldContent);
      (fs.writeFileSync as any).mockImplementation(() => {});

      // Mock Date for consistent backup filename
      const mockDate = new Date('2024-01-15T10:30:00Z');
      vi.spyOn(globalThis, 'Date').mockImplementation(() => mockDate as any);

      await fileManager.writeFileWithDir(outputDir, filename, content);

      expect(fs.readFileSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // Once for backup, once for new file
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('backup'),
        oldContent,
        'utf-8',
      );
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FileManager.getInstance();
      const instance2 = FileManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after clearing', () => {
      const instance1 = FileManager.getInstance();
      (FileManager as any).instance = undefined;
      const instance2 = FileManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });
});