import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigMigration } from '../../../src/config/migration.ts';

describe('configMigration', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-migration-test-'));
    configPath = path.join(testDir, '.confluence-sync.json');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  });

  describe('needsMigration', () => {
    it('should return false for current format', async () => {
      const currentConfig = {
        version: '1.0.0',
        profiles: {
          default: {
            confluenceUrl: 'https://test.atlassian.net',
            spaceKey: 'TEST',
          },
        },
      };
      await fs.promises.writeFile(configPath, JSON.stringify(currentConfig));

      const needs = await ConfigMigration.needsMigration(configPath);
      expect(needs).toBe(false);
    });

    it('should return true for legacy format', async () => {
      const legacyConfig = {
        confluenceUrl: 'https://test.atlassian.net',
        spaceKey: 'TEST',
        authType: 'token',
      };
      await fs.promises.writeFile(configPath, JSON.stringify(legacyConfig));

      const needs = await ConfigMigration.needsMigration(configPath);
      expect(needs).toBe(true);
    });

    it('should return true for partially migrated format', async () => {
      const partialConfig = {
        profiles: {
          default: {
            confluenceUrl: 'https://test.atlassian.net',
            spaceKey: 'TEST',
          },
        },
        // Missing version field
      };
      await fs.promises.writeFile(configPath, JSON.stringify(partialConfig));

      const needs = await ConfigMigration.needsMigration(configPath);
      expect(needs).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const needs = await ConfigMigration.needsMigration('/non/existent/path.json');
      expect(needs).toBe(false);
    });
  });

  describe('migrate', () => {
    it('should migrate legacy single-profile config', async () => {
      const legacyConfig = {
        confluenceUrl: 'https://test.atlassian.net',
        spaceKey: 'TEST',
        authType: 'token',
        concurrentOperations: 3,
        conflictStrategy: 'local-first',
        includePatterns: ['**/*.md', '**/*.txt'],
        excludePatterns: ['**/node_modules/**'],
        cacheEnabled: false,
        username: 'testuser',
      };
      await fs.promises.writeFile(configPath, JSON.stringify(legacyConfig));

      const migrated = await ConfigMigration.migrate(configPath);
      expect(migrated).toBe(true);

      // Read migrated config
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.version).toBe('1.0.0');
      expect(config.defaultProfile).toBe('default');
      expect(config.profiles.default).toBeDefined();
      expect(config.profiles.default.confluenceUrl).toBe('https://test.atlassian.net');
      expect(config.profiles.default.spaceKey).toBe('TEST');
      expect(config.profiles.default.authType).toBe('token');
      expect(config.profiles.default.concurrentOperations).toBe(3);
      expect(config.profiles.default.conflictStrategy).toBe('local-first');
      expect(config.profiles.default.includePatterns).toEqual(['**/*.md', '**/*.txt']);
      expect(config.profiles.default.cacheEnabled).toBe(false);
      expect(config.profiles.default.username).toBe('testuser');
    });

    it('should complete partial migration', async () => {
      const partialConfig = {
        profiles: {
          prod: {
            confluenceUrl: 'https://prod.atlassian.net',
            spaceKey: 'PROD',
          },
          staging: {
            confluenceUrl: 'https://staging.atlassian.net',
            spaceKey: 'STAGE',
            authType: 'oauth',
          },
        },
        shared: {
          logLevel: 'debug',
        },
      };
      await fs.promises.writeFile(configPath, JSON.stringify(partialConfig));

      const migrated = await ConfigMigration.migrate(configPath);
      expect(migrated).toBe(true);

      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.version).toBe('1.0.0');
      expect(config.defaultProfile).toBe('prod'); // First profile as default
      expect(config.profiles.prod).toBeDefined();
      expect(config.profiles.staging).toBeDefined();
      expect(config.profiles.prod.confluenceUrl).toBe('https://prod.atlassian.net');
      expect(config.profiles.staging.authType).toBe('oauth');
      expect(config.shared.logLevel).toBe('debug');
    });

    it('should not migrate current format', async () => {
      const currentConfig = {
        version: '1.0.0',
        defaultProfile: 'main',
        profiles: {
          main: {
            confluenceUrl: 'https://test.atlassian.net',
            spaceKey: 'TEST',
            authType: 'token',
            concurrentOperations: 5,
            conflictStrategy: 'manual',
            includePatterns: ['**/*.md'],
            excludePatterns: ['**/node_modules/**', '**/.git/**'],
            cacheEnabled: true,
          },
        },
        shared: {
          logLevel: 'info',
          retryAttempts: 3,
          retryDelay: 1000,
        },
      };
      await fs.promises.writeFile(configPath, JSON.stringify(currentConfig, null, 2));

      const migrated = await ConfigMigration.migrate(configPath);
      expect(migrated).toBe(false);

      // Config should remain unchanged
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config).toEqual(currentConfig);
    });

    it('should create backup before migration', async () => {
      const legacyConfig = {
        confluenceUrl: 'https://test.atlassian.net',
        spaceKey: 'TEST',
      };
      await fs.promises.writeFile(configPath, JSON.stringify(legacyConfig));

      await ConfigMigration.migrate(configPath);

      // Check for backup file
      const files = await fs.promises.readdir(testDir);
      const backupFiles = files.filter(f => f.includes('.backup.'));
      expect(backupFiles.length).toBe(1);

      // Verify backup content
      const backupPath = path.join(testDir, backupFiles[0]);
      const backupContent = await fs.promises.readFile(backupPath, 'utf-8');
      const backup = JSON.parse(backupContent);
      expect(backup).toEqual(legacyConfig);
    });

    it('should handle unknown format with best effort', async () => {
      const unknownConfig = {
        url: 'https://test.atlassian.net',
        space: 'TEST',
        someUnknownField: 'value',
      };
      await fs.promises.writeFile(configPath, JSON.stringify(unknownConfig));

      const migrated = await ConfigMigration.migrate(configPath);
      expect(migrated).toBe(true);

      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.version).toBe('1.0.0');
      expect(config.defaultProfile).toBe('migrated');
      expect(config.profiles.migrated).toBeDefined();
      expect(config.profiles.migrated.confluenceUrl).toBe('https://test.atlassian.net');
      expect(config.profiles.migrated.spaceKey).toBe('TEST');
    });
  });
});
