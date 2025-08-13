import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchCommand } from '../../../src/commands/watch';
import { ConfigManager } from '../../../src/config/config-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';
import { FileWatcher } from '../../../src/storage/watcher';
import { SyncEngine } from '../../../src/sync/engine';

describe('watch Command', () => {
  let mockWatcher: any;
  let mockConfigManager: any;
  let mockManifestManager: any;
  let mockSyncEngine: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockWatcher = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnThis(),
    };

    mockConfigManager = {
      loadConfig: vi.fn().mockResolvedValue({
        syncDirectory: '/test/sync',
        confluenceUrl: 'https://test.atlassian.net',
      }),
    };

    mockManifestManager = {
      load: vi.fn().mockResolvedValue(undefined),
      getManifest: vi.fn().mockResolvedValue({
        pages: [],
        version: '1.0.0',
      }),
    };

    mockSyncEngine = {
      sync: vi.fn().mockResolvedValue({
        synced: 1,
        failed: 0,
      }),
    };

    // Setup mock constructors
    (FileWatcher as any).mockImplementation(() => mockWatcher);
    (ConfigManager as any).mockImplementation(() => mockConfigManager);
    (ManifestManager as any).mockImplementation(() => mockManifestManager);
    (SyncEngine as any).mockImplementation(() => mockSyncEngine);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command configuration', () => {
    expect(watchCommand.name()).toBe('watch');
    expect(watchCommand.description()).toBe('Watch for file changes and sync automatically');

    const options = watchCommand.options;
    const optionNames = options.map(opt => opt.long);

    expect(optionNames).toContain('--debounce');
    expect(optionNames).toContain('--retry');
    expect(optionNames).toContain('--no-notifications');
    expect(optionNames).toContain('--verbose');
    expect(optionNames).toContain('--json');
  });

  it('should parse debounce option correctly', () => {
    const debounceOption = watchCommand.options.find(opt => opt.long === '--debounce');
    expect(debounceOption?.defaultValue).toBe('2000');
    expect(debounceOption?.argChoices).toBeUndefined();
  });

  it('should parse retry option correctly', () => {
    const retryOption = watchCommand.options.find(opt => opt.long === '--retry');
    expect(retryOption?.defaultValue).toBe('3');
  });

  it('should have notifications enabled by default', () => {
    const notificationsOption = watchCommand.options.find(opt => opt.long === '--no-notifications');
    expect(notificationsOption).toBeDefined();
  });
});
