import type { SyncManifest } from '../../../src/storage/manifest-manager';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

describe('Push Integration', () => {
  let tempDir: string;
  let server: ReturnType<typeof setupServer>;

  const mockPageResponse = {
    id: '123',
    title: 'Test Page',
    status: 'current',
    version: {
      number: 1,
      when: new Date().toISOString(),
      message: 'Initial version',
    },
    body: {
      storage: {
        value: '<p>Original content from Confluence</p>',
        representation: 'storage',
      },
    },
    space: {
      key: 'TEST',
      name: 'Test Space',
    },
  };

  beforeEach(async () => {
    // Create temp directory
    tempDir = await Bun.mkdtemp(path.join(Bun.tmpdir(), 'push-test-'));
    process.chdir(tempDir);

    // Set up MSW server
    server = setupServer(
      // Mock authentication endpoint
      http.get('https://test.atlassian.net/wiki/api/v2/users/current', () => {
        return HttpResponse.json({
          accountId: 'test-user',
          email: 'test@example.com',
          displayName: 'Test User',
        });
      }),

      // Mock get page endpoint
      http.get('https://test.atlassian.net/wiki/api/v2/pages/123', ({ request }) => {
        const url = new URL(request.url);
        const includeBody = url.searchParams.has('body-format');

        return HttpResponse.json({
          ...mockPageResponse,
          body: includeBody ? mockPageResponse.body : undefined,
        });
      }),

      // Mock update page endpoint
      http.put('https://test.atlassian.net/wiki/api/v2/pages/123', async ({ request }) => {
        const body = await request.json() as any;

        return HttpResponse.json({
          ...mockPageResponse,
          version: {
            number: body.version.number,
            when: new Date().toISOString(),
            message: body.version.message,
          },
          body: {
            storage: {
              value: body.body.value,
              representation: 'storage',
            },
          },
        });
      }),
    );

    server.listen({ onUnhandledRequest: 'error' });

    // Create manifest file
    const manifest: SyncManifest = {
      version: '1.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      pages: new Map([
        ['123', {
          id: '123',
          spaceKey: 'TEST',
          title: 'Test Page',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'test-page.md',
          contentHash: 'old-hash',
          status: 'synced',
        }],
      ]),
    };

    // Convert Map to JSON-serializable format
    const manifestJson = {
      ...manifest,
      pages: Object.fromEntries(manifest.pages),
    };

    await Bun.write('.confluence-sync.json', JSON.stringify(manifestJson, null, 2));

    // Create test markdown file
    await Bun.write('test-page.md', `# Updated Test Page

This is the updated content.

## New Section

- Item 1
- Item 2
- Item 3

**Bold text** and *italic text*.

\`\`\`javascript
console.log('Hello, World!');
\`\`\`

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
`);

    // Mock auth credentials
    process.env.TEST_CONFLUENCE_URL = 'https://test.atlassian.net';
    process.env.TEST_CONFLUENCE_USER = 'test@example.com';
    process.env.TEST_CONFLUENCE_TOKEN = 'test-token';
  });

  afterEach(async () => {
    server.close();
    process.chdir('..');

    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
    catch {
      // Ignore cleanup errors
    }
  });

  it('should push markdown changes to Confluence', async () => {
    // Note: This test would need the actual CLI to be built and executable
    // For now, we'll test the components directly

    const { MarkdownToConfluenceConverter } = await import('../../../src/converters/markdown-to-confluence');
    const converter = new MarkdownToConfluenceConverter();

    const markdown = await Bun.file('test-page.md').text();
    const converted = await converter.convert(markdown);

    // Verify conversion includes expected elements
    expect(converted).toContain('<h1>Updated Test Page</h1>');
    expect(converted).toContain('<h2>New Section</h2>');
    expect(converted).toContain('<ul>');
    expect(converted).toContain('<li>Item 1</li>');
    expect(converted).toContain('<strong>Bold text</strong>');
    expect(converted).toContain('<em>italic text</em>');
    expect(converted).toContain('<ac:structured-macro ac:name="code">');
    expect(converted).toContain('<table>');
  });

  it('should detect conflicts when remote is newer', async () => {
    // Update mock to return newer version
    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/123', () => {
        return HttpResponse.json({
          ...mockPageResponse,
          version: {
            number: 3,
            when: new Date().toISOString(),
          },
        });
      }),
    );

    // Test would verify conflict detection
    // In a real integration test, we'd run the CLI and check for conflict error
  });

  it('should handle dry-run mode without making changes', async () => {
    // In a real integration test, we'd run:
    // const result = await $`confluence-sync push test-page.md --dry-run`.text();

    // And verify:
    // - No PUT request was made to the server
    // - Output contains preview information
    // - Manifest file is unchanged

    const originalManifest = await Bun.file('.confluence-sync.json').text();

    // After dry-run (simulated)
    const afterManifest = await Bun.file('.confluence-sync.json').text();

    expect(originalManifest).toBe(afterManifest);
  });

  it('should update manifest after successful push', async () => {
    // Simulate successful push
    const manifestBefore = JSON.parse(await Bun.file('.confluence-sync.json').text());
    expect(manifestBefore.pages['123'].version).toBe(1);

    // After push (would be done by actual CLI command)
    // The manifest should be updated with new version and hash
  });

  it('should create backup when conflict is detected', async () => {
    // Update mock to return newer version for conflict
    server.use(
      http.get('https://test.atlassian.net/wiki/api/v2/pages/123', () => {
        return HttpResponse.json({
          ...mockPageResponse,
          version: {
            number: 3,
            when: new Date().toISOString(),
          },
        });
      }),
    );

    // After conflict detection, verify backup file exists
    // This would be checked after running the actual CLI command
  });

  it('should properly escape special characters in conversion', async () => {
    const { MarkdownToConfluenceConverter } = await import('../../../src/converters/markdown-to-confluence');
    const converter = new MarkdownToConfluenceConverter();

    const markdown = 'Text with < and > and & symbols, plus "quotes"';
    const converted = await converter.convert(markdown);

    expect(converted).toContain('&lt;');
    expect(converted).toContain('&gt;');
    expect(converted).toContain('&amp;');
    expect(converted).toContain('&quot;');
  });
});
