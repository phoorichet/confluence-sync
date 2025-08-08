import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import * as Diff from 'diff';
import ora from 'ora';
import { apiClient } from '../api/client.js';
import { ConfluenceToMarkdownConverter } from '../converters/confluence-to-markdown.js';
import { BackupManager } from '../storage/backup-manager.js';
import { FileManager } from '../storage/file-manager.js';
import { ManifestManager } from '../storage/manifest-manager.js';
import { ConflictResolver } from '../sync/conflict-resolver.js';
import { logger } from '../utils/logger.js';

export const conflictsCommand = new Command('conflicts')
  .description('List and manage conflicted files')
  .option('--show-diff', 'Show diff for each conflicted file')
  .option('--resolve-all <strategy>', 'Resolve all conflicts with strategy (local-first, remote-first)')
  .action(async (options) => {
    const spinner = ora('Loading conflicts...').start();

    try {
      // Initialize managers
      const conflictResolver = ConflictResolver.getInstance();
      const manifestManager = ManifestManager.getInstance();
      const fileManager = FileManager.getInstance();
      const backupManager = BackupManager.getInstance();

      conflictResolver.setManagers(manifestManager, fileManager, backupManager);

      // Get conflicted pages
      const conflictedPages = await conflictResolver.getConflictedPages();

      if (conflictedPages.length === 0) {
        spinner.succeed('No conflicts found');
        return;
      }

      spinner.stop();
      console.log(chalk.yellow(`\nFound ${conflictedPages.length} conflicted file(s):\n`));

      // Display conflict information
      for (const conflict of conflictedPages) {
        console.log(chalk.red(`● ${conflict.localPath}`));
        console.log(`  Page ID: ${conflict.pageId}`);

        if (conflict.timestamp) {
          console.log(`  Last modified: ${conflict.timestamp.toLocaleString()}`);
        }

        // Show diff if requested
        if (options.showDiff) {
          try {
            await showDiff(conflict.pageId, conflict.localPath);
          }
          catch (error) {
            logger.error(`Failed to show diff for ${conflict.localPath}`, error);
          }
        }

        console.log();
      }

      // Resolve all conflicts if requested
      if (options.resolveAll) {
        const strategy = options.resolveAll;

        if (!['local-first', 'remote-first'].includes(strategy)) {
          console.log(chalk.red(`Invalid strategy: ${strategy}. Use 'local-first' or 'remote-first'`));
          return;
        }

        const resolveSpinner = ora(`Resolving all conflicts with ${strategy} strategy...`).start();

        for (const conflict of conflictedPages) {
          try {
            // Get content based on strategy
            let localContent: string | undefined;
            let remoteContent: string | undefined;

            if (strategy === 'local-first') {
              localContent = readFileSync(path.resolve(conflict.localPath), 'utf-8');
            }
            else if (strategy === 'remote-first') {
              // Fetch remote content
              await apiClient.initialize();
              const manifest = await manifestManager.load();
              const page = manifest.pages.get(conflict.pageId);

              if (page) {
                const remotePage = await apiClient.getPage(page.id);
                if (remotePage?.body?.storage?.value) {
                  const converter = new ConfluenceToMarkdownConverter();
                  remoteContent = await converter.convert(remotePage.body.storage.value);
                }
              }
            }

            await conflictResolver.resolveConflict(
              conflict.pageId,
              strategy as any,
              localContent,
              remoteContent,
            );

            resolveSpinner.text = `Resolved ${conflict.localPath}`;
          }
          catch (error) {
            logger.error(`Failed to resolve conflict for ${conflict.localPath}`, error);
            resolveSpinner.fail(`Failed to resolve ${conflict.localPath}`);
          }
        }

        resolveSpinner.succeed(`Resolved ${conflictedPages.length} conflict(s) with ${strategy} strategy`);
      }
      else {
        // Show resolution instructions
        console.log(chalk.cyan('To resolve conflicts:'));
        console.log('  1. Edit conflicted files manually and remove conflict markers');
        console.log('  2. Use --resolve-all <strategy> to batch resolve');
        console.log('  3. Use push/pull commands with --force-local or --force-remote flags');
      }
    }
    catch (error) {
      spinner.fail('Failed to list conflicts');
      logger.error('Failed to list conflicts', error);
      // eslint-disable-next-line node/prefer-global/process
      process.exit(1);
    }
  });

/**
 * Show diff for a conflicted file
 */
async function showDiff(pageId: string, localPath: string): Promise<void> {
  try {
    // Get local content
    const localContent = readFileSync(path.resolve(localPath), 'utf-8');

    // Get remote content
    await apiClient.initialize();
    const manifestManager = ManifestManager.getInstance();
    const manifest = await manifestManager.load();
    const page = manifest.pages.get(pageId);

    if (!page) {
      console.log(chalk.gray('  [Remote page not found]'));
      return;
    }

    const remotePage = await apiClient.getPage(page.id);
    if (!remotePage?.body?.storage?.value) {
      console.log(chalk.gray('  [Remote content not available]'));
      return;
    }

    // Convert remote content to markdown
    const converter = new ConfluenceToMarkdownConverter();
    const remoteContent = await converter.convert(remotePage.body.storage.value);

    // Generate diff
    const diff = Diff.createTwoFilesPatch(
      'LOCAL',
      'REMOTE',
      localContent,
      remoteContent,
      'Local Version',
      'Remote Version',
    );

    // Display diff with colors
    const lines = diff.split('\n');
    console.log('\n  Diff:');

    for (const line of lines) {
      if (line.startsWith('+')) {
        console.log(chalk.green(`  ${line}`));
      }
      else if (line.startsWith('-')) {
        console.log(chalk.red(`  ${line}`));
      }
      else if (line.startsWith('@')) {
        console.log(chalk.cyan(`  ${line}`));
      }
      else {
        console.log(chalk.gray(`  ${line}`));
      }
    }
  }
  catch (error) {
    logger.error(`Failed to generate diff for ${localPath}`, error);
    throw error;
  }
}
