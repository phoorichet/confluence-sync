import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigManager } from '../../../src/config/config-manager.ts';

describe('configManager Integration', () => {
  let configManager: ConfigManager;
  let testDir: string;
  let configPath: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

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
        includePatterns: ['**/*.md', '**/*.markdown'],
        excludePatterns: ['**/node_modules/**', '**/.git/**'],
        cacheEnabled: false,
      },
    },
    shared: {
      logLevel: 'info',
      retryAttempts: 3,
      retryDelay: 1000,
    },
  };

  beforeEach(async () => {
    // Save original values
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Create temporary test directory
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-test-'));
    configPath = path.join(testDir, 'csconfig.json');

    // Write mock config
    await fs.promises.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    // Change to test directory
    process.chdir(testDir);

    // Get singleton instance
    configManager = ConfigManager.getInstance();
  });

  afterEach(async () => {
    // Restore original values
    process.chdir(originalCwd);
    process.env = originalEnv;

    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    catch {
      // Ignore cleanup errors
    }

    // Reset singleton
    (ConfigManager as any).instance = undefined;
  });

  describe('loadConfig', () => {
    it('should load configuration with default profile', async () => {
      const config = await configManager.loadConfig();

      expect(config.profile).toBe('production');
      expect(config.confluenceUrl).toBe('https://prod.atlassian.net');
      expect(config.spaceKey).toBe('PROD');
      expect(config.logLevel).toBe('info');
      expect(config.retryAttempts).toBe(3);
    });

    it('should load configuration with specified profile', async () => {
      const config = await configManager.loadConfig('staging');

      expect(config.profile).toBe('staging');
      expect(config.confluenceUrl).toBe('https://staging.atlassian.net');
      expect(config.spaceKey).toBe('STAGE');
      expect(config.authType).toBe('oauth');
      expect(config.concurrentOperations).toBe(3);
    });

    it('should apply environment variable overrides', async () => {
      process.env.CONFLUENCE_SYNC_URL = 'https://env.atlassian.net';
      process.env.CONFLUENCE_SYNC_SPACE = 'ENV';
      process.env.CONFLUENCE_SYNC_CONCURRENT_OPS = '7';

      const config = await configManager.loadConfig();

      expect(config.confluenceUrl).toBe('https://env.atlassian.net');
      expect(config.spaceKey).toBe('ENV');
      expect(config.concurrentOperations).toBe(7);
    });

    it('should use environment variable for profile selection', async () => {
      process.env.CONFLUENCE_SYNC_PROFILE = 'staging';

      const config = await configManager.loadConfig();

      expect(config.profile).toBe('staging');
      expect(config.spaceKey).toBe('STAGE');
    });

    it('should merge shared and profile configurations', async () => {
      const config = await configManager.loadConfig('staging');

      // From profile
      expect(config.conflictStrategy).toBe('local-first');
      expect(config.includePatterns).toEqual(['**/*.md', '**/*.markdown']);

      // From shared
      expect(config.logLevel).toBe('info');
      expect(config.retryAttempts).toBe(3);
      expect(config.retryDelay).toBe(1000);
    });

    it('should throw error when no config file found', async () => {
      // Change to a directory without config
      const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'empty-'));
      process.chdir(emptyDir);

      // Reset singleton to force new instance
      (ConfigManager as any).instance = undefined;
      const newConfigManager = ConfigManager.getInstance();

      await expect(newConfigManager.loadConfig()).rejects.toThrow(
        'No configuration file found',
      );

      // Cleanup
      await fs.promises.rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('saveConfig', () => {
    it('should save configuration changes', async () => {
      await configManager.loadConfig('production');

      await configManager.saveConfig({
        profile: 'production',
        spaceKey: 'UPDATED',
        concurrentOperations: 8,
      });

      // Reload and verify
      const config = await configManager.loadConfig('production');
      expect(config.spaceKey).toBe('UPDATED');
      expect(config.concurrentOperations).toBe(8);
    });

    it('should throw error when profile not specified', async () => {
      await expect(configManager.saveConfig({ spaceKey: 'TEST' })).rejects.toThrow(
        'Profile name is required',
      );
    });
  });

  describe('switchProfile', () => {
    it('should switch to different profile', async () => {
      await configManager.loadConfig('production');
      await configManager.switchProfile('staging');

      const config = await configManager.getConfig();
      expect(config.profile).toBe('staging');
      expect(config.spaceKey).toBe('STAGE');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        profile: 'test',
        confluenceUrl: 'https://test.atlassian.net',
        spaceKey: 'TEST',
        authType: 'token',
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**'],
        formatOptions: {},
        cacheEnabled: true,
        logLevel: 'info',
        retryAttempts: 3,
        retryDelay: 1000,
      };

      const result = configManager.validateConfig(validConfig);
      expect(result.profile).toBe('test');
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig = {
        profile: 'test',
        confluenceUrl: 'not-a-url',
        spaceKey: 'TEST',
      };

      expect(() => configManager.validateConfig(invalidConfig)).toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return cached configuration', async () => {
      const config1 = await configManager.getConfig();
      const config2 = await configManager.getConfig();

      expect(config1).toBe(config2); // Same object reference
    });

    it('should reload when profile specified', async () => {
      const config1 = await configManager.getConfig();
      const config2 = await configManager.getConfig('staging');

      expect(config1.profile).toBe('production');
      expect(config2.profile).toBe('staging');
    });
  });

  describe('profile management', () => {
    it('should list all profiles', async () => {
      const profiles = await configManager.listProfiles();
      expect(profiles).toEqual(['production', 'staging']);
    });

    it('should create new profile', async () => {
      const newProfile = {
        confluenceUrl: 'https://test.atlassian.net',
        spaceKey: 'TEST',
        authType: 'token' as const,
        concurrentOperations: 5,
        conflictStrategy: 'manual' as const,
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/.git/**'],
        cacheEnabled: true,
      };

      await configManager.createProfile('test', newProfile);

      const profiles = await configManager.listProfiles();
      expect(profiles).toContain('test');
    });

    it('should delete profile', async () => {
      await configManager.deleteProfile('staging');

      const profiles = await configManager.listProfiles();
      expect(profiles).not.toContain('staging');
      expect(profiles).toContain('production');
    });

    it('should get active profile name', async () => {
      await configManager.switchProfile('staging');

      const activeProfile = await configManager.getActiveProfileName();
      expect(activeProfile).toBe('staging');
    });
  });
});
