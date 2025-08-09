import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { logger } from '../utils/logger.js';

export class FileManager {
  private static instance: FileManager;

  private constructor() {}

  public static getInstance(): FileManager {
    if (!FileManager.instance) {
      FileManager.instance = new FileManager();
    }
    return FileManager.instance;
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);
      const dir = path.dirname(absolutePath);

      // Ensure directory exists
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }

      // Write the file
      writeFileSync(absolutePath, content, 'utf-8');
      logger.info(`Wrote file: ${absolutePath}`);

      return absolutePath;
    }
    catch (error) {
      logger.error('Failed to write file', error);
      throw new Error(`CS-502: Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Write a file to the filesystem with backup if it exists
   * @deprecated Use writeFile(filePath, content) instead
   */
  async writeFileWithDir(outputDir: string, filename: string, content: string): Promise<string> {
    try {
      // Ensure output directory exists
      const absoluteDir = path.resolve(outputDir);
      if (!existsSync(absoluteDir)) {
        mkdirSync(absoluteDir, { recursive: true });
        logger.info(`Created directory: ${absoluteDir}`);
      }

      // Generate full file path
      const filePath = path.join(absoluteDir, `${filename}.md`);

      // Create backup if file exists
      if (existsSync(filePath)) {
        const backupPath = this.generateBackupPath(filePath);
        await this.createBackup(filePath, backupPath);
        logger.info(`Created backup: ${backupPath}`);
      }

      // Write the file
      writeFileSync(filePath, content, 'utf-8');
      logger.info(`Wrote file: ${filePath}`);

      return filePath;
    }
    catch (error) {
      logger.error('Failed to write file', error);
      throw new Error(`CS-502: Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sanitize a filename for safe filesystem usage
   */
  sanitizeFilename(title: string): string {
    // Remove or replace invalid characters
    let sanitized = title
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid chars with dash
      .replace(/\s+/g, '-') // Replace spaces with dash
      .replace(/-+/g, '-') // Replace multiple dashes with single
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .toLowerCase(); // Convert to lowercase

    // Ensure filename is not empty
    if (!sanitized) {
      sanitized = 'untitled';
    }

    // Truncate if too long (keep under 200 chars for safety)
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200);
    }

    return sanitized;
  }

  /**
   * Calculate SHA-256 hash of content
   */
  async calculateHash(content: string): Promise<string> {
    const hash = createHash('sha256');
    hash.update(content, 'utf-8');
    return hash.digest('hex');
  }

  /**
   * Create a backup of an existing file
   */
  async createBackup(originalPath: string, backupPath: string): Promise<void> {
    try {
      const content = readFileSync(originalPath, 'utf-8');
      writeFileSync(backupPath, content, 'utf-8');
    }
    catch (error) {
      logger.error('Failed to create backup', error);
      throw new Error(`CS-502: Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a backup filename with timestamp
   */
  private generateBackupPath(originalPath: string): string {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    return path.join(dir, `${base}.backup-${timestamp}${ext}`);
  }

  /**
   * Read a file from the filesystem
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);
      if (!existsSync(absolutePath)) {
        throw new Error(`CS-404: File not found: ${filePath}`);
      }
      return readFileSync(absolutePath, 'utf-8');
    }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('CS-')) {
        throw error;
      }
      logger.error('Failed to read file', error);
      throw new Error(`CS-502: Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear singleton instance (for testing)
   */
  static clearInstance(): void {
    FileManager.instance = null as any;
  }

  /**
   * Check if a file is larger than the specified size threshold
   * @param filePath Path to the file
   * @param thresholdBytes Size threshold in bytes (default 1MB)
   * @returns true if file is larger than threshold
   */
  isLargeFile(filePath: string, thresholdBytes = 1024 * 1024): boolean {
    try {
      const absolutePath = path.resolve(filePath);
      if (!existsSync(absolutePath)) {
        return false;
      }
      const stats = statSync(absolutePath);
      return stats.size > thresholdBytes;
    }
    catch (error) {
      logger.error('Failed to check file size', error);
      return false;
    }
  }

  /**
   * Read a file using streams for memory efficiency (for large files)
   * @param filePath Path to the file
   * @param chunkSize Size of each chunk in bytes (default 64KB)
   * @returns AsyncIterator of string chunks
   */
  async *readFileStream(filePath: string, chunkSize = 64 * 1024): AsyncIterableIterator<string> {
    const absolutePath = path.resolve(filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`CS-404: File not found: ${filePath}`);
    }

    const stream = createReadStream(absolutePath, {
      encoding: 'utf-8',
      highWaterMark: chunkSize,
    });

    try {
      for await (const chunk of stream) {
        yield chunk as string;
      }
    }
    catch (error) {
      logger.error('Failed to read file stream', error);
      throw new Error(`CS-902: Failed to read file stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
      stream.destroy();
    }
  }

  /**
   * Write content to a file using streams for memory efficiency (for large files)
   * @param filePath Path to the file
   * @param contentIterator AsyncIterator providing content chunks
   * @param chunkSize Size of write buffer in bytes (default 64KB)
   */
  async writeFileStream(
    filePath: string,
    contentIterator: AsyncIterableIterator<string> | string[],
    chunkSize = 64 * 1024,
  ): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);

    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }

    const writeStream = createWriteStream(absolutePath, {
      encoding: 'utf-8',
      highWaterMark: chunkSize,
    });

    try {
      for await (const chunk of contentIterator) {
        const canContinue = writeStream.write(chunk);

        // Handle backpressure
        if (!canContinue) {
          await new Promise<void>((resolve) => {
            writeStream.once('drain', resolve);
          });
        }
      }

      // End the stream and wait for it to finish
      await new Promise<void>((resolve, reject) => {
        writeStream.end((error?: Error) => {
          if (error) {
            reject(error);
          }
          else {
            resolve();
          }
        });
      });

      logger.info(`Wrote file stream: ${absolutePath}`);
    }
    catch (error) {
      logger.error('Failed to write file stream', error);
      throw new Error(`CS-903: Failed to write file stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
      writeStream.destroy();
    }
  }

  /**
   * Copy a file using streams for memory efficiency
   * @param sourcePath Source file path
   * @param destPath Destination file path
   */
  async copyFileStream(sourcePath: string, destPath: string): Promise<void> {
    const absoluteSource = path.resolve(sourcePath);
    const absoluteDest = path.resolve(destPath);

    if (!existsSync(absoluteSource)) {
      throw new Error(`CS-404: Source file not found: ${sourcePath}`);
    }

    const destDir = path.dirname(absoluteDest);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    const readStream = createReadStream(absoluteSource);
    const writeStream = createWriteStream(absoluteDest);

    try {
      await pipeline(readStream, writeStream);
      logger.info(`Copied file: ${absoluteSource} -> ${absoluteDest}`);
    }
    catch (error) {
      logger.error('Failed to copy file stream', error);
      throw new Error(`CS-904: Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate hash of a file using streams (memory efficient for large files)
   * @param filePath Path to the file
   * @returns SHA-256 hash of the file
   */
  async calculateHashStream(filePath: string): Promise<string> {
    const absolutePath = path.resolve(filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`CS-404: File not found: ${filePath}`);
    }

    const hash = createHash('sha256');
    const stream = createReadStream(absolutePath);

    try {
      await pipeline(stream, hash);
      return hash.digest('hex');
    }
    catch (error) {
      logger.error('Failed to calculate file hash', error);
      throw new Error(`CS-905: Failed to calculate hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get memory usage statistics for monitoring
   */
  getMemoryUsage(): { heapUsed: number; heapTotal: number; rss: number } {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
    };
  }

  /**
   * Smart read: automatically choose between regular read and streaming based on file size
   * @param filePath Path to the file
   * @param sizeThreshold Size threshold in bytes (default 1MB)
   * @returns File content as string (for small files) or AsyncIterator (for large files)
   */
  async smartRead(filePath: string, sizeThreshold = 1024 * 1024): Promise<string | AsyncIterableIterator<string>> {
    if (this.isLargeFile(filePath, sizeThreshold)) {
      logger.info(`Using streaming read for large file: ${filePath}`);
      return this.readFileStream(filePath);
    }
    else {
      logger.debug(`Using regular read for file: ${filePath}`);
      return this.readFile(filePath);
    }
  }

  /**
   * Smart write: automatically choose between regular write and streaming based on content size
   * @param filePath Path to the file
   * @param content Content to write (string or async iterator)
   * @param sizeThreshold Size threshold in bytes (default 1MB)
   */
  async smartWrite(
    filePath: string,
    content: string | AsyncIterableIterator<string>,
    sizeThreshold = 1024 * 1024,
  ): Promise<void> {
    if (typeof content === 'string') {
      if (content.length > sizeThreshold) {
        logger.info(`Using streaming write for large content: ${filePath}`);
        // Convert string to chunks for streaming
        const chunks = Array.from(this.stringToChunks(content, 64 * 1024));
        await this.writeFileStream(filePath, chunks);
      }
      else {
        logger.debug(`Using regular write for file: ${filePath}`);
        await this.writeFile(filePath, content);
      }
    }
    else {
      // Already an iterator, use streaming
      logger.info(`Using streaming write for iterator content: ${filePath}`);
      await this.writeFileStream(filePath, content);
    }
  }

  /**
   * Convert a string to chunks for streaming
   * @param str String to convert
   * @param chunkSize Size of each chunk
   */
  private *stringToChunks(str: string, chunkSize: number): Generator<string> {
    for (let i = 0; i < str.length; i += chunkSize) {
      yield str.slice(i, i + chunkSize);
    }
  }
}
