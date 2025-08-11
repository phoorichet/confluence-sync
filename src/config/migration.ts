import * as fs from 'node:fs';
import { logger } from '../utils/logger.ts';
import {
  CONFIG_ERROR_CODES,
  type ConfigFile,
  configFileSchema,
  createConfigError,
  type ProfileConfig,
} from './schemas.ts';

interface LegacyConfig {
  confluenceUrl?: string;
  spaceKey?: string;
  authType?: string;
  concurrentOperations?: number;
  conflictStrategy?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  cacheEnabled?: boolean;
  // Any other legacy fields
  [key: string]: any;
}

export class ConfigMigration {
  /**
   * Migrate configuration file to current format
   */
  static async migrate(configPath: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(content);

      // Check if already in current format
      if (this.isCurrentFormat(rawConfig)) {
        logger.debug('Configuration is already in current format');
        return false;
      }

      // Create backup
      const backupPath = await this.createBackup(configPath);
      logger.info(`Created backup: ${backupPath}`);

      // Perform migration
      const migratedConfig = this.migrateToCurrentFormat(rawConfig);

      // Validate migrated config
      const validatedConfig = configFileSchema.parse(migratedConfig);

      // Write migrated config
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(validatedConfig, null, 2),
        'utf-8',
      );

      logger.success('Configuration migrated successfully');
      return true;
    }
    catch (error) {
      if (error instanceof Error) {
        throw createConfigError(
          CONFIG_ERROR_CODES.MIGRATION_ERROR,
          `Failed to migrate configuration: ${error.message}`,
          error,
        );
      }
      throw error;
    }
  }

  /**
   * Check if config is in current format
   */
  private static isCurrentFormat(config: any): boolean {
    // Current format has version and profiles object
    return (
      typeof config === 'object'
      && config !== null
      && 'version' in config
      && 'profiles' in config
      && typeof config.profiles === 'object'
    );
  }

  /**
   * Create backup of configuration file
   */
  private static async createBackup(configPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.backup.${timestamp}`;

    await fs.promises.copyFile(configPath, backupPath);
    return backupPath;
  }

  /**
   * Migrate legacy config to current format
   */
  private static migrateToCurrentFormat(legacyConfig: LegacyConfig): ConfigFile {
    // Check if it's a single-profile legacy config
    if (this.isLegacySimpleFormat(legacyConfig)) {
      return this.migrateSingleProfile(legacyConfig);
    }

    // Check if it has some structure but needs updating
    if (this.isPartiallyMigrated(legacyConfig)) {
      return this.completePartialMigration(legacyConfig);
    }

    // Unknown format, try best effort
    return this.bestEffortMigration(legacyConfig);
  }

  /**
   * Check if config is legacy simple format (no profiles)
   */
  private static isLegacySimpleFormat(config: any): boolean {
    return (
      'confluenceUrl' in config
      || 'spaceKey' in config
      || 'authType' in config
    ) && !('profiles' in config);
  }

  /**
   * Check if config is partially migrated
   */
  private static isPartiallyMigrated(config: any): boolean {
    return 'profiles' in config && !('version' in config);
  }

  /**
   * Migrate single-profile legacy config
   */
  private static migrateSingleProfile(legacy: LegacyConfig): ConfigFile {
    const profile: ProfileConfig = {
      confluenceUrl: legacy.confluenceUrl || '',
      spaceKey: legacy.spaceKey || '',
      authType: (legacy.authType as any) || 'token',
      concurrentOperations: legacy.concurrentOperations || 5,
      conflictStrategy: (legacy.conflictStrategy as any) || 'manual',
      includePatterns: legacy.includePatterns || ['**/*.md'],
      excludePatterns: legacy.excludePatterns || ['**/node_modules/**', '**/.git/**'],
      cacheEnabled: legacy.cacheEnabled !== false,
    };

    // Extract any auth-related fields
    if (legacy.username) {
      profile.username = legacy.username;
    }

    return {
      version: '1.0.0',
      defaultProfile: 'default',
      profiles: {
        default: profile,
      },
      shared: {
        logLevel: legacy.logLevel || 'info',
        retryAttempts: legacy.retryAttempts || 3,
        retryDelay: legacy.retryDelay || 1000,
      },
    };
  }

  /**
   * Complete partial migration
   */
  private static completePartialMigration(config: any): ConfigFile {
    const result: ConfigFile = {
      version: config.version || '1.0.0',
      profiles: {},
      shared: config.shared || {},
    };

    // Migrate profiles
    if (typeof config.profiles === 'object' && config.profiles !== null) {
      for (const [name, profile] of Object.entries(config.profiles)) {
        result.profiles[name] = this.normalizeProfile(profile as any);
      }
    }

    // Set default profile if not present
    if (config.defaultProfile) {
      result.defaultProfile = config.defaultProfile;
    }
    else if (Object.keys(result.profiles).length > 0) {
      result.defaultProfile = Object.keys(result.profiles)[0];
    }

    return result;
  }

  /**
   * Best effort migration for unknown formats
   */
  private static bestEffortMigration(config: any): ConfigFile {
    logger.warn('Unknown configuration format, attempting best-effort migration');

    // Try to extract any recognizable fields
    const profile: ProfileConfig = {
      confluenceUrl: config.confluenceUrl || config.url || '',
      spaceKey: config.spaceKey || config.space || '',
      authType: 'token',
      concurrentOperations: 5,
      conflictStrategy: 'manual',
      includePatterns: ['**/*.md'],
      excludePatterns: ['**/node_modules/**', '**/.git/**'],
      cacheEnabled: true,
    };

    return {
      version: '1.0.0',
      defaultProfile: 'migrated',
      profiles: {
        migrated: profile,
      },
      shared: {
        logLevel: 'info',
        retryAttempts: 3,
        retryDelay: 1000,
      },
    };
  }

  /**
   * Normalize a profile to ensure all required fields
   */
  private static normalizeProfile(profile: any): ProfileConfig {
    return {
      confluenceUrl: profile.confluenceUrl || '',
      spaceKey: profile.spaceKey || '',
      authType: profile.authType || 'token',
      concurrentOperations: profile.concurrentOperations || 5,
      conflictStrategy: profile.conflictStrategy || 'manual',
      includePatterns: profile.includePatterns || ['**/*.md'],
      excludePatterns: profile.excludePatterns || ['**/node_modules/**', '**/.git/**'],
      formatOptions: profile.formatOptions || {},
      cacheEnabled: profile.cacheEnabled !== false,
      username: profile.username,
    };
  }

  /**
   * Check if migration is needed
   */
  static async needsMigration(configPath: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(content);
      return !this.isCurrentFormat(rawConfig);
    }
    catch {
      return false;
    }
  }
}
