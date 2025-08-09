import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import * as diff from 'diff';
import { glob } from 'glob';
import ora from 'ora';
import pLimit from 'p-limit';
import { apiClient, type PageSingle } from '../api/client';
import { ConfluenceToMarkdownConverter } from '../converters/confluence-to-markdown';
import { MarkdownToConfluenceConverter } from '../converters/markdown-to-confluence';
import { BackupManager } from '../storage/backup-manager';
import { FileManager } from '../storage/file-manager';
import { HierarchyManager } from '../storage/hierarchy-manager';
import { ManifestManager } from '../storage/manifest-manager';
import { ConflictResolver } from '../sync/conflict-resolver';
import { Cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance';
import { createProgress } from '../utils/progress';

interface PushOptions {
  dryRun?: boolean;
  forceLocal?: boolean;
  forceRemote?: boolean;
  spaceKey?: string;
  parentId?: string;
  recursive?: boolean;
  verbose?: boolean;
  concurrency?: number;
}

export const pushCommand = new Command('push')
  .description('Push local Markdown changes to Confluence')
  .argument('<path>', 'Markdown file or directory to push')
  .option('--dry-run', 'Preview changes without actually pushing')
  .option('--force-local', 'Force local version in case of conflicts')
  .option('--force-remote', 'Force remote version in case of conflicts')
  .option('-s, --space <key>', 'Space key for creating new pages')
  .option('-p, --parent-id <id>', 'Parent page ID for creating child pages')
  .option('-r, --recursive', 'Recursively push directory structure')
  .option('-v, --verbose', 'Display performance metrics and detailed progress')
  .option('-c, --concurrency <number>', 'Number of concurrent operations (default: 5)', '5')
  .action(async (inputPath: string, options: PushOptions) => {
    const spinner = ora();
    const progress = createProgress();
    const perfMonitor = PerformanceMonitor.getInstance();
    const _cache = Cache.getInstance();

    // Start performance monitoring
    if (options.verbose) {
      perfMonitor.start();
    }

    try {
      // Validate path parameter exists and is readable
      const absolutePath = path.resolve(inputPath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`CS-404: Path not found: ${inputPath}`);
      }

      const stats = fs.statSync(absolutePath);

      // Check if it's a directory - if so, handle bulk push
      if (stats.isDirectory()) {
        if (!options.recursive) {
          throw new Error(`CS-400: Directory push requires --recursive flag: ${inputPath}`);
        }
        await pushDirectory(absolutePath, options, progress);
        return;
      }

      // Single file push logic continues below
      if (!stats.isFile()) {
        throw new Error(`CS-400: Path is not a file or directory: ${inputPath}`);
      }

      if (!absolutePath.endsWith('.md')) {
        throw new Error(`CS-400: File must be a Markdown file (.md): ${inputPath}`);
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
        throw new Error(`CS-404: File not tracked in manifest. Please pull the page first: ${inputPath}`);
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

        // Display performance metrics if verbose
        if (options.verbose) {
          const metrics = perfMonitor.getMetrics();
          console.log(chalk.cyan('\nPerformance Metrics:'));
          console.log(chalk.cyan(`  API Calls: ${metrics.apiCalls}`));
          console.log(chalk.cyan(`  Cache Hits: ${metrics.cacheHits}/${metrics.cacheHits + metrics.cacheMisses}`));
          console.log(chalk.cyan(`  Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`));
          console.log(chalk.cyan(`  Memory Usage: ${metrics.memoryUsage.toFixed(2)}MB`));
        }
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
        path: inputPath,
        error: error.message,
        stack: error.stack,
      });

      process.exit(1);
    }
  });

// Helper function to push an entire directory structure
async function pushDirectory(
  dirPath: string,
  options: PushOptions,
  progress: any,
): Promise<void> {
  progress.start('Scanning directory structure...');

  // Find all markdown files in the directory
  const pattern = path.join(dirPath, '**/*.md');
  const files = await glob(pattern, { absolute: true });

  if (files.length === 0) {
    progress.stop();
    throw new Error(`CS-404: No Markdown files found in directory: ${dirPath}`);
  }

  progress.update(`Found ${files.length} Markdown files`);

  // Parse the directory structure to determine hierarchy
  const hierarchyManager = HierarchyManager.getInstance();
  const fileStructure = hierarchyManager.parseDirectoryStructure(dirPath, files);

  // Build a hierarchy tree from the files
  const _pageHierarchy = buildPageHierarchy(dirPath, files, fileStructure);

  // Initialize API client
  await apiClient.initialize();

  // Load manifest
  const manifestManager = ManifestManager.getInstance();
  const manifest = await manifestManager.load();

  // Check if we need a space key
  if (!options.spaceKey && !options.parentId) {
    // Try to find space key from existing pages in manifest
    const existingPages = Array.from(manifest.pages.values());
    if (existingPages.length > 0 && existingPages[0]) {
      options.spaceKey = existingPages[0].spaceKey;
      logger.info(`Using space key from manifest: ${options.spaceKey}`);
    }
    else {
      throw new Error('CS-400: Space key (--space) or parent ID (--parent-id) required for new pages');
    }
  }

  // Process pages in hierarchical order (parents before children)
  const processedPages = new Map<string, string>(); // localPath -> pageId
  const failedPages: Array<{ path: string; error: Error }> = [];

  progress.update('Processing pages in hierarchical order...');

  // Sort files to ensure parents are processed before children
  const sortedFiles = sortFilesByHierarchy(dirPath, files);

  // Process with concurrency limit - but maintain parent-child order
  const concurrency = typeof options.concurrency === 'string' ? options.concurrency : '5';
  const concurrencyLimit = pLimit(Number.parseInt(concurrency, 10));
  let processedCount = 0;

  // Initialize cache for better performance
  const cache = Cache.getInstance();

  // Group files by depth for sequential processing of each level
  const filesByDepth = new Map<number, string[]>();
  for (const filePath of sortedFiles) {
    const relativePath = path.relative(dirPath, filePath);
    const depth = relativePath.split(path.sep).length;
    if (!filesByDepth.has(depth)) {
      filesByDepth.set(depth, []);
    }
    filesByDepth.get(depth)!.push(filePath);
  }

  // Process each depth level sequentially, but files within a level concurrently
  const sortedDepths = Array.from(filesByDepth.keys()).sort((a, b) => a - b);

  // Batch-fetch existing pages for better performance
  const existingPageIds: string[] = [];
  for (const page of manifest.pages.values()) {
    if (page.id) {
      existingPageIds.push(page.id);
      // Pre-cache page metadata
      cache.set(`page:${page.id}`, page);
    }
  }

  // Use batch API to fetch page details if we have many pages
  if (existingPageIds.length > 10 && options.verbose) {
    progress.update('Pre-fetching page metadata for optimization...');
    const pages = await apiClient.batchGetPages(existingPageIds.slice(0, 50), false);
    for (const page of pages) {
      cache.set(`confluence:${page.id}`, page);
    }
  }

  for (const depth of sortedDepths) {
    const filesAtDepth = filesByDepth.get(depth)!;

    // Process all files at this depth level concurrently
    const promises = filesAtDepth.map(filePath =>
      concurrencyLimit(async () => {
        try {
          const relativePath = path.relative(dirPath, filePath);
          progress.update(`Processing (${++processedCount}/${files.length}): ${relativePath}`);

          // Determine parent ID based on directory structure
          const parentDir = path.dirname(filePath);
          const _parentDirRelative = path.relative(dirPath, parentDir);
          let actualParentId = options.parentId;

          // Check if this file's parent directory has an _index.md
          const parentIndexPath = path.join(parentDir, '_index.md');
          if (fs.existsSync(parentIndexPath) && filePath !== parentIndexPath) {
            // Look up the parent page ID from our processed pages
            const parentRelativePath = path.relative(dirPath, parentIndexPath);
            if (processedPages.has(parentRelativePath)) {
              actualParentId = processedPages.get(parentRelativePath);
            }
          }

          // Push the file
          const pageId = await pushSingleFile(
            filePath,
            options.spaceKey!,
            actualParentId,
            options,
            manifest,
            manifestManager,
          );

          // Store the page ID for child pages to reference
          const fileRelativePath = path.relative(dirPath, filePath);
          processedPages.set(fileRelativePath, pageId);
        }
        catch (error: any) {
          logger.error(`Failed to push ${filePath}: ${error.message}`);
          failedPages.push({ path: filePath, error });
        }
      }),
    );

    // Wait for all files at this depth to complete before moving to next depth
    await Promise.all(promises);
  }

  progress.stop();

  // Report results
  const successCount = files.length - failedPages.length;
  console.log(chalk.green('✓'), `Successfully pushed ${successCount}/${files.length} pages`);

  if (failedPages.length > 0) {
    console.log(chalk.yellow('⚠'), `Failed to push ${failedPages.length} pages:`);
    for (const { path: failedPath, error } of failedPages) {
      console.log(chalk.red('  ✗'), path.relative(dirPath, failedPath), '-', error.message);
    }
  }
}

// Helper function to build page hierarchy from directory structure
function buildPageHierarchy(
  baseDir: string,
  files: string[],
  structure: Map<string, { parentPath?: string; isIndex: boolean }>,
): Map<string, { children: string[]; parent?: string }> {
  const hierarchy = new Map<string, { children: string[]; parent?: string }>();

  for (const [filePath, info] of structure.entries()) {
    const relativePath = path.relative(baseDir, filePath);

    if (!hierarchy.has(relativePath)) {
      hierarchy.set(relativePath, { children: [] });
    }

    const node = hierarchy.get(relativePath)!;

    if (info.parentPath) {
      // This file has a parent
      const parentIndexPath = path.join(info.parentPath, '_index.md');
      if (hierarchy.has(parentIndexPath)) {
        hierarchy.get(parentIndexPath)!.children.push(relativePath);
        node.parent = parentIndexPath;
      }
    }
  }

  return hierarchy;
}

// Helper function to sort files so parents are processed before children
function sortFilesByHierarchy(baseDir: string, files: string[]): string[] {
  return files.sort((a, b) => {
    const aRelative = path.relative(baseDir, a);
    const bRelative = path.relative(baseDir, b);

    // Count directory depth
    const aDepth = aRelative.split(path.sep).length;
    const bDepth = bRelative.split(path.sep).length;

    // Process shallower files first
    if (aDepth !== bDepth) {
      return aDepth - bDepth;
    }

    // Within same depth, process _index.md files first
    const aIsIndex = path.basename(a) === '_index.md';
    const bIsIndex = path.basename(b) === '_index.md';

    if (aIsIndex && !bIsIndex)
      return -1;
    if (!aIsIndex && bIsIndex)
      return 1;

    // Otherwise, alphabetical order
    return aRelative.localeCompare(bRelative);
  });
}

// Helper function to push a single file (extracted from main logic)
async function pushSingleFile(
  filePath: string,
  spaceKey: string,
  parentId: string | undefined,
  options: PushOptions,
  manifest: any,
  manifestManager: ManifestManager,
): Promise<string> {
  const fileManager = FileManager.getInstance();
  const relativePath = path.relative(process.cwd(), filePath);

  // Check if page exists in manifest
  interface ManifestPage {
    id: string;
    spaceKey: string;
    title: string;
    version: number;
    parentId: string | null;
    lastModified: Date;
    localPath: string;
    contentHash: string;
    status: 'synced' | 'modified' | 'conflicted';
  }

  const page = Array.from(manifest.pages.values()).find(
    (p: any) => p.localPath === relativePath,
  ) as ManifestPage | undefined;

  // Read file content
  const content = await fileManager.readFile(filePath);
  const contentHash = createHash('sha256').update(content).digest('hex');

  // Convert to Confluence format
  const converter = new MarkdownToConfluenceConverter();
  const confluenceContent = await converter.convert(content);

  // Extract title from first H1 or use filename
  const titleMatch = content.match(/^#\s([^\n]+)$/m);
  const title: string = titleMatch?.[1]?.trim() || path.basename(filePath, '.md');

  if (page) {
    // Update existing page
    if (contentHash === page.contentHash && !options.dryRun) {
      logger.debug(`No changes for ${relativePath}`);
      return page.id;
    }

    if (!options.dryRun) {
      const remotePage = await apiClient.getPage(page.id, true);
      const updatedPage = await apiClient.updatePage(
        page.id,
        confluenceContent,
        (remotePage.version?.number || 0) + 1,
        title,
      );

      await manifestManager.updatePage({
        id: page.id,
        spaceKey: page.spaceKey,
        title,
        version: updatedPage.version?.number || page.version + 1,
        parentId: page.parentId,
        lastModified: new Date(),
        localPath: page.localPath,
        contentHash,
        status: 'synced',
      });

      logger.info(`Updated page: ${title}`);
      return page.id;
    }
    return page.id;
  }
  else {
    // Create new page
    if (!options.dryRun) {
      const space = await apiClient.getSpace(spaceKey);
      if (!space) {
        throw new Error(`CS-404: Space not found: ${spaceKey}`);
      }

      const newPage = await apiClient.createPage(
        space.id!,
        title,
        confluenceContent,
        parentId,
      );

      // Add to manifest
      await manifestManager.updatePage({
        id: newPage.id!,
        spaceKey,
        title,
        version: newPage.version?.number || 1,
        parentId: parentId || null,
        lastModified: new Date(),
        localPath: relativePath,
        contentHash,
        status: 'synced',
      });

      logger.info(`Created new page: ${title}`);
      return newPage.id!;
    }
  }

  return 'dry-run-id';
}
