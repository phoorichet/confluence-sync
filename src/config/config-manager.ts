import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import { logger } from '../utils/logger.ts';
import { ConfigMigration } from './migration.ts';
import { ProfileManager } from './profiles.ts';
import {
  CONFIG_ERROR_CODES,
  type ConfigFile,
  configFileSchema,
  createConfigError,
  type ProfileConfig,
  type SharedConfig,
  type SyncConfig,
  syncConfigSchema,
} from './schemas.ts';

export class ConfigManager {
  private static instance: ConfigManager;
  private profileManager: ProfileManager;
  private cachedConfig: SyncConfig | null = null;
  private configPaths: string[];

  private constructor() {
    // Define search paths for configuration files
    this.configPaths = [
      path.join(process.cwd(), 'csconfig.json'), // Primary project config
      path.join(os.homedir(), '.config', 'confluence-sync', 'config.json'), // User config
      '/etc/confluence-sync/config.json', // Global config (Unix-like systems)
    ];

    this.profileManager = new ProfileManager();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration with profile selection and environment variable overrides
   */
  async loadConfig(profileName?: string): Promise<SyncConfig> {
    // Clear cache when explicitly loading
    this.cachedConfig = null;

    // Find the first existing config file
    const configPath = await this.findConfigFile();
    if (!configPath) {
      throw createConfigError(
        CONFIG_ERROR_CODES.FILE_NOT_FOUND,
        'No configuration file found. Run \'confluence-sync init\' to create one.',
      );
    }

    // Check if migration is needed
    if (await ConfigMigration.needsMigration(configPath)) {
      logger.info('Configuration format outdated, migrating...');
      await ConfigMigration.migrate(configPath);
    }

    // Initialize profile manager with the found config path
    this.profileManager = new ProfileManager(configPath);

    // Determine which profile to use
    const activeProfileName = await this.determineProfile(profileName);
    if (!activeProfileName) {
      throw createConfigError(
        CONFIG_ERROR_CODES.PROFILE_NOT_FOUND,
        'No profile specified and no default profile configured',
      );
    }

    // Load the profile configuration
    const profile = await this.profileManager.getProfile(activeProfileName);

    // Load shared configuration with defaults
    const configFile = await this.loadConfigFile(configPath);
    const shared: SharedConfig = {
      logLevel: configFile.shared?.logLevel ?? 'info',
      retryAttempts: configFile.shared?.retryAttempts ?? 3,
      retryDelay: configFile.shared?.retryDelay ?? 1000,
      concurrentOperations: configFile.shared?.concurrentOperations,
      conflictStrategy: configFile.shared?.conflictStrategy,
      includePatterns: configFile.shared?.includePatterns,
      excludePatterns: configFile.shared?.excludePatterns,
      formatOptions: configFile.shared?.formatOptions,
      cacheEnabled: configFile.shared?.cacheEnabled,
    };

    // Merge configurations: shared < profile < env vars
    const mergedConfig = this.mergeConfigs(shared, profile, activeProfileName);

    // Apply environment variable overrides
    const finalConfig = this.applyEnvironmentVariables(mergedConfig);

    // Validate the final configuration
    const validatedConfig = syncConfigSchema.parse(finalConfig);

    this.cachedConfig = validatedConfig;
    logger.debug(`Configuration loaded for profile: ${activeProfileName}`);

    return validatedConfig;
  }

  /**
   * Save configuration changes
   */
  async saveConfig(config: Partial<SyncConfig>): Promise<void> {
    if (!config.profile) {
      throw createConfigError(
        CONFIG_ERROR_CODES.MISSING_REQUIRED,
        'Profile name is required to save configuration',
      );
    }

    // Update the profile with the new configuration
    const updates: Partial<ProfileConfig> = {
      confluenceUrl: config.confluenceUrl,
      spaceKey: config.spaceKey,
      authType: config.authType,
      concurrentOperations: config.concurrentOperations,
      conflictStrategy: config.conflictStrategy,
      includePatterns: config.includePatterns,
      excludePatterns: config.excludePatterns,
      formatOptions: config.formatOptions,
      cacheEnabled: config.cacheEnabled,
      username: config.username,
    };

    // Remove undefined values
    Object.keys(updates).forEach((key) => {
      if (updates[key as keyof ProfileConfig] === undefined) {
        delete updates[key as keyof ProfileConfig];
      }
    });

    await this.profileManager.updateProfile(config.profile, updates);

    // Clear cache to force reload on next access
    this.cachedConfig = null;
    logger.info(`Configuration saved for profile: ${config.profile}`);
  }

  /**
   * Switch to a different profile
   */
  async switchProfile(profileName: string): Promise<void> {
    await this.profileManager.switchProfile(profileName);
    // Clear cache to force reload with new profile
    this.cachedConfig = null;
    logger.info(`Switched to profile: ${profileName}`);
  }

  /**
   * Validate configuration without loading
   */
  validateConfig(config: unknown): SyncConfig {
    return syncConfigSchema.parse(config);
  }

  /**
   * Get cached configuration or load if not cached
   */
  async getConfig(profileName?: string): Promise<SyncConfig> {
    if (this.cachedConfig && !profileName) {
      return this.cachedConfig;
    }
    return this.loadConfig(profileName);
  }

  /**
   * Find the first existing configuration file
   */
  private async findConfigFile(): Promise<string | null> {
    for (const configPath of this.configPaths) {
      try {
        await fs.promises.access(configPath, fs.constants.R_OK);
        logger.debug(`Found configuration file: ${configPath}`);
        return configPath;
      }
      catch {
        // File doesn't exist or not readable, continue to next
      }
    }
    return null;
  }

  /**
   * Load and parse configuration file
   */
  private async loadConfigFile(configPath: string): Promise<ConfigFile> {
    try {
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(content);
      return configFileSchema.parse(rawConfig);
    }
    catch (error) {
      if (error instanceof SyntaxError) {
        throw createConfigError(
          CONFIG_ERROR_CODES.PARSE_ERROR,
          `Failed to parse configuration file: ${error.message}`,
          error,
        );
      }
      throw error;
    }
  }

  /**
   * Determine which profile to use based on precedence
   */
  private async determineProfile(requestedProfile?: string): Promise<string | null> {
    // 1. Environment variable override
    const envProfile = process.env.CONFLUENCE_SYNC_PROFILE;
    if (envProfile) {
      logger.debug(`Using profile from environment variable: ${envProfile}`);
      return envProfile;
    }

    // 2. Explicitly requested profile
    if (requestedProfile) {
      logger.debug(`Using requested profile: ${requestedProfile}`);
      return requestedProfile;
    }

    // 3. Active profile from file
    const activeProfile = await this.profileManager.getActiveProfile();
    if (activeProfile) {
      logger.debug(`Using active profile: ${activeProfile}`);
      return activeProfile;
    }

    // 4. Default profile from config
    const defaultProfile = await this.profileManager.getDefaultProfile();
    if (defaultProfile) {
      logger.debug(`Using default profile: ${defaultProfile}`);
      return defaultProfile;
    }

    // 5. First available profile
    const profiles = await this.profileManager.listProfiles();
    if (profiles.length > 0) {
      logger.debug(`No profile specified, using first available: ${profiles[0]}`);
      return profiles[0] || null;
    }

    return null;
  }

  /**
   * Merge configurations with proper precedence
   */
  private mergeConfigs(
    shared: SharedConfig,
    profile: ProfileConfig,
    profileName: string,
  ): SyncConfig {
    // Merge format options with proper defaults
    const mergedFormatOptions = {
      preserveTables: profile.formatOptions?.preserveTables ?? shared.formatOptions?.preserveTables ?? true,
      preserveCodeBlocks: profile.formatOptions?.preserveCodeBlocks ?? shared.formatOptions?.preserveCodeBlocks ?? true,
      preserveLinks: profile.formatOptions?.preserveLinks ?? shared.formatOptions?.preserveLinks ?? true,
      preserveImages: profile.formatOptions?.preserveImages ?? shared.formatOptions?.preserveImages ?? true,
      preserveMacros: profile.formatOptions?.preserveMacros ?? shared.formatOptions?.preserveMacros ?? false,
    };

    return {
      profile: profileName,
      // Profile config takes precedence over shared
      confluenceUrl: profile.confluenceUrl,
      spaceKey: profile.spaceKey,
      authType: profile.authType || 'token',
      concurrentOperations: profile.concurrentOperations ?? shared.concurrentOperations ?? 5,
      conflictStrategy: profile.conflictStrategy ?? shared.conflictStrategy ?? 'manual',
      includePatterns: profile.includePatterns ?? shared.includePatterns ?? ['**/*.md'],
      excludePatterns: profile.excludePatterns ?? shared.excludePatterns ?? ['**/node_modules/**', '**/.git/**'],
      formatOptions: mergedFormatOptions,
      cacheEnabled: profile.cacheEnabled ?? shared.cacheEnabled ?? true,
      logLevel: shared.logLevel ?? 'info',
      retryAttempts: shared.retryAttempts ?? 3,
      retryDelay: shared.retryDelay ?? 1000,
      username: profile.username,
    };
  }

  /**
   * Apply environment variable overrides to configuration
   */
  private applyEnvironmentVariables(config: SyncConfig): SyncConfig {
    const env = process.env;

    // Validate auth type from environment
    const validAuthTypes = ['token', 'oauth', 'basic'] as const;
    const envAuthType = env.CONFLUENCE_SYNC_AUTH_TYPE;
    const authType = envAuthType && validAuthTypes.includes(envAuthType as any)
      ? (envAuthType as typeof validAuthTypes[number])
      : config.authType;

    // Validate conflict strategy from environment
    const validStrategies = ['manual', 'local-first', 'remote-first'] as const;
    const envStrategy = env.CONFLUENCE_SYNC_CONFLICT_STRATEGY;
    const conflictStrategy = envStrategy && validStrategies.includes(envStrategy as any)
      ? (envStrategy as typeof validStrategies[number])
      : config.conflictStrategy;

    // Validate log level from environment
    const validLogLevels = ['debug', 'info', 'warn', 'error'] as const;
    const envLogLevel = env.CONFLUENCE_SYNC_LOG_LEVEL;
    const logLevel = envLogLevel && validLogLevels.includes(envLogLevel as any)
      ? (envLogLevel as typeof validLogLevels[number])
      : config.logLevel;

    return {
      ...config,
      // Environment variables take highest precedence
      confluenceUrl: env.CONFLUENCE_SYNC_URL || config.confluenceUrl,
      spaceKey: env.CONFLUENCE_SYNC_SPACE || config.spaceKey,
      authType,
      concurrentOperations: env.CONFLUENCE_SYNC_CONCURRENT_OPS
        ? Math.min(10, Math.max(1, Number.parseInt(env.CONFLUENCE_SYNC_CONCURRENT_OPS, 10) || config.concurrentOperations))
        : config.concurrentOperations,
      conflictStrategy,
      cacheEnabled: env.CONFLUENCE_SYNC_CACHE_ENABLED
        ? env.CONFLUENCE_SYNC_CACHE_ENABLED === 'true'
        : config.cacheEnabled,
      logLevel,
      retryAttempts: env.CONFLUENCE_SYNC_RETRY_ATTEMPTS
        ? Math.min(5, Math.max(0, Number.parseInt(env.CONFLUENCE_SYNC_RETRY_ATTEMPTS, 10) || config.retryAttempts))
        : config.retryAttempts,
      retryDelay: env.CONFLUENCE_SYNC_RETRY_DELAY
        ? Math.min(10000, Math.max(100, Number.parseInt(env.CONFLUENCE_SYNC_RETRY_DELAY, 10) || config.retryDelay))
        : config.retryDelay,
      username: env.CONFLUENCE_SYNC_USERNAME || config.username,
    };
  }

  /**
   * Get all available profiles
   */
  async listProfiles(): Promise<string[]> {
    const configPath = await this.findConfigFile();
    if (!configPath) {
      return [];
    }

    const pm = new ProfileManager(configPath);
    return pm.listProfiles();
  }

  /**
   * Create a new profile
   */
  async createProfile(profileName: string, profileConfig: ProfileConfig): Promise<void> {
    const configPath = await this.findConfigFile();
    if (!configPath) {
      throw createConfigError(
        CONFIG_ERROR_CODES.FILE_NOT_FOUND,
        'No configuration file found. Run \'confluence-sync init\' to create one.',
      );
    }

    const pm = new ProfileManager(configPath);
    await pm.createProfile(profileName, profileConfig);

    // Clear cache
    this.cachedConfig = null;
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileName: string): Promise<void> {
    const configPath = await this.findConfigFile();
    if (!configPath) {
      throw createConfigError(
        CONFIG_ERROR_CODES.FILE_NOT_FOUND,
        'No configuration file found.',
      );
    }

    const pm = new ProfileManager(configPath);
    await pm.deleteProfile(profileName);

    // Clear cache
    this.cachedConfig = null;
  }

  /**
   * Get current active profile name
   */
  async getActiveProfileName(): Promise<string | null> {
    const configPath = await this.findConfigFile();
    if (!configPath) {
      return null;
    }

    const pm = new ProfileManager(configPath);
    return pm.getActiveProfile();
  }
}
