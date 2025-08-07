import type { paths } from '../index';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getApiClient } from '../api-client';

export interface SyncConfig {
  localPath: string;
  spaceKey: string;
  parentPageId?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface PageMetadata {
  id?: string;
  title: string;
  spaceKey?: string;
  parentId?: string;
  version?: number;
  lastSyncedHash?: string;
  path?: string;
}

export interface SyncResult {
  success: boolean;
  created: string[];
  updated: string[];
  skipped: string[];
  errors: Array<{ file: string; error: string }>;
}

type GetPageResponse = paths['/pages/{id}']['get']['responses']['200']['content']['application/json'];
type CreatePageRequest = paths['/pages']['post']['requestBody']['content']['application/json'];
type UpdatePageRequest = paths['/pages/{id}']['put']['requestBody']['content']['application/json'];

export class ConfluenceSync {
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
  }

  private getContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async getPage(pageId: string): Promise<GetPageResponse | null> {
    const client = await getApiClient();
    const response = await client.GET('/pages/{id}', {
      params: {
        path: { id: Number.parseInt(pageId, 10) },
        query: { 'body-format': 'storage' },
      },
    });

    if (response.data) {
      return response.data;
    }
    return null;
  }

  private async createPage(data: CreatePageRequest): Promise<string | null> {
    if (this.config.dryRun) {
      console.log('[DRY RUN] Would create page:', data.title);
      return 'dry-run-id';
    }

    const client = await getApiClient();
    const response = await client.POST('/pages', {
      body: data,
    });

    if (response.data?.id) {
      return response.data.id;
    }
    return null;
  }

  private async updatePage(pageId: string, data: UpdatePageRequest): Promise<boolean> {
    if (this.config.dryRun) {
      console.log('[DRY RUN] Would update page:', pageId);
      return true;
    }

    const client = await getApiClient();
    const response = await client.PUT('/pages/{id}', {
      params: { path: { id: Number.parseInt(pageId, 10) } },
      body: data,
    });

    return response.response.ok;
  }

  private markdownToConfluenceStorage(markdown: string): string {
    // Basic markdown to Confluence storage format conversion
    let storage = markdown;

    // Headers
    storage = storage.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    storage = storage.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    storage = storage.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    storage = storage.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    storage = storage.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    storage = storage.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Code blocks
    storage = storage.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const language = lang || 'none';
      return `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${language}</ac:parameter><ac:plain-text-body><![CDATA[${code.trim()}]]></ac:plain-text-body></ac:structured-macro>`;
    });

    // Inline code
    storage = storage.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links
    storage = storage.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Lists
    storage = storage.replace(/^\* (.+)$/gm, '<li>$1</li>');
    storage = storage.replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`);

    // Paragraphs
    storage = storage.replace(/\n\n/g, '</p><p>');
    storage = `<p>${storage}</p>`;
    storage = storage.replace(/<p><\/p>/g, '');

    return storage;
  }

  private confluenceStorageToMarkdown(storage: string): string {
    // Basic Confluence storage format to markdown conversion
    let markdown = storage;

    // Headers
    markdown = markdown.replace(/<h1>(.+?)<\/h1>/g, '# $1\n');
    markdown = markdown.replace(/<h2>(.+?)<\/h2>/g, '## $1\n');
    markdown = markdown.replace(/<h3>(.+?)<\/h3>/g, '### $1\n');
    markdown = markdown.replace(/<h4>(.+?)<\/h4>/g, '#### $1\n');

    // Bold and italic
    markdown = markdown.replace(/<strong>(.+?)<\/strong>/g, '**$1**');
    markdown = markdown.replace(/<em>(.+?)<\/em>/g, '*$1*');

    // Code blocks
    markdown = markdown.replace(/<ac:structured-macro ac:name="code".*?<ac:parameter ac:name="language">(.*?)<\/ac:parameter>.*?<!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body><\/ac:structured-macro>/g, (_, lang, code) => `\n\`\`\`${lang}\n${code}\n\`\`\`\n`);

    // Inline code
    markdown = markdown.replace(/<code>(.+?)<\/code>/g, '`$1`');

    // Links
    markdown = markdown.replace(/<a href="(.+?)">(.+?)<\/a>/g, '[$2]($1)');

    // Lists
    markdown = markdown.replace(/<ul>([\s\S]*?)<\/ul>/g, (_, items) => {
      return items.replace(/<li>(.+?)<\/li>/g, '* $1\n');
    });

    // Paragraphs
    markdown = markdown.replace(/<p>(.+?)<\/p>/g, '$1\n\n');
    markdown = markdown.replace(/<br\s*\/?>/g, '\n');

    // Clean up
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    return markdown;
  }

  async syncToConfluence(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      created: [],
      updated: [],
      skipped: [],
      errors: [],
    };

    try {
      // Find all markdown files
      const pattern = join(this.config.localPath, '**/*.md');
      const files = await glob(pattern, { ignore: ['**/node_modules/**', '**/.git/**'] });

      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          const { data: frontmatter, content: body } = matter(content);
          const metadata = frontmatter as PageMetadata;

          // Skip if no title
          if (!metadata.title) {
            result.skipped.push(file);
            continue;
          }

          const contentHash = this.getContentHash(body);
          const confluenceContent = this.markdownToConfluenceStorage(body);

          // Check if page needs update
          if (metadata.id && metadata.lastSyncedHash === contentHash && !this.config.force) {
            result.skipped.push(file);
            continue;
          }

          if (metadata.id) {
            // Update existing page
            const existingPage = await this.getPage(metadata.id);
            if (existingPage) {
              const success = await this.updatePage(metadata.id, {
                id: metadata.id,
                status: 'current',
                title: metadata.title,
                spaceId: metadata.spaceKey || this.config.spaceKey,
                parentId: metadata.parentId || this.config.parentPageId,
                body: {
                  value: confluenceContent,
                  representation: 'storage',
                },
                version: {
                  number: (existingPage.version?.number || 0) + 1,
                },
              });

              if (success) {
                // Update frontmatter with new hash
                metadata.lastSyncedHash = contentHash;
                const updatedContent = matter.stringify(body, metadata);
                if (!this.config.dryRun) {
                  writeFileSync(file, updatedContent);
                }
                result.updated.push(file);
              }
              else {
                throw new Error('Failed to update page');
              }
            }
            else {
              throw new Error(`Page with ID ${metadata.id} not found`);
            }
          }
          else {
            // Create new page
            const pageId = await this.createPage({
              title: metadata.title,
              spaceId: metadata.spaceKey || this.config.spaceKey,
              parentId: metadata.parentId || this.config.parentPageId,
              body: {
                value: confluenceContent,
                representation: 'storage',
              },
            });

            if (pageId) {
              // Update frontmatter with page ID and hash
              metadata.id = pageId;
              metadata.lastSyncedHash = contentHash;
              metadata.spaceKey = metadata.spaceKey || this.config.spaceKey;
              const updatedContent = matter.stringify(body, metadata);
              if (!this.config.dryRun) {
                writeFileSync(file, updatedContent);
              }
              result.created.push(file);
            }
            else {
              throw new Error('Failed to create page');
            }
          }
        }
        catch (error) {
          result.errors.push({
            file,
            error: error instanceof Error ? error.message : String(error),
          });
          result.success = false;
        }
      }
    }
    catch (error) {
      result.errors.push({
        file: 'general',
        error: error instanceof Error ? error.message : String(error),
      });
      result.success = false;
    }

    return result;
  }

  async syncFromConfluence(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      created: [],
      updated: [],
      skipped: [],
      errors: [],
    };

    try {
      const client = await getApiClient();

      // Get pages from space
      // Note: We need to get the space ID first from the space key
      const spaceResponse = await client.GET('/spaces', {
        params: {
          query: {
            keys: [this.config.spaceKey],
            limit: 1,
          },
        },
      });

      if (!spaceResponse.data?.results?.[0]?.id) {
        throw new Error(`Space with key ${this.config.spaceKey} not found`);
      }

      const spaceId = Number.parseInt(spaceResponse.data.results[0].id, 10);

      const response = await client.GET('/spaces/{id}/pages', {
        params: {
          path: { id: spaceId },
          query: {
            'body-format': 'storage',
            'limit': 250,
          },
        },
      });

      if (!response.data?.results) {
        throw new Error('Failed to fetch pages from Confluence');
      }

      for (const page of response.data.results) {
        try {
          if (!page.id || !page.title) {
            continue;
          }

          // Get full page content
          const fullPage = await this.getPage(page.id);
          if (!fullPage?.body?.storage?.value) {
            result.skipped.push(page.title);
            continue;
          }

          const markdown = this.confluenceStorageToMarkdown(fullPage.body.storage.value);
          const contentHash = this.getContentHash(markdown);

          // Determine file path
          const fileName = `${page.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
          const filePath = join(this.config.localPath, fileName);

          // Check if file exists and needs update
          if (existsSync(filePath)) {
            const existingContent = readFileSync(filePath, 'utf-8');
            const { data: existingMeta } = matter(existingContent);

            if ((existingMeta as PageMetadata).lastSyncedHash === contentHash && !this.config.force) {
              result.skipped.push(filePath);
              continue;
            }
          }

          // Prepare metadata
          const metadata: PageMetadata = {
            id: page.id,
            title: page.title,
            spaceKey: this.config.spaceKey,
            parentId: page.parentId,
            version: fullPage.version?.number,
            lastSyncedHash: contentHash,
          };

          // Write file
          const fileContent = matter.stringify(markdown, metadata);
          if (!this.config.dryRun) {
            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, fileContent);
          }

          if (existsSync(filePath)) {
            result.updated.push(filePath);
          }
          else {
            result.created.push(filePath);
          }
        }
        catch (error) {
          result.errors.push({
            file: page.title || 'unknown',
            error: error instanceof Error ? error.message : String(error),
          });
          result.success = false;
        }
      }
    }
    catch (error) {
      result.errors.push({
        file: 'general',
        error: error instanceof Error ? error.message : String(error),
      });
      result.success = false;
    }

    return result;
  }
}

export { ConfluenceSync as default };
