import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { calculateFileHash, calculateStringHash, getShortHash, hashesMatch } from '../../../src/utils/hash';

describe('Hash Utilities', () => {
  describe('calculateStringHash', () => {
    it('should calculate SHA-256 hash for a string', () => {
      const content = 'Hello, World!';
      const hash = calculateStringHash(content);

      // Known SHA-256 hash for 'Hello, World!'
      expect(hash).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('should return same hash for same content', () => {
      const content = 'Test content';
      const hash1 = calculateStringHash(content);
      const hash2 = calculateStringHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different content', () => {
      const hash1 = calculateStringHash('Content 1');
      const hash2 = calculateStringHash('Content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = calculateStringHash('');

      // Known SHA-256 hash for empty string
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle unicode content', () => {
      const content = '你好世界 🌍';
      const hash = calculateStringHash(content);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should handle large content', () => {
      const largeContent = 'a'.repeat(1000000); // 1MB of 'a'
      const hash = calculateStringHash(largeContent);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('calculateFileHash', () => {
    const testDir = path.join(import.meta.dir, 'test-files');
    const testFile = path.join(testDir, 'test.txt');

    beforeEach(() => {
      // Create test directory and file
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      fs.writeFileSync(testFile, 'Test file content', 'utf-8');
    });

    afterEach(() => {
      // Clean up test files
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      if (fs.existsSync(testDir)) {
        fs.rmdirSync(testDir);
      }
    });

    it('should calculate hash for a file', () => {
      const hash = calculateFileHash(testFile);
      const expectedHash = calculateStringHash('Test file content');

      expect(hash).toBe(expectedHash);
    });

    it('should throw error for non-existent file', () => {
      expect(() => calculateFileHash('/non/existent/file.txt')).toThrow('CS-504');
    });

    it('should handle empty file', () => {
      fs.writeFileSync(testFile, '', 'utf-8');
      const hash = calculateFileHash(testFile);

      // Known SHA-256 hash for empty string
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle binary content in text file', () => {
      // Write some binary-like content
      fs.writeFileSync(testFile, '\x00\x01\x02\x03', 'utf-8');
      const hash = calculateFileHash(testFile);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('hashesMatch', () => {
    it('should return true for matching hashes', () => {
      const hash1 = 'abc123def456';
      const hash2 = 'abc123def456';

      expect(hashesMatch(hash1, hash2)).toBe(true);
    });

    it('should return false for different hashes', () => {
      const hash1 = 'abc123def456';
      const hash2 = 'xyz789ghi012';

      expect(hashesMatch(hash1, hash2)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const hash1 = 'ABC123DEF456';
      const hash2 = 'abc123def456';

      expect(hashesMatch(hash1, hash2)).toBe(false);
    });
  });

  describe('getShortHash', () => {
    it('should return first 8 characters', () => {
      const hash = 'abcdef1234567890';
      const shortHash = getShortHash(hash);

      expect(shortHash).toBe('abcdef12');
    });

    it('should handle hash shorter than 8 characters', () => {
      const hash = 'abc';
      const shortHash = getShortHash(hash);

      expect(shortHash).toBe('abc');
    });

    it('should handle empty string', () => {
      const hash = '';
      const shortHash = getShortHash(hash);

      expect(shortHash).toBe('');
    });
  });
});
