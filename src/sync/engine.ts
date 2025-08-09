import type { Page } from '../storage/manifest-manager';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pLimit from 'p-limit';
import { apiClient } from '../api/client';
import { ConfluenceToMarkdownConverter } from '../converters/confluence-to-markdown';
import { MarkdownToConfluenceConverter } from '../converters/markdown-to-confluence';
import { BackupManager } from '../storage/backup-manager';
import { FileManager } from '../storage/file-manager';
import { ManifestManager } from '../storage/manifest-manager';
import { ChangeDetector } from '../sync/change-detector';
import { ConflictResolver } from '../sync/conflict-resolver';
import { logger } from '../utils/logger';
import { createProgress } from '../utils/progress';

export interface SyncOptions {
  dryRun: boolean;
  maxConcurrent: number;
  verbose: boolean;
}

export interface SyncOperation {
  id: string;
  type: 'pull' | 'push' | 'sync';
  pageIds: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  changes: ChangeSet[];
  startTime: Date;
  endTime?: Date;
  error?: Error | null;
}

export interface ChangeSet {
  pageId: string;
  changeType: 'create' | 'update' | 'delete';
  direction: 'local-to-remote' | 'remote-to-local';
  previousVersion?: number;
  newVersion?: number;
  previousHash: string;
  backup?: string | null;
}

export interface SyncResult {
  operation: SyncOperation;
  pushed: string[];
  pulled: string[];
  conflicted: string[];
  unchanged: string[];
  errors: Error[];
}

interface ChangeCategory {
  localOnly: Map<string, Page>;
  remoteOnly: Map<string, Page>;
  conflicts: Map<string, Page>;
  unchanged: Map<string, Page>;
}

export class SyncEngine {
  private static _instance: SyncEngine | null = null;
  private _manifestManager: ManifestManager;
  private _fileManager: FileManager;
  private _changeDetector: ChangeDetector;
  private _conflictResolver: ConflictResolver;
  private _backupManager: BackupManager;
  private _apiClient = apiClient;

  private constructor() {
    this._manifestManager = ManifestManager.getInstance();
    this._fileManager = FileManager.getInstance();
    this._changeDetector = ChangeDetector.getInstance();
    this._conflictResolver = ConflictResolver.getInstance();
    this._backupManager = BackupManager.getInstance();

    // Set managers for conflict resolver
    this._conflictResolver.setManagers(
      this._manifestManager,
      this._fileManager,
      this._backupManager,
    );
  }

  static getInstance(): SyncEngine {
    if (!SyncEngine._instance) {
      SyncEngine._instance = new SyncEngine();
    }
    return SyncEngine._instance;
  }

  /**
   * Main sync method that orchestrates bi-directional synchronization
   */
  async sync(options: SyncOptions): Promise<SyncResult> {
    const operation: SyncOperation = {
      id: randomUUID(),
      type: 'sync',
      pageIds: [],
      status: 'in-progress',
      changes: [],
      startTime: new Date(),
    };

    const result: SyncResult = {
      operation,
      pushed: [],
      pulled: [],
      conflicted: [],
      unchanged: [],
      errors: [],
    };

    try {
      // Initialize API client
      await this._apiClient.initialize();

      // Detect all changes
      const changes = await this.detectChanges();
      operation.pageIds = Array.from(new Set([
        ...Array.from(changes.localOnly.keys()),
        ...Array.from(changes.remoteOnly.keys()),
        ...Array.from(changes.conflicts.keys()),
      ]));

      // Track unchanged files
      result.unchanged = Array.from(changes.unchanged.values()).map(p => p.localPath);

      if (options.verbose) {
        logger.info(`Detected changes: ${changes.localOnly.size} local, ${changes.remoteOnly.size} remote, ${changes.conflicts.size} conflicts`);
      }

      // Handle conflicts first
      for (const [pageId, page] of changes.conflicts) {
        result.conflicted.push(page.localPath);
        if (!options.dryRun) {
          logger.warn(`Conflict detected for ${page.localPath}`);
        }
      }

      // Process local-only changes (push)
      if (changes.localOnly.size > 0) {
        const pushResults = await this.processPushChanges(
          changes.localOnly,
          options,
          operation,
        );
        result.pushed.push(...pushResults.pushed);
        result.errors.push(...pushResults.errors);
      }

      // Process remote-only changes (pull)
      if (changes.remoteOnly.size > 0) {
        const pullResults = await this.processPullChanges(
          changes.remoteOnly,
          options,
          operation,
        );
        result.pulled.push(...pullResults.pulled);
        result.errors.push(...pullResults.errors);
      }

      operation.status = result.errors.length > 0 ? 'failed' : 'completed';
    }
    catch (error) {
      operation.status = 'failed';
      operation.error = error as Error;
      result.errors.push(error as Error);
      logger.error('Sync operation failed', error);
      throw new Error(`CS-701: Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    finally {
      operation.endTime = new Date();
    }

    return result;
  }

  /**
   * Detect all changes between local and remote
   */
  async detectChanges(): Promise<ChangeCategory> {
    const manifest = await this._manifestManager.load();
    const changes: ChangeCategory = {
      localOnly: new Map(),
      remoteOnly: new Map(),
      conflicts: new Map(),
      unchanged: new Map(),
    };

    // Check each page in manifest
    for (const [pageId, page] of manifest.pages) {
      try {
        const changeType = await this._changeDetector.getChangeState(page);

        switch (changeType) {
          case 'local-only':
            changes.localOnly.set(pageId, page);
            break;
          case 'remote-only':
            changes.remoteOnly.set(pageId, page);
            break;
          case 'conflicted':
            changes.conflicts.set(pageId, page);
            break;
          case 'unchanged':
            changes.unchanged.set(pageId, page);
            break;
          case 'both-changed':
            // Treat both-changed as conflict for now
            changes.conflicts.set(pageId, page);
            break;
        }
      }
      catch (error) {
        logger.error(`Failed to detect changes for page ${pageId}`, error);
        throw new Error(`CS-702: Change detection failed for ${pageId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return changes;
  }

  /**
   * Process local changes that need to be pushed
   */
  private async processPushChanges(
    localChanges: Map<string, Page>,
    options: SyncOptions,
    operation: SyncOperation,
  ): Promise<{ pushed: string[]; errors: Error[] }> {
    const pushed: string[] = [];
    const errors: Error[] = [];
    const limit = pLimit(options.maxConcurrent);
    const progress = options.verbose ? createProgress() : null;

    const pushTasks = Array.from(localChanges.entries()).map(([pageId, page]) =>
      limit(async () => {
        try {
          if (options.dryRun) {
            logger.info(`[DRY-RUN] Would push ${page.localPath}`);
            pushed.push(page.localPath);
            return;
          }

          progress?.update(`Pushing ${path.basename(page.localPath)}...`);

          // Read local content
          const absolutePath = path.resolve(page.localPath);
          const content = await this._fileManager.readFile(absolutePath);

          // Convert to Confluence format
          const converter = new MarkdownToConfluenceConverter();
          const confluenceContent = await converter.convert(content);

          // Update page
          const updatedPage = await this._apiClient.updatePage(
            pageId,
            confluenceContent,
            page.version + 1,
            page.title,
          );

          // Update manifest with new version
          await this._manifestManager.updatePage({
            ...page,
            version: updatedPage.version?.number || page.version + 1,
            contentHash: await this._fileManager.calculateHash(content),
            status: 'synced',
          });

          // Track change
          const change: ChangeSet = {
            pageId,
            changeType: 'update',
            direction: 'local-to-remote',
            previousVersion: page.version,
            newVersion: updatedPage.version?.number,
            previousHash: page.contentHash,
          };
          operation.changes.push(change);

          pushed.push(page.localPath);
          logger.info(`Pushed ${page.localPath}`);
        }
        catch (error) {
          const err = new Error(`CS-703: Failed to push ${page.localPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errors.push(err);
          logger.error(`Failed to push ${page.localPath}`, error);
        }
      }),
    );

    await Promise.all(pushTasks);
    progress?.stop();

    return { pushed, errors };
  }

  /**
   * Process remote changes that need to be pulled
   */
  private async processPullChanges(
    remoteChanges: Map<string, Page>,
    options: SyncOptions,
    operation: SyncOperation,
  ): Promise<{ pulled: string[]; errors: Error[] }> {
    const pulled: string[] = [];
    const errors: Error[] = [];
    const limit = pLimit(options.maxConcurrent);
    const progress = options.verbose ? createProgress() : null;

    const pullTasks = Array.from(remoteChanges.entries()).map(([pageId, page]) =>
      limit(async () => {
        try {
          if (options.dryRun) {
            logger.info(`[DRY-RUN] Would pull ${pageId} to ${page.localPath}`);
            pulled.push(pageId);
            return;
          }

          progress?.update(`Pulling ${page.title}...`);

          // Fetch remote page
          const remotePage = await this._apiClient.getPage(pageId, true);
          if (!remotePage) {
            throw new Error(`Page ${pageId} not found`);
          }

          // Convert to markdown
          const converter = new ConfluenceToMarkdownConverter();
          const markdown = await converter.convert(
            remotePage.body?.storage?.value || '',
          );

          // Create backup if file exists
          const absolutePath = path.resolve(page.localPath);
          if (await this._fileManager.readFile(absolutePath).catch(() => null)) {
            await this._backupManager.createBackup(absolutePath);
          }

          // Write to file
          await this._fileManager.writeFile(absolutePath, markdown);

          // Update manifest
          await this._manifestManager.updatePage({
            ...page,
            version: remotePage.version?.number || page.version,
            contentHash: await this._fileManager.calculateHash(markdown),
            status: 'synced',
            remoteHash: await this._fileManager.calculateHash(
              remotePage.body?.storage?.value || '',
            ),
          });

          // Track change
          const change: ChangeSet = {
            pageId,
            changeType: 'update',
            direction: 'remote-to-local',
            previousVersion: page.version,
            newVersion: remotePage.version?.number,
            previousHash: page.contentHash,
          };
          operation.changes.push(change);

          pulled.push(pageId);
          logger.info(`Pulled ${pageId} to ${page.localPath}`);
        }
        catch (error) {
          const err = new Error(`CS-704: Failed to pull ${pageId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          errors.push(err);
          logger.error(`Failed to pull ${pageId}`, error);
        }
      }),
    );

    await Promise.all(pullTasks);
    progress?.stop();

    return { pulled, errors };
  }

  /**
   * Clear singleton instance (for testing)
   */
  static clearInstance(): void {
    SyncEngine._instance = null;
  }
}
