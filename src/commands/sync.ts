import type { SyncOptions, SyncResult } from '../sync/engine';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { SyncEngine } from '../sync/engine';
import { logger } from '../utils/logger';

export const syncCommand = new Command('sync')
  .description('Synchronize all changes between local and Confluence in both directions')
  .option('--dry-run', 'Preview changes without executing')
  .option('--max-concurrent <number>', 'Maximum concurrent operations', '5')
  .option('--verbose', 'Show detailed progress information')
  .action(async (options: { dryRun?: boolean; maxConcurrent?: string; verbose?: boolean }) => {
    const spinner = ora();
    const startTime = Date.now();

    try {
      // Initialize sync engine
      const syncEngine = SyncEngine.getInstance();

      // Prepare sync options
      const syncOptions: SyncOptions = {
        dryRun: options.dryRun || false,
        maxConcurrent: Number.parseInt(options.maxConcurrent || '5', 10),
        verbose: options.verbose || false,
      };

      // Show mode
      if (syncOptions.dryRun) {
        console.log(chalk.yellow('🔍 Running in dry-run mode - no changes will be made\n'));
      }

      // Start sync operation
      spinner.start('Detecting changes...');

      // Execute sync
      const result = await syncEngine.sync(syncOptions);

      spinner.stop();

      // Display summary report
      displaySummaryReport(result, startTime);

      // Exit with appropriate code
      if (result.errors.length > 0) {
        process.exit(1);
      }
    }
    catch (error: any) {
      spinner.fail('Sync failed');
      logger.error('Sync command failed', error);
      console.error(chalk.red('✗'), error.message);
      process.exit(1);
    }
  });

/**
 * Display a formatted summary report of sync operations
 */
function displaySummaryReport(result: SyncResult, startTime: number): void {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(chalk.bold('\n📊 Sync Summary\n'));
  console.log('═'.repeat(50));

  // Operation counts
  const stats = [
    { label: 'Pushed', count: result.pushed.length, color: chalk.green, icon: '⬆' },
    { label: 'Pulled', count: result.pulled.length, color: chalk.blue, icon: '⬇' },
    { label: 'Conflicted', count: result.conflicted.length, color: chalk.yellow, icon: '⚠' },
    { label: 'Unchanged', count: result.unchanged.length, color: chalk.gray, icon: '=' },
    { label: 'Errors', count: result.errors.length, color: chalk.red, icon: '✗' },
  ];

  for (const stat of stats) {
    if (stat.count > 0 || stat.label === 'Unchanged') {
      console.log(`${stat.icon} ${stat.label}: ${stat.color(stat.count)}`);
    }
  }

  console.log('═'.repeat(50));

  // Show conflicts if any
  if (result.conflicted.length > 0) {
    console.log(chalk.yellow('\n⚠ Conflicts detected:'));
    for (const file of result.conflicted) {
      console.log(chalk.yellow(`  • ${file}`));
    }
    console.log(chalk.dim('\nResolve conflicts using:'));
    console.log(chalk.dim('  confluence-sync conflicts'));
    console.log(chalk.dim('  confluence-sync push --force-local <file>'));
    console.log(chalk.dim('  confluence-sync push --force-remote <file>'));
  }

  // Show errors if any
  if (result.errors.length > 0) {
    console.log(chalk.red('\n✗ Errors encountered:'));
    for (const error of result.errors) {
      console.log(chalk.red(`  • ${error.message}`));
    }
  }

  // Timing
  console.log(chalk.dim(`\n⏱ Duration: ${duration}s`));

  // Success message
  if (result.errors.length === 0 && result.conflicted.length === 0) {
    console.log(chalk.green('\n✓ Sync completed successfully!'));
  }
  else if (result.errors.length > 0) {
    console.log(chalk.red('\n✗ Sync completed with errors'));
  }
  else if (result.conflicted.length > 0) {
    console.log(chalk.yellow('\n⚠ Sync completed with conflicts'));
  }
}

export default syncCommand;
