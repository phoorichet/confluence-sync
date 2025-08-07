import { keyring } from '@zowe/secrets-for-zowe-sdk';
import { logger } from '../utils/logger';

export class Keychain {
  // Cache for performance optimization - cleared on any write operation
  private cache = new Map<string, string>();

  public async getPassword(service: string, account: string): Promise<string | null> {
    const cacheKey = `${service}:${account}`;

    // Check cache first for performance
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    try {
      const password = await keyring.getPassword(service, account);
      if (password) {
        this.cache.set(cacheKey, password);
      }
      return password;
    }
    catch (error) {
      // Only log non-expected errors (missing password is expected)
      if (error instanceof Error && !error.message.includes('password not found')) {
        logger.error(`CS-500: Failed to retrieve password from keychain`, error);
      }
      return null;
    }
  }

  public async setPassword(service: string, account: string, password: string): Promise<void> {
    try {
      await keyring.setPassword(service, account, password);
      // Clear cache on any write operation to ensure consistency
      this.cache.clear();
    }
    catch (error) {
      // Provide more specific error message based on error type
      if (error instanceof Error) {
        if (error.message.includes('access denied') || error.message.includes('permission')) {
          throw new Error(`CS-403: Keychain access denied. Please check system permissions.`);
        }
        throw new Error(`CS-500: Failed to store credentials: ${error.message}`);
      }
      throw new Error(`CS-500: Failed to store password in keychain`);
    }
  }

  public async deletePassword(service: string, account: string): Promise<boolean> {
    try {
      const result = await keyring.deletePassword(service, account);
      // Clear cache on delete
      this.cache.clear();
      return result;
    }
    catch (error) {
      // Don't log if password doesn't exist (normal case)
      if (error instanceof Error && !error.message.includes('password not found')) {
        logger.error(`CS-500: Failed to delete password from keychain`, error);
      }
      return false;
    }
  }

  public async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    try {
      const credentials = await keyring.findCredentials(service);
      // Cache found credentials for performance
      credentials.forEach(({ account, password }) => {
        this.cache.set(`${service}:${account}`, password);
      });
      return credentials;
    }
    catch (error) {
      // Only log unexpected errors
      if (error instanceof Error && !error.message.includes('not found')) {
        logger.error(`CS-500: Failed to find credentials in keychain`, error);
      }
      return [];
    }
  }

  // Method to clear cache when needed (e.g., after auth failure)
  public clearCache(): void {
    this.cache.clear();
  }
}
