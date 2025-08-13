import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keychain } from '../../../src/auth/keychain';
import { logger } from '../../../src/utils/logger';

// Mock the keyring module
const mockKeyring = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
};

vi.mock('@zowe/secrets-for-zowe-sdk', () => ({
  keyring: mockKeyring,
}));

describe('keychain', () => {
  let keychain: Keychain;

  beforeEach(() => {
    vi.clearAllMocks();
    keychain = new Keychain();
    
    // Setup logger spies
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  describe('getPassword', () => {
    it('should retrieve password successfully', async () => {
      mockKeyring.getPassword.mockResolvedValue('test-password');

      const password = await keychain.getPassword('service', 'account');

      expect(password).toBe('test-password');
      expect(mockKeyring.getPassword).toHaveBeenCalledWith('service', 'account');
    });

    it('should return null and log error on failure', async () => {
      const error = new Error('Keychain error');
      mockKeyring.getPassword.mockRejectedValue(error);

      const password = await keychain.getPassword('service', 'account');

      expect(password).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Failed to get password:', error);
    });
  });

  describe('setPassword', () => {
    it('should store password successfully', async () => {
      mockKeyring.setPassword.mockResolvedValue(undefined);

      await keychain.setPassword('service', 'account', 'password');

      expect(mockKeyring.setPassword).toHaveBeenCalledWith('service', 'account', 'password');
    });

    it('should throw error on failure', async () => {
      const error = new Error('Failed to store');
      mockKeyring.setPassword.mockRejectedValue(error);

      await expect(keychain.setPassword('service', 'account', 'password')).rejects.toThrow(
        'Failed to set password',
      );
    });
  });

  describe('deletePassword', () => {
    it('should delete password successfully', async () => {
      mockKeyring.deletePassword.mockResolvedValue(true);

      const result = await keychain.deletePassword('service', 'account');

      expect(result).toBe(true);
      expect(mockKeyring.deletePassword).toHaveBeenCalledWith('service', 'account');
    });

    it('should return false and log error on failure', async () => {
      const error = new Error('Delete failed');
      mockKeyring.deletePassword.mockRejectedValue(error);

      const result = await keychain.deletePassword('service', 'account');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to delete password:', error);
    });
  });

  describe('findCredentials', () => {
    it('should find credentials successfully', async () => {
      const mockCredentials = [
        { account: 'user1', password: 'pass1' },
        { account: 'user2', password: 'pass2' },
      ];
      mockKeyring.findCredentials.mockResolvedValue(mockCredentials);

      const credentials = await keychain.findCredentials('service');

      expect(credentials).toEqual(mockCredentials);
      expect(mockKeyring.findCredentials).toHaveBeenCalledWith('service');
    });

    it('should return empty array and log error on failure', async () => {
      const error = new Error('Find failed');
      mockKeyring.findCredentials.mockRejectedValue(error);

      const credentials = await keychain.findCredentials('service');

      expect(credentials).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Failed to find credentials:', error);
    });
  });
});