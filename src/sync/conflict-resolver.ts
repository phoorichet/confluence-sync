import type { BackupManager } from '../storage/backup-manager.js';
import type { FileManager } from '../storage/file-manager.js';
import type { ManifestManager, ResolutionRecord as ManifestResolutionRecord } from '../storage/manifest-manager.js';
import path from 'node:path';
import chalk from 'chalk';
import * as Diff from 'diff';
import { logger } from '../utils/logger.js';
import { promptManager } from '../utils/prompts.js';

export type ConflictStrategy = 'manual' | 'local-first' | 'remote-first';

export interface ConflictInfo {
  pageId: string;
  localPath: string;
  localHash: string;
  remoteHash: string;
  localVersion?: number;
  remoteVersion?: number;
  timestamp: Date;
}

export type ResolutionRecord = ManifestResolutionRecord;

export class ConflictResolver {
  private static _instance: ConflictResolver | null = null;
  private _manifestManager: ManifestManager | null = null;
  private _fileManager: FileManager | null = null;
  private _backupManager: BackupManager | null = null;

  private constructor() {}

  static getInstance(): ConflictResolver {
    if (!ConflictResolver._instance) {
      ConflictResolver._instance = new ConflictResolver();
    }
    return ConflictResolver._instance;
  }

  setManagers(
    manifestManager: ManifestManager,
    fileManager: FileManager,
    backupManager: BackupManager,
  ): void {
    this._manifestManager = manifestManager;
    this._fileManager = fileManager;
    this._backupManager = backupManager;
  }

  private get manifestManager(): ManifestManager {
    if (!this._manifestManager) {
      throw new Error('CS-601: ManifestManager not initialized');
    }
    return this._manifestManager;
  }

  private get fileManager(): FileManager {
    if (!this._fileManager) {
      throw new Error('CS-602: FileManager not initialized');
    }
    return this._fileManager;
  }

  private get backupManager(): BackupManager {
    if (!this._backupManager) {
      throw new Error('CS-603: BackupManager not initialized');
    }
    return this._backupManager;
  }

  /**
   * Detect conflicts between local and remote versions
   */
  async detectConflict(
    pageId: string,
    localHash: string,
    remoteHash: string,
    localVersion?: number,
    remoteVersion?: number,
  ): Promise<ConflictInfo | null> {
    try {
      const manifest = await this.manifestManager.load();
      const page = manifest.pages.get(pageId);

      if (!page) {
        throw new Error(`CS-604: Page ${pageId} not found in manifest`);
      }

      // Check if both hashes differ from the base hash
      if (localHash !== remoteHash && localHash !== page.contentHash && remoteHash !== page.contentHash) {
        logger.warn(`Conflict detected for page ${pageId}`);

        const conflictInfo: ConflictInfo = {
          pageId,
          localPath: page.localPath,
          localHash,
          remoteHash,
          localVersion,
          remoteVersion,
          timestamp: new Date(),
        };

        // Update page status to conflicted
        await this.manifestManager.updatePage({
          ...page,
          status: 'conflicted',
        });

        return conflictInfo;
      }

      return null;
    }
    catch (error) {
      logger.error('Failed to detect conflict', error);
      throw new Error(`CS-605: Failed to detect conflict: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate conflict markers for a file
   */
  generateConflictMarkers(
    localContent: string,
    remoteContent: string,
    _fileName: string = 'file',
  ): string {
    const marker = '='.repeat(7);
    const localMarker = `${'<'.repeat(7)} LOCAL`;
    const remoteMarker = `${'>'.repeat(7)} REMOTE`;

    return `${localMarker}
${localContent}
${marker}
${remoteContent}
${remoteMarker}`;
  }

  /**
   * Write conflict markers to a file
   */
  async writeConflictFile(
    filePath: string,
    localContent: string,
    remoteContent: string,
  ): Promise<void> {
    try {
      const absolutePath = path.resolve(filePath);

      // Create backup first
      await this.backupManager.createBackup(absolutePath);

      // Generate conflict content
      const conflictContent = this.generateConflictMarkers(
        localContent,
        remoteContent,
        path.basename(filePath),
      );

      // Write conflict file
      await this.fileManager.writeFile(absolutePath, conflictContent);

      logger.info(`Conflict markers written to ${filePath}`);
    }
    catch (error) {
      logger.error('Failed to write conflict file', error);
      throw new Error(`CS-606: Failed to write conflict file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Resolve a conflict using the specified strategy
   */
  async resolveConflict(
    pageId: string,
    strategy: ConflictStrategy,
    localContent?: string,
    remoteContent?: string,
  ): Promise<void> {
    try {
      const manifest = await this.manifestManager.load();
      const page = manifest.pages.get(pageId);

      if (!page) {
        throw new Error(`CS-607: Page ${pageId} not found in manifest`);
      }

      if (page.status !== 'conflicted') {
        logger.info(`Page ${pageId} is not in conflict`);
        return;
      }

      const absolutePath = path.resolve(page.localPath);

      // Create backup before resolution
      await this.backupManager.createBackup(absolutePath);

      let resolvedContent: string;

      switch (strategy) {
        case 'local-first':
          if (!localContent) {
            throw new Error('CS-608: Local content required for local-first strategy');
          }
          resolvedContent = localContent;
          break;

        case 'remote-first':
          if (!remoteContent) {
            throw new Error('CS-609: Remote content required for remote-first strategy');
          }
          resolvedContent = remoteContent;
          break;

        case 'manual':
          // Manual resolution means the user has already edited the file
          // Just clear the conflict status
          break;

        default:
          throw new Error(`CS-610: Unknown resolution strategy: ${strategy}`);
      }

      // Write resolved content if not manual
      if (strategy !== 'manual' && resolvedContent!) {
        await this.fileManager.writeFile(absolutePath, resolvedContent);
      }

      // Create resolution record
      const resolutionRecord: ResolutionRecord = {
        timestamp: new Date(),
        strategy,
        previousLocalHash: page.contentHash,
        previousRemoteHash: page.remoteHash,
      };

      // Update page status and add resolution history
      const resolutionHistory = page.resolutionHistory || [];
      resolutionHistory.push(resolutionRecord);

      await this.manifestManager.updatePage({
        ...page,
        status: 'synced',
        resolutionHistory,
      });

      logger.info(`Conflict resolved for page ${pageId} using ${strategy} strategy`);
    }
    catch (error) {
      logger.error('Failed to resolve conflict', error);
      throw new Error(`CS-611: Failed to resolve conflict: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all conflicted pages from manifest
   */
  async getConflictedPages(): Promise<Array<{ pageId: string; localPath: string; timestamp?: Date }>> {
    try {
      const manifest = await this.manifestManager.load();
      const conflictedPages: Array<{ pageId: string; localPath: string; timestamp?: Date }> = [];

      manifest.pages.forEach((page, pageId) => {
        if (page.status === 'conflicted') {
          conflictedPages.push({
            pageId,
            localPath: page.localPath,
            timestamp: page.lastModified,
          });
        }
      });

      return conflictedPages;
    }
    catch (error) {
      logger.error('Failed to get conflicted pages', error);
      throw new Error(`CS-612: Failed to get conflicted pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format diff output for display
   */
  formatDiff(localContent: string, remoteContent: string): string {
    const diff = Diff.createTwoFilesPatch(
      'LOCAL',
      'REMOTE',
      localContent,
      remoteContent,
      'Local Version',
      'Remote Version',
    );

    return diff;
  }

  /**
   * Format diff output with colors for terminal display
   */
  formatColoredDiff(localContent: string, remoteContent: string): string {
    const changes = Diff.diffLines(localContent, remoteContent);
    let output = '';

    changes.forEach((part) => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      const color = part.added ? chalk.green : part.removed ? chalk.red : chalk.gray;

      const lines = part.value.split('\n').filter(line => line);
      lines.forEach((line) => {
        output += color(`${prefix} ${line}\n`);
      });
    });

    return output;
  }

  /**
   * Interactively resolve a conflict
   */
  async resolveConflictInteractive(
    pageId: string,
    localContent: string,
    remoteContent: string,
    pageName?: string,
  ): Promise<void> {
    try {
      const manifest = await this.manifestManager.load();
      const page = manifest.pages.get(pageId);

      if (!page) {
        throw new Error(`CS-607: Page ${pageId} not found in manifest`);
      }

      if (page.status !== 'conflicted') {
        logger.info(`Page ${pageId} is not in conflict`);
        return;
      }

      // Display conflict information
      console.log(chalk.yellow('\n⚠️  Conflict detected!'));
      console.log(chalk.gray(`Page: ${pageName || page.localPath}`));
      console.log(chalk.gray(`Local Path: ${page.localPath}`));
      console.log('');

      // Show diff
      const showDiff = await promptManager.confirm('Would you like to see the differences?', true);

      if (showDiff) {
        console.log(chalk.cyan('\n📝 Differences:\n'));
        console.log(this.formatColoredDiff(localContent, remoteContent));
      }

      // Ask for resolution strategy
      const strategy = await promptManager.select<ConflictStrategy>(
        'How would you like to resolve this conflict?',
        [
          {
            title: 'Keep local version',
            value: 'local-first',
            description: 'Use your local changes and discard remote changes',
          },
          {
            title: 'Keep remote version',
            value: 'remote-first',
            description: 'Use remote changes and discard your local changes',
          },
          {
            title: 'Resolve manually',
            value: 'manual',
            description: 'Edit the file manually to resolve conflicts',
          },
        ],
      );

      if (strategy === 'manual') {
        // Write conflict markers to file
        await this.writeConflictFile(page.localPath, localContent, remoteContent);
        console.log(chalk.yellow('\n📝 Conflict markers have been added to the file.'));
        console.log(chalk.gray(`Please edit ${page.localPath} to resolve conflicts.`));
        console.log(chalk.gray('Look for <<<<<<< LOCAL and >>>>>>> REMOTE markers.'));
        console.log(chalk.gray('After resolving, run the sync command again.'));
      }
      else {
        // Resolve automatically
        await this.resolveConflict(pageId, strategy, localContent, remoteContent);
        console.log(chalk.green(`✅ Conflict resolved using ${strategy === 'local-first' ? 'local' : 'remote'} version`));
      }
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('CS-1002')) {
        // User cancelled
        console.log(chalk.gray('\nConflict resolution cancelled.'));
        return;
      }
      throw error;
    }
  }

  /**
   * Check if a conflict was previously resolved with same hashes
   */
  isPreviouslyResolved(
    pageId: string,
    localHash: string,
    remoteHash: string,
    resolutionHistory?: ResolutionRecord[],
  ): boolean {
    if (!resolutionHistory || resolutionHistory.length === 0) {
      return false;
    }

    // Check if this exact conflict was resolved before
    return resolutionHistory.some(
      record =>
        record.previousLocalHash === localHash
        && record.previousRemoteHash === remoteHash,
    );
  }

  /**
   * Clear singleton instance (for testing)
   */
  static clearInstance(): void {
    ConflictResolver._instance = null;
  }
}
