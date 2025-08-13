import { z } from 'zod';

// Format options for markdown conversion
export const formatOptionsSchema = z.object({
  preserveTables: z.boolean().default(true),
  preserveCodeBlocks: z.boolean().default(true),
  preserveLinks: z.boolean().default(true),
  preserveImages: z.boolean().default(true),
  preserveMacros: z.boolean().default(false),
}).default(() => ({
  preserveTables: true,
  preserveCodeBlocks: true,
  preserveLinks: true,
  preserveImages: true,
  preserveMacros: false,
}));

// Individual profile configuration
export const profileConfigSchema = z.object({
  confluenceUrl: z.string().url('Invalid Confluence URL'),
  spaceKey: z.string().min(1, 'Space key is required'),
  authType: z.enum(['token', 'oauth', 'basic']).default('token'),
  concurrentOperations: z.number().min(1).max(10).default(5),
  conflictStrategy: z.enum(['manual', 'local-first', 'remote-first']).default('manual'),
  includePatterns: z.array(z.string()).default(['**/*.md']),
  excludePatterns: z.array(z.string()).default(['**/node_modules/**', '**/.git/**']),
  formatOptions: formatOptionsSchema.optional(),
  cacheEnabled: z.boolean().default(true),
  // Profile-specific auth settings (optional, can be overridden by env vars)
  username: z.string().optional(),
  // Note: token/password should be stored in keychain, not config file
});

// Shared configuration that applies to all profiles
export const sharedConfigSchema = z.object({
  concurrentOperations: z.number().min(1).max(10).optional(),
  conflictStrategy: z.enum(['manual', 'local-first', 'remote-first']).optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  formatOptions: z.object({
    preserveTables: z.boolean().optional(),
    preserveCodeBlocks: z.boolean().optional(),
    preserveLinks: z.boolean().optional(),
    preserveImages: z.boolean().optional(),
    preserveMacros: z.boolean().optional(),
  }).optional(),
  cacheEnabled: z.boolean().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  retryAttempts: z.number().min(0).max(5).default(3),
  retryDelay: z.number().min(100).max(10000).default(1000),
});

// Main configuration file schema
export const configFileSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  defaultProfile: z.string().optional(),
  profiles: z.record(z.string(), profileConfigSchema),
  shared: sharedConfigSchema.optional(),
});

// Runtime configuration (merged result of profile + shared + env vars)
export const syncConfigSchema = z.object({
  // Active profile name
  profile: z.string(),
  // All fields from profile config
  confluenceUrl: z.string().url(),
  spaceKey: z.string(),
  authType: z.enum(['token', 'oauth', 'basic']),
  concurrentOperations: z.number().min(1).max(10),
  conflictStrategy: z.enum(['manual', 'local-first', 'remote-first']),
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  formatOptions: formatOptionsSchema,
  cacheEnabled: z.boolean(),
  // Additional runtime fields
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  retryAttempts: z.number(),
  retryDelay: z.number(),
  username: z.string().optional(),
});

// Types exported from schemas
export type FormatOptions = z.infer<typeof formatOptionsSchema>;
export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type SharedConfig = z.infer<typeof sharedConfigSchema>;
export type ConfigFile = z.infer<typeof configFileSchema>;
export type SyncConfig = z.infer<typeof syncConfigSchema>;

// Validation error codes
export const CONFIG_ERROR_CODES = {
  INVALID_FORMAT: 'CS-1201',
  MISSING_REQUIRED: 'CS-1202',
  INVALID_PROFILE: 'CS-1203',
  FILE_NOT_FOUND: 'CS-1204',
  PARSE_ERROR: 'CS-1205',
  VALIDATION_ERROR: 'CS-1206',
  MIGRATION_ERROR: 'CS-1207',
  PROFILE_NOT_FOUND: 'CS-1208',
  ENV_VAR_INVALID: 'CS-1209',
} as const;

// Custom error class for configuration errors
export class ConfigError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(`[${code}] ${message}`);
    this.name = 'ConfigError';
    this.code = code;
    this.details = details;

    // Ensures proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

// Helper function to create config error messages
export function createConfigError(code: string, message: string, details?: unknown): ConfigError {
  return new ConfigError(code, message, details);
}
