import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { ManifestManager } from '../storage/manifest-manager.js';
import { ChangeDetector } from '../sync/change-detector.js';
import { logger } from '../utils/logger.js';

interface StatusOptions {
  json?: boolean;
  space?: string;
}

export const statusCommand = new Command('status')
  .description('Show the sync status of tracked files')
  .option('--json', 'Output in JSON format')
  .option('-s, --space <key>', 'Filter by space key')
  .action(async (options: StatusOptions) => {
    const spinner = ora('Loading manifest...').start();

    try {
      // Load manifest
      const manifestManager = ManifestManager.getInstance();
      const manifest = await manifestManager.load();

      if (manifest.pages.size === 0) {
        spinner.stop();
        console.log(chalk.yellow('No pages tracked yet. Use pull or push commands to start tracking pages.'));
        return;
      }

      spinner.text = 'Checking file status...';

      // Get pages to check
      let pages = Array.from(manifest.pages.values());
      if (options.space) {
        pages = pages.filter(p => p.spaceKey === options.space);
        if (pages.length === 0) {
          spinner.stop();
          console.log(chalk.yellow(`No pages found for space: ${options.space}`));
          return;
        }
      }

      // Detect changes
      const changeDetector = ChangeDetector.getInstance();
      const results = await changeDetector.detectBatchChanges(pages);

      spinner.succeed('Status check complete');

      // Output results
      if (options.json) {
        // JSON output
        const jsonOutput = results.map(r => ({
          pageId: r.pageId,
          localPath: r.localPath,
          state: r.state,
          localHash: r.localHash,
          remoteVersion: r.remoteVersion,
          manifestVersion: r.manifestVersion,
        }));
        console.log(JSON.stringify(jsonOutput, null, 2));
      }
      else {
        // Table output
        console.log(`\n${chalk.bold('Sync Status:\n')}`);

        // Group by state
        const unchanged = results.filter(r => r.state === 'unchanged');
        const localOnly = results.filter(r => r.state === 'local-only');
        const remoteOnly = results.filter(r => r.state === 'remote-only');
        const bothChanged = results.filter(r => r.state === 'both-changed');

        // Display summary
        console.log(chalk.bold('Summary:'));
        console.log(`  ${chalk.green('✓')} Synced: ${unchanged.length}`);
        console.log(`  ${chalk.yellow('↑')} Local changes: ${localOnly.length}`);
        console.log(`  ${chalk.blue('↓')} Remote changes: ${remoteOnly.length}`);
        console.log(`  ${chalk.red('⚠')} Conflicts: ${bothChanged.length}`);
        console.log();

        // Display detailed status
        if (localOnly.length > 0) {
          console.log(chalk.yellow.bold('Local Changes (need push):'));
          for (const result of localOnly) {
            const page = pages.find(p => p.id === result.pageId);
            console.log(`  ${chalk.yellow('↑')} ${result.localPath} - ${page?.title || 'Unknown'}`);
          }
          console.log();
        }

        if (remoteOnly.length > 0) {
          console.log(chalk.blue.bold('Remote Changes (need pull):'));
          for (const result of remoteOnly) {
            const page = pages.find(p => p.id === result.pageId);
            console.log(`  ${chalk.blue('↓')} ${result.localPath} - ${page?.title || 'Unknown'} (v${result.manifestVersion} → v${result.remoteVersion})`);
          }
          console.log();
        }

        if (bothChanged.length > 0) {
          console.log(chalk.red.bold('Conflicts (both changed):'));
          for (const result of bothChanged) {
            const page = pages.find(p => p.id === result.pageId);
            console.log(`  ${chalk.red('⚠')} ${result.localPath} - ${page?.title || 'Unknown'}`);
            console.log(`     Local modified, Remote v${result.manifestVersion} → v${result.remoteVersion}`);
          }
          console.log();
        }

        if (unchanged.length > 0 && (localOnly.length > 0 || remoteOnly.length > 0 || bothChanged.length > 0)) {
          console.log(chalk.green.bold('Up to date:'));
          for (const result of unchanged) {
            const page = pages.find(p => p.id === result.pageId);
            console.log(`  ${chalk.green('✓')} ${result.localPath} - ${page?.title || 'Unknown'}`);
          }
          console.log();
        }

        // Suggest actions
        if (localOnly.length > 0) {
          console.log(chalk.dim('Run `confluence-sync push <file>` to upload local changes'));
        }
        if (remoteOnly.length > 0) {
          console.log(chalk.dim('Run `confluence-sync pull <pageId>` to download remote changes'));
        }
        if (bothChanged.length > 0) {
          console.log(chalk.dim('Resolve conflicts by pulling latest and merging manually'));
        }
      }
    }
    catch (error) {
      spinner.fail('Failed to check status');
      logger.error('Status command failed', error);
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

export default statusCommand;
