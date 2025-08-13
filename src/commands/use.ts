import { exit } from 'node:process';
import { Command } from 'commander';
import { ConfigManager } from '../config/config-manager.ts';
import { CONFIG_ERROR_CODES } from '../config/schemas.ts';
import { logger } from '../utils/logger.ts';

export const useCommand = new Command('use')
  .description('Switch between configuration profiles')
  .argument('[profile]', 'Name of the profile to switch to')
  .option('-l, --list', 'List all available profiles')
  .action(async (profileName: string | undefined, options: { list?: boolean }) => {
    try {
      const configManager = ConfigManager.getInstance();

      // Handle list option
      if (options.list || !profileName) {
        const profiles = await configManager.listProfiles();

        if (profiles.length === 0) {
          logger.warn('No profiles found in configuration');
          return;
        }

        const activeProfile = await configManager.getActiveProfileName();

        logger.info('Available profiles:');
        profiles.forEach((profile) => {
          const marker = profile === activeProfile ? ' (active)' : '';
          logger.info(`  - ${profile}${marker}`);
        });
        return;
      }

      // Validate that the profile exists
      const profiles = await configManager.listProfiles();
      if (!profiles.includes(profileName)) {
        logger.error(`Profile '${profileName}' not found`);
        logger.info('Available profiles:');
        profiles.forEach((profile) => {
          logger.info(`  - ${profile}`);
        });
        exit(1);
      }

      // Switch to the requested profile
      await configManager.switchProfile(profileName);

      // Load the configuration to validate it
      const config = await configManager.loadConfig(profileName);

      logger.success(`Switched to profile '${profileName}'`);
      logger.info(`  Confluence URL: ${config.confluenceUrl}`);
      logger.info(`  Space Key: ${config.spaceKey}`);
      logger.info(`  Auth Type: ${config.authType}`);
    }
    catch (error) {
      if (error instanceof Error) {
        // Check for specific error codes
        if (error.message.includes(CONFIG_ERROR_CODES.FILE_NOT_FOUND)) {
          logger.error('No configuration file found. Run \'confluence-sync init\' to create one.');
        }
        else if (error.message.includes(CONFIG_ERROR_CODES.PROFILE_NOT_FOUND)) {
          logger.error(`Profile '${profileName}' not found in configuration`);
        }
        else {
          logger.error(`Failed to switch profile: ${error.message}`);
        }
      }
      else {
        logger.error('An unexpected error occurred');
      }
      exit(1);
    }
  });
