import type { SyncManifest } from '../../../src/storage/manifest-manager';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { statusCommand } from '../../../src/commands/status';

describe('Status Command Integration', () => {
  let tempDir: string;
  let server: ReturnType<typeof setupServer>;
  let consoleLogSpy: any;
  let processExitSpy: any;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await Bun.mkdtemp(path.join(Bun.env.TMPDIR || '/tmp/', 'status-test-'));
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
      http.get('https://test.atlassian.net/wiki/api/v2/pages/:pageId', ({ params }) => {
        const pageId = params.pageId as string;

        if (pageId === '123') {
          return HttpResponse.json({
            id: '123',
            title: 'Test Page 1',
            status: 'current',
            version: {
              number: 2, // Higher version for remote change
              when: new Date().toISOString(),
            },
          });
        }
        else if (pageId === '456') {
          return HttpResponse.json({
            id: '456',
            title: 'Test Page 2',
            status: 'current',
            version: {
              number: 1, // Same version
              when: new Date().toISOString(),
            },
          });
        }
        else if (pageId === '789') {
          return HttpResponse.json({
            id: '789',
            title: 'Test Page 3',
            status: 'current',
            version: {
              number: 3, // Higher version for conflict
              when: new Date().toISOString(),
            },
          });
        }

        return HttpResponse.notFound();
      }),
    );

    server.listen({ onUnhandledRequest: 'error' });

    // Mock console
    consoleLogSpy = Bun.spyOn(console, 'log');
    processExitSpy = Bun.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });
  });

  afterEach(async () => {
    server.close();

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore mocks
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should show status for tracked pages', async () => {
    // Create manifest with test pages
    const manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map([
        ['123', {
          id: '123',
          spaceKey: 'TEST',
          title: 'Test Page 1',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page1.md',
          contentHash: 'hash123',
          status: 'synced',
        }],
        ['456', {
          id: '456',
          spaceKey: 'TEST',
          title: 'Test Page 2',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page2.md',
          contentHash: 'hash456',
          status: 'synced',
        }],
        ['789', {
          id: '789',
          spaceKey: 'TEST',
          title: 'Test Page 3',
          version: 2,
          parentId: null,
          lastModified: new Date(),
          localPath: 'page3.md',
          contentHash: 'hash789',
          status: 'synced',
        }],
      ]),
      config: {
        profile: 'default',
        includePatterns: ['**/*.md'],
        excludePatterns: [],
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        cacheEnabled: true,
      },
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync('.confluence-sync.json', JSON.stringify(manifestData, null, 2));

    // Create local files with different states
    fs.writeFileSync('page1.md', '# Page 1'); // Unchanged (remote has v2)
    fs.writeFileSync('page2.md', '# Page 2 Modified'); // Local change (different hash)
    fs.writeFileSync('page3.md', '# Page 3 Modified'); // Conflict (both changed)

    // Create auth credentials
    fs.mkdirSync(path.join(Bun.env.HOME || '', '.confluence-sync'), { recursive: true });
    fs.writeFileSync(
      path.join(Bun.env.HOME || '', '.confluence-sync', 'auth.json'),
      JSON.stringify({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'test-token',
      }),
    );

    // Run status command
    await statusCommand.parseAsync(['node', 'status']);

    // Check output
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync Status'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Summary:'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Local changes: 1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Remote changes: 1'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Conflicts: 1'));
  });

  it('should output JSON format when requested', async () => {
    // Create manifest with one page
    const manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map([
        ['456', {
          id: '456',
          spaceKey: 'TEST',
          title: 'Test Page',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'test.md',
          contentHash: 'hash456',
          status: 'synced',
        }],
      ]),
      config: {
        profile: 'default',
        includePatterns: ['**/*.md'],
        excludePatterns: [],
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        cacheEnabled: true,
      },
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync('.confluence-sync.json', JSON.stringify(manifestData, null, 2));

    // Create local file
    fs.writeFileSync('test.md', '# Test Page');

    // Create auth credentials
    fs.mkdirSync(path.join(Bun.env.HOME || '', '.confluence-sync'), { recursive: true });
    fs.writeFileSync(
      path.join(Bun.env.HOME || '', '.confluence-sync', 'auth.json'),
      JSON.stringify({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'test-token',
      }),
    );

    // Run status command with --json
    await statusCommand.parseAsync(['node', 'status', '--json']);

    // Check JSON output
    const jsonOutput = consoleLogSpy.mock.calls.find((call: any[]) => {
      try {
        JSON.parse(call[0]);
        return true;
      }
      catch {
        return false;
      }
    });

    expect(jsonOutput).toBeDefined();
    const data = JSON.parse(jsonOutput[0]);
    expect(data).toBeInstanceOf(Array);
    expect(data[0]).toHaveProperty('pageId');
    expect(data[0]).toHaveProperty('state');
    expect(data[0]).toHaveProperty('localPath');
  });

  it('should filter by space when requested', async () => {
    // Create manifest with pages in different spaces
    const manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map([
        ['123', {
          id: '123',
          spaceKey: 'SPACE1',
          title: 'Space 1 Page',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'space1.md',
          contentHash: 'hash123',
          status: 'synced',
        }],
        ['456', {
          id: '456',
          spaceKey: 'SPACE2',
          title: 'Space 2 Page',
          version: 1,
          parentId: null,
          lastModified: new Date(),
          localPath: 'space2.md',
          contentHash: 'hash456',
          status: 'synced',
        }],
      ]),
      config: {
        profile: 'default',
        includePatterns: ['**/*.md'],
        excludePatterns: [],
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        cacheEnabled: true,
      },
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync('.confluence-sync.json', JSON.stringify(manifestData, null, 2));

    // Create local files
    fs.writeFileSync('space1.md', '# Space 1');
    fs.writeFileSync('space2.md', '# Space 2');

    // Create auth credentials
    fs.mkdirSync(path.join(Bun.env.HOME || '', '.confluence-sync'), { recursive: true });
    fs.writeFileSync(
      path.join(Bun.env.HOME || '', '.confluence-sync', 'auth.json'),
      JSON.stringify({
        url: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'test-token',
      }),
    );

    // Run status command with space filter
    await statusCommand.parseAsync(['node', 'status', '--space', 'SPACE1']);

    // Should only show SPACE1 page
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('space1.md'));
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('space2.md'));
  });

  it('should handle empty manifest', async () => {
    // Create empty manifest
    const manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map(),
      config: {
        profile: 'default',
        includePatterns: ['**/*.md'],
        excludePatterns: [],
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        cacheEnabled: true,
      },
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: [],
    };
    fs.writeFileSync('.confluence-sync.json', JSON.stringify(manifestData, null, 2));

    // Run status command
    await statusCommand.parseAsync(['node', 'status']);

    // Should show helpful message
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No pages tracked yet'),
    );
  });
});
