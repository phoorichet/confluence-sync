import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../src/api/client';
import { pullCommand } from '../../../src/commands/pull';
import { ConfluenceToMarkdownConverter } from '../../../src/converters/confluence-to-markdown';
import { FileManager } from '../../../src/storage/file-manager';
import { ManifestManager } from '../../../src/storage/manifest-manager';

// Mock all dependencies
vi.mock('../../../src/api/client', () => ({
  apiClient: {
    initialize: vi.fn(),
    getPage: vi.fn(),
  },
}));
vi.mock('../../../src/converters/confluence-to-markdown');
vi.mock('../../../src/storage/file-manager');
vi.mock('../../../src/storage/manifest-manager');
vi.mock('../../../src/utils/logger');
vi.mock('../../../src/utils/progress', () => ({
  createProgress: () => ({
    start: vi.fn(),
    update: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('pull Command', () => {
  let mockApiClient: any;
  let mockConverter: any;
  let mockFileManager: any;
  let mockManifestManager: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Setup mocks
    mockApiClient = apiClient;
    vi.clearAllMocks();

    mockConverter = {
      convert: vi.fn(),
    };
    vi.mocked(ConfluenceToMarkdownConverter).mockImplementation(() => mockConverter);

    mockFileManager = {
      sanitizeFilename: vi.fn(),
      writeFile: vi.fn(),
      calculateHash: vi.fn(),
    };
    vi.mocked(FileManager).mockImplementation(() => mockFileManager);

    mockManifestManager = {
      updatePage: vi.fn(),
    };
    vi.mocked(ManifestManager.getInstance).mockReturnValue(mockManifestManager);

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should pull a page successfully', async () => {
    // Arrange
    const pageId = '12345';
    const mockPage = {
      id: pageId,
      title: 'Test Page',
      status: 'current',
      spaceId: 'SPACE1',
      version: { number: 1 },
      body: {
        storage: {
          value: '<p>Test content</p>',
          representation: 'storage',
        },
      },
    };

    mockApiClient.getPage.mockResolvedValue(mockPage);
    mockConverter.convert.mockResolvedValue('# Test Page\n\nTest content');
    mockFileManager.sanitizeFilename.mockReturnValue('test-page');
    mockFileManager.writeFile.mockResolvedValue('/current/test-page.md');
    mockFileManager.calculateHash.mockResolvedValue('abc123hash');

    // Act
    await pullCommand.parseAsync(['node', 'test', pageId], { from: 'user' });

    // Assert
    expect(mockApiClient.initialize).toHaveBeenCalled();
    expect(mockApiClient.getPage).toHaveBeenCalledWith(pageId, true);
    expect(mockConverter.convert).toHaveBeenCalledWith('<p>Test content</p>');
    expect(mockFileManager.sanitizeFilename).toHaveBeenCalledWith('Test Page');
    expect(mockFileManager.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'test-page',
      '# Test Page\n\nTest content',
    );
    expect(mockManifestManager.updatePage).toHaveBeenCalledWith({
      id: pageId,
      spaceKey: 'SPACE1',
      title: 'Test Page',
      version: 1,
      parentId: null,
      lastModified: expect.any(Date),
      localPath: 'test-page.md',
      contentHash: 'abc123hash',
      status: 'synced',
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Successfully pulled page "Test Page"'),
    );
  });

  it('should handle invalid page ID', async () => {
    // Arrange
    const pageId = '';

    // Act & Assert
    await expect(pullCommand.parseAsync(['node', 'test', pageId], { from: 'user' })).rejects.toThrow('process.exit called');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('CS-400: Invalid page ID'),
    );
  });

  it('should handle page not found', async () => {
    // Arrange
    const pageId = '99999';
    mockApiClient.getPage.mockResolvedValue(null);

    // Act & Assert
    await expect(pullCommand.parseAsync(['node', 'test', pageId], { from: 'user' })).rejects.toThrow('process.exit called');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('CS-404: Page with ID 99999 not found'),
    );
  });

  it('should handle API errors', async () => {
    // Arrange
    const pageId = '12345';
    mockApiClient.getPage.mockRejectedValue(new Error('CS-500: API Error'));

    // Act & Assert
    await expect(pullCommand.parseAsync(['node', 'test', pageId], { from: 'user' })).rejects.toThrow('process.exit called');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('CS-500: API Error'),
    );
  });

  it('should handle conversion errors', async () => {
    // Arrange
    const pageId = '12345';
    const mockPage = {
      id: pageId,
      title: 'Test Page',
      body: {
        storage: {
          value: '<p>Test content</p>',
        },
      },
    };

    mockApiClient.getPage.mockResolvedValue(mockPage);
    mockConverter.convert.mockRejectedValue(new Error('CS-500: Conversion failed'));

    // Act & Assert
    await expect(pullCommand.parseAsync(['node', 'test', pageId], { from: 'user' })).rejects.toThrow('process.exit called');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('CS-500: Conversion failed'),
    );
  });

  it('should use custom output directory', async () => {
    // Arrange
    const pageId = '12345';
    const customOutput = './docs';
    const mockPage = {
      id: pageId,
      title: 'Test Page',
      body: {
        storage: {
          value: '<p>Test content</p>',
        },
      },
    };

    mockApiClient.getPage.mockResolvedValue(mockPage);
    mockConverter.convert.mockResolvedValue('# Test Page\n\nTest content');
    mockFileManager.sanitizeFilename.mockReturnValue('test-page');
    mockFileManager.writeFile.mockResolvedValue('/current/docs/test-page.md');
    mockFileManager.calculateHash.mockResolvedValue('abc123hash');

    // Act
    await pullCommand.parseAsync(['node', 'test', pageId, '--output', customOutput], { from: 'user' });

    // Assert
    expect(mockFileManager.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('docs'),
      'test-page',
      '# Test Page\n\nTest content',
    );
  });

  it('should handle empty page content', async () => {
    // Arrange
    const pageId = '12345';
    const mockPage = {
      id: pageId,
      title: 'Empty Page',
      body: {
        storage: {
          value: '',
        },
      },
    };

    mockApiClient.getPage.mockResolvedValue(mockPage);
    mockConverter.convert.mockResolvedValue('');
    mockFileManager.sanitizeFilename.mockReturnValue('empty-page');
    mockFileManager.writeFile.mockResolvedValue('/current/empty-page.md');
    mockFileManager.calculateHash.mockResolvedValue('emptyhash');

    // Act
    await pullCommand.parseAsync(['node', 'test', pageId], { from: 'user' });

    // Assert
    expect(mockConverter.convert).toHaveBeenCalledWith('');
    expect(mockFileManager.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'empty-page',
      '',
    );
  });
});
