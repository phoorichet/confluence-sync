import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../../../src/auth/auth-manager';
import authCommand from '../../../src/commands/auth';

// Mock AuthManager
vi.mock('../../../src/auth/auth-manager');

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

describe('auth command', () => {
  let mockAuthManager: any;
  let program: Command;
  let mockConsole: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthManager = {
      authenticate: vi.fn(),
      getCurrentUser: vi.fn(),
      getStoredCredentials: vi.fn(),
      validateAuth: vi.fn(),
      clearCredentials: vi.fn(),
      getToken: vi.fn(),
    };

    (AuthManager as any).getInstance = vi.fn().mockReturnValue(mockAuthManager);

    program = new Command();
    program.addCommand(authCommand);

    mockConsole = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
  });

  describe('auth', () => {
    it('should authenticate with provided options', async () => {
      mockAuthManager.authenticate.mockResolvedValue({
        token: 'test-token',
        type: 'basic',
      });

      mockAuthManager.getCurrentUser.mockResolvedValue({
        displayName: 'Test User',
        email: 'test@example.com',
      });

      await program.parseAsync([
        'node',
        'test',
        'auth',
        '--url',
        'https://test.atlassian.net',
        '--email',
        'test@example.com',
        '--token',
        'test-token',
      ]);

      expect(mockAuthManager.authenticate).toHaveBeenCalledWith({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        apiToken: 'test-token',
        authType: 'cloud',
      });
    });

    it('should detect server authentication type', async () => {
      mockAuthManager.authenticate.mockResolvedValue({
        token: 'pat-token',
        type: 'bearer',
      });

      mockAuthManager.getCurrentUser.mockResolvedValue({
        displayName: 'Test User',
      });

      await program.parseAsync([
        'node',
        'test',
        'auth',
        '--url',
        'https://confluence.company.com',
        '--email',
        'testuser',
        '--token',
        'pat-token',
      ]);

      expect(mockAuthManager.authenticate).toHaveBeenCalledWith({
        url: 'https://confluence.company.com',
        username: 'testuser',
        apiToken: 'pat-token',
        authType: 'server',
      });
    });

    it('should handle authentication failure', async () => {
      mockAuthManager.authenticate.mockRejectedValue(new Error('CS-401: Invalid credentials'));

      await expect(
        program.parseAsync([
          'node',
          'test',
          'auth',
          '--url',
          'https://test.atlassian.net',
          '--email',
          'test@example.com',
          '--token',
          'invalid-token',
        ]),
      ).rejects.toThrow('Process exited with code 1');

      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('auth:status', () => {
    it('should show authenticated status', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        authType: 'cloud',
      });

      mockAuthManager.validateAuth.mockResolvedValue(true);

      mockAuthManager.getCurrentUser.mockResolvedValue({
        displayName: 'Test User',
        email: 'test@example.com',
      });

      await program.parseAsync(['node', 'test', 'auth', 'status']);

      expect(mockAuthManager.validateAuth).toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should show not authenticated status', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue(null);

      await program.parseAsync(['node', 'test', 'auth', 'status']);

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should show expired authentication', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        authType: 'cloud',
      });

      mockAuthManager.validateAuth.mockResolvedValue(false);

      await program.parseAsync(['node', 'test', 'auth', 'status']);

      expect(mockAuthManager.validateAuth).toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalled();
    });
  });

  describe('auth:clear', () => {
    it('should clear credentials when confirmed', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        authType: 'cloud',
      });

      const inquirer = await import('inquirer');
      (inquirer.default.prompt as any).mockResolvedValue({ confirm: true });

      mockAuthManager.clearCredentials.mockResolvedValue(undefined);

      await program.parseAsync(['node', 'test', 'auth', 'clear']);

      expect(mockAuthManager.clearCredentials).toHaveBeenCalled();
    });

    it('should not clear credentials when cancelled', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        authType: 'cloud',
      });

      const inquirer = await import('inquirer');
      (inquirer.default.prompt as any).mockResolvedValue({ confirm: false });

      await program.parseAsync(['node', 'test', 'auth', 'clear']);

      expect(mockAuthManager.clearCredentials).not.toHaveBeenCalled();
    });

    it('should handle no stored credentials', async () => {
      mockAuthManager.getStoredCredentials.mockResolvedValue(null);

      await program.parseAsync(['node', 'test', 'auth', 'clear']);

      expect(mockAuthManager.clearCredentials).not.toHaveBeenCalled();
    });
  });
});
