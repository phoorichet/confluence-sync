import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { pullCommand } from '../../../src/commands/pull';

describe('pull Command', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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

  describe('space pull', () => {
    it('should pull all pages from a space', async () => {
      // Arrange
      const spaceKey = 'TEST';
      const mockSpace = {
        key: spaceKey,
        name: 'Test Space',
        type: 'global',
        id: 'space123',
      };

      const mockPages = [
        {
          id: '1',
          title: 'Page 1',
          body: { storage: { value: '<p>Content 1</p>' } },
          version: { number: 1 },
        },
        {
          id: '2',
          title: 'Page 2',
          body: { storage: { value: '<p>Content 2</p>' } },
          version: { number: 2 },
        },
      ];

      mockApiClient.getSpaceDetails.mockResolvedValue(mockSpace);
      mockApiClient.getSpacePages.mockResolvedValue({
        results: mockPages,
        size: 2,
      });
      mockConverter.convert.mockImplementation(html => `Converted: ${html}`);
      mockFileManager.sanitizeFilename.mockImplementation(title => title.toLowerCase().replace(' ', '-'));
      mockFileManager.writeFile.mockImplementation(path => Promise.resolve(path));
      mockFileManager.calculateHash.mockReturnValue('hash123');

      // Act
      await pullCommand.parseAsync(['node', 'test', '--space', spaceKey], { from: 'user' });

      // Assert
      expect(mockApiClient.getSpaceDetails).toHaveBeenCalledWith(spaceKey);
      expect(mockApiClient.getSpacePages).toHaveBeenCalledWith(spaceKey, { start: 0, limit: 250 });
      expect(mockManifestManager.updateSpace).toHaveBeenCalledWith(
        expect.objectContaining({
          key: spaceKey,
          name: 'Test Space',
        }),
      );
      expect(mockManifestManager.updatePage).toHaveBeenCalledTimes(2);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(`Successfully pulled 2 pages from space ${spaceKey}`),
      );
    });

    it('should handle space not found', async () => {
      // Arrange
      const spaceKey = 'NOTFOUND';
      mockApiClient.getSpaceDetails.mockResolvedValue(null);

      // Act & Assert
      await expect(
        pullCommand.parseAsync(['node', 'test', '--space', spaceKey], { from: 'user' }),
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(`CS-803: Space with key ${spaceKey} not found`),
      );
    });

    it('should handle empty space', async () => {
      // Arrange
      const spaceKey = 'EMPTY';
      const mockSpace = {
        key: spaceKey,
        name: 'Empty Space',
        type: 'global',
      };

      mockApiClient.getSpaceDetails.mockResolvedValue(mockSpace);
      mockApiClient.getSpacePages.mockResolvedValue({
        results: [],
        size: 0,
      });

      // Act
      await pullCommand.parseAsync(['node', 'test', '--space', spaceKey], { from: 'user' });

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(`No pages found in space ${spaceKey}`),
      );
    });
  });

  describe('recursive pull', () => {
    it('should pull a page and its children recursively', async () => {
      // Arrange
      const pageId = '100';
      const mockParentPage = {
        id: pageId,
        title: 'Parent Page',
        body: { storage: { value: '<p>Parent content</p>' } },
        version: { number: 1 },
      };

      const mockChildren = [
        {
          id: '101',
          title: 'Child 1',
          body: { storage: { value: '<p>Child 1 content</p>' } },
          version: { number: 1 },
        },
        {
          id: '102',
          title: 'Child 2',
          body: { storage: { value: '<p>Child 2 content</p>' } },
          version: { number: 1 },
        },
      ];

      mockApiClient.getPage.mockResolvedValue(mockParentPage);
      mockApiClient.getPageChildren.mockImplementation((id) => {
        if (id === pageId)
          return Promise.resolve(mockChildren);
        return Promise.resolve([]);
      });

      mockConverter.convert.mockImplementation(html => `Converted: ${html}`);
      mockFileManager.sanitizeFilename.mockImplementation(title => title.toLowerCase().replace(' ', '-'));
      mockFileManager.writeFile.mockImplementation(path => Promise.resolve(path));
      mockFileManager.calculateHash.mockReturnValue('hash123');

      // Act
      await pullCommand.parseAsync(['node', 'test', pageId, '--recursive'], { from: 'user' });

      // Assert
      expect(mockApiClient.getPage).toHaveBeenCalledWith(pageId, true);
      expect(mockApiClient.getPageChildren).toHaveBeenCalledWith(pageId);
      expect(mockManifestManager.updatePage).toHaveBeenCalledTimes(3); // Parent + 2 children
    });

    it('should respect max depth limit', async () => {
      // Arrange
      const pageId = '200';
      const mockPage = {
        id: pageId,
        title: 'Root Page',
        body: { storage: { value: '<p>Root content</p>' } },
        version: { number: 1 },
      };

      const mockChildren = [
        { id: '201', title: 'Child 1' },
      ];

      mockApiClient.getPage.mockResolvedValue(mockPage);
      mockApiClient.getPageChildren.mockResolvedValue(mockChildren);

      mockConverter.convert.mockReturnValue('Converted content');
      mockFileManager.sanitizeFilename.mockReturnValue('filename');
      mockFileManager.writeFile.mockResolvedValue('/path/to/file');
      mockFileManager.calculateHash.mockReturnValue('hash');

      // Act - with max depth of 1
      await pullCommand.parseAsync(
        ['node', 'test', pageId, '--recursive', '--max-depth', '1'],
        { from: 'user' },
      );

      // Assert - should only call getPage once for root (depth 0)
      expect(mockApiClient.getPage).toHaveBeenCalledTimes(1);
      expect(mockApiClient.getPageChildren).toHaveBeenCalledTimes(1);
    });
  });

  it('should reject when both pageId and space are provided', async () => {
    // Act & Assert
    await expect(
      pullCommand.parseAsync(['node', 'test', '123', '--space', 'TEST'], { from: 'user' }),
    ).rejects.toThrow('process.exit called');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('CS-801: Cannot specify both page ID and --space option'),
    );
  });

  it('should reject when neither pageId nor space are provided', async () => {
    // Act & Assert
    await expect(
      pullCommand.parseAsync(['node', 'test'], { from: 'user' }),
    ).rejects.toThrow('process.exit called');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('CS-800: Either a page ID or --space option is required'),
    );
  });
});
