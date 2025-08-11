import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileManager } from '../../../src/config/profiles.ts';

describe('profileManager Integration', () => {
  let profileManager: ProfileManager;
  let testDir: string;
  let configPath: string;

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
    // Create temporary test directory
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-test-'));
    configPath = path.join(testDir, '.confluence-sync.json');

    // Write mock config
    await fs.promises.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    profileManager = new ProfileManager(configPath);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('listProfiles', () => {
    it('should return all profile names', async () => {
      const profiles = await profileManager.listProfiles();
      expect(profiles).toEqual(['production', 'staging']);
    });
  });

  describe('getProfile', () => {
    it('should return specific profile configuration', async () => {
      const profile = await profileManager.getProfile('production');
      expect(profile.confluenceUrl).toBe('https://prod.atlassian.net');
      expect(profile.spaceKey).toBe('PROD');
    });

    it('should throw error for non-existent profile', async () => {
      await expect(profileManager.getProfile('nonexistent')).rejects.toThrow(
        'Profile \'nonexistent\' not found',
      );
    });
  });

  describe('createProfile', () => {
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

      await profileManager.createProfile('test', newProfile);

      const profiles = await profileManager.listProfiles();
      expect(profiles).toContain('test');

      const profile = await profileManager.getProfile('test');
      expect(profile.spaceKey).toBe('TEST');
    });

    it('should throw error if profile already exists', async () => {
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

      await expect(profileManager.createProfile('production', newProfile)).rejects.toThrow(
        'Profile \'production\' already exists',
      );
    });
  });

  describe('updateProfile', () => {
    it('should update existing profile', async () => {
      await profileManager.updateProfile('production', { spaceKey: 'UPDATED' });

      const profile = await profileManager.getProfile('production');
      expect(profile.spaceKey).toBe('UPDATED');
    });
  });

  describe('deleteProfile', () => {
    it('should delete existing profile', async () => {
      await profileManager.deleteProfile('staging');

      const profiles = await profileManager.listProfiles();
      expect(profiles).not.toContain('staging');
      expect(profiles).toContain('production');
    });
  });

  describe('active profile management', () => {
    it('should set and get active profile', async () => {
      await profileManager.setActiveProfile('staging');

      const activeProfile = await profileManager.getActiveProfile();
      expect(activeProfile).toBe('staging');
    });

    it('should switch profiles', async () => {
      const profile = await profileManager.switchProfile('staging');
      expect(profile.spaceKey).toBe('STAGE');

      const activeProfile = await profileManager.getActiveProfile();
      expect(activeProfile).toBe('staging');
    });

    it('should get default profile when no active profile', async () => {
      const activeProfile = await profileManager.getActiveProfile();
      expect(activeProfile).toBe('production');
    });
  });

  describe('default profile management', () => {
    it('should set default profile', async () => {
      await profileManager.setDefaultProfile('staging');

      const defaultProfile = await profileManager.getDefaultProfile();
      expect(defaultProfile).toBe('staging');
    });
  });
});
