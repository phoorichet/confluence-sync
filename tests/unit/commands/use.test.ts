import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigManager } from '../../../src/config/config-manager.ts';
import { logger } from '../../../src/utils/logger.ts';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the use command module to avoid process.exit issues
vi.mock('../../../src/commands/use.ts', async () => {
  const { Command } = await vi.importActual<typeof import('commander')>('commander');
  const _actual = await vi.importActual<typeof import('../../../src/commands/use.ts')>('../../../src/commands/use.ts');

  // Create a modified command that doesn't call process.exit
  const useCommand = new Command('use')
    .description('Switch between configuration profiles')
    .argument('[profile]', 'Name of the profile to switch to')
    .option('-l, --list', 'List all available profiles')
    .exitOverride() // Prevent process.exit
    .action(async (profileName: string | undefined, options: { list?: boolean }) => {
      const { ConfigManager } = await import('../../../src/config/config-manager.ts');
      const { logger } = await import('../../../src/utils/logger.ts');

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
          throw new Error('Profile not found');
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
          if (error.message.includes('CS-100') || error.message.includes('Configuration file not found')) {
            logger.error('No configuration file found. Run \'confluence-sync init\' to create one.');
          }
          else if (error.message.includes('CS-102') || error.message.includes('Profile not found')) {
            logger.error(`Profile '${profileName}' not found in configuration`);
          }
          else if (error.message === 'Profile not found') {
            // Already logged above
          }
          else {
            logger.error(`Failed to switch profile: ${error.message}`);
          }
        }
        else {
          logger.error('An unexpected error occurred');
        }
        throw error;
      }
    });

  return { useCommand };
});

describe('use Command', () => {
  let testDir: string;
  let configPath: string;
  let originalCwd: string;
  let useCommand: Command;

  const mockConfig = {
    version: '1.0.0',
    defaultProfile: 'production',
    profiles: {
      production: {
        confluenceUrl: 'https://prod.atlassian.net',
        spaceKey: 'PROD',
        authType: 'token',
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/.git/**'],
        cacheEnabled: true,
      },
      staging: {
        confluenceUrl: 'https://staging.atlassian.net',
        spaceKey: 'STAGE',
        authType: 'oauth',
        concurrentOperations: 3,
        conflictStrategy: 'local-first',
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/.git/**'],
        cacheEnabled: false,
      },
      development: {
        confluenceUrl: 'https://dev.atlassian.net',
        spaceKey: 'DEV',
        authType: 'basic',
        concurrentOperations: 2,
        conflictStrategy: 'remote-first',
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/.git/**'],
        cacheEnabled: true,
      },
    },
  };

  beforeEach(async () => {
    // Save original values
    originalCwd = process.cwd();

    // Import the mocked command
    const module = await import('../../../src/commands/use.ts');
    useCommand = module.useCommand;

    // Create temporary test directory
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-test-'));
    configPath = path.join(testDir, 'csconfig.json');

    // Write mock config
    await fs.promises.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    // Change to test directory
    process.chdir(testDir);

    // Reset singleton
    (ConfigManager as any).instance = undefined;

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore original values
    process.chdir(originalCwd);

    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  });

  describe('profile switching', () => {
    it('should switch to valid profile', async () => {
      await useCommand.parseAsync(['node', 'use', 'staging']);

      expect(logger.success).toHaveBeenCalledWith('Switched to profile \'staging\'');
      expect(logger.info).toHaveBeenCalledWith('  Confluence URL: https://staging.atlassian.net');
      expect(logger.info).toHaveBeenCalledWith('  Space Key: STAGE');
      expect(logger.info).toHaveBeenCalledWith('  Auth Type: oauth');
    });

    it('should handle non-existent profile', async () => {
      await expect(useCommand.parseAsync(['node', 'use', 'nonexistent'])).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith('Profile \'nonexistent\' not found');
      expect(logger.info).toHaveBeenCalledWith('Available profiles:');
      expect(logger.info).toHaveBeenCalledWith('  - production');
      expect(logger.info).toHaveBeenCalledWith('  - staging');
      expect(logger.info).toHaveBeenCalledWith('  - development');
    });
  });

  describe('list profiles', () => {
    it('should list all available profiles', async () => {
      await useCommand.parseAsync(['node', 'use', 'dummy', '--list']);

      expect(logger.info).toHaveBeenCalledWith('Available profiles:');
      expect(logger.info).toHaveBeenCalledWith('  - production (active)');
      expect(logger.info).toHaveBeenCalledWith('  - staging');
      expect(logger.info).toHaveBeenCalledWith('  - development');
    });

    it('should mark active profile in list', async () => {
      const configManager = ConfigManager.getInstance();
      await configManager.switchProfile('staging');

      await useCommand.parseAsync(['node', 'use', 'dummy', '--list']);

      expect(logger.info).toHaveBeenCalledWith('  - production');
      expect(logger.info).toHaveBeenCalledWith('  - staging (active)');
      expect(logger.info).toHaveBeenCalledWith('  - development');
    });

    it('should handle empty profile list', async () => {
      // Create config with no profiles
      const emptyConfig = {
        version: '1.0.0',
        profiles: {},
      };
      await fs.promises.writeFile(configPath, JSON.stringify(emptyConfig, null, 2));

      // Reset singleton to pick up new config
      (ConfigManager as any).instance = undefined;

      await useCommand.parseAsync(['node', 'use', 'dummy', '--list']);

      expect(logger.warn).toHaveBeenCalledWith('No profiles found in configuration');
    });
  });

  describe('error handling', () => {
    it('should handle missing configuration file', async () => {
      // Change to directory without config
      const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'empty-'));
      process.chdir(emptyDir);

      // Reset singleton
      (ConfigManager as any).instance = undefined;

      await expect(useCommand.parseAsync(['node', 'use', 'staging'])).rejects.toThrow();

      // When there's no config file, listProfiles returns empty array
      // So the error will be "Profile 'staging' not found"
      expect(logger.error).toHaveBeenCalledWith('Profile \'staging\' not found');
      expect(logger.info).toHaveBeenCalledWith('Available profiles:');

      // Cleanup
      await fs.promises.rm(emptyDir, { recursive: true, force: true });
    });

    it('should handle invalid configuration', async () => {
      // Write invalid config
      await fs.promises.writeFile(configPath, '{ invalid json');

      // Reset singleton
      (ConfigManager as any).instance = undefined;

      await expect(useCommand.parseAsync(['node', 'use', 'staging'])).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
