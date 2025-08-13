import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileManager } from '../../../src/storage/file-manager';

describe('fileManager Streaming Operations', () => {
  const fileManager = FileManager.getInstance();
  const testDir = path.join(__dirname, 'test-streaming');
  const largeFilePath = path.join(testDir, 'large-file.txt');
  const smallFilePath = path.join(testDir, 'small-file.txt');

  beforeEach(() => {
    // Create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Create a small test file (< 1MB)
    writeFileSync(smallFilePath, 'Small content for testing');

    // Create a large test file (> 1MB)
    const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
    writeFileSync(largeFilePath, largeContent);
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    
    // Clear singleton instance for clean state
    FileManager.clearInstance();
  });

  describe('isLargeFile', () => {
    it('should identify large files correctly', () => {
      expect(fileManager.isLargeFile(largeFilePath)).toBe(true);
      expect(fileManager.isLargeFile(smallFilePath)).toBe(false);
    });

    it('should use custom threshold', () => {
      expect(fileManager.isLargeFile(smallFilePath, 10)).toBe(true); // 10 bytes threshold
      expect(fileManager.isLargeFile(smallFilePath, 1024 * 1024)).toBe(false);
    });

    it('should return false for non-existent files', () => {
      expect(fileManager.isLargeFile('/non/existent/file.txt')).toBe(false);
    });
  });

  describe('readFileStream', () => {
    it('should read file in chunks', async () => {
      const chunks: string[] = [];

      for await (const chunk of fileManager.readFileStream(smallFilePath)) {
        chunks.push(chunk);
      }

      const content = chunks.join('');
      expect(content).toBe('Small content for testing');
    });

    it('should handle large files efficiently', async () => {
      const chunkSizes: number[] = [];
      let totalSize = 0;

      for await (const chunk of fileManager.readFileStream(largeFilePath, 64 * 1024)) {
        chunkSizes.push(chunk.length);
        totalSize += chunk.length;
      }

      // Should have multiple chunks
      expect(chunkSizes.length).toBeGreaterThan(1);
      // Total size should match file size
      expect(totalSize).toBe(2 * 1024 * 1024);
    });

    it('should throw error for non-existent file', async () => {
      // The async generator throws when iteration starts
      await expect(async () => {
        const iterator = fileManager.readFileStream('/non/existent/file.txt');
        // Force the generator to start and throw
        await iterator.next();
      }).rejects.toThrow('CS-404');
    });
  });

  describe('writeFileStream', () => {
    it('should write file from chunks', async () => {
      const outputPath = path.join(testDir, 'output.txt');
      const chunks = ['Hello', ' ', 'World', '!'];

      // Convert array to async iterator
      async function* makeAsyncIterator(array: string[]) {
        for (const item of array) {
          yield item;
        }
      }

      await fileManager.writeFileStream(outputPath, makeAsyncIterator(chunks));

      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toBe('Hello World!');
    });

    it('should handle large content efficiently', async () => {
      const outputPath = path.join(testDir, 'large-output.txt');
      const chunkSize = 64 * 1024;
      const totalSize = 2 * 1024 * 1024;

      // Create an async generator for large content
      async function* generateContent() {
        const chunk = 'x'.repeat(chunkSize);
        const numChunks = Math.ceil(totalSize / chunkSize);

        for (let i = 0; i < numChunks; i++) {
          yield chunk;
        }
      }

      await fileManager.writeFileStream(outputPath, generateContent());

      // Verify file was written
      expect(existsSync(outputPath)).toBe(true);
      const stats = fileManager.isLargeFile(outputPath);
      expect(stats).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const outputPath = path.join(testDir, 'new-dir', 'output.txt');
      const chunks = ['Test'];

      // Convert array to async iterator
      async function* makeAsyncIterator(array: string[]) {
        for (const item of array) {
          yield item;
        }
      }

      await fileManager.writeFileStream(outputPath, makeAsyncIterator(chunks));

      expect(existsSync(outputPath)).toBe(true);
      expect(readFileSync(outputPath, 'utf-8')).toBe('Test');
    });
  });

  describe('copyFileStream', () => {
    it('should copy file efficiently', async () => {
      const destPath = path.join(testDir, 'copy.txt');

      await fileManager.copyFileStream(smallFilePath, destPath);

      expect(existsSync(destPath)).toBe(true);
      expect(readFileSync(destPath, 'utf-8')).toBe('Small content for testing');
    });

    it('should copy large files without loading into memory', async () => {
      const destPath = path.join(testDir, 'large-copy.txt');
      const memBefore = fileManager.getMemoryUsage();

      await fileManager.copyFileStream(largeFilePath, destPath);

      const memAfter = fileManager.getMemoryUsage();

      // Memory usage should not increase significantly (< 50MB)
      expect(memAfter.heapUsed - memBefore.heapUsed).toBeLessThan(50 * 1024 * 1024);

      // Verify file was copied
      expect(existsSync(destPath)).toBe(true);
      expect(fileManager.isLargeFile(destPath)).toBe(true);
    });

    it('should throw error for non-existent source', async () => {
      // Add await to properly handle the promise
      await expect(fileManager.copyFileStream('/non/existent.txt', '/dest.txt')).rejects.toThrow('CS-404');
    });
  });

  describe('calculateHashStream', () => {
    it('should calculate hash correctly', async () => {
      const testPath = path.join(testDir, 'hash-test.txt');
      writeFileSync(testPath, 'Hello World');

      const hash = await fileManager.calculateHashStream(testPath);

      // SHA-256 hash of 'Hello World'
      expect(hash).toBe('a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
    });

    it('should handle large files efficiently', async () => {
      const memBefore = fileManager.getMemoryUsage();

      const hash = await fileManager.calculateHashStream(largeFilePath);

      const memAfter = fileManager.getMemoryUsage();

      // Memory usage should not increase significantly (< 50MB)
      expect(memAfter.heapUsed - memBefore.heapUsed).toBeLessThan(50 * 1024 * 1024);

      // Hash should be consistent
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex characters
    });
  });

  describe('smartRead', () => {
    it('should use regular read for small files', async () => {
      const result = await fileManager.smartRead(smallFilePath);

      expect(typeof result).toBe('string');
      expect(result).toBe('Small content for testing');
    });

    it('should use streaming for large files', async () => {
      const result = await fileManager.smartRead(largeFilePath);

      // Should return an async iterator for large files
      expect(typeof result).toBe('object');
      expect((result as any)[Symbol.asyncIterator]).toBeDefined();

      // Verify we can read from it
      const chunks: string[] = [];
      for await (const chunk of result as AsyncIterableIterator<string>) {
        chunks.push(chunk);
        if (chunks.length > 2)
          break; // Just test a few chunks
      }
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should respect custom threshold', async () => {
      const result = await fileManager.smartRead(smallFilePath, 10); // 10 bytes threshold

      // Should use streaming since file is larger than 10 bytes
      expect(typeof result).toBe('object');
      expect((result as any)[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe('smartWrite', () => {
    it('should use regular write for small content', async () => {
      const outputPath = path.join(testDir, 'smart-small.txt');
      await fileManager.smartWrite(outputPath, 'Small content');

      expect(readFileSync(outputPath, 'utf-8')).toBe('Small content');
    });

    it('should use streaming for large content', async () => {
      const outputPath = path.join(testDir, 'smart-large.txt');
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB

      const memBefore = fileManager.getMemoryUsage();
      await fileManager.smartWrite(outputPath, largeContent);
      const memAfter = fileManager.getMemoryUsage();

      // Memory usage should be reasonable (< 100MB increase)
      expect(memAfter.heapUsed - memBefore.heapUsed).toBeLessThan(100 * 1024 * 1024);

      // File should be written correctly
      expect(existsSync(outputPath)).toBe(true);
      expect(fileManager.isLargeFile(outputPath)).toBe(true);
    });

    it('should handle async iterator input', async () => {
      const outputPath = path.join(testDir, 'smart-iterator.txt');

      async function* generateContent() {
        yield 'Hello ';
        yield 'from ';
        yield 'iterator!';
      }

      await fileManager.smartWrite(outputPath, generateContent());

      expect(readFileSync(outputPath, 'utf-8')).toBe('Hello from iterator!');
    });
  });

  describe('getMemoryUsage', () => {
    it('should return memory statistics', () => {
      const usage = fileManager.getMemoryUsage();

      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('rss');

      expect(usage.heapUsed).toBeGreaterThan(0);
      expect(usage.heapTotal).toBeGreaterThan(0);
      expect(usage.rss).toBeGreaterThan(0);
    });
  });
});