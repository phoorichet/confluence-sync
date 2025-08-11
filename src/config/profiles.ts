import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { logger } from '../utils/logger.ts';
import {
  CONFIG_ERROR_CODES,
  type ConfigFile,
  configFileSchema,
  createConfigError,
  type ProfileConfig,
} from './schemas.ts';

export class ProfileManager {
  private configPath: string;
  private config: ConfigFile | null = null;
  private activeProfilePath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.confluence-sync.json');
    this.activeProfilePath = path.join(path.dirname(this.configPath), '.confluence-sync-profile');
  }

  /**
   * Load configuration file
   */
  private async loadConfig(): Promise<ConfigFile> {
    if (this.config) {
      return this.config;
    }

    try {
      const configContent = await fs.promises.readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(configContent);
      this.config = configFileSchema.parse(rawConfig);
      return this.config;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw createConfigError(
          CONFIG_ERROR_CODES.FILE_NOT_FOUND,
          `Configuration file not found: ${this.configPath}`,
        );
      }
      if (error instanceof SyntaxError) {
        throw createConfigError(
          CONFIG_ERROR_CODES.PARSE_ERROR,
          `Failed to parse configuration file: ${error.message}`,
          error,
        );
      }
      if (error instanceof z.ZodError) {
        throw createConfigError(
          CONFIG_ERROR_CODES.VALIDATION_ERROR,
          'Configuration validation failed',
          error.errors,
        );
      }
      throw error;
    }
  }

  /**
   * Save configuration file
   */
  private async saveConfig(): Promise<void> {
    if (!this.config) {
      throw createConfigError(
        CONFIG_ERROR_CODES.INVALID_FORMAT,
        'No configuration loaded',
      );
    }

    const configContent = JSON.stringify(this.config, null, 2);
    await fs.promises.writeFile(this.configPath, configContent, 'utf-8');
    logger.debug(`Configuration saved to ${this.configPath}`);
  }

  /**
   * List all available profiles
   */
  async listProfiles(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config.profiles);
  }

  /**
   * Get a specific profile configuration
   */
  async getProfile(profileName: string): Promise<ProfileConfig> {
    const config = await this.loadConfig();
    const profile = config.profiles[profileName];

    if (!profile) {
      throw createConfigError(
        CONFIG_ERROR_CODES.PROFILE_NOT_FOUND,
        `Profile '${profileName}' not found`,
      );
    }

    return profile;
  }

  /**
   * Create a new profile
   */
  async createProfile(profileName: string, profileConfig: ProfileConfig): Promise<void> {
    const config = await this.loadConfig();

    if (config.profiles[profileName]) {
      throw createConfigError(
        CONFIG_ERROR_CODES.INVALID_PROFILE,
        `Profile '${profileName}' already exists`,
      );
    }

    config.profiles[profileName] = profileConfig;
    this.config = config;
    await this.saveConfig();
    logger.info(`Profile '${profileName}' created successfully`);
  }

  /**
   * Update an existing profile
   */
  async updateProfile(profileName: string, updates: Partial<ProfileConfig>): Promise<void> {
    const config = await this.loadConfig();
    const existingProfile = config.profiles[profileName];

    if (!existingProfile) {
      throw createConfigError(
        CONFIG_ERROR_CODES.PROFILE_NOT_FOUND,
        `Profile '${profileName}' not found`,
      );
    }

    config.profiles[profileName] = { ...existingProfile, ...updates };
    this.config = config;
    await this.saveConfig();
    logger.info(`Profile '${profileName}' updated successfully`);
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileName: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.profiles[profileName]) {
      throw createConfigError(
        CONFIG_ERROR_CODES.PROFILE_NOT_FOUND,
        `Profile '${profileName}' not found`,
      );
    }

    // Check if this is the default profile
    if (config.defaultProfile === profileName) {
      config.defaultProfile = undefined;
    }

    // Check if this is the active profile
    const activeProfile = await this.getActiveProfile();
    if (activeProfile === profileName) {
      await this.clearActiveProfile();
    }

    delete config.profiles[profileName];
    this.config = config;
    await this.saveConfig();
    logger.info(`Profile '${profileName}' deleted successfully`);
  }

  /**
   * Get the currently active profile name
   */
  async getActiveProfile(): Promise<string | null> {
    try {
      const activeProfile = await fs.promises.readFile(this.activeProfilePath, 'utf-8');
      return activeProfile.trim();
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // No active profile file, check for default
        const config = await this.loadConfig();
        return config.defaultProfile || null;
      }
      throw error;
    }
  }

  /**
   * Set the active profile
   */
  async setActiveProfile(profileName: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.profiles[profileName]) {
      throw createConfigError(
        CONFIG_ERROR_CODES.PROFILE_NOT_FOUND,
        `Profile '${profileName}' not found`,
      );
    }

    await fs.promises.writeFile(this.activeProfilePath, profileName, 'utf-8');
    logger.info(`Active profile set to '${profileName}'`);
  }

  /**
   * Clear the active profile
   */
  async clearActiveProfile(): Promise<void> {
    try {
      await fs.promises.unlink(this.activeProfilePath);
      logger.debug('Active profile cleared');
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Switch to a different profile
   */
  async switchProfile(profileName: string): Promise<ProfileConfig> {
    const profile = await this.getProfile(profileName);
    await this.setActiveProfile(profileName);
    return profile;
  }

  /**
   * Get default profile name
   */
  async getDefaultProfile(): Promise<string | null> {
    const config = await this.loadConfig();
    return config.defaultProfile || null;
  }

  /**
   * Set default profile
   */
  async setDefaultProfile(profileName: string): Promise<void> {
    const config = await this.loadConfig();

    if (!config.profiles[profileName]) {
      throw createConfigError(
        CONFIG_ERROR_CODES.PROFILE_NOT_FOUND,
        `Profile '${profileName}' not found`,
      );
    }

    config.defaultProfile = profileName;
    this.config = config;
    await this.saveConfig();
    logger.info(`Default profile set to '${profileName}'`);
  }
}
