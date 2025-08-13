import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCommand } from '../../../src/commands/search';
import { ConfigManager } from '../../../src/config/config-manager';
import { FilterManager } from '../../../src/storage/filter-manager';
import { SearchService } from '../../../src/sync/search-service';

// Mock modules
vi.mock('../../../src/sync/search-service', () => ({
  SearchService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../../src/storage/filter-manager', () => ({
  FilterManager: {
    getInstance: vi.fn(),
  },
}));

vi.mock('../../../src/config/config-manager', () => ({
  ConfigManager: {
    getInstance: vi.fn(),
  },
}));

describe('search Command', () => {
  let mockSearchService: any;
  let mockFilterManager: any;
  let mockConfigManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSearchService = {
      search: vi.fn().mockResolvedValue([]),
    };

    mockFilterManager = {
      listFilters: vi.fn().mockResolvedValue([]),
      getFilter: vi.fn().mockResolvedValue(null),
      saveFilter: vi.fn().mockResolvedValue(undefined),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigManager = {
      getConfig: vi.fn().mockResolvedValue({
        confluenceUrl: 'https://test.atlassian.net',
        apiToken: 'test-token',
      }),
    };

    (SearchService.getInstance as any).mockReturnValue(mockSearchService);
    (FilterManager.getInstance as any).mockReturnValue(mockFilterManager);
    (ConfigManager.getInstance as any).mockReturnValue(mockConfigManager);
  });

  it('should create search command with correct properties', () => {
    expect(searchCommand.name()).toBe('search');
    expect(searchCommand.description()).toContain('Search for Confluence pages');
  });

  it('should have all required options', () => {
    const options = searchCommand.options;
    const optionNames = options.map((opt: any) => opt.long);

    expect(optionNames).toContain('--author');
    expect(optionNames).toContain('--modified-after');
    expect(optionNames).toContain('--label');
    expect(optionNames).toContain('--space');
    expect(optionNames).toContain('--cql');
    expect(optionNames).toContain('--glob');
    expect(optionNames).toContain('--pull');
    expect(optionNames).toContain('--pull-interactive');
    expect(optionNames).toContain('--save');
    expect(optionNames).toContain('--filter');
    expect(optionNames).toContain('--list-filters');
    expect(optionNames).toContain('--json');
    expect(optionNames).toContain('--limit');
  });

  it('should accept a search query argument', () => {
    // The search command accepts one optional argument (the search query)
    // In Commander.js, registeredArguments contains the argument definitions
    const registeredArgs = searchCommand.registeredArguments;
    expect(registeredArgs.length).toBe(1);
    expect(registeredArgs[0]?.name()).toBe('query');
    expect(registeredArgs[0]?.description).toBe('Search query text');
  });

  it('should parse multiple filter options', () => {
    const args = searchCommand.parse([
      'search',
      '--author',
      'john',
      '--space',
      'DEV',
      'PROD',
      '--label',
      'important',
      'urgent',
    ], { from: 'user' });

    expect(args.opts()).toMatchObject({
      author: 'john',
      space: ['DEV', 'PROD'],
      label: ['important', 'urgent'],
    });
  });
});
