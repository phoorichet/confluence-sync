import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { AuthManager, type Credentials } from '../auth/auth-manager';
import { promptManager } from '../utils/prompts';

const authManager = AuthManager.getInstance();

export const authCommand = new Command('auth')
  .description('Authenticate with your Confluence instance')
  .option('-u, --url <url>', 'Confluence instance URL')
  .option('-e, --email <email>', 'Your email or username')
  .option('-t, --token <token>', 'API token or Personal Access Token')
  .action(async (options) => {
    const spinner = ora('Authenticating with Confluence...').start();
    let url = options.url;
    let username = options.email;
    let apiToken = options.token;
    let authType: 'cloud' | 'server' = 'cloud';

    try {
      if (!url) {
        spinner.stop();
        url = await promptManager.text('Enter your Confluence URL:', {
          validate: (input: string) => {
            try {
              const url = new URL(input);
              // Validate it's HTTPS for security
              if (url.protocol !== 'https:') {
                return 'Please use HTTPS for secure connection';
              }
              // Validate it looks like a Confluence URL
              if (!url.hostname || url.hostname === 'localhost') {
                return 'Please enter a valid Confluence URL';
              }
              return true;
            }
            catch {
              return 'Please enter a valid URL (e.g., https://your-domain.atlassian.net)';
            }
          },
        });
        spinner.start();
      }

      // Improved detection of instance type
      const urlObj = new URL(url);
      authType = urlObj.hostname.includes('.atlassian.net') ? 'cloud' : 'server';

      // Ensure URL has correct format for API calls
      if (authType === 'cloud' && !url.includes('/wiki/api/v2')) {
        url = `${url.replace(/\/$/, '')}/wiki/api/v2`;
      }

      if (!username) {
        spinner.stop();
        username = await promptManager.text(
          authType === 'cloud' ? 'Enter your email:' : 'Enter your username:',
          {
            validate: (input: string) => input.length > 0 || 'This field is required',
          },
        );
        spinner.start();
      }

      if (!apiToken) {
        spinner.stop();
        apiToken = await promptManager.password(
          authType === 'cloud' ? 'Enter your API token:' : 'Enter your Personal Access Token:',
        );
        spinner.start();
      }

      const credentials: Credentials = {
        url,
        username,
        apiToken,
        authType,
      };

      await authManager.authenticate(credentials);

      const userInfo = await authManager.getCurrentUser();

      spinner.succeed(chalk.green('Authentication successful!'));

      if (userInfo) {
        console.log(chalk.cyan('\nAuthenticated as:'));
        console.log(`  Display Name: ${userInfo.displayName}`);
        if (userInfo.email) {
          console.log(`  Email: ${userInfo.email}`);
        }
        console.log(`  Instance: ${url}`);
        console.log(`  Type: ${authType === 'cloud' ? 'Atlassian Cloud' : 'Server/Data Center'}`);
      }
    }
    catch (error) {
      spinner.fail(chalk.red('Authentication failed'));

      if (error instanceof Error) {
        if (error.message.includes('CS-401')) {
          console.error(chalk.red('\n❌ Invalid credentials'));
          console.error(chalk.gray('Please check your username/email and API token.'));
          if (authType === 'cloud') {
            console.error(chalk.gray('For Atlassian Cloud, use your email address and API token from:'));
            console.error(chalk.blue('https://id.atlassian.com/manage-profile/security/api-tokens'));
          }
          else {
            console.error(chalk.gray('For Server/Data Center, use your username and Personal Access Token.'));
          }
        }
        else if (error.message.includes('CS-403')) {
          console.error(chalk.red('\n❌ Access denied'));
          console.error(chalk.gray('Unable to access system keychain. Please check permissions.'));
        }
        else if (error.message.includes('CS-404')) {
          console.error(chalk.red('\n❌ Confluence instance not found'));
          console.error(chalk.gray(`Could not connect to: ${url}`));
          console.error(chalk.gray('Please verify the URL is correct and accessible.'));
        }
        else if (error.message.includes('CS-500')) {
          console.error(chalk.red('\n❌ Connection error'));
          if (error.message.includes('timeout')) {
            console.error(chalk.gray('The request timed out. The server may be slow or unreachable.'));
          }
          else {
            console.error(chalk.gray('Please check your internet connection and try again.'));
          }
        }
        else {
          console.error(chalk.red(`\n❌ Unexpected error: ${error.message}`));
        }
      }

      process.exit(1);
    }
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    const spinner = ora('Checking authentication status...').start();

    try {
      const credentials = await authManager.getStoredCredentials();

      if (!credentials || !credentials.url) {
        spinner.warn(chalk.yellow('Not authenticated'));
        console.log('\nRun "confluence-sync auth" to authenticate.');
        return;
      }

      const isValid = await authManager.validateAuth();

      if (isValid) {
        const userInfo = await authManager.getCurrentUser();
        spinner.succeed(chalk.green('Authenticated'));

        console.log(chalk.cyan('\nAuthentication Details:'));
        console.log(`  Instance: ${credentials.url}`);
        console.log(`  Username: ${credentials.username}`);
        console.log(`  Type: ${credentials.authType === 'cloud' ? 'Atlassian Cloud' : 'Server/Data Center'}`);

        if (userInfo) {
          console.log(`  Display Name: ${userInfo.displayName}`);
          if (userInfo.email) {
            console.log(`  Email: ${userInfo.email}`);
          }
        }
      }
      else {
        spinner.warn(chalk.yellow('Authentication expired or invalid'));
        console.log('\nStored credentials are no longer valid.');
        console.log('Run "confluence-sync auth" to re-authenticate.');
      }
    }
    catch (error) {
      spinner.fail(chalk.red('Failed to check authentication status'));

      if (error instanceof Error) {
        console.error(chalk.red(`\nError: ${error.message}`));
      }

      process.exit(1);
    }
  });

authCommand
  .command('clear')
  .description('Remove stored credentials')
  .action(async () => {
    const spinner = ora('Clearing stored credentials...').start();

    try {
      const credentials = await authManager.getStoredCredentials();

      if (!credentials) {
        spinner.info(chalk.blue('No stored credentials found'));
        return;
      }

      spinner.stop();

      const confirm = await promptManager.confirm(`Remove credentials for ${credentials.url}?`, false);

      if (confirm) {
        spinner.start('Removing credentials...');
        await authManager.clearCredentials();
        spinner.succeed(chalk.green('Credentials removed successfully'));
      }
      else {
        console.log(chalk.gray('Operation cancelled'));
      }
    }
    catch (error) {
      spinner.fail(chalk.red('Failed to clear credentials'));

      if (error instanceof Error) {
        console.error(chalk.red(`\nError: ${error.message}`));
      }

      process.exit(1);
    }
  });

export default authCommand;
