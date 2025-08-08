import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

export class BackupManager {
  private static instance: BackupManager;
  private backupExtension = '.backup';
  private maxBackupAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  private constructor() {}

  public static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager();
    }
    return BackupManager.instance;
  }

  /**
   * Create a backup of a file
   * @returns The path to the backup file
   */
  async createBackup(filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);

      if (!existsSync(absolutePath)) {
        logger.warn(`File does not exist, no backup created: ${filePath}`);
        return '';
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${absolutePath}.${timestamp}${this.backupExtension}`;

      // Copy file to backup
      copyFileSync(absolutePath, backupPath);
      logger.info(`Backup created: ${backupPath}`);

      return backupPath;
    }
    catch (error) {
      logger.error('Failed to create backup', error);
      throw new Error(`CS-620: Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore a file from backup
   */
  async restoreBackup(backupPath: string, targetPath: string): Promise<void> {
    try {
      const absoluteBackupPath = path.resolve(backupPath);
      const absoluteTargetPath = path.resolve(targetPath);

      if (!existsSync(absoluteBackupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Copy backup to target
      copyFileSync(absoluteBackupPath, absoluteTargetPath);
      logger.info(`File restored from backup: ${targetPath}`);
    }
    catch (error) {
      logger.error('Failed to restore backup', error);
      throw new Error(`CS-621: Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all backups for a file
   */
  listBackups(filePath: string): string[] {
    try {
      const absolutePath = path.resolve(filePath);
      const dir = path.dirname(absolutePath);
      const baseName = path.basename(absolutePath);

      if (!existsSync(dir)) {
        return [];
      }

      const files = readdirSync(dir);
      const backups = files.filter(file =>
        file.startsWith(baseName) && file.endsWith(this.backupExtension),
      );

      return backups.map(file => path.join(dir, file));
    }
    catch (error) {
      logger.error('Failed to list backups', error);
      return [];
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups(filePath?: string): Promise<number> {
    try {
      let cleanupCount = 0;
      const now = Date.now();

      if (filePath) {
        // Clean up backups for specific file
        const backups = this.listBackups(filePath);

        for (const backup of backups) {
          const stats = statSync(backup);
          const age = now - stats.mtime.getTime();

          if (age > this.maxBackupAge) {
            unlinkSync(backup);
            cleanupCount++;
            logger.debug(`Removed old backup: ${backup}`);
          }
        }
      }
      else {
        // Clean up all old backups in current directory
        const files = readdirSync('.');

        for (const file of files) {
          if (file.endsWith(this.backupExtension)) {
            const stats = statSync(file);
            const age = now - stats.mtime.getTime();

            if (age > this.maxBackupAge) {
              unlinkSync(file);
              cleanupCount++;
              logger.debug(`Removed old backup: ${file}`);
            }
          }
        }
      }

      if (cleanupCount > 0) {
        logger.info(`Cleaned up ${cleanupCount} old backup(s)`);
      }

      return cleanupCount;
    }
    catch (error) {
      logger.error('Failed to cleanup old backups', error);
      throw new Error(`CS-622: Failed to cleanup backups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the most recent backup for a file
   */
  getMostRecentBackup(filePath: string): string | null {
    try {
      const backups = this.listBackups(filePath);

      if (backups.length === 0) {
        return null;
      }

      // Sort by modification time (most recent first)
      backups.sort((a, b) => {
        const aStats = statSync(a);
        const bStats = statSync(b);
        return bStats.mtime.getTime() - aStats.mtime.getTime();
      });

      return backups[0] ?? null;
    }
    catch (error) {
      logger.error('Failed to get most recent backup', error);
      return null;
    }
  }

  /**
   * Clear singleton instance (for testing)
   */
  static clearInstance(): void {
    BackupManager.instance = null as any;
  }
}
