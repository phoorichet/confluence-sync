import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { Command } from 'commander';
import { AuthManager } from '../auth/auth-manager.js';
import { ConfluenceSync } from '../sync/index.js';
import { logger } from '../utils/logger.js';

const syncCommand = new Command('sync')
  .description('Sync between local markdown files and Confluence');

syncCommand
  .command('push')
  .description('Push local markdown files to Confluence')
  .requiredOption('-p, --path <path>', 'Path to local markdown files')
  .requiredOption('-s, --space <key>', 'Confluence space key')
  .option('--parent-id <id>', 'Parent page ID for new pages')
  .option('--dry-run', 'Perform a dry run without making changes')
  .option('--force', 'Force sync even if content hasn\'t changed')
  .action(async (options) => {
    try {
      // Check if authenticated
      const authManager = AuthManager.getInstance();
      const isAuthenticated = await authManager.isAuthenticated();

      if (!isAuthenticated) {
        logger.error('Not authenticated. Please run: confluence-sync auth login');
        process.exit(1);
      }

      // Validate path
      const localPath = resolve(options.path);
      if (!existsSync(localPath)) {
        logger.error(`Path does not exist: ${localPath}`);
        process.exit(1);
      }

      logger.info(`Syncing from ${localPath} to Confluence space ${options.space}`);
      if (options.dryRun) {
        logger.info('DRY RUN MODE - No changes will be made');
      }

      const sync = new ConfluenceSync({
        localPath,
        spaceKey: options.space,
        parentPageId: options.parentId,
        dryRun: options.dryRun,
        force: options.force,
      });

      const result = await sync.syncToConfluence();

      // Display results
      logger.info('\\n📊 Sync Results:');

      if (result.created.length > 0) {
        logger.success(`✅ Created ${result.created.length} pages:`);
        result.created.forEach(file => logger.info(`   - ${file}`));
      }

      if (result.updated.length > 0) {
        logger.success(`✅ Updated ${result.updated.length} pages:`);
        result.updated.forEach(file => logger.info(`   - ${file}`));
      }

      if (result.skipped.length > 0) {
        logger.info(`⏭️  Skipped ${result.skipped.length} pages (no changes)`);
      }

      if (result.errors.length > 0) {
        logger.error(`❌ Errors encountered:`);
        result.errors.forEach(({ file, error }) => {
          logger.error(`   - ${file}: ${error}`);
        });
      }

      if (result.success) {
        logger.success('\\n✨ Sync completed successfully!');
      }
      else {
        logger.error('\\n⚠️  Sync completed with errors');
        process.exit(1);
      }
    }
    catch (error) {
      logger.error('Failed to sync:', error);
      process.exit(1);
    }
  });

syncCommand
  .command('pull')
  .description('Pull pages from Confluence to local markdown files')
  .requiredOption('-p, --path <path>', 'Path to save markdown files')
  .requiredOption('-s, --space <key>', 'Confluence space key')
  .option('--dry-run', 'Perform a dry run without making changes')
  .option('--force', 'Force sync even if content hasn\'t changed')
  .action(async (options) => {
    try {
      // Check if authenticated
      const authManager = AuthManager.getInstance();
      const isAuthenticated = await authManager.isAuthenticated();

      if (!isAuthenticated) {
        logger.error('Not authenticated. Please run: confluence-sync auth login');
        process.exit(1);
      }

      const localPath = resolve(options.path);
      logger.info(`Syncing from Confluence space ${options.space} to ${localPath}`);
      if (options.dryRun) {
        logger.info('DRY RUN MODE - No changes will be made');
      }

      const sync = new ConfluenceSync({
        localPath,
        spaceKey: options.space,
        dryRun: options.dryRun,
        force: options.force,
      });

      const result = await sync.syncFromConfluence();

      // Display results
      logger.info('\\n📊 Sync Results:');

      if (result.created.length > 0) {
        logger.success(`✅ Created ${result.created.length} files:`);
        result.created.forEach(file => logger.info(`   - ${file}`));
      }

      if (result.updated.length > 0) {
        logger.success(`✅ Updated ${result.updated.length} files:`);
        result.updated.forEach(file => logger.info(`   - ${file}`));
      }

      if (result.skipped.length > 0) {
        logger.info(`⏭️  Skipped ${result.skipped.length} files (no changes)`);
      }

      if (result.errors.length > 0) {
        logger.error(`❌ Errors encountered:`);
        result.errors.forEach(({ file, error }) => {
          logger.error(`   - ${file}: ${error}`);
        });
      }

      if (result.success) {
        logger.success('\\n✨ Sync completed successfully!');
      }
      else {
        logger.error('\\n⚠️  Sync completed with errors');
        process.exit(1);
      }
    }
    catch (error) {
      logger.error('Failed to sync:', error);
      process.exit(1);
    }
  });

export { syncCommand };
export default syncCommand;
