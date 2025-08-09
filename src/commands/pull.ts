import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import pLimit from 'p-limit';
import { apiClient, type FolderSingle, type PageBulk, type PageSingle } from '../api/client.js';
import { ConfluenceToMarkdownConverter } from '../converters/confluence-to-markdown.js';
import { FileManager } from '../storage/file-manager.js';
import { HierarchyManager } from '../storage/hierarchy-manager.js';
import { ManifestManager } from '../storage/manifest-manager.js';
import { logger } from '../utils/logger.js';
import { createProgress } from '../utils/progress.js';

export const pullCommand = new Command('pull')
  .description('Pull Confluence page(s) to local filesystem as Markdown')
  .argument('[pageId]', 'Confluence page ID to pull (optional with --space)')
  .option('-o, --output <dir>', 'Output directory (defaults to current directory)', '.')
  .option('-s, --space <key>', 'Pull all pages from a Confluence space')
  .option('-r, --recursive', 'Pull page and all its children recursively')
  .option('--max-depth <depth>', 'Maximum depth for recursive operations', '10')
  .action(async (pageId: string | undefined, options: { output: string; space?: string; recursive?: boolean; maxDepth: string }) => {
    const progress = createProgress();

    try {
      // Validate input
      if (!pageId && !options.space) {
        throw new Error('CS-800: Either a page ID or --space option is required');
      }

      if (pageId && options.space) {
        throw new Error('CS-801: Cannot specify both page ID and --space option');
      }

      // validate if pageId is a number
      if (pageId && Number.isNaN(Number(pageId))) {
        throw new Error(`CS-802: Invalid page ID: ${pageId}`);
      }

      // Initialize API client
      progress.start('Initializing Confluence connection...');
      await apiClient.initialize();

      // Determine which operation to perform
      if (options.space) {
        // Pull all pages from a space
        await pullSpace(options.space, options.output, progress);
      }
      else if (pageId) {
        if (options.recursive) {
        // Pull page and its children recursively
          const maxDepth = Number.parseInt(options.maxDepth, 10);
          if (Number.isNaN(maxDepth) || maxDepth < 1) {
            throw new Error('CS-802: Invalid max-depth value');
          }
          await pullPageRecursive(pageId, options.output, maxDepth, progress);
        }
        else {
        // Pull a single page
          await pullSinglePage(pageId, options.output, progress);
        }
      }

      // Success message
      progress.stop();
      logger.info('Pull operation completed successfully');
      console.log(chalk.green('✓'), 'Pull operation completed successfully');
    }
    catch (error: any) {
      progress.stop();
      logger.error('Pull command failed', error);
      // Console output for CLI user feedback
      console.error(chalk.red('✗'), error.message);
      process.exit(1);
    }
  });

// Helper function to pull a single page
async function pullSinglePage(pageId: string, outputDir: string, progress: any): Promise<void> {
  // Fetch page from Confluence
  progress.update('Fetching page from Confluence...');
  const page = await apiClient.getPage(pageId, true);

  if (!page) {
    throw new Error(`CS-404: Page with ID ${pageId} not found`);
  }

  await savePage(page, outputDir, progress);
}

// Helper function to format position with zero padding
function formatPosition(position: number | null | undefined): string {
  // Use 3 digits for position to handle up to 999 items
  const pos = position ?? 0;
  return pos.toString().padStart(3, '0');
}

// Helper function to build the full path from child to root by traversing parent relationships
function buildFullPath(
  itemId: string | null | undefined,
  allPages: PageBulk[],
  folders: FolderSingle[],
  visited: Set<string> = new Set(),
  includePosition = true,
): string[] {
  if (!itemId || visited.has(itemId)) {
    return [];
  }

  visited.add(itemId);

  // Check if it's a page
  const page = allPages.find(p => p.id === itemId);
  if (page) {
    const parentPath = page.parentId
      ? buildFullPath(page.parentId, allPages, folders, visited, includePosition)
      : [];
    const title = page.title || 'untitled';
    const name = includePosition ? `${formatPosition(page.position)}-${title}` : title;
    return [...parentPath, name];
  }

  // Check if it's a folder
  const folder = folders.find(f => f.id === itemId);
  if (folder) {
    const parentPath = folder.parentId
      ? buildFullPath(folder.parentId, allPages, folders, visited, includePosition)
      : [];
    const title = folder.title || 'untitled-folder';
    const name = includePosition ? `${formatPosition(folder.position)}-${title}` : title;
    return [...parentPath, name];
  }

  return [];
}

// Helper function to pull all pages from a space
async function pullSpace(spaceKey: string, outputDir: string, progress: any): Promise<void> {
  progress.update(`Fetching space ${spaceKey} details...`);

  // Get space details first
  const space = await apiClient.getSpaceDetails(spaceKey);
  if (!space) {
    throw new Error(`CS-803: Space with key ${spaceKey} not found`);
  }
  // ensure required properties are present
  if (!space.id || !space.name || !space.key || !space.type || !space.homepageId) {
    throw new Error(`CS-804: Space ${spaceKey} is missing required properties`);
  }

  // Store space metadata in manifest
  const manifestManager = ManifestManager.getInstance();
  await manifestManager.updateSpace({
    id: space.id,
    key: space.key,
    name: space.name,
    type: space.type,
    permissions: {
      view: true,
      edit: false,
      delete: false,
    },
    homepageId: space.homepageId,
    lastSyncTime: new Date(),
  });

  progress.update(`Fetching all pages from space ${spaceKey}...`);

  // Get all pages in the space with pagination
  const allPages: PageBulk[] = [];
  const folders: FolderSingle[] = [];
  const limit = 250;
  let hasMore = true;

  while (hasMore) {
    const pages = await apiClient.getSpacePages(+space.id, { limit });
    allPages.push(...pages?.results || []);

    hasMore = !!pages._links?.next;

    progress.update(`Fetched ${allPages.length} pages from space ${spaceKey}...`);
  }

  if (allPages.length === 0) {
    logger.warn(`No pages found in space ${spaceKey}`);
    console.log(chalk.yellow('⚠'), `No pages found in space ${spaceKey}`);
    return;
  }

  // Collect all unique folder IDs
  const noDuplicateFolders = new Set<string>();
  for (const page of allPages) {
    if (page.parentType === 'folder' && page.parentId) {
      noDuplicateFolders.add(page.parentId);
    }
  }

  // Also traverse folders to find parent folders
  const processedFolders = new Set<string>();
  const foldersToProcess = Array.from(noDuplicateFolders);

  while (foldersToProcess.length > 0) {
    const folderId = foldersToProcess.pop();
    if (!folderId || processedFolders.has(folderId))
      continue;

    processedFolders.add(folderId);
    const folder = await apiClient.getFolder(folderId);
    if (folder) {
      folders.push(folder);
      // If this folder has a parent folder, add it to the list to process
      if (folder.parentType === 'folder' && folder.parentId && !processedFolders.has(folder.parentId)) {
        foldersToProcess.push(folder.parentId);
      }
    }
  }

  // Save all folders
  for (const folder of folders) {
    await saveFolder(folder);
  }

  progress.update(`Processing ${allPages.length} pages...`);

  // Track failed pages for reporting
  const failedPages: Array<{ page: PageBulk; error: Error }> = [];
  let processedCount = 0;

  // Process pages with concurrency limit and error recovery
  const concurrencyLimit = pLimit(5);
  const tasks = allPages.map(page =>
    concurrencyLimit(async () => {
      try {
        progress.update(`Processing page: ${page.title} (${++processedCount}/${allPages.length})`);

        // Build the full path from the page to the root
        let parentPath: string | undefined;
        if (page.parentId) {
          const pathSegments = buildFullPath(page.parentId, allPages, folders);
          parentPath = pathSegments.length > 0 ? path.join(...pathSegments) : undefined;
        }

        // Check if page has children
        const hasChildren = allPages.some(p => p.parentId === page.id);
        const isHomepageId = page.id === space.homepageId;

        await savePage(page, outputDir, null, spaceKey, parentPath, hasChildren, page.position, isHomepageId);
      }
      catch (error: any) {
        logger.error(`Failed to process page ${page.title} (${page.id}): ${error.message}`);
        failedPages.push({ page, error });
      }
    }),
  );

  await Promise.all(tasks);

  // Report failed pages if any
  if (failedPages.length > 0) {
    logger.warn(`${failedPages.length} pages failed to process:`);
    for (const { page, error } of failedPages) {
      logger.warn(`  - ${page.title} (${page.id}): ${error.message}`);
    }
    console.log(chalk.yellow('⚠'), `${failedPages.length} pages failed to process. Check logs for details.`);
  }

  logger.info(`Successfully pulled ${allPages.length} pages from space ${spaceKey}`);
  console.log(chalk.green('✓'), `Successfully pulled ${allPages.length} pages from space ${spaceKey}`);
}

// Helper function to pull a page and its children recursively
async function pullPageRecursive(
  pageId: string,
  outputDir: string,
  maxDepth: number,
  progress: any,
  currentDepth = 0,
): Promise<void> {
  if (currentDepth >= maxDepth) {
    logger.warn(`CS-804: Maximum depth ${maxDepth} reached, skipping deeper pages`);
    return;
  }

  // Pull the current page
  progress.update(`Fetching page ${pageId} (depth: ${currentDepth})...`);
  const page = await apiClient.getPage(pageId, true);

  if (!page) {
    throw new Error(`CS-404: Page with ID ${pageId} not found`);
  }

  await savePage(page, outputDir, progress);

  // Get and process children
  progress.update(`Fetching children of page ${pageId}...`);
  const children = await apiClient.getPageChildren(pageId);

  if (children.length > 0) {
    logger.info(`Found ${children.length} child pages for page ${pageId}`);
    console.log(chalk.gray(`  Found ${children.length} child pages`));

    // Process children with concurrency limit and error recovery
    const concurrencyLimit = pLimit(5);
    const failedChildren: string[] = [];

    const tasks = children.map(child =>
      concurrencyLimit(async () => {
        try {
          await pullPageRecursive(child?.id || '', outputDir, maxDepth, progress, currentDepth + 1);
        }
        catch (error: any) {
          logger.error(`Failed to pull child page ${child?.id}: ${error.message}`);
          failedChildren.push(child?.id || 'unknown');
        }
      }),
    );

    await Promise.all(tasks);

    if (failedChildren.length > 0) {
      logger.warn(`Failed to pull ${failedChildren.length} child pages of ${pageId}`);
    }
  }
}

// Helper function to save a page to disk and update manifest
async function savePage(
  page: PageSingle,
  outputDir: string,
  progress: any | null,
  spaceKey?: string,
  parentPath?: string,
  hasChildren = false,
  position?: number | null,
  isHomepageId = false,
): Promise<void> {
  // ensure page has an ID
  if (!page.id) {
    throw new Error(`CS-806: Page ID is missing or invalid for page ${page.title}`);
  }

  // Extract page details
  const pageContent = page.body?.storage?.value || '';
  const pageTitle = page.title || 'untitled';
  const pageVersion = page.version?.number || 1;
  const pageSpaceKey = spaceKey || page.spaceId || '';
  const pagePosition = position ?? page.position ?? 0;

  // Convert to Markdown
  if (progress) {
    progress.update('Converting to Markdown...');
  }
  const converter = new ConfluenceToMarkdownConverter();
  const markdown = await converter.convert(pageContent);

  // Determine file path based on hierarchy
  const fileManager = FileManager.getInstance();
  const hierarchyManager = HierarchyManager.getInstance();
  const baseDir = path.resolve(outputDir);

  // Build hierarchical path with position prefix
  const titleWithPosition = `${formatPosition(pagePosition)}-${pageTitle}`;
  const hierarchyPath = hierarchyManager.buildHierarchyPath(
    titleWithPosition,
    parentPath,
    hasChildren,
    isHomepageId,
  );
  const outputPath = path.join(baseDir, hierarchyPath);

  // Ensure directory structure exists
  await hierarchyManager.ensureDirectoryStructure(outputPath);

  // Write the file
  const filePath = await fileManager.writeFile(outputPath, markdown);

  // Update manifest
  if (progress) {
    progress.update('Updating manifest...');
  }
  const manifestManager = ManifestManager.getInstance();
  await manifestManager.updatePage({
    id: page.id,
    spaceKey: pageSpaceKey,
    title: pageTitle,
    version: pageVersion,
    parentId: page.parentId || null,
    parentType: page.parentType,
    position: page.position || 0,
    lastModified: new Date(),
    localPath: path.relative(process.cwd(), filePath),
    contentHash: await fileManager.calculateHash(markdown),
    status: 'synced',
  });

  if (progress) {
    logger.debug(`Saved page: ${pageTitle} to ${filePath}`);
    console.log(chalk.gray('  ✓'), `Saved: ${pageTitle}`);
  }
}

// Helper function to save a single folder to manifest
async function saveFolder(folder: FolderSingle): Promise<void> {
  // Ensure folder has an ID
  if (!folder.id) {
    throw new Error(`CS-807: Folder ID is missing or invalid for folder ${folder.title}`);
  }

  // Update manifest with folder information
  const manifestManager = ManifestManager.getInstance();
  await manifestManager.updateFolder({
    id: folder.id,
    type: folder.type,
    status: folder.status,
    title: folder.title,
    parentId: folder.parentId,
    parentType: folder.parentType,
    position: folder.position,
    authorId: folder.authorId,
    ownerId: folder.ownerId,
    createdAt: folder.createdAt,
    version: folder.version,
  });

  logger.info(`Saved folder metadata: ${folder.title || folder.id}`);
}

export default pullCommand;
