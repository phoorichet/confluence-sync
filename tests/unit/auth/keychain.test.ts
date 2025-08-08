import { keyring } from '@zowe/secrets-for-zowe-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keychain } from '../../../src/auth/keychain';
import { logger } from '../../../src/utils/logger';

vi.mock('@zowe/secrets-for-zowe-sdk');
vi.mock('../../../src/utils/logger');

describe('keychain', () => {
  let keychain: Keychain;
  let mockKeyring: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();
    keychain = new Keychain();
    mockKeyring = vi.mocked(keyring);
    mockLogger = vi.mocked(logger);
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
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CS-500: Failed to retrieve password from keychain',
        error,
      );
    });
  });

  describe('setPassword', () => {
    it('should store password successfully', async () => {
      mockKeyring.setPassword.mockResolvedValue(undefined);

      await keychain.setPassword('service', 'account', 'password');

      expect(mockKeyring.setPassword).toHaveBeenCalledWith('service', 'account', 'password');
    });

    it('should throw error on failure', async () => {
      const error = new Error('Keychain error');
      mockKeyring.setPassword.mockRejectedValue(error);

      await expect(keychain.setPassword('service', 'account', 'password'))
        .rejects
        .toThrow('CS-500: Failed to store credentials');
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
      const error = new Error('Keychain error');
      mockKeyring.deletePassword.mockRejectedValue(error);

      const result = await keychain.deletePassword('service', 'account');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CS-500: Failed to delete password from keychain',
        error,
      );
    });
  });

  describe('findCredentials', () => {
    it('should find credentials successfully', async () => {
      const credentials = [
        { account: 'account1', password: 'password1' },
        { account: 'account2', password: 'password2' },
      ];
      mockKeyring.findCredentials.mockResolvedValue(credentials);

      const result = await keychain.findCredentials('service');

      expect(result).toEqual(credentials);
      expect(mockKeyring.findCredentials).toHaveBeenCalledWith('service');
    });

    it('should return empty array and log error on failure', async () => {
      const error = new Error('Keychain error');
      mockKeyring.findCredentials.mockRejectedValue(error);

      const result = await keychain.findCredentials('service');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CS-500: Failed to find credentials in keychain',
        error,
      );
    });
  });
});
