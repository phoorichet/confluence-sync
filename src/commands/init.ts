import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import yaml from 'yaml';
import { AuthManager } from '../auth/auth-manager';
import { ManifestManager } from '../storage/manifest-manager';
import { logger } from '../utils/logger';
import { promptManager } from '../utils/prompts';

interface InitConfig {
  readonly confluence: {
    readonly url: string;
    readonly username: string;
    readonly authType: 'cloud' | 'server';
  };
  readonly sync: {
    readonly directory: string;
    readonly patterns: readonly string[];
  };
  readonly options: {
    readonly interactive: boolean;
    readonly colors: boolean;
    readonly progressBars: boolean;
    readonly jsonOutput: boolean;
  };
}

export const initCommand = new Command('init')
  .description('Initialize a new Confluence sync configuration')
  .option('--no-interactive', 'Run in non-interactive mode')
  .option('--url <url>', 'Confluence URL')
  .option('--email <email>', 'Email address (for Cloud) or username (for Server)')
  .option('--token <token>', 'API token (for Cloud) or Personal Access Token (for Server)')
  .option('--dir <directory>', 'Directory to sync files', path.join(process.cwd(), 'confluence-docs'))
  .action(async (options) => {
    const spinner = ora('Setting up Confluence sync...').start();

    try {
      spinner.stop();

      // Check if we can run interactively
      // Bun doesn't support TTY properly for prompts, so we need to use command-line args
      const isBunEnvironment = typeof Bun !== 'undefined';
      const canRunInteractive = !isBunEnvironment && promptManager.isInteractive() && !options.noInteractive;
      const hasRequiredOptions = options.url && options.email && options.token;
      
      // If we can't run interactively and don't have required options, show help
      if (!canRunInteractive && !hasRequiredOptions) {
        console.error(chalk.red('\n❌ Interactive mode is not available when using Bun\n'));
        console.log(chalk.yellow('Bun does not support interactive prompts. Please provide all required options via command line:'));
        console.log(chalk.cyan('\n  bun ./src/cli.ts init --url <url> --email <email> --token <token>\n'));
        console.log(chalk.gray('Options:'));
        console.log(chalk.gray('  --url <url>        Your Confluence URL (e.g., https://company.atlassian.net)'));
        console.log(chalk.gray('  --email <email>    Your email address (for Cloud) or username (for Server)'));
        console.log(chalk.gray('  --token <token>    API token (for Cloud) or Personal Access Token (for Server)'));
        console.log(chalk.gray('  --dir <directory>  Directory to sync files (optional, default: ./confluence-docs)'));
        console.log(chalk.gray('\nExample:'));
        console.log(chalk.green('  bun ./src/cli.ts init --url https://mycompany.atlassian.net --email user@example.com --token abc123\n'));
        
        if (!isBunEnvironment) {
          console.log(chalk.yellow('\nAlternatively, if you have Node.js installed, you can run:'));
          console.log(chalk.green('  node ./dist/cli.js init\n'));
        }
        process.exit(1);
      }
      
      const isInteractive = canRunInteractive && !hasRequiredOptions;

      // Welcome message
      console.log(chalk.cyan('\n🚀 Welcome to Confluence Sync Setup!\n'));
      console.log(chalk.gray('This wizard will help you configure your local Confluence sync.\n'));

      // Step 1: Confluence URL
      const confluenceUrl = options.url || await promptManager.text(
        'Enter your Confluence URL (e.g., https://your-domain.atlassian.net):',
        {
          validate: (input: string) => {
            try {
              const url = new URL(input);
              if (url.protocol !== 'https:') {
                return 'Please use HTTPS for secure connection';
              }
              return true;
            }
            catch {
              return 'Please enter a valid URL';
            }
          },
        },
      );

      // Validate URL even if provided via options
      try {
        const url = new URL(confluenceUrl);
        if (url.protocol !== 'https:') {
          console.error(chalk.red('Error: Please use HTTPS for secure connection'));
          process.exit(1);
        }
      }
      catch {
        console.error(chalk.red('Error: Invalid URL provided'));
        process.exit(1);
      }

      // Detect instance type
      const urlObj = new URL(confluenceUrl);
      const authType = urlObj.hostname.includes('.atlassian.net') ? 'cloud' : 'server';

      // Step 2: Authentication
      if (isInteractive) {
        console.log(chalk.cyan('\n📝 Authentication Setup\n'));
      }

      const username = options.email || await promptManager.text(
        authType === 'cloud' ? 'Enter your email address:' : 'Enter your username:',
        {
          validate: (input: string) => input.length > 0 || 'This field is required',
        },
      );

      const apiToken = options.token || await promptManager.password(
        authType === 'cloud' ? 'Enter your API token:' : 'Enter your Personal Access Token:',
      );

      // Step 3: Sync Directory
      if (isInteractive) {
        console.log(chalk.cyan('\n📁 Sync Directory Setup\n'));
      }

      const defaultDir = options.dir || path.join(process.cwd(), 'confluence-docs');
      const syncDirectory = isInteractive
        ? await promptManager.text(
          'Where should synchronized files be stored?',
          {
            defaultValue: defaultDir,
            validate: (input: string) => {
              if (!input)
                return 'Directory path is required';
              return true;
            },
          },
        )
        : defaultDir;

      // Step 4: File Patterns
      let patterns: string[] = ['**/*.md']; // Default pattern

      if (isInteractive) {
        console.log(chalk.cyan('\n🔍 File Patterns\n'));

        const includeAllMarkdown = await promptManager.confirm(
          'Sync all Markdown files (*.md)?',
          true,
        );

        patterns = includeAllMarkdown
          ? ['**/*.md']
          : [await promptManager.text(
              'Enter file pattern (e.g., docs/**/*.md):',
              { defaultValue: '**/*.md' },
            )];
      }

      // Step 5: CLI Options
      let enableColors = true;
      let enableProgress = true;
      let enableInteractive = true;

      if (isInteractive) {
        console.log(chalk.cyan('\n⚙️  CLI Preferences\n'));

        enableColors = await promptManager.confirm('Enable colored output?', true);
        enableProgress = await promptManager.confirm('Show progress bars?', true);
        enableInteractive = await promptManager.confirm('Enable interactive mode by default?', true);
      }

      // Create configuration
      const config: InitConfig = Object.freeze({
        confluence: Object.freeze({
          url: confluenceUrl,
          username,
          authType,
        }),
        sync: Object.freeze({
          directory: syncDirectory,
          patterns: Object.freeze(patterns),
        }),
        options: Object.freeze({
          interactive: enableInteractive,
          colors: enableColors,
          progressBars: enableProgress,
          jsonOutput: false,
        }),
      });

      // Step 6: Save configuration
      spinner.start('Saving configuration...');

      const configPath = path.join(process.cwd(), '.confluence-sync.yml');
      const configYaml = yaml.stringify(config);
      await fs.writeFile(configPath, configYaml, 'utf-8');

      spinner.succeed(chalk.green('Configuration saved to .confluence-sync.yml'));

      // Step 7: Authenticate
      spinner.start('Authenticating with Confluence...');

      const authManager = AuthManager.getInstance();
      await authManager.authenticate({
        url: confluenceUrl,
        username,
        apiToken,
        authType,
      });

      spinner.succeed(chalk.green('Authentication successful!'));

      // Step 8: Create sync directory
      spinner.start('Creating sync directory...');

      const absoluteSyncDir = path.resolve(syncDirectory);
      await fs.mkdir(absoluteSyncDir, { recursive: true });

      spinner.succeed(chalk.green(`Created sync directory at ${absoluteSyncDir}`));

      // Step 9: Initialize manifest
      spinner.start('Initializing sync manifest...');

      // Change to the sync directory for manifest creation
      const originalCwd = process.cwd();
      process.chdir(absoluteSyncDir);

      const manifestManager = ManifestManager.getInstance();
      await manifestManager.load(); // This will create a new manifest if it doesn't exist

      // Change back to original directory
      process.chdir(originalCwd);

      spinner.succeed(chalk.green('Sync manifest initialized'));

      // Step 10: Create .gitignore
      if (isInteractive) {
        const addGitignore = await promptManager.confirm(
          '\nWould you like to add .confluence-sync.json to .gitignore?',
          true,
        );

        if (addGitignore) {
          await addToGitignore();
        }
      }
      else {
        // In non-interactive mode, always add to gitignore
        await addToGitignore();
      }

      // Success message
      console.log(chalk.green('\n✅ Setup complete!\n'));
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.gray('  1. Run "confluence-sync pull" to download pages from Confluence'));
      console.log(chalk.gray('  2. Edit your Markdown files locally'));
      console.log(chalk.gray('  3. Run "confluence-sync push" to upload changes back to Confluence'));
      console.log(chalk.gray('  4. Run "confluence-sync status" to check sync status\n'));

      // Documentation links
      if (authType === 'cloud') {
        console.log(chalk.blue('📚 Documentation:'));
        console.log(chalk.gray('  API Tokens: https://id.atlassian.com/manage-profile/security/api-tokens'));
        console.log(chalk.gray('  Confluence Sync: https://github.com/your-org/confluence-sync\n'));
      }
    }
    catch (error) {
      spinner.fail(chalk.red('Setup failed'));

      if (error instanceof Error) {
        if (error.message.includes('CS-1002')) {
          console.log(chalk.gray('\nSetup cancelled by user.'));
        }
        else {
          console.error(chalk.red(`\nError: ${error.message}`));
        }
      }

      process.exit(1);
    }
  });

async function addToGitignore(): Promise<void> {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const ignoreEntry = '\n# Confluence sync files\n.confluence-sync.json\n';
  const targetFile = '.confluence-sync.json';

  try {
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    }
    catch {
      // File doesn't exist, will create it
    }

    if (!content.includes(targetFile)) {
      await fs.writeFile(gitignorePath, `${content}${ignoreEntry}`, 'utf-8');
      console.log(chalk.green(`✅ Added ${targetFile} to .gitignore`));
    }
  }
  catch (error) {
    logger.warn('Could not update .gitignore', error);
  }
}

export default initCommand;
