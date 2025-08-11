import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigManager } from '../../../src/config/config-manager.ts';

describe('config Command Integration', () => {
  let testDir: string;
  let configPath: string;
  let originalCwd: string;

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

    // Create temporary test directory
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-test-'));
    configPath = path.join(testDir, '.confluence-sync.json');

    // Write mock config
    await fs.promises.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    // Change to test directory
    process.chdir(testDir);

    // Reset singleton
    (ConfigManager as any).instance = undefined;
  });

  afterEach(async () => {
    // Restore original values
    process.chdir(originalCwd);

    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('config get', () => {
    it('should get specific configuration value', async () => {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.loadConfig();

      expect(config.confluenceUrl).toBe('https://prod.atlassian.net');
      expect(config.spaceKey).toBe('PROD');
      expect(config.concurrentOperations).toBe(5);
    });

    it('should get configuration for specific profile', async () => {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.loadConfig('staging');

      expect(config.confluenceUrl).toBe('https://staging.atlassian.net');
      expect(config.spaceKey).toBe('STAGE');
      expect(config.authType).toBe('oauth');
    });
  });

  describe('config set', () => {
    it('should update configuration value', async () => {
      const configManager = ConfigManager.getInstance();

      await configManager.saveConfig({
        profile: 'production',
        spaceKey: 'UPDATED',
        concurrentOperations: 8,
      });

      const config = await configManager.loadConfig('production');
      expect(config.spaceKey).toBe('UPDATED');
      expect(config.concurrentOperations).toBe(8);
    });

    it('should update arrays and objects', async () => {
      const configManager = ConfigManager.getInstance();

      await configManager.saveConfig({
        profile: 'production',
        includePatterns: ['**/*.md', '**/*.txt'],
        formatOptions: {
          preserveTables: true,
          preserveCodeBlocks: false,
        },
      });

      const config = await configManager.loadConfig('production');
      expect(config.includePatterns).toEqual(['**/*.md', '**/*.txt']);
      expect(config.formatOptions).toMatchObject({
        preserveTables: true,
        preserveCodeBlocks: false,
      });
    });
  });

  describe('config view', () => {
    it('should display all configuration settings', async () => {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.loadConfig();

      // Verify all expected fields are present
      expect(config).toHaveProperty('confluenceUrl');
      expect(config).toHaveProperty('spaceKey');
      expect(config).toHaveProperty('authType');
      expect(config).toHaveProperty('concurrentOperations');
      expect(config).toHaveProperty('conflictStrategy');
      expect(config).toHaveProperty('includePatterns');
      expect(config).toHaveProperty('excludePatterns');
      expect(config).toHaveProperty('cacheEnabled');
      expect(config).toHaveProperty('logLevel');
      expect(config).toHaveProperty('retryAttempts');
      expect(config).toHaveProperty('retryDelay');
    });
  });

  describe('profile management', () => {
    it('should create new profile', async () => {
      const configManager = ConfigManager.getInstance();

      await configManager.createProfile('test', {
        confluenceUrl: 'https://test.atlassian.net',
        spaceKey: 'TEST',
        authType: 'basic',
        concurrentOperations: 2,
        conflictStrategy: 'remote-first',
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/.git/**'],
        cacheEnabled: true,
      });

      const profiles = await configManager.listProfiles();
      expect(profiles).toContain('test');

      const config = await configManager.loadConfig('test');
      expect(config.spaceKey).toBe('TEST');
      expect(config.authType).toBe('basic');
    });

    it('should delete profile', async () => {
      const configManager = ConfigManager.getInstance();

      await configManager.deleteProfile('staging');

      const profiles = await configManager.listProfiles();
      expect(profiles).not.toContain('staging');
      expect(profiles).toContain('production');
    });

    it('should list all profiles with details', async () => {
      const configManager = ConfigManager.getInstance();
      const profiles = await configManager.listProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles).toContain('production');
      expect(profiles).toContain('staging');

      // Verify we can load each profile
      for (const profile of profiles) {
        const config = await configManager.loadConfig(profile);
        expect(config.profile).toBe(profile);
        expect(config.confluenceUrl).toBeTruthy();
        expect(config.spaceKey).toBeTruthy();
      }
    });

    it('should handle non-existent profile deletion', async () => {
      const configManager = ConfigManager.getInstance();

      await expect(configManager.deleteProfile('nonexistent')).rejects.toThrow(
        'Profile \'nonexistent\' not found',
      );
    });
  });
});
