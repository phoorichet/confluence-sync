import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

export class FileManager {
  /**
   * Write a file to the filesystem with backup if it exists
   */
  async writeFile(outputDir: string, filename: string, content: string): Promise<string> {
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
}
