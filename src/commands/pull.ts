import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import { apiClient } from '../api/client.js';
import { ConfluenceToMarkdownConverter } from '../converters/confluence-to-markdown.js';
import { FileManager } from '../storage/file-manager.js';
import { ManifestManager } from '../storage/manifest-manager.js';
import { logger } from '../utils/logger.js';
import { createProgress } from '../utils/progress.js';

export const pullCommand = new Command('pull')
  .description('Pull a Confluence page to local filesystem as Markdown')
  .argument('<pageId>', 'Confluence page ID to pull')
  .option('-o, --output <dir>', 'Output directory (defaults to current directory)', '.')
  .action(async (pageId: string, options: { output: string }) => {
    const progress = createProgress();

    try {
      // Validate pageId format
      if (!pageId || pageId.trim().length === 0) {
        throw new Error('CS-400: Invalid page ID - cannot be empty');
      }

      // Initialize API client
      progress.start('Initializing Confluence connection...');
      await apiClient.initialize();

      // Fetch page from Confluence
      progress.update('Fetching page from Confluence...');
      const page = await apiClient.getPage(pageId, true);

      if (!page) {
        throw new Error(`CS-404: Page with ID ${pageId} not found`);
      }

      // Extract page details
      const pageContent = page.body?.storage?.value || '';
      const pageTitle = page.title || 'untitled';
      const pageVersion = page.version?.number || 1;
      const pageSpaceId = page.spaceId || '';

      // Convert to Markdown
      progress.update('Converting to Markdown...');
      const converter = new ConfluenceToMarkdownConverter();
      const markdown = await converter.convert(pageContent);

      // Save to filesystem
      progress.update('Saving to filesystem...');
      const fileManager = new FileManager();
      const outputDir = path.resolve(options.output);
      const filename = fileManager.sanitizeFilename(pageTitle);
      const filePath = await fileManager.writeFile(outputDir, filename, markdown);

      // Update manifest
      progress.update('Updating manifest...');
      const manifestManager = ManifestManager.getInstance();
      await manifestManager.updatePage({
        id: pageId,
        spaceKey: pageSpaceId,
        title: pageTitle,
        version: pageVersion,
        parentId: page.parentId || null,
        lastModified: new Date(), // Use current date since 'when' is not in PageResponse
        localPath: path.relative(process.cwd(), filePath),
        contentHash: await fileManager.calculateHash(markdown),
        status: 'synced',
      });

      // Success message
      progress.stop();
      // Using console for CLI output is acceptable for user-facing messages
      // This is different from using console.log for debugging
      console.log(chalk.green('✓'), `Successfully pulled page "${pageTitle}" (v${pageVersion})`);
      console.log(chalk.gray('  File saved to:'), chalk.cyan(path.relative(process.cwd(), filePath)));
    }
    catch (error: any) {
      progress.stop();
      logger.error('Pull command failed', error);
      // Using console.error for CLI output is acceptable for user-facing error messages
      console.error(chalk.red('✗'), error.message);
      process.exit(1);
    }
  });

export default pullCommand;
