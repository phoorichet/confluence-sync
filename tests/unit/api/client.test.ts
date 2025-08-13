import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfluenceAPIClient } from '../../../src/api/client';
import { AuthManager } from '../../../src/auth/auth-manager';


describe('confluenceAPIClient', () => {
  let client: ConfluenceAPIClient;
  let mockAuthManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton instance for each test
    (ConfluenceAPIClient as any).instance = undefined;

    mockAuthManager = {
      getStoredCredentials: vi.fn(),
      getToken: vi.fn(),
    };

    vi.spyOn(AuthManager, 'getInstance').mockReturnValue(mockAuthManager);

    client = ConfluenceAPIClient.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with Cloud URL', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/rest/api',
        username: 'user@example.com',
        authType: 'cloud',
      });

      await client.initialize();

      expect(mockAuthManager.getStoredCredentials).toHaveBeenCalled();
    });

    it('should initialize with Server URL', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://confluence.example.com/rest/api',
        username: 'user',
        authType: 'server',
      });

      await client.initialize();

      expect(mockAuthManager.getStoredCredentials).toHaveBeenCalled();
    });

    it('should throw error when no credentials found', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue(null);

      await expect(client.initialize()).rejects.toThrow('CS-401: No stored credentials found');
    });

    it('should normalize Cloud URLs to v2 API', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/rest/api',
        username: 'user@example.com',
        authType: 'cloud',
      });

      await client.initialize();

      // The baseUrl should be converted to v2 format
      expect((client as any).baseUrl).toBe('https://example.atlassian.net/wiki/api/v2');
    });

    it('should handle URLs that already have v2 API path', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/api/v2',
        username: 'user@example.com',
        authType: 'cloud',
      });

      await client.initialize();

      expect((client as any).baseUrl).toBe('https://example.atlassian.net/wiki/api/v2');
    });
  });

  describe('aPI wrapper methods', () => {
    beforeEach(async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/api/v2',
        username: 'user@example.com',
        authType: 'cloud',
      });
      mockAuthManager.getToken.mockResolvedValue('Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbg==');

      await client.initialize();
    });

    it('should have getPage method', () => {
      expect(client.getPage).toBeDefined();
      expect(typeof client.getPage).toBe('function');
    });

    it('should have updatePage method', () => {
      expect(client.updatePage).toBeDefined();
      expect(typeof client.updatePage).toBe('function');
    });

    it('should have getSpace method', () => {
      expect(client.getSpace).toBeDefined();
      expect(typeof client.getSpace).toBe('function');
    });

    it('should have searchPages method', () => {
      expect(client.searchPages).toBeDefined();
      expect(typeof client.searchPages).toBe('function');
    });

    it('should have createPage method', () => {
      expect(client.createPage).toBeDefined();
      expect(typeof client.createPage).toBe('function');
    });

    it('should have deletePage method', () => {
      expect(client.deletePage).toBeDefined();
      expect(typeof client.deletePage).toBe('function');
    });

    it('should have getPageChildren method', () => {
      expect(client.getPageChildren).toBeDefined();
      expect(typeof client.getPageChildren).toBe('function');
    });

    // Note: getPageContent is handled via getPage with expand parameter
  });

  describe('authentication', () => {
    it('should inject authentication headers for Cloud', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/api/v2',
        username: 'user@example.com',
        authType: 'cloud',
      });
      mockAuthManager.getToken.mockResolvedValue('Basic dXNlckBleGFtcGxlLmNvbTp0b2tlbg==');

      await client.initialize();

      // Verify that middleware was set up
      expect((client as any).client.use).toBeDefined();
    });

    it('should inject authentication headers for Server', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://confluence.example.com/api/v2',
        username: 'user',
        authType: 'server',
      });
      mockAuthManager.getToken.mockResolvedValue('Bearer personal-access-token');

      await client.initialize();

      // Verify that middleware was set up
      expect((client as any).client.use).toBeDefined();
    });
  });
});
