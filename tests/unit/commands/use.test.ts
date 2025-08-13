import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommand } from '../../../src/commands/use.ts';
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

describe('use Command', () => {
  let testDir: string;
  let configPath: string;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

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
    originalExit = process.exit;
    exitCode = undefined;

    // Mock process.exit
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`Process exit with code ${code}`);
    }) as any;

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
    process.exit = originalExit;

    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('profile switching', () => {
    it('should switch to valid profile', async () => {
      const command = useCommand;

      await command.parseAsync(['node', 'use', 'staging']);

      expect(logger.success)).toHaveBeenCalledWith('Switched to profile \'staging\'');
      expect(logger.info)).toHaveBeenCalledWith('  Confluence URL: https://staging.atlassian.net');
      expect(logger.info)).toHaveBeenCalledWith('  Space Key: STAGE');
      expect(logger.info)).toHaveBeenCalledWith('  Auth Type: oauth');
    });

    it('should handle non-existent profile', async () => {
      const command = useCommand;

      try {
        await command.parseAsync(['node', 'use', 'nonexistent']);
      }
      catch (error) {
        // Expected to throw due to process.exit mock
      }

      expect(logger.error)).toHaveBeenCalledWith('Profile \'nonexistent\' not found');
      expect(logger.info)).toHaveBeenCalledWith('Available profiles:');
      expect(logger.info)).toHaveBeenCalledWith('  - production');
      expect(logger.info)).toHaveBeenCalledWith('  - staging');
      expect(logger.info)).toHaveBeenCalledWith('  - development');
      expect(exitCode).toBe(1);
    });
  });

  describe('list profiles', () => {
    it('should list all available profiles', async () => {
      const command = useCommand;

      await command.parseAsync(['node', 'use', 'dummy', '--list']);

      expect(logger.info)).toHaveBeenCalledWith('Available profiles:');
      expect(logger.info)).toHaveBeenCalledWith('  - production (active)');
      expect(logger.info)).toHaveBeenCalledWith('  - staging');
      expect(logger.info)).toHaveBeenCalledWith('  - development');
    });

    it('should mark active profile in list', async () => {
      const configManager = ConfigManager.getInstance();
      await configManager.switchProfile('staging');

      const command = useCommand;
      await command.parseAsync(['node', 'use', 'dummy', '--list']);

      expect(logger.info)).toHaveBeenCalledWith('  - production');
      expect(logger.info)).toHaveBeenCalledWith('  - staging (active)');
      expect(logger.info)).toHaveBeenCalledWith('  - development');
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

      const command = useCommand;
      await command.parseAsync(['node', 'use', 'dummy', '--list']);

      expect(logger.warn)).toHaveBeenCalledWith('No profiles found in configuration');
    });
  });

  describe('error handling', () => {
    it('should handle missing configuration file', async () => {
      // Change to directory without config
      const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'empty-'));
      process.chdir(emptyDir);

      // Reset singleton
      (ConfigManager as any).instance = undefined;

      const command = useCommand;

      try {
        await command.parseAsync(['node', 'use', 'staging']);
      }
      catch (error) {
        // Expected to throw due to process.exit mock
      }

      expect(logger.error)).toHaveBeenCalledWith(
        'No configuration file found. Run \'confluence-sync init\' to create one.',
      );
      expect(exitCode).toBe(1);

      // Cleanup
      await fs.promises.rm(emptyDir, { recursive: true, force: true });
    });

    it('should handle invalid configuration', async () => {
      // Write invalid config
      await fs.promises.writeFile(configPath, '{ invalid json');

      // Reset singleton
      (ConfigManager as any).instance = undefined;

      const command = useCommand;

      try {
        await command.parseAsync(['node', 'use', 'staging']);
      }
      catch (error) {
        // Expected to throw due to process.exit mock
      }

      expect(logger.error)).toHaveBeenCalled();
      expect(exitCode).toBe(1);
    });
  });
});
