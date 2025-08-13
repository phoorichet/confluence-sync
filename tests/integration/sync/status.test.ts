import type { SyncManifest } from '../../../src/storage/manifest-manager';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../src/api/client';
import { statusCommand } from '../../../src/commands/status';

describe('status Command Integration', () => {
  let tempDir: string;
  let server: ReturnType<typeof setupServer>;
  let consoleLogSpy: any;
  let _processExitSpy: any;
  let program: Command;
  let originalCwd: string;

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Save original working directory
    originalCwd = process.cwd();
    
    // Create temp directory
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'status-test-'));
    // Don't use process.chdir as it affects all parallel tests

    // Mock apiClient
    vi.spyOn(apiClient, 'initialize').mockResolvedValue();
    vi.spyOn(apiClient, 'getPage').mockImplementation(async (pageId: string) => {
      if (pageId === '123') {
        return {
          id: '123',
          title: 'Test Page 1',
          status: 'current',
          version: {
            number: 2, // Higher version for remote change
            when: new Date().toISOString(),
          },
        } as any;
      } else if (pageId === '456') {
        return {
          id: '456',
          title: 'Test Page 2',
          status: 'current',
          version: {
            number: 1, // Same version
            when: new Date().toISOString(),
          },
        } as any;
      } else if (pageId === '789') {
        return {
          id: '789',
          title: 'Test Page 3',
          status: 'current',
          version: {
            number: 3, // Higher version for conflict
            when: new Date().toISOString(),
          },
        } as any;
      }
      throw new Error('Not found');
    });

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

        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }),
    );

    server.listen({ onUnhandledRequest: 'error' });

    // Mock AuthManager
    const AuthManager = await import('../../../src/auth/auth-manager').then(m => m.AuthManager);
    const mockAuthManager = {
      getStoredCredentials: vi.fn().mockResolvedValue({
        url: 'https://test.atlassian.net/wiki/api/v2',
        username: 'test@example.com',
        authType: 'cloud',
      }),
      getToken: vi.fn().mockResolvedValue('Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2Vu'),
    };
    vi.spyOn(AuthManager, 'getInstance').mockReturnValue(mockAuthManager as any);

    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log');
    _processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });

    // Setup Commander program
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    program.addCommand(statusCommand);
    program.name('confluence-sync');
  });

  afterEach(async () => {
    // Ensure we're back in the original directory
    try {
      process.chdir(originalCwd);
    } catch {
      // Ignore if directory doesn't exist
    }
    
    if (server) {
      server.close();
    }

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }

    // Restore mocks
    vi.restoreAllMocks();
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
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync(path.join(tempDir, '.csmanifest.json'), JSON.stringify(manifestData, null, 2));

    // Create local files with different states
    fs.writeFileSync(path.join(tempDir, 'page1.md'), '# Page 1'); // Unchanged (remote has v2)
    fs.writeFileSync(path.join(tempDir, 'page2.md'), '# Page 2 Modified'); // Local change (different hash)
    fs.writeFileSync(path.join(tempDir, 'page3.md'), '# Page 3 Modified'); // Conflict (both changed)

    // Run status command from the temp directory
    try {
      process.chdir(tempDir);
      await program.parseAsync(['status'], { from: 'user' });
    } finally {
      process.chdir(originalCwd);
    }

    // Check output - status should show information about the pages
    const allLogs = consoleLogSpy.mock.calls.map((call: any[]) => call[0]).join('\n');
    
    // Should show local changes
    expect(allLogs).toContain('page2.md');
    expect(allLogs).toContain('modified');
    
    // Should show remote changes  
    expect(allLogs).toContain('page1.md');
    
    // Should show conflicts
    expect(allLogs).toContain('page3.md');
  });

  it.skip('should output JSON format when requested', async () => {
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
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync(path.join(tempDir, '.csmanifest.json'), JSON.stringify(manifestData, null, 2));

    // Create local file
    fs.writeFileSync(path.join(tempDir, 'test.md'), '# Test Page');


    // Run status command with --json from the temp directory
    try {
      process.chdir(tempDir);
      await program.parseAsync(['status', '--json'], { from: 'user' });
    } finally {
      process.chdir(originalCwd);
    }

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

  it.skip('should filter by space when requested', async () => {
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
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync(path.join(tempDir, '.csmanifest.json'), JSON.stringify(manifestData, null, 2));

    // Create local files
    fs.writeFileSync(path.join(tempDir, 'space1.md'), '# Space 1');
    fs.writeFileSync(path.join(tempDir, 'space2.md'), '# Space 2');


    // Run status command with space filter from the temp directory
    try {
      process.chdir(tempDir);
      await program.parseAsync(['status', '--space', 'SPACE1'], { from: 'user' });
    } finally {
      process.chdir(originalCwd);
    }

    // Should only show SPACE1 page
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('space1.md'));
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('space2.md'));
  });

  it.skip('should handle empty manifest', async () => {
    // Create empty manifest
    const manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: 'https://test.atlassian.net',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map(),
    };

    // Save manifest
    const manifestData = {
      ...manifest,
      pages: Array.from(manifest.pages.entries()),
    };
    fs.writeFileSync(path.join(tempDir, '.csmanifest.json'), JSON.stringify(manifestData, null, 2));

    // Run status command from the temp directory
    try {
      process.chdir(tempDir);
      await program.parseAsync(['status'], { from: 'user' });
    } finally {
      process.chdir(originalCwd);
    }

    // Should show helpful message
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No pages tracked yet'),
    );
  });
});
