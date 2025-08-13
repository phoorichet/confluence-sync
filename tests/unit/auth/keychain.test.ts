import { keyring } from '@zowe/secrets-for-zowe-sdk';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keychain } from '../../../src/auth/keychain';
import { logger } from '../../../src/utils/logger';

// Mock the keyring module
vi.mock('@zowe/secrets-for-zowe-sdk', () => ({
  keyring: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
    findCredentials: vi.fn(),
  },
}));

describe('keychain', () => {
  let keychain: Keychain;
  let mockKeyring: typeof keyring;

  beforeEach(() => {
    vi.clearAllMocks();
    keychain = new Keychain();
    mockKeyring = keyring as any;

    // Setup logger spies
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  describe('getPassword', () => {
    it('should retrieve password successfully', async () => {
      (mockKeyring.getPassword as any).mockResolvedValue('test-password');

      const password = await keychain.getPassword('service', 'account');

      expect(password).toBe('test-password');
      expect(mockKeyring.getPassword).toHaveBeenCalledWith('service', 'account');
    });

    it('should return null and log error on failure', async () => {
      const error = new Error('Keychain error');
      (mockKeyring.getPassword as any).mockRejectedValue(error);

      const password = await keychain.getPassword('service', 'account');

      expect(password).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('CS-500: Failed to retrieve password from keychain', error);
    });
  });

  describe('setPassword', () => {
    it('should store password successfully', async () => {
      (mockKeyring.setPassword as any).mockResolvedValue(undefined);

      await keychain.setPassword('service', 'account', 'password');

      expect(mockKeyring.setPassword).toHaveBeenCalledWith('service', 'account', 'password');
    });

    it('should throw error on failure', async () => {
      const error = new Error('Failed to store');
      (mockKeyring.setPassword as any).mockRejectedValue(error);

      await expect(keychain.setPassword('service', 'account', 'password')).rejects.toThrow(
        'CS-500: Failed to store credentials',
      );
    });
  });

  describe('deletePassword', () => {
    it('should delete password successfully', async () => {
      (mockKeyring.deletePassword as any).mockResolvedValue(true);

      const result = await keychain.deletePassword('service', 'account');

      expect(result).toBe(true);
      expect(mockKeyring.deletePassword).toHaveBeenCalledWith('service', 'account');
    });

    it('should return false and log error on failure', async () => {
      const error = new Error('Delete failed');
      (mockKeyring.deletePassword as any).mockRejectedValue(error);

      const result = await keychain.deletePassword('service', 'account');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('CS-500: Failed to delete password from keychain', error);
    });
  });

  describe('findCredentials', () => {
    it('should find credentials successfully', async () => {
      const mockCredentials = [
        { account: 'user1', password: 'pass1' },
        { account: 'user2', password: 'pass2' },
      ];
      (mockKeyring.findCredentials as any).mockResolvedValue(mockCredentials);

      const credentials = await keychain.findCredentials('service');

      expect(credentials).toEqual(mockCredentials);
      expect(mockKeyring.findCredentials).toHaveBeenCalledWith('service');
    });

    it('should return empty array and log error on failure', async () => {
      const error = new Error('Find failed');
      (mockKeyring.findCredentials as any).mockRejectedValue(error);

      const credentials = await keychain.findCredentials('service');

      expect(credentials).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('CS-500: Failed to find credentials in keychain', error);
    });
  });
});
