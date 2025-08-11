import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_ERROR_CODES } from '../../../src/config/schemas.ts';

// Import ProfileManager after mocks
import { ProfileManager } from '../../../src/config/profiles.ts';

// Mock fs module
vi.mock('node:fs');

// Mock logger
vi.mock('../../../src/utils/logger.ts', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('profileManager', () => {
  let profileManager: ProfileManager;
  const mockConfigPath = '/test/path/.confluence-sync.json';
  const mockProfilePath = '/test/path/.confluence-sync-profile';

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

  beforeEach(() => {
    vi.clearAllMocks();
    profileManager = new ProfileManager(mockConfigPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listProfiles', () => {
    it('should return all profile names', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const profiles = await profileManager.listProfiles();
      expect(profiles).toEqual(['production', 'staging']);
    });

    it('should handle file not found error', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.promises.readFile).mockRejectedValue(error);

      await expect(profileManager.listProfiles()).rejects.toThrow(`[${CONFIG_ERROR_CODES.FILE_NOT_FOUND}]`);
    });

    it('should handle JSON parse error', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('invalid json');

      await expect(profileManager.listProfiles()).rejects.toThrow(`[${CONFIG_ERROR_CODES.PARSE_ERROR}]`);
    });

    it('should handle validation error', async () => {
      const invalidConfig = { ...mockConfig, version: 'invalid' };
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(profileManager.listProfiles()).rejects.toThrow(`[${CONFIG_ERROR_CODES.VALIDATION_ERROR}]`);
    });
  });

  describe('getProfile', () => {
    it('should return specific profile configuration', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const profile = await profileManager.getProfile('production');
      expect(profile).toEqual(mockConfig.profiles.production);
    });

    it('should throw error for non-existent profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      await expect(profileManager.getProfile('nonexistent')).rejects.toThrow(
        `[${CONFIG_ERROR_CODES.PROFILE_NOT_FOUND}]`,
      );
    });
  });

  describe('createProfile', () => {
    it('should create new profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

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

      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"test":'),
        'utf-8',
      );
    });

    it('should throw error if profile already exists', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

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
        `[${CONFIG_ERROR_CODES.INVALID_PROFILE}]`,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update existing profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      const updates = {
        spaceKey: 'UPDATED',
        concurrentOperations: 10,
      };

      await profileManager.updateProfile('production', updates);

      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"UPDATED"'),
        'utf-8',
      );
    });

    it('should throw error for non-existent profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      await expect(profileManager.updateProfile('nonexistent', { spaceKey: 'TEST' })).rejects.toThrow(
        `[${CONFIG_ERROR_CODES.PROFILE_NOT_FOUND}]`,
      );
    });
  });

  describe('deleteProfile', () => {
    it('should delete existing profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await profileManager.deleteProfile('staging');

      const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);
      expect(writtenConfig.profiles.staging).toBeUndefined();
      expect(writtenConfig.profiles.production).toBeDefined();
    });

    it('should clear default profile if deleted', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await profileManager.deleteProfile('production');

      const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);
      expect(writtenConfig.defaultProfile).toBeUndefined();
    });

    it('should clear active profile if deleted', async () => {
      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(mockConfig))
        .mockResolvedValueOnce('staging');
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);

      await profileManager.deleteProfile('staging');

      expect(vi.mocked(fs.promises.unlink)).toHaveBeenCalledWith(mockProfilePath);
    });

    it('should throw error for non-existent profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      await expect(profileManager.deleteProfile('nonexistent')).rejects.toThrow(
        `[${CONFIG_ERROR_CODES.PROFILE_NOT_FOUND}]`,
      );
    });
  });

  describe('getActiveProfile', () => {
    it('should return active profile from file', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce('staging\n');

      const activeProfile = await profileManager.getActiveProfile();
      expect(activeProfile).toBe('staging');
    });

    it('should return default profile if no active profile file', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.promises.readFile)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(JSON.stringify(mockConfig));

      const activeProfile = await profileManager.getActiveProfile();
      expect(activeProfile).toBe('production');
    });

    it('should return null if no active or default profile', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      const configWithoutDefault = { ...mockConfig, defaultProfile: undefined };
      vi.mocked(fs.promises.readFile)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(JSON.stringify(configWithoutDefault));

      const activeProfile = await profileManager.getActiveProfile();
      expect(activeProfile).toBeNull();
    });
  });

  describe('setActiveProfile', () => {
    it('should set active profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await profileManager.setActiveProfile('staging');

      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(
        mockProfilePath,
        'staging',
        'utf-8',
      );
    });

    it('should throw error for non-existent profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      await expect(profileManager.setActiveProfile('nonexistent')).rejects.toThrow(
        `[${CONFIG_ERROR_CODES.PROFILE_NOT_FOUND}]`,
      );
    });
  });

  describe('clearActiveProfile', () => {
    it('should delete active profile file', async () => {
      vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);

      await profileManager.clearActiveProfile();

      expect(vi.mocked(fs.promises.unlink)).toHaveBeenCalledWith(mockProfilePath);
    });

    it('should handle file not found gracefully', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.promises.unlink).mockRejectedValue(error);

      await expect(profileManager.clearActiveProfile()).resolves.not.toThrow();
    });
  });

  describe('switchProfile', () => {
    it('should switch to different profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      const profile = await profileManager.switchProfile('staging');

      expect(profile).toEqual(mockConfig.profiles.staging);
      expect(vi.mocked(fs.promises.writeFile)).toHaveBeenCalledWith(
        mockProfilePath,
        'staging',
        'utf-8',
      );
    });
  });

  describe('getDefaultProfile', () => {
    it('should return default profile name', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const defaultProfile = await profileManager.getDefaultProfile();
      expect(defaultProfile).toBe('production');
    });

    it('should return null if no default profile', async () => {
      const configWithoutDefault = { ...mockConfig, defaultProfile: undefined };
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(configWithoutDefault));

      const defaultProfile = await profileManager.getDefaultProfile();
      expect(defaultProfile).toBeNull();
    });
  });

  describe('setDefaultProfile', () => {
    it('should set default profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      await profileManager.setDefaultProfile('staging');

      const writeCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
      const writtenConfig = JSON.parse(writeCall[1] as string);
      expect(writtenConfig.defaultProfile).toBe('staging');
    });

    it('should throw error for non-existent profile', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      await expect(profileManager.setDefaultProfile('nonexistent')).rejects.toThrow(
        `[${CONFIG_ERROR_CODES.PROFILE_NOT_FOUND}]`,
      );
    });
  });
});
