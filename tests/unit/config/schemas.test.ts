import { describe, expect, it } from 'vitest';
import {
  CONFIG_ERROR_CODES,
  configFileSchema,
  createConfigError,
  formatOptionsSchema,
  profileConfigSchema,
  sharedConfigSchema,
  syncConfigSchema,
} from '../../../src/config/schemas.ts';

describe('configuration Schemas', () => {
  describe('formatOptionsSchema', () => {
    it('should parse valid format options', () => {
      const valid = {
        preserveTables: true,
        preserveCodeBlocks: false,
        preserveLinks: true,
        preserveImages: false,
        preserveMacros: true,
      };
      const result = formatOptionsSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should use defaults for missing fields', () => {
      const result = formatOptionsSchema.parse({});
      expect(result).toEqual({
        preserveTables: true,
        preserveCodeBlocks: true,
        preserveLinks: true,
        preserveImages: true,
        preserveMacros: false,
      });
    });
  });

  describe('profileConfigSchema', () => {
    it('should parse valid profile configuration', () => {
      const valid = {
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: 'TEST',
        authType: 'token' as const,
        concurrentOperations: 3,
        conflictStrategy: 'local-first' as const,
        includePatterns: ['**/*.md', '**/*.markdown'],
        excludePatterns: ['**/node_modules/**'],
        cacheEnabled: false,
      };
      const result = profileConfigSchema.parse(valid);
      expect(result).toMatchObject(valid);
    });

    it('should validate confluenceUrl format', () => {
      const invalid = {
        confluenceUrl: 'not-a-url',
        spaceKey: 'TEST',
      };
      expect(() => profileConfigSchema.parse(invalid)).toThrow();
    });

    it('should require spaceKey', () => {
      const invalid = {
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: '',
      };
      expect(() => profileConfigSchema.parse(invalid)).toThrow();
    });

    it('should validate authType enum', () => {
      const invalid = {
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: 'TEST',
        authType: 'invalid',
      };
      expect(() => profileConfigSchema.parse(invalid)).toThrow();
    });

    it('should validate concurrentOperations range', () => {
      const tooLow = {
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: 'TEST',
        concurrentOperations: 0,
      };
      expect(() => profileConfigSchema.parse(tooLow)).toThrow();

      const tooHigh = {
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: 'TEST',
        concurrentOperations: 11,
      };
      expect(() => profileConfigSchema.parse(tooHigh)).toThrow();
    });

    it('should use defaults for optional fields', () => {
      const minimal = {
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: 'TEST',
      };
      const result = profileConfigSchema.parse(minimal);
      expect(result.authType).toBe('token');
      expect(result.concurrentOperations).toBe(5);
      expect(result.conflictStrategy).toBe('manual');
      expect(result.includePatterns).toEqual(['**/*.md']);
      expect(result.excludePatterns).toEqual(['**/node_modules/**', '**/.git/**']);
      expect(result.cacheEnabled).toBe(true);
    });
  });

  describe('sharedConfigSchema', () => {
    it('should parse valid shared configuration', () => {
      const valid = {
        concurrentOperations: 3,
        conflictStrategy: 'remote-first' as const,
        logLevel: 'debug' as const,
        retryAttempts: 2,
        retryDelay: 500,
      };
      const result = sharedConfigSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should allow all fields to be optional', () => {
      const result = sharedConfigSchema.parse({});
      expect(result).toEqual({
        logLevel: 'info',
        retryAttempts: 3,
        retryDelay: 1000,
      });
    });

    it('should validate logLevel enum', () => {
      const invalid = {
        logLevel: 'verbose',
      };
      expect(() => sharedConfigSchema.parse(invalid)).toThrow();
    });

    it('should validate retryAttempts range', () => {
      const tooLow = { retryAttempts: -1 };
      expect(() => sharedConfigSchema.parse(tooLow)).toThrow();

      const tooHigh = { retryAttempts: 6 };
      expect(() => sharedConfigSchema.parse(tooHigh)).toThrow();
    });

    it('should validate retryDelay range', () => {
      const tooLow = { retryDelay: 50 };
      expect(() => sharedConfigSchema.parse(tooLow)).toThrow();

      const tooHigh = { retryDelay: 15000 };
      expect(() => sharedConfigSchema.parse(tooHigh)).toThrow();
    });
  });

  describe('configFileSchema', () => {
    it('should parse valid configuration file', () => {
      const valid = {
        version: '1.0.0',
        defaultProfile: 'production',
        profiles: {
          production: {
            confluenceUrl: 'https://prod.atlassian.net',
            spaceKey: 'PROD',
          },
          staging: {
            confluenceUrl: 'https://staging.atlassian.net',
            spaceKey: 'STAGE',
          },
        },
        shared: {
          logLevel: 'info' as const,
        },
      };
      const result = configFileSchema.parse(valid);
      expect(result.version).toBe('1.0.0');
      expect(result.defaultProfile).toBe('production');
      expect(Object.keys(result.profiles)).toEqual(['production', 'staging']);
    });

    it('should validate version format', () => {
      const invalid = {
        version: '1.0',
        profiles: {},
      };
      expect(() => configFileSchema.parse(invalid)).toThrow();
    });

    it('should require version field', () => {
      const invalid = {
        profiles: {
          test: {
            confluenceUrl: 'https://test.atlassian.net',
            spaceKey: 'TEST',
          },
        },
      };
      expect(() => configFileSchema.parse(invalid)).toThrow();
    });

    it('should require profiles object', () => {
      const invalid = {
        version: '1.0.0',
      };
      expect(() => configFileSchema.parse(invalid)).toThrow();
    });

    it('should allow defaultProfile to be optional', () => {
      const valid = {
        version: '1.0.0',
        profiles: {
          test: {
            confluenceUrl: 'https://test.atlassian.net',
            spaceKey: 'TEST',
          },
        },
      };
      const result = configFileSchema.parse(valid);
      expect(result.defaultProfile).toBeUndefined();
    });
  });

  describe('syncConfigSchema', () => {
    it('should parse valid runtime configuration', () => {
      const valid = {
        profile: 'production',
        confluenceUrl: 'https://example.atlassian.net',
        spaceKey: 'TEST',
        authType: 'oauth' as const,
        concurrentOperations: 5,
        conflictStrategy: 'manual' as const,
        includePatterns: ['**/*.md'],
        excludePatterns: ['**/node_modules/**'],
        formatOptions: {},
        cacheEnabled: true,
        logLevel: 'info' as const,
        retryAttempts: 3,
        retryDelay: 1000,
      };
      const result = syncConfigSchema.parse(valid);
      expect(result).toMatchObject(valid);
    });

    it('should require all profile fields', () => {
      const invalid = {
        profile: 'test',
        confluenceUrl: 'https://example.atlassian.net',
        // Missing required fields
      };
      expect(() => syncConfigSchema.parse(invalid)).toThrow();
    });
  });

  describe('createConfigError', () => {
    it('should create error with code', () => {
      const error = createConfigError(
        CONFIG_ERROR_CODES.FILE_NOT_FOUND,
        'Configuration file not found',
      );
      expect(error.message).toBe('[CS-1204] Configuration file not found');
    });

    it('should attach details to error', () => {
      const details = { file: '/path/to/config.json' };
      const error = createConfigError(
        CONFIG_ERROR_CODES.PARSE_ERROR,
        'Parse failed',
        details,
      );
      expect(error.message).toBe('[CS-1205] Parse failed');
      expect((error as any).details).toEqual(details);
    });
  });
});
