import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { z } from 'zod';
import { ConfigManager } from '../config/config-manager.js';
import { FilterManager } from '../storage/filter-manager.js';
import { SearchService } from '../sync/search-service.js';
import { ErrorMapper } from '../utils/error-mapper.js';
import { logger } from '../utils/logger.js';

const searchOptionsSchema = z.object({
  author: z.string().optional(),
  modifiedAfter: z.string().optional(),
  label: z.array(z.string()).optional(),
  space: z.array(z.string()).optional(),
  cql: z.string().optional(),
  glob: z.string().optional(),
  pull: z.boolean().optional(),
  pullInteractive: z.boolean().optional(),
  save: z.string().optional(),
  filter: z.string().optional(),
  listFilters: z.boolean().optional(),
  json: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(25),
});

type SearchOptions = z.infer<typeof searchOptionsSchema>;

export const searchCommand = new Command('search')
  .description('Search for Confluence pages')
  .argument('[query]', 'Search query text')
  .option('--author <author>', 'Filter by page author')
  .option('--modified-after <date>', 'Filter by modification date (ISO 8601)')
  .option('--label <labels...>', 'Filter by page labels')
  .option('--space <spaces...>', 'Filter by space keys')
  .option('--cql <query>', 'Use raw CQL query (overrides other filters)')
  .option('--glob <pattern>', 'Filter results by glob pattern on title')
  .option('--pull', 'Pull all matching pages')
  .option('--pull-interactive', 'Interactively select pages to pull')
  .option('--save <name>', 'Save search as a named filter')
  .option('--filter <name>', 'Use a saved filter')
  .option('--list-filters', 'List all saved filters')
  .option('--json', 'Output results as JSON')
  .option('--limit <number>', 'Maximum results to return', '25')
  .action(async (query: string | undefined, options: unknown) => {
    try {
      const opts = options as any;
      const validatedOptions = searchOptionsSchema.parse({
        ...opts,
        limit: Number.parseInt(opts.limit || '25', 10),
      });
      await executeSearch(query, validatedOptions);
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid options:', (error as any).errors);
      }
      else {
        const mappedError = ErrorMapper.mapError(error);
        logger.error(`Search failed: ${mappedError.message}`);
      }
      process.exit(1);
    }
  });

async function executeSearch(query: string | undefined, options: SearchOptions): Promise<void> {
  const configManager = ConfigManager.getInstance();
  const config = await configManager.getConfig();

  if (!config.confluenceUrl) {
    throw new Error('Confluence not configured. Run "confluence-sync auth" first.');
  }

  // Handle list filters
  if (options.listFilters) {
    const filterManager = FilterManager.getInstance();
    const filters = await filterManager.listFilters();

    if (filters.length === 0) {
      logger.info('No saved filters found.');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(filters, null, 2));
    }
    else {
      logger.info(chalk.bold('Saved Filters:'));
      filters.forEach((filter, index) => {
        console.log(chalk.cyan(`${index + 1}. ${filter.name}`));
        if (filter.description) {
          console.log(`   ${chalk.gray(filter.description)}`);
        }
        console.log(`   Last used: ${filter.lastUsed ? chalk.gray(filter.lastUsed.toISOString()) : chalk.gray('Never')}`);
      });
    }
    return;
  }

  // Handle saved filter
  let searchOptions = { ...options };
  if (options.filter) {
    const filterManager = FilterManager.getInstance();
    const savedFilter = await filterManager.getFilter(options.filter);
    if (!savedFilter) {
      throw new Error(`Filter "${options.filter}" not found`);
    }

    // Merge saved filter with current options
    searchOptions = {
      ...searchOptions,
      ...savedFilter.filters,
      cql: savedFilter.cql || searchOptions.cql,
    };
    query = savedFilter.query || query;

    await filterManager.updateLastUsed(options.filter);
  }

  const searchService = SearchService.getInstance();
  const spinner = ora('Searching Confluence...').start();

  try {
    const results = await searchService.search({
      query,
      author: searchOptions.author,
      modifiedAfter: searchOptions.modifiedAfter,
      labels: searchOptions.label,
      spaces: searchOptions.space,
      cql: searchOptions.cql,
      limit: searchOptions.limit,
    });

    spinner.stop();

    // Apply glob pattern if specified
    let filteredResults = results;
    if (searchOptions.glob) {
      const { globMatch } = await import('../utils/glob-matcher.js');
      filteredResults = results.filter(result => globMatch(result.title, searchOptions.glob!));
    }

    // Display results
    if (searchOptions.json) {
      console.log(JSON.stringify(filteredResults, null, 2));
    }
    else {
      displaySearchResults(filteredResults);
    }

    // Save filter if requested
    if (searchOptions.save) {
      const filterManager = FilterManager.getInstance();
      await filterManager.saveFilter(searchOptions.save, {
        query,
        cql: searchOptions.cql,
        filters: {
          author: searchOptions.author,
          modifiedAfter: searchOptions.modifiedAfter,
          label: searchOptions.label,
          space: searchOptions.space,
        },
      });
      logger.success(`Filter saved as "${searchOptions.save}"`);
    }

    // Handle bulk operations
    if (searchOptions.pull || searchOptions.pullInteractive) {
      await handleBulkPull(filteredResults, searchOptions.pullInteractive || false);
    }
  }
  catch (error) {
    spinner.fail('Search failed');
    throw error;
  }
}

function displaySearchResults(results: any[]): void {
  if (results.length === 0) {
    logger.info('No results found.');
    return;
  }

  logger.info(chalk.bold(`Found ${results.length} result(s):\n`));

  results.forEach((result, index) => {
    console.log(chalk.cyan(`${index + 1}. ${result.title}`));
    console.log(`   ${chalk.gray('Space:')} ${result.spaceName} (${result.spaceKey})`);
    console.log(`   ${chalk.gray('Author:')} ${result.author}`);
    console.log(`   ${chalk.gray('Modified:')} ${new Date(result.lastModified).toLocaleString()}`);
    if (result.contentSnippet) {
      console.log(`   ${chalk.gray('Preview:')} ${result.contentSnippet}...`);
    }
    console.log(`   ${chalk.gray('URL:')} ${result.url}`);
    console.log();
  });
}

async function handleBulkPull(results: any[], interactive: boolean): Promise<void> {
  if (results.length === 0) {
    logger.info('No pages to pull.');
    return;
  }

  let pagesToPull = results;

  // Interactive selection
  if (interactive) {
    const { default: inquirer } = await import('inquirer');
    const { selectedPages } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedPages',
        message: 'Select pages to pull:',
        choices: results.map((result, index) => ({
          name: `${result.title} (${result.spaceKey})`,
          value: index,
          checked: false,
        })),
      },
    ]);

    if (selectedPages.length === 0) {
      logger.info('No pages selected.');
      return;
    }

    pagesToPull = selectedPages.map((index: number) => results[index]);
  }

  // Confirmation for bulk operations
  if (pagesToPull.length > 10 && !interactive) {
    const { default: inquirer } = await import('inquirer');
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Pull ${pagesToPull.length} pages?`,
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info('Operation cancelled.');
      return;
    }
  }

  // Execute bulk pull
  const { pullSinglePage } = await import('./pull.js');
  const { createProgress } = await import('../utils/progress.js');
  const progress = createProgress();
  progress.start(`Pulling ${pagesToPull.length} pages...`);

  let successCount = 0;
  let errorCount = 0;

  for (const page of pagesToPull) {
    try {
      progress.update(`Pulling: ${page.title}`);
      await pullSinglePage(page.id, '.', progress);
      successCount++;
    }
    catch (error) {
      errorCount++;
      logger.error(`Failed to pull "${page.title}": ${error}`);
    }
  }

  progress.stop();
  logger.success(`Pulled ${successCount} page(s), ${errorCount} error(s)`);
}
