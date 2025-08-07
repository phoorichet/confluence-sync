import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, LogLevel } from '../../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let mockConsole: any;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = Logger.getInstance();
    
    mockConsole = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  describe('log levels', () => {
    it('should log debug messages when level is DEBUG', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('test message');
      
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should not log debug messages when level is INFO', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.debug('test message');
      
      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    it('should log info messages when level is INFO', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.info('test message');
      
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should log warn messages when level is WARN', () => {
      logger.setLogLevel(LogLevel.WARN);
      logger.warn('test message');
      
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should log error messages when level is ERROR', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('test message');
      
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('sanitization', () => {
    it('should redact Bearer tokens from strings', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('Error with token', 'Bearer abc123def456');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.any(String),
        '[REDACTED]'
      );
    });

    it('should redact Basic auth from strings', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('Error with auth', 'Basic dGVzdDp0ZXN0');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.any(String),
        '[REDACTED]'
      );
    });

    it('should redact apiToken from JSON strings', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('Error with token', 'apiToken": "secret-token-123"');
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.any(String),
        '[REDACTED]'
      );
    });

    it('should redact sensitive fields from objects', () => {
      logger.setLogLevel(LogLevel.ERROR);
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        apiToken: 'token456',
        secret: 'mysecret',
        apiKey: 'key789',
        normalField: 'visible',
      };
      
      logger.error('Error with object', sensitiveData);
      
      const lastCall = mockConsole.error.mock.calls[0][1];
      expect(lastCall.username).toBe('testuser');
      expect(lastCall.password).toBe('[REDACTED]');
      expect(lastCall.apiToken).toBe('[REDACTED]');
      expect(lastCall.secret).toBe('[REDACTED]');
      expect(lastCall.apiKey).toBe('[REDACTED]');
      expect(lastCall.normalField).toBe('visible');
    });

    it('should handle nested objects', () => {
      logger.setLogLevel(LogLevel.ERROR);
      const nestedData = {
        user: {
          name: 'test',
          credentials: {
            password: 'secret',
            token: 'token123',
          },
        },
      };
      
      logger.error('Error with nested', nestedData);
      
      const lastCall = mockConsole.error.mock.calls[0][1];
      expect(lastCall.user.name).toBe('test');
      expect(lastCall.user.credentials.password).toBe('[REDACTED]');
      expect(lastCall.user.credentials.token).toBe('[REDACTED]');
    });

    it('should not sanitize non-error log levels', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.info('Info with token', 'Bearer abc123');
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.any(String),
        'Bearer abc123'
      );
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});