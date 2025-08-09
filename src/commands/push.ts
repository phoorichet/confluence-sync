import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import * as diff from 'diff';
import ora from 'ora';
import { apiClient, type PageSingle } from '../api/client';
import { ConfluenceToMarkdownConverter } from '../converters/confluence-to-markdown';
import { MarkdownToConfluenceConverter } from '../converters/markdown-to-confluence';
import { BackupManager } from '../storage/backup-manager';
import { FileManager } from '../storage/file-manager';
import { ManifestManager } from '../storage/manifest-manager';
import { ConflictResolver } from '../sync/conflict-resolver';
import { logger } from '../utils/logger';

interface PushOptions {
  dryRun?: boolean;
  forceLocal?: boolean;
  forceRemote?: boolean;
}

export const pushCommand = new Command('push')
  .description('Push local Markdown changes to Confluence')
  .argument('<file>', 'Markdown file to push')
  .option('--dry-run', 'Preview changes without actually pushing')
  .option('--force-local', 'Force local version in case of conflicts')
  .option('--force-remote', 'Force remote version in case of conflicts')
  .action(async (file: string, options: PushOptions) => {
    const spinner = ora();

    try {
      // Validate file path parameter exists and is readable
      const absolutePath = path.resolve(file);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`CS-404: File not found: ${file}`);
      }

      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        throw new Error(`CS-400: Path is not a file: ${file}`);
      }

      if (!absolutePath.endsWith('.md')) {
        throw new Error(`CS-400: File must be a Markdown file (.md): ${file}`);
      }

      // Load manifest to get page metadata
      spinner.start('Loading page metadata...');
      const manifestManager = ManifestManager.getInstance();
      const manifest = await manifestManager.load();

      // Find page in manifest by local path
      const relativePath = path.relative(process.cwd(), absolutePath);
      const page = Array.from(manifest.pages.values()).find(
        p => p.localPath === relativePath,
      );

      if (!page) {
        spinner.fail();
        throw new Error(`CS-404: File not tracked in manifest. Please pull the page first: ${file}`);
      }

      spinner.succeed('Page metadata loaded');

      // Read file content
      spinner.start('Reading file content...');
      const fileManager = FileManager.getInstance();
      const content = await fileManager.readFile(absolutePath);
      spinner.succeed('File content read');

      // Calculate content hash
      const contentHash = createHash('sha256').update(content).digest('hex');

      // Check for local changes
      if (contentHash === page.contentHash && !options.dryRun) {
        console.log(chalk.green('✓ No changes to push - file is already in sync'));
        return;
      }

      // Initialize API client if needed
      await apiClient.initialize();

      // Fetch current remote version for conflict detection
      spinner.start('Checking for remote changes...');
      let remotePage: PageSingle;
      try {
        remotePage = await apiClient.getPage(page.id, true);
      }
      catch (error: any) {
        spinner.fail();
        throw new Error(`CS-503: Failed to fetch remote page: ${error.message}`);
      }

      // Check for conflicts
      if (remotePage.version && typeof remotePage.version.number === 'number' && remotePage.version.number > page.version) {
        spinner.fail();

        // Handle conflict with force flags
        if (options.forceLocal || options.forceRemote) {
          const conflictResolver = ConflictResolver.getInstance();
          const backupManager = BackupManager.getInstance();

          conflictResolver.setManagers(manifestManager, fileManager, backupManager);

          if (options.forceLocal) {
            console.log(chalk.yellow('⚠ Forcing local version...'));
            // Continue with push (local wins)
          }
          else if (options.forceRemote) {
            console.log(chalk.yellow('⚠ Forcing remote version...'));

            // Convert remote content to markdown
            const confluenceConverter = new ConfluenceToMarkdownConverter();
            const remoteMarkdown = await confluenceConverter.convert(remotePage.body?.storage?.value || '');

            // Write remote content to local file
            await fileManager.writeFile(absolutePath, remoteMarkdown);

            // Update manifest to synced
            await manifestManager.updatePage({
              ...page,
              version: remotePage.version.number,
              status: 'synced',
            });

            console.log(chalk.green('✓ Remote version applied locally'));
            return;
          }
        }
        else {
          // Create backup if conflict detected
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
          const backupPath = absolutePath.replace('.md', `.backup-${timestamp}.md`);
          await fileManager.createBackup(absolutePath, backupPath);
          console.log(chalk.yellow(`⚠ Backup created: ${backupPath}`));

          // Update manifest with conflicted status
          await manifestManager.updatePage({
            ...page,
            status: 'conflicted',
          });

          throw new Error(
            `CS-409: Conflict detected! Remote page has been updated (version ${remotePage.version.number} vs local version ${page.version}). `
            + `Use --force-local to push anyway or --force-remote to pull remote changes.`,
          );
        }
      }

      spinner.succeed('No conflicts detected');

      // Convert markdown to Confluence format
      spinner.start('Converting Markdown to Confluence format...');
      const converter = new MarkdownToConfluenceConverter();
      const confluenceContent = await converter.convert(content);
      spinner.succeed('Content converted');

      // Dry-run mode
      if (options.dryRun) {
        console.log(chalk.cyan('\n=== DRY RUN MODE ===\n'));
        console.log(chalk.blue('File:'), relativePath);
        console.log(chalk.blue('Size:'), `${content.length} characters`);
        console.log(chalk.blue('Target Page ID:'), page.id);
        console.log(chalk.blue('Target Page Title:'), page.title);
        console.log(chalk.blue('Current Remote Version:'), remotePage.version?.number || 'unknown');
        console.log(chalk.blue('New Version:'), (remotePage.version?.number || 0) + 1);

        // Show diff summary if content changed
        if (remotePage.body?.storage?.value) {
          const changes = diff.diffLines(
            remotePage.body.storage.value,
            confluenceContent,
          );

          let linesAdded = 0;
          let linesRemoved = 0;

          changes.forEach((change) => {
            if (change.added) {
              linesAdded += change.count || 0;
            }
            else if (change.removed) {
              linesRemoved += change.count || 0;
            }
          });

          console.log(chalk.blue('\nChanges:'));
          console.log(chalk.green(`  + ${linesAdded} lines added`));
          console.log(chalk.red(`  - ${linesRemoved} lines removed`));
        }

        // Preview first 500 chars
        console.log(chalk.blue('\nContent Preview (first 500 chars):'));
        console.log(`${confluenceContent.substring(0, 500)}...\n`);

        console.log(chalk.cyan('=== DRY RUN - No changes made ==='));
        return;
      }

      // Update page on Confluence
      spinner.start('Pushing changes to Confluence...');

      try {
        const updatedPage = await apiClient.updatePage(
          page.id,
          confluenceContent,
          (remotePage.version?.number || 0) + 1,
          page.title,
        );

        spinner.succeed('Changes pushed successfully');

        // Update manifest with new version and hash
        await manifestManager.updatePage({
          ...page,
          version: updatedPage.version?.number || page.version + 1,
          contentHash,
          lastModified: new Date(),
          status: 'synced',
        });

        // Display success message
        const confluenceUrl = `${manifest.confluenceUrl}/wiki/spaces/${page.spaceKey}/pages/${page.id}`;

        // These console.log calls are for CLI user-facing output, not debugging
        console.log(chalk.green(`\n✓ Successfully pushed ${relativePath}`));
        console.log(chalk.green(`  Page: ${page.title}`));
        console.log(chalk.green(`  Version: ${updatedPage.version?.number || 'unknown'}`));
        console.log(chalk.green(`  URL: ${confluenceUrl}`));
      }
      catch (error: any) {
        spinner.fail();

        if (error.message?.includes('CS-')) {
          throw error;
        }

        throw new Error(`CS-503: Failed to update page on Confluence: ${error.message}`);
      }
    }
    catch (error: any) {
      if (spinner.isSpinning) {
        spinner.fail();
      }

      // These console.error calls are for CLI user-facing error messages
      console.error(chalk.red(`\n✗ Push failed: ${error.message}`));

      logger.error('Push command failed', {
        file,
        error: error.message,
        stack: error.stack,
      });

      process.exit(1);
    }
  });
