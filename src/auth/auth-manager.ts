import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { Keychain } from './keychain';

export const CredentialsSchema = z.object({
  url: z.string().url(),
  username: z.string().min(1),
  apiToken: z.string().min(1),
  authType: z.enum(['cloud', 'server']),
});

export const AuthTokenSchema = z.object({
  token: z.string(),
  type: z.enum(['basic', 'bearer']),
  expiresAt: z.date().optional(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;
export type AuthToken = z.infer<typeof AuthTokenSchema>;

export interface UserInfo {
  accountId?: string;
  email?: string;
  displayName: string;
  accountType?: string;
}

export class AuthManager {
  private keychain: Keychain;
  private static instance: AuthManager;

  // Helper method to convert to V1 API URL
  private getV1ApiUrl(url: string): string {
    // Handle both V2 and custom server URLs
    if (url.includes('/wiki/api/v2')) {
      return url.replace('/wiki/api/v2', '/wiki/rest/api');
    }
    // For server instances, ensure we have the correct path
    if (!url.includes('/rest/api')) {
      return url.endsWith('/') ? `${url}rest/api` : `${url}/rest/api`;
    }
    return url;
  }

  private constructor() {
    this.keychain = new Keychain();
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  public async authenticate(credentials: Credentials): Promise<AuthToken> {
    const validatedCreds = CredentialsSchema.parse(credentials);

    const authToken = this.createAuthToken(validatedCreds);

    const isValid = await this.validateAuthWithAPI(validatedCreds.url, authToken);
    if (!isValid) {
      throw new Error('CS-401: Invalid credentials provided');
    }

    await this.keychain.setPassword('confluence-sync', 'url', validatedCreds.url);
    await this.keychain.setPassword('confluence-sync', 'username', validatedCreds.username);
    await this.keychain.setPassword('confluence-sync', 'apiToken', validatedCreds.apiToken);
    await this.keychain.setPassword('confluence-sync', 'authType', validatedCreds.authType);

    return authToken;
  }

  public async getToken(): Promise<string> {
    const apiToken = await this.keychain.getPassword('confluence-sync', 'apiToken');
    const username = await this.keychain.getPassword('confluence-sync', 'username');
    const authType = await this.keychain.getPassword('confluence-sync', 'authType');

    if (!apiToken || !username || !authType) {
      throw new Error('CS-401: No stored credentials found');
    }

    if (authType === 'cloud') {
      const basicAuth = Buffer.from(`${username}:${apiToken}`).toString('base64');
      return `Basic ${basicAuth}`;
    }
    else {
      return `Bearer ${apiToken}`;
    }
  }

  public async clearCredentials(): Promise<void> {
    // Batch delete operations for better performance
    await Promise.all([
      this.keychain.deletePassword('confluence-sync', 'url'),
      this.keychain.deletePassword('confluence-sync', 'username'),
      this.keychain.deletePassword('confluence-sync', 'apiToken'),
      this.keychain.deletePassword('confluence-sync', 'authType'),
    ]);
  }

  public async isAuthenticated(): Promise<boolean> {
    return this.validateAuth();
  }

  public async validateAuth(): Promise<boolean> {
    try {
      // Batch fetch for better performance
      const [url, username, apiToken, authType] = await Promise.all([
        this.keychain.getPassword('confluence-sync', 'url'),
        this.keychain.getPassword('confluence-sync', 'username'),
        this.keychain.getPassword('confluence-sync', 'apiToken'),
        this.keychain.getPassword('confluence-sync', 'authType'),
      ]);

      if (!url || !username || !apiToken || !authType) {
        return false;
      }

      const credentials: Credentials = {
        url,
        username,
        apiToken,
        authType: authType as 'cloud' | 'server',
      };

      const authToken = this.createAuthToken(credentials);
      return await this.validateAuthWithAPI(url, authToken);
    }
    catch {
      return false;
    }
  }

  public async getCurrentUser(): Promise<UserInfo | null> {
    try {
      const url = await this.keychain.getPassword('confluence-sync', 'url');
      const authToken = await this.getAuthToken();

      if (!url || !authToken) {
        return null;
      }

      // Use V1 API for current user info since V2 doesn't have this endpoint
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: authToken.type === 'basic'
          ? `Basic ${authToken.token}`
          : `Bearer ${authToken.token}`,
      };

      const apiUrl = this.getV1ApiUrl(url);

      // Add timeout for better UX
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${apiUrl}/user/current`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const userData = await response.json() as any;
          return {
            accountId: userData.accountId,
            email: userData.email,
            displayName: userData.displayName || userData.publicName || 'Unknown',
            accountType: userData.accountType,
          };
        }
      }
      catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          console.error(`Failed to get current user: ${error.message}`);
        }
      }

      return null;
    }
    catch (error) {
      if (error instanceof Error) {
        console.error(`Error in getCurrentUser: ${error.message}`);
      }
      return null;
    }
  }

  public async getStoredCredentials(): Promise<Partial<Credentials> | null> {
    try {
      const url = await this.keychain.getPassword('confluence-sync', 'url');
      const username = await this.keychain.getPassword('confluence-sync', 'username');
      const authType = await this.keychain.getPassword('confluence-sync', 'authType');

      if (!url || !username) {
        return null;
      }

      return {
        url,
        username,
        authType: authType as 'cloud' | 'server',
      };
    }
    catch {
      return null;
    }
  }

  private createAuthToken(credentials: Credentials): AuthToken {
    if (credentials.authType === 'cloud') {
      const basicAuth = Buffer.from(`${credentials.username}:${credentials.apiToken}`).toString('base64');
      return {
        token: basicAuth,
        type: 'basic',
      };
    }
    else {
      return {
        token: credentials.apiToken,
        type: 'bearer',
      };
    }
  }

  private async getAuthToken(): Promise<AuthToken | null> {
    try {
      // Batch fetch for better performance
      const [username, apiToken, authType] = await Promise.all([
        this.keychain.getPassword('confluence-sync', 'username'),
        this.keychain.getPassword('confluence-sync', 'apiToken'),
        this.keychain.getPassword('confluence-sync', 'authType'),
      ]);

      if (!username || !apiToken || !authType) {
        return null;
      }

      const credentials: Credentials = {
        url: '', // URL not needed for token creation
        username,
        apiToken,
        authType: authType as 'cloud' | 'server',
      };

      return this.createAuthToken(credentials);
    }
    catch (error) {
      if (error instanceof Error) {
        console.error(`Error getting auth token: ${error.message}`);
      }
      return null;
    }
  }

  private async validateAuthWithAPI(url: string, authToken: AuthToken): Promise<boolean> {
    try {
      // Use V1 API for validation since V2 doesn't have user/current endpoint
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: authToken.type === 'basic'
          ? `Basic ${authToken.token}`
          : `Bearer ${authToken.token}`,
      };

      const apiUrl = this.getV1ApiUrl(url);

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(`${apiUrl}/user/current`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response.ok;
      }
      catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('CS-500: Request timeout - Confluence server did not respond');
        }
        throw error;
      }
    }
    catch (error) {
      // Log specific error for debugging while returning false for validation
      if (error instanceof Error) {
        console.error(`Authentication validation failed: ${error.message}`);
      }
      return false;
    }
  }
}
