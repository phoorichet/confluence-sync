import process from 'node:process';
import { Command } from 'commander';
import { ConfigManager } from '../config/config-manager.ts';
import { CONFIG_ERROR_CODES, type ProfileConfig } from '../config/schemas.ts';
import { logger } from '../utils/logger.ts';

export const configCommand = new Command('config')
  .description('Manage configuration settings')
  .option('-p, --profile <name>', 'Specify profile for the operation');

  // Subcommand: config get
configCommand
    .command('get')
    .description('Get a configuration value')
    .argument('[key]', 'Configuration key (e.g., confluenceUrl, spaceKey)')
    .action(async (key: string | undefined, _options: any) => {
      try {
        const parentOptions = configCommand.opts();
        const profileName = parentOptions.profile;

        const configManager = ConfigManager.getInstance();
        const config = await configManager.loadConfig(profileName);

        if (!key) {
          // Display all configuration
          logger.info(`Configuration for profile '${config.profile}':`);
          logger.info(JSON.stringify(config, null, 2));
        }
        else {
          // Get specific key
          const value = (config as any)[key];
          if (value !== undefined) {
            if (typeof value === 'object') {
              logger.info(JSON.stringify(value, null, 2));
            }
            else {
              logger.info(String(value));
            }
          }
          else {
            logger.error(`Configuration key '${key}' not found`);
            process.exit(1);
          }
        }
      }
      catch (error) {
        handleConfigError(error);
      }
    });

// Subcommand: config set
configCommand
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (e.g., confluenceUrl, spaceKey)')
    .argument('<value>', 'Value to set')
    .action(async (key: string, value: string, _options: any) => {
      try {
        const parentOptions = configCommand.opts();
        const profileName = parentOptions.profile;

        const configManager = ConfigManager.getInstance();
        const config = await configManager.loadConfig(profileName);

        // Parse value if it looks like JSON
        let parsedValue: any = value;
        if (value.startsWith('[') || value.startsWith('{')) {
          try {
            parsedValue = JSON.parse(value);
          }
          catch {
            // Keep as string if JSON parse fails
          }
        }
        else if (value === 'true') {
          parsedValue = true;
        }
        else if (value === 'false') {
          parsedValue = false;
        }
        else if (!Number.isNaN(Number(value))) {
          parsedValue = Number(value);
        }

        // Validate key is a valid configuration property
        const validKeys = [
          'confluenceUrl',
          'spaceKey',
          'authType',
          'concurrentOperations',
          'conflictStrategy',
          'includePatterns',
          'excludePatterns',
          'cacheEnabled',
          'username',
        ];

        if (!validKeys.includes(key)) {
          logger.error(`Invalid configuration key: ${key}`);
          logger.info('Valid keys are:');
          validKeys.forEach(k => logger.info(`  - ${k}`));
          process.exit(1);
        }

        // Update configuration
        const updates = { [key]: parsedValue };
        await configManager.saveConfig({
          profile: config.profile,
          ...updates,
        });

        logger.success(`Configuration updated: ${key} = ${JSON.stringify(parsedValue)}`);
      }
      catch (error) {
        handleConfigError(error);
      }
    });

// Subcommand: config view
configCommand
    .command('view')
    .description('View all configuration settings')
    .action(async (_options: any) => {
      try {
        const parentOptions = configCommand.opts();
        const profileName = parentOptions.profile;

        const configManager = ConfigManager.getInstance();
        const config = await configManager.loadConfig(profileName);

        logger.info(`Configuration for profile '${config.profile}':`);
        logger.info('');
        logger.info('Connection Settings:');
        logger.info(`  Confluence URL: ${config.confluenceUrl}`);
        logger.info(`  Space Key: ${config.spaceKey}`);
        logger.info(`  Auth Type: ${config.authType}`);
        if (config.username) {
          logger.info(`  Username: ${config.username}`);
        }
        logger.info('');
        logger.info('Sync Settings:');
        logger.info(`  Concurrent Operations: ${config.concurrentOperations}`);
        logger.info(`  Conflict Strategy: ${config.conflictStrategy}`);
        logger.info(`  Cache Enabled: ${config.cacheEnabled}`);
        logger.info('');
        logger.info('File Patterns:');
        logger.info(`  Include: ${config.includePatterns.join(', ')}`);
        logger.info(`  Exclude: ${config.excludePatterns.join(', ')}`);
        logger.info('');
        logger.info('Advanced Settings:');
        logger.info(`  Log Level: ${config.logLevel}`);
        logger.info(`  Retry Attempts: ${config.retryAttempts}`);
        logger.info(`  Retry Delay: ${config.retryDelay}ms`);

        if (config.formatOptions && Object.keys(config.formatOptions).length > 0) {
          logger.info('');
          logger.info('Format Options:');
          Object.entries(config.formatOptions).forEach(([key, value]) => {
            logger.info(`  ${key}: ${value}`);
          });
        }
      }
      catch (error) {
        handleConfigError(error);
      }
    });

// Subcommand: config create-profile
configCommand
    .command('create-profile')
    .description('Create a new configuration profile')
    .argument('<name>', 'Profile name')
    .requiredOption('--url <url>', 'Confluence URL')
    .requiredOption('--space <key>', 'Space key')
    .option('--auth-type <type>', 'Authentication type (token, oauth, basic)', 'token')
    .option('--concurrent <number>', 'Concurrent operations', '5')
    .option('--conflict-strategy <strategy>', 'Conflict strategy (manual, local-first, remote-first)', 'manual')
    .action(async (name: string, options: any) => {
      try {
        const configManager = ConfigManager.getInstance();

        const newProfile: ProfileConfig = {
          confluenceUrl: options.url,
          spaceKey: options.space,
          authType: options.authType,
          concurrentOperations: Number.parseInt(options.concurrent, 10),
          conflictStrategy: options.conflictStrategy,
          includePatterns: ['**/*.md'],
          excludePatterns: ['**/node_modules/**', '**/.git/**'],
          cacheEnabled: true,
        };

        await configManager.createProfile(name, newProfile);
        logger.success(`Profile '${name}' created successfully`);
        logger.info(`Use 'confluence-sync use ${name}' to switch to this profile`);
      }
      catch (error) {
        handleConfigError(error);
      }
    });

// Subcommand: config delete-profile
configCommand
    .command('delete-profile')
    .description('Delete a configuration profile')
    .argument('<name>', 'Profile name')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name: string, options: { force?: boolean }) => {
      try {
        const configManager = ConfigManager.getInstance();

        // Check if profile exists
        const profiles = await configManager.listProfiles();
        if (!profiles.includes(name)) {
          logger.error(`Profile '${name}' not found`);
          process.exit(1);
        }

        // Confirmation prompt (simplified for now)
        if (!options.force) {
          logger.warn(`This will permanently delete profile '${name}'`);
          logger.info('Use --force flag to skip this confirmation');
          process.exit(1);
        }

        await configManager.deleteProfile(name);
        logger.success(`Profile '${name}' deleted successfully`);
      }
      catch (error) {
        handleConfigError(error);
      }
    });

// Subcommand: config list-profiles
configCommand
    .command('list-profiles')
    .description('List all configuration profiles')
    .action(async () => {
      try {
        const configManager = ConfigManager.getInstance();
        const profiles = await configManager.listProfiles();

        if (profiles.length === 0) {
          logger.warn('No profiles found in configuration');
          return;
        }

        const activeProfile = await configManager.getActiveProfileName();

        logger.info('Available profiles:');
        for (const profile of profiles) {
          const marker = profile === activeProfile ? ' (active)' : '';

          // Load profile to show details
          const config = await configManager.loadConfig(profile);
          logger.info(`  ${profile}${marker}`);
          logger.info(`    URL: ${config.confluenceUrl}`);
          logger.info(`    Space: ${config.spaceKey}`);
        }
      }
      catch (error) {
        handleConfigError(error);
      }
    });

function handleConfigError(error: unknown): void {
  if (error instanceof Error) {
    if (error.message.includes(CONFIG_ERROR_CODES.FILE_NOT_FOUND)) {
      logger.error('No configuration file found. Run \'confluence-sync init\' to create one.');
    }
    else if (error.message.includes(CONFIG_ERROR_CODES.PROFILE_NOT_FOUND)) {
      logger.error(error.message);
    }
    else if (error.message.includes(CONFIG_ERROR_CODES.VALIDATION_ERROR)) {
      logger.error('Configuration validation failed:');
      logger.error(error.message);
    }
    else {
      logger.error(`Configuration error: ${error.message}`);
    }
  }
  else {
    logger.error('An unexpected error occurred');
  }
  process.exit(1);
}
