import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../../../src/auth/auth-manager';
import { pullCommand } from '../../../src/commands/pull';

// Mock AuthManager
vi.mock('../../../src/auth/auth-manager');

// Create MSW server for mocking Confluence API
const server = setupServer();

describe('pull Command Integration', () => {
  let tempDir: string;
  let program: Command;
  let mockAuthManager: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    // Setup temp directory
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confluence-sync-test-'));
    process.chdir(tempDir);

    // Setup MSW server
    server.listen({ onUnhandledRequest: 'error' });

    // Mock AuthManager
    mockAuthManager = {
      getStoredCredentials: vi.fn().mockResolvedValue({
        url: 'https://test.atlassian.net/wiki/api/v2',
        username: 'test@example.com',
        authType: 'cloud',
      }),
      getToken: vi.fn().mockResolvedValue('Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu'),
    };
    vi.mocked(AuthManager.getInstance).mockReturnValue(mockAuthManager);

    // Setup Commander program
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    program.addCommand(pullCommand);

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Cleanup
    server.resetHandlers();
    server.close();

    // Remove temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });

    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should pull a simple page successfully', async () => {
    // Arrange
    const pageId = '12345';
    const pageData = {
      id: pageId,
      status: 'current',
      title: 'Test Page',
      spaceId: 'SPACE1',
      version: {
        number: 1,
        message: 'Initial version',
      },
      body: {
        storage: {
          value: '<h1>Test Page</h1><p>This is a test page content.</p>',
          representation: 'storage',
        },
      },
    };

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', ({ params }) => {
        if (params.id === pageId) {
          return HttpResponse.json(pageData);
        }
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }),
    );

    // Act
    await program.parseAsync(['node', 'test', 'pull', pageId]);

    // Assert
    // Check that file was created
    const expectedFile = path.join(tempDir, 'test-page.md');
    expect(fs.existsSync(expectedFile)).toBe(true);

    // Check file content
    const content = fs.readFileSync(expectedFile, 'utf-8');
    expect(content).toContain('# Test Page');
    expect(content).toContain('This is a test page content.');

    // Check manifest was created
    const manifestPath = path.join(tempDir, '.confluence-sync.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.pages).toBeDefined();
    expect(manifest.pages).toHaveLength(1);
    expect(manifest.pages[0][0]).toBe(pageId);
    expect(manifest.pages[0][1].title).toBe('Test Page');
    expect(manifest.pages[0][1].status).toBe('synced');

    // Check success message
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Successfully pulled page "Test Page"'),
    );
  });

  it('should pull page with complex formatting', async () => {
    // Arrange
    const pageId = '67890';
    const complexContent = `
      <h1>Main Title</h1>
      <p>Introduction paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
      <h2>Section 1</h2>
      <ul>
        <li>First item</li>
        <li>Second item with <code>inline code</code></li>
        <li>Third item
          <ul>
            <li>Nested item 1</li>
            <li>Nested item 2</li>
          </ul>
        </li>
      </ul>
      <h2>Section 2</h2>
      <ol>
        <li>Numbered item 1</li>
        <li>Numbered item 2</li>
      </ol>
      <pre><code class="language-javascript">function hello() {
  console.log("Hello, World!");
}</code></pre>
      <p>Conclusion with a <a href="https://example.com">link</a>.</p>
    `;

    const pageData = {
      id: pageId,
      status: 'current',
      title: 'Complex Page',
      spaceId: 'SPACE1',
      version: { number: 2 },
      body: {
        storage: {
          value: complexContent,
          representation: 'storage',
        },
      },
    };

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', ({ params }) => {
        if (params.id === pageId) {
          return HttpResponse.json(pageData);
        }
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }),
    );

    // Act
    await program.parseAsync(['node', 'test', 'pull', pageId]);

    // Assert
    const expectedFile = path.join(tempDir, 'complex-page.md');
    expect(fs.existsSync(expectedFile)).toBe(true);

    const content = fs.readFileSync(expectedFile, 'utf-8');

    // Check various formatting elements
    expect(content).toContain('# Main Title');
    expect(content).toContain('## Section 1');
    expect(content).toContain('**bold**');
    expect(content).toContain('*italic*');
    expect(content).toContain('`inline code`');
    expect(content).toContain('- First item');
    expect(content).toContain('1. Numbered item 1');
    expect(content).toContain('```javascript');
    expect(content).toContain('function hello()');
    expect(content).toContain('[link](https://example.com)');
  });

  it('should pull page with Confluence-specific elements', async () => {
    // Arrange
    const pageId = '11111';
    const confluenceContent = `
      <ac:structured-macro ac:name="code">
        <ac:parameter ac:name="language">python</ac:parameter>
        <ac:plain-text-body><![CDATA[def greet(name):
    print(f"Hello, {name}!")]]></ac:plain-text-body>
      </ac:structured-macro>
      <p>Use <ac:emoticon ac:name="thumbs-up"/> for approval!</p>
      <ac:link>
        <ri:page ri:content-title="Other Page"/>
        <ac:plain-text-link-body><![CDATA[See other page]]></ac:plain-text-link-body>
      </ac:link>
    `;

    const pageData = {
      id: pageId,
      status: 'current',
      title: 'Confluence Elements',
      spaceId: 'SPACE1',
      version: { number: 1 },
      body: {
        storage: {
          value: confluenceContent,
          representation: 'storage',
        },
      },
    };

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', ({ params }) => {
        if (params.id === pageId) {
          return HttpResponse.json(pageData);
        }
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }),
    );

    // Act
    await program.parseAsync(['node', 'test', 'pull', pageId]);

    // Assert
    const expectedFile = path.join(tempDir, 'confluence-elements.md');
    expect(fs.existsSync(expectedFile)).toBe(true);

    const content = fs.readFileSync(expectedFile, 'utf-8');

    // Check Confluence-specific conversions
    expect(content).toContain('```python');
    expect(content).toContain('def greet(name):');
    expect(content).toContain('👍'); // Thumbs-up emoji
    expect(content).toContain('[See other page](#Other Page)');
  });

  it('should handle custom output directory', async () => {
    // Arrange
    const pageId = '22222';
    const outputDir = 'docs/pulled';

    const pageData = {
      id: pageId,
      status: 'current',
      title: 'Output Test',
      spaceId: 'SPACE1',
      version: { number: 1 },
      body: {
        storage: {
          value: '<p>Test content</p>',
          representation: 'storage',
        },
      },
    };

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', () => {
        return HttpResponse.json(pageData);
      }),
    );

    // Act
    await program.parseAsync(['node', 'test', 'pull', pageId, '--output', outputDir]);

    // Assert
    const expectedFile = path.join(tempDir, outputDir, 'output-test.md');
    expect(fs.existsSync(expectedFile)).toBe(true);
  });

  it('should create backup when pulling existing file', async () => {
    // Arrange
    const pageId = '33333';
    const existingContent = '# Old Content\n\nThis is the old content.';
    const filename = 'existing-page.md';

    // Create existing file
    fs.writeFileSync(path.join(tempDir, filename), existingContent, 'utf-8');

    const pageData = {
      id: pageId,
      status: 'current',
      title: 'Existing Page',
      spaceId: 'SPACE1',
      version: { number: 2 },
      body: {
        storage: {
          value: '<h1>New Content</h1><p>This is the new content.</p>',
          representation: 'storage',
        },
      },
    };

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', () => {
        return HttpResponse.json(pageData);
      }),
    );

    // Act
    await program.parseAsync(['node', 'test', 'pull', pageId]);

    // Assert
    // Check that new file exists
    const newFile = path.join(tempDir, filename);
    expect(fs.existsSync(newFile)).toBe(true);

    const newContent = fs.readFileSync(newFile, 'utf-8');
    expect(newContent).toContain('# New Content');
    expect(newContent).toContain('This is the new content.');

    // Check that backup was created
    const files = fs.readdirSync(tempDir);
    const backupFiles = files.filter(f => f.includes('backup'));
    expect(backupFiles.length).toBeGreaterThan(0);

    const backupContent = fs.readFileSync(path.join(tempDir, backupFiles[0]), 'utf-8');
    expect(backupContent).toBe(existingContent);
  });

  it('should handle page not found error', async () => {
    // Arrange
    const pageId = '99999';

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', () => {
        return HttpResponse.json(
          { error: 'Page not found' },
          { status: 404 },
        );
      }),
    );

    // Act & Assert
    await expect(
      program.parseAsync(['node', 'test', 'pull', pageId]),
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Failed to get page'),
    );
  });

  it('should handle authentication error', async () => {
    // Arrange
    const pageId = '12345';

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', () => {
        return HttpResponse.json(
          { error: 'Unauthorized' },
          { status: 401 },
        );
      }),
    );

    // Act & Assert
    await expect(
      program.parseAsync(['node', 'test', 'pull', pageId]),
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should handle rate limiting', async () => {
    // Arrange
    const pageId = '12345';

    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:id', () => {
        return HttpResponse.json(
          { error: 'Rate limit exceeded' },
          {
            status: 429,
            headers: {
              'Retry-After': '60',
            },
          },
        );
      }),
    );

    // Act & Assert
    await expect(
      program.parseAsync(['node', 'test', 'pull', pageId]),
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
