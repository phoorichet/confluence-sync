import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigManager } from '../../../src/config/config-manager.ts';

describe('use Command Integration', () => {
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
  };

  beforeEach(async () => {
    // Save original values
    originalCwd = process.cwd();

    // Create temporary test directory
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-test-'));
    configPath = path.join(testDir, 'csconfig.json');

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

  describe('profile switching', () => {
    it('should switch to valid profile', async () => {
      const configManager = ConfigManager.getInstance();
      const initialProfile = await configManager.getActiveProfileName();
      expect(initialProfile).toBe('production'); // default

      // Switch profile using config manager directly (simulating command)
      await configManager.switchProfile('staging');

      const newProfile = await configManager.getActiveProfileName();
      expect(newProfile).toBe('staging');

      // Verify configuration is loaded correctly
      const config = await configManager.getConfig();
      expect(config.spaceKey).toBe('STAGE');
      expect(config.authType).toBe('oauth');
    });

    it('should persist profile switch', async () => {
      const configManager = ConfigManager.getInstance();

      // Switch profile
      await configManager.switchProfile('staging');

      // Reset singleton to simulate new session
      (ConfigManager as any).instance = undefined;
      const newConfigManager = ConfigManager.getInstance();

      // Check if switch persisted
      const activeProfile = await newConfigManager.getActiveProfileName();
      expect(activeProfile).toBe('staging');
    });
  });

  describe('profile listing', () => {
    it('should list all available profiles', async () => {
      const configManager = ConfigManager.getInstance();
      const profiles = await configManager.listProfiles();

      expect(profiles).toEqual(['production', 'staging']);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent profile', async () => {
      const configManager = ConfigManager.getInstance();

      await expect(configManager.switchProfile('nonexistent')).rejects.toThrow(
        'Profile \'nonexistent\' not found',
      );
    });
  });
});
