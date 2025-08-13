import type { FSWatcher } from 'chokidar';
import type { SyncEngine } from '../sync/engine';
import type { WatchConfig } from '../types/watch';
import type { ManifestManager } from './manifest-manager';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import chokidar from 'chokidar';
import { debounce } from '../utils/debounce';
import { ConfluenceSyncError } from '../utils/errors';
import { logger } from '../utils/logger';

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: WatchConfig;
  private syncEngine: SyncEngine;
  private manifestManager: ManifestManager;
  private pendingChanges: Set<string> = new Set();
  private debouncedSync: (() => void) | null = null;
  private retryCount = 0;
  private isActive = false;
  private isSyncing = false;
  private lastSyncFiles: string[] = [];

  constructor(
    config: WatchConfig,
    syncEngine: SyncEngine,
    manifestManager: ManifestManager,
  ) {
    super();
    this.config = config;
    this.syncEngine = syncEngine;
    this.manifestManager = manifestManager;

    // Create debounced sync function
    this.debouncedSync = debounce(
      () => this.performSync(),
      this.config.debounceDelay,
    );
  }

  async start(): Promise<void> {
    if (this.isActive) {
      throw new ConfluenceSyncError(
        'CS-1100',
        'Watcher is already active',
      );
    }

    try {
      const syncDirectory = await this.getSyncDirectory();

      // Configure chokidar with optimized settings
      this.watcher = chokidar.watch('**/*.{md,markdown}', {
        cwd: syncDirectory,
        ignored: this.config.ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        usePolling: false,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      });

      // Set up event handlers
      this.watcher
        .on('add', filePath => this.handleFileChange('add', filePath))
        .on('change', filePath => this.handleFileChange('change', filePath))
        .on('unlink', filePath => this.handleFileChange('unlink', filePath))
        .on('error', error => this.handleWatchError(error as Error));

      this.isActive = true;
      logger.debug('File watcher started');
    }
    catch (error) {
      throw new ConfluenceSyncError(
        'CS-1101',
        `Failed to start file watcher: ${(error as Error).message}`,
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      // Cancel any pending sync
      if (this.debouncedSync && 'cancel' in this.debouncedSync) {
        (this.debouncedSync as any).cancel();
      }

      // Stop the watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.isActive = false;
      this.pendingChanges.clear();
      logger.debug('File watcher stopped');
    }
    catch (error) {
      throw new ConfluenceSyncError(
        'CS-1102',
        `Failed to stop file watcher: ${(error as Error).message}`,
      );
    }
  }

  private handleFileChange(event: string, filePath: string): void {
    if (!this.isActive) {
      return;
    }

    // During sync, queue changes for next batch
    logger.debug(`File ${event}: ${filePath}`);

    // Handle different file events appropriately
    if (event === 'unlink') {
      // For delete events, always track them if the file was previously synced
      this.pendingChanges.add(filePath);
    }
    else {
      // For add/change events, track them
      this.pendingChanges.add(filePath);
    }

    this.emit('change', filePath);

    // Trigger debounced sync
    if (this.debouncedSync && !this.isSyncing) {
      this.debouncedSync();
    }
  }

  private async performSync(): Promise<void> {
    if (this.isSyncing || this.pendingChanges.size === 0) {
      return;
    }

    this.isSyncing = true;
    this.emit('sync:start');

    try {
      // Convert pending changes to array and clear the set
      const changedFiles = Array.from(this.pendingChanges);
      this.pendingChanges.clear();

      // Store files for potential retry
      this.lastSyncFiles = changedFiles;

      logger.debug(`Syncing ${changedFiles.length} changed files`);

      // Perform sync operation
      const result = await this.syncEngine.sync({
        dryRun: false,
        maxConcurrent: 5,
        verbose: false,
      });

      this.retryCount = 0;
      this.lastSyncFiles = [];
      this.emit('sync:complete', result);
      logger.debug('Sync completed successfully');
    }
    catch (error) {
      await this.handleSyncError(error as Error);
    }
    finally {
      this.isSyncing = false;
    }
  }

  private async handleSyncError(error: Error): Promise<void> {
    logger.error(`Sync failed: ${error.message}`);
    this.emit('sync:error', error);

    // Check if we should retry
    if (this.shouldRetry(error)) {
      await this.retrySync();
    }
    else {
      // Reset retry count if we're not retrying
      this.retryCount = 0;
    }
  }

  private shouldRetry(error: Error): boolean {
    // Retry on network errors
    if (this.isNetworkError(error)) {
      return this.retryCount < this.config.retryAttempts;
    }

    // Don't retry on API errors (401, 403, 404, etc.)
    return false;
  }

  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('network')
      || message.includes('timeout')
      || message.includes('econnrefused')
      || message.includes('enotfound')
      || message.includes('econnreset')
    );
  }

  private async retrySync(): Promise<void> {
    this.retryCount++;
    const delay = this.config.retryDelay * 2 ** (this.retryCount - 1);

    logger.info(`Retrying sync (attempt ${this.retryCount}/${this.config.retryAttempts}) in ${delay}ms`);
    this.emit('retry', this.retryCount);

    setTimeout(() => {
      this.isSyncing = false;
      // Re-add the files that failed to sync for retry
      this.lastSyncFiles.forEach(file => this.pendingChanges.add(file));
      this.performSync();
    }, delay);
  }

  private async getSyncDirectory(): Promise<string> {
    // Use current directory as sync directory
    return path.resolve('.');
  }

  private handleWatchError(error: Error): void {
    logger.error(`Watcher error: ${error.message}`);
    this.emit('error', error);
  }
}
