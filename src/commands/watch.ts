import type { WatchConfig, WatchStatus } from '../types/watch';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { ManifestManager } from '../storage/manifest-manager';
import { FileWatcher } from '../storage/watcher';
import { SyncEngine } from '../sync/engine';
import { ConfluenceSyncError } from '../utils/errors';
import { formatTimestamp } from '../utils/formatters';
import { loadIgnorePatterns } from '../utils/ignore-patterns';
import { logger } from '../utils/logger';

export const watchCommand = new Command('watch')
  .description('Watch for file changes and sync automatically')
  .option('-d, --debounce <ms>', 'Debounce delay in milliseconds', '2000')
  .option('-r, --retry <attempts>', 'Max retry attempts on failure', '3')
  .option('--no-notifications', 'Disable desktop notifications')
  .option('-v, --verbose', 'Show verbose output')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const spinner = ora();
    let watcher: FileWatcher | null = null;

    try {
      // Initialize manifest
      const manifestManager = ManifestManager.getInstance();
      await manifestManager.load();

      // Initialize sync engine
      const syncEngine = SyncEngine.getInstance();

      // Configure watch settings with validation
      const debounceDelay = Number.parseInt(options.debounce, 10);
      const retryAttempts = Number.parseInt(options.retry, 10);

      if (Number.isNaN(debounceDelay) || debounceDelay < 0) {
        throw new ConfluenceSyncError('CS-1103', 'Invalid debounce delay. Must be a positive number.');
      }

      if (Number.isNaN(retryAttempts) || retryAttempts < 0) {
        throw new ConfluenceSyncError('CS-1104', 'Invalid retry attempts. Must be a positive number.');
      }

      const watchConfig: WatchConfig = {
        enabled: true,
        debounceDelay,
        ignorePatterns: await loadIgnorePatterns(),
        notificationsEnabled: options.notifications !== false,
        retryAttempts,
        retryDelay: 1000,
      };

      // Initialize watcher
      watcher = new FileWatcher(watchConfig, syncEngine, manifestManager);

      // Set up status display
      const status: WatchStatus = {
        active: true,
        lastSyncTime: null,
        pendingChanges: 0,
        currentOperation: 'idle',
        failureCount: 0,
      };

      // Handle watcher events
      watcher.on('change', (_filePath: string) => {
        status.pendingChanges++;
        updateStatusDisplay(status, spinner, options);
      });

      watcher.on('sync:start', () => {
        status.currentOperation = 'syncing';
        status.pendingChanges = 0;
        updateStatusDisplay(status, spinner, options);
      });

      watcher.on('sync:complete', (_result: any) => {
        status.lastSyncTime = new Date();
        status.currentOperation = 'idle';
        status.failureCount = 0;
        updateStatusDisplay(status, spinner, options);

        if (watchConfig.notificationsEnabled && !options.json) {
          logger.success('✅ Sync completed successfully');
        }
      });

      watcher.on('sync:error', (error: Error) => {
        status.failureCount++;
        status.currentOperation = 'idle';
        updateStatusDisplay(status, spinner, options);

        if (watchConfig.notificationsEnabled && !options.json) {
          logger.error(`❌ Sync failed: ${error.message}`);
        }
      });

      watcher.on('retry', (_attempt: number) => {
        status.currentOperation = 'retrying';
        updateStatusDisplay(status, spinner, options);
      });

      // Start watching
      await watcher.start();

      if (!options.json) {
        logger.info(chalk.green('👁️  Watch mode started'));
        logger.info(chalk.dim(`Watching for changes in current directory`));
        logger.info(chalk.dim(`Debounce delay: ${watchConfig.debounceDelay}ms`));
        logger.info(chalk.dim('Press Ctrl+C to stop watching'));
      }

      // Initial status display
      updateStatusDisplay(status, spinner, options);

      // Handle graceful shutdown
      const handleShutdown = async (signal: string) => {
        if (!options.json && signal === 'SIGINT') {
          logger.info('\n🛑 Stopping watch mode...');
        }

        if (watcher) {
          await watcher.stop();
        }

        spinner.stop();

        // Clean up event listeners to prevent memory leaks
        process.removeListener('SIGINT', handleShutdown);
        process.removeListener('SIGTERM', handleShutdown);

        process.exit(0);
      };

      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));

      // Keep process alive
      await new Promise(() => {});
    }
    catch (error) {
      spinner.stop();

      if (error instanceof ConfluenceSyncError) {
        logger.error(error.message);
        if (options.verbose) {
          logger.error(error.stack || '');
        }
      }
      else {
        logger.error('An unexpected error occurred');
        logger.error((error as Error).message);
      }

      if (watcher) {
        await watcher.stop();
      }

      process.exit(1);
    }
  });

function updateStatusDisplay(
  status: WatchStatus,
  spinner: ReturnType<typeof ora>,
  options: any,
): void {
  if (options.json) {
    console.log(JSON.stringify(status));
    return;
  }

  let message = chalk.cyan('👁️  Watching');

  if (status.currentOperation === 'syncing') {
    spinner.start(chalk.yellow('🔄 Syncing changes...'));
    return;
  }
  else if (status.currentOperation === 'retrying') {
    spinner.start(chalk.yellow('🔄 Retrying sync...'));
    return;
  }

  spinner.stop();

  if (status.pendingChanges > 0) {
    message += chalk.yellow(` | ${status.pendingChanges} pending changes`);
  }

  if (status.lastSyncTime) {
    message += chalk.dim(` | Last sync: ${formatTimestamp(status.lastSyncTime)}`);
  }

  if (status.failureCount > 0) {
    message += chalk.red(` | ${status.failureCount} failed attempts`);
  }

  console.log(message);
}

export default watchCommand;
