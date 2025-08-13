import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager, type Credentials } from '../../../src/auth/auth-manager';
import { Keychain } from '../../../src/auth/keychain';

// Mock Keychain
vi.mock('../../../src/auth/keychain');

describe('authManager', () => {
  let authManager: AuthManager;
  let mockKeychainInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (AuthManager as any).instance = undefined;

    // Get the mocked Keychain constructor
    mockKeychainInstance = {
      getPassword: vi.fn(),
      setPassword: vi.fn(),
      deletePassword: vi.fn(),
      findCredentials: vi.fn(),
      clearCache: vi.fn(),
    };

    (Keychain as any).mockImplementation(() => mockKeychainInstance);

    authManager = AuthManager.getInstance();
  });

  describe('authenticate', () => {
    it('should authenticate with valid cloud credentials', async () => {
      const credentials: Credentials = {
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        apiToken: 'test-token',
        authType: 'cloud',
      };

      mockKeychainInstance.setPassword = vi.fn().mockResolvedValue(undefined);

      // Mock the validation API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ displayName: 'Test User' }),
        response: { ok: true },
      });
      globalThis.fetch = mockFetch;

      const result = await authManager.authenticate(credentials);

      expect(result).toEqual({
        token: Buffer.from(`${credentials.username}:${credentials.apiToken}`).toString('base64'),
        type: 'basic',
      });

      expect(mockKeychainInstance.setPassword).toHaveBeenCalledWith('confluence-sync', 'url', credentials.url);
      expect(mockKeychainInstance.setPassword).toHaveBeenCalledWith('confluence-sync', 'username', credentials.username);
      expect(mockKeychainInstance.setPassword).toHaveBeenCalledWith('confluence-sync', 'apiToken', credentials.apiToken);
      expect(mockKeychainInstance.setPassword).toHaveBeenCalledWith('confluence-sync', 'authType', credentials.authType);
    });

    it('should authenticate with valid server credentials', async () => {
      const credentials: Credentials = {
        url: 'https://confluence.company.com',
        username: 'testuser',
        apiToken: 'pat-token',
        authType: 'server',
      };

      mockKeychainInstance.setPassword = vi.fn().mockResolvedValue(undefined);

      // Mock the validation API call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ displayName: 'Test User' }),
        response: { ok: true },
      });
      globalThis.fetch = mockFetch;

      const result = await authManager.authenticate(credentials);

      expect(result).toEqual({
        token: credentials.apiToken,
        type: 'bearer',
      });

      expect(mockKeychainInstance.setPassword).toHaveBeenCalledTimes(4);
    });

    it('should throw error for invalid credentials', async () => {
      const credentials: Credentials = {
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        apiToken: 'invalid-token',
        authType: 'cloud',
      };

      // Mock failed validation
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        response: { ok: false },
      });
      globalThis.fetch = mockFetch;

      await expect(authManager.authenticate(credentials)).rejects.toThrow('CS-401: Invalid credentials provided');

      expect(mockKeychainInstance.setPassword).not.toHaveBeenCalled();
    });

    it('should validate credential schema', async () => {
      const invalidCredentials = {
        url: 'not-a-url',
        username: '',
        apiToken: 'token',
        authType: 'invalid',
      };

      await expect(authManager.authenticate(invalidCredentials as any)).rejects.toThrow();
    });
  });

  describe('getToken', () => {
    it('should return cloud auth token', async () => {
      mockKeychainInstance.getPassword = vi.fn()
        .mockResolvedValueOnce('test-token')
        .mockResolvedValueOnce('test@example.com')
        .mockResolvedValueOnce('cloud');

      const token = await authManager.getToken();

      const expectedToken = Buffer.from('test@example.com:test-token').toString('base64');
      expect(token).toBe(`Basic ${expectedToken}`);
    });

    it('should return server auth token', async () => {
      mockKeychainInstance.getPassword = vi.fn()
        .mockResolvedValueOnce('pat-token')
        .mockResolvedValueOnce('testuser')
        .mockResolvedValueOnce('server');

      const token = await authManager.getToken();

      expect(token).toBe('Bearer pat-token');
    });

    it('should throw error when no credentials stored', async () => {
      mockKeychainInstance.getPassword = vi.fn().mockResolvedValue(null);

      await expect(authManager.getToken()).rejects.toThrow('CS-401: No stored credentials found');
    });
  });

  describe('clearCredentials', () => {
    it('should delete all stored credentials', async () => {
      mockKeychainInstance.deletePassword = vi.fn().mockResolvedValue(true);

      await authManager.clearCredentials();

      expect(mockKeychainInstance.deletePassword).toHaveBeenCalledWith('confluence-sync', 'url');
      expect(mockKeychainInstance.deletePassword).toHaveBeenCalledWith('confluence-sync', 'username');
      expect(mockKeychainInstance.deletePassword).toHaveBeenCalledWith('confluence-sync', 'apiToken');
      expect(mockKeychainInstance.deletePassword).toHaveBeenCalledWith('confluence-sync', 'authType');
    });
  });

  describe('validateAuth', () => {
    it('should return true for valid stored credentials', async () => {
      mockKeychainInstance.getPassword = vi.fn()
        .mockImplementation((service: string, account: string) => {
          const values: Record<string, string> = {
            url: 'https://test.atlassian.net',
            username: 'test@example.com',
            apiToken: 'test-token',
            authType: 'cloud',
          };
          return Promise.resolve(values[account]);
        });

      // Mock successful validation
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        response: { ok: true },
      });
      globalThis.fetch = mockFetch;

      const isValid = await authManager.validateAuth();

      expect(isValid).toBe(true);
    });

    it('should return false for missing credentials', async () => {
      mockKeychainInstance.getPassword = vi.fn().mockResolvedValue(null);

      const isValid = await authManager.validateAuth();

      expect(isValid).toBe(false);
    });

    it('should return false for invalid credentials', async () => {
      mockKeychainInstance.getPassword = vi.fn()
        .mockImplementation((service: string, account: string) => {
          const values: Record<string, string> = {
            url: 'https://test.atlassian.net',
            username: 'test@example.com',
            apiToken: 'invalid-token',
            authType: 'cloud',
          };
          return Promise.resolve(values[account]);
        });

      // Mock failed validation
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        response: { ok: false },
      });
      globalThis.fetch = mockFetch;

      const isValid = await authManager.validateAuth();

      expect(isValid).toBe(false);
    });
  });

  describe('getStoredCredentials', () => {
    it('should return stored credentials without apiToken', async () => {
      mockKeychainInstance.getPassword = vi.fn()
        .mockImplementation((service: string, account: string) => {
          const values: Record<string, string> = {
            url: 'https://test.atlassian.net',
            username: 'test@example.com',
            authType: 'cloud',
          };
          return Promise.resolve(values[account]);
        });

      const credentials = await authManager.getStoredCredentials();

      expect(credentials).toEqual({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        authType: 'cloud',
      });
    });

    it('should return null when no credentials stored', async () => {
      mockKeychainInstance.getPassword = vi.fn().mockResolvedValue(null);

      const credentials = await authManager.getStoredCredentials();

      expect(credentials).toBeNull();
    });
  });
});
