import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfluenceAPIClient } from '../../../src/api/client';
import { AuthManager } from '../../../src/auth/auth-manager';
import { CircuitState } from '../../../src/api/circuit-breaker';

// Mock AuthManager
vi.mock('../../../src/auth/auth-manager');

describe('Basic API Client Tests', () => {
  let client: ConfluenceAPIClient;
  let mockAuthManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockAuthManager = {
      getStoredCredentials: vi.fn().mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/api/v2',
        username: 'test@example.com',
        authType: 'cloud',
      }),
      getToken: vi.fn().mockResolvedValue('Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu'),
    };
    
    vi.mocked(AuthManager.getInstance).mockReturnValue(mockAuthManager);
    
    client = new ConfluenceAPIClient();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid credentials', async () => {
      await expect(client.initialize()).resolves.not.toThrow();
    });

    it('should throw error when no credentials found', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue(null);
      
      await expect(client.initialize()).rejects.toThrow('CS-401: No stored credentials found');
    });
  });

  describe('Circuit Breaker', () => {
    it('should have circuit breaker initialized', () => {
      expect(client['circuitBreaker']).toBeDefined();
      expect(client['circuitBreaker'].getState()).toBe(CircuitState.CLOSED);
    });

    it('should have correct circuit breaker configuration', () => {
      const stats = client['circuitBreaker'].getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('Rate Limiter', () => {
    it('should have rate limiter initialized', () => {
      expect(client['rateLimiter']).toBeDefined();
    });

    it('should have correct rate limiter configuration', () => {
      const stats = client['rateLimiter'].getStats();
      expect(stats.requestsPerHour).toBe(5000);
      expect(stats.requestCount).toBe(0);
    });
  });

  describe('Retry Handler', () => {
    it('should have retry handler initialized', () => {
      expect(client['retryHandler']).toBeDefined();
    });
  });

  describe('API Methods', () => {
    it('should expose all required API methods', () => {
      expect(typeof client.getPage).toBe('function');
      expect(typeof client.updatePage).toBe('function');
      expect(typeof client.getSpace).toBe('function');
      expect(typeof client.searchPages).toBe('function');
      expect(typeof client.createPage).toBe('function');
      expect(typeof client.deletePage).toBe('function');
      expect(typeof client.getPageChildren).toBe('function');
      expect(typeof client.getPageContent).toBe('function');
    });
  });

  describe('URL Normalization', () => {
    it('should normalize Cloud URLs to v2 API', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/rest/api',
        username: 'test@example.com',
        authType: 'cloud',
      });
      
      await client.initialize();
      
      expect(client['baseUrl']).toBe('https://example.atlassian.net/wiki/api/v2');
    });

    it('should handle URLs already in v2 format', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://example.atlassian.net/wiki/api/v2',
        username: 'test@example.com',
        authType: 'cloud',
      });
      
      await client.initialize();
      
      expect(client['baseUrl']).toBe('https://example.atlassian.net/wiki/api/v2');
    });

    it('should normalize Server URLs to v2 API', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://confluence.example.com/rest/api',
        username: 'user',
        authType: 'server',
      });
      
      await client.initialize();
      
      expect(client['baseUrl']).toBe('https://confluence.example.com/api/v2');
    });
  });
});