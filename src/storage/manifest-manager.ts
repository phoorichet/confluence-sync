import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AuthManager } from '../auth/auth-manager.js';
import { logger } from '../utils/logger.js';

// Define the Page schema
const PageSchema = z.object({
  id: z.string(),
  spaceKey: z.string(),
  title: z.string(),
  version: z.number(),
  parentId: z.string().nullable(),
  lastModified: z.date(),
  localPath: z.string(),
  contentHash: z.string(),
  status: z.enum(['synced', 'modified', 'conflicted']),
});

// Define the SyncManifest schema
const SyncManifestSchema = z.object({
  version: z.string(),
  confluenceUrl: z.string(),
  lastSyncTime: z.date(),
  pages: z.map(z.string(), PageSchema),
});

export type Page = z.infer<typeof PageSchema>;
export type SyncManifest = z.infer<typeof SyncManifestSchema>;

export class ManifestManager {
  private static instance: ManifestManager;
  private manifestPath: string;
  private manifest: SyncManifest | null = null;

  private constructor() {
    this.manifestPath = path.resolve('.confluence-sync.json');
  }

  public static getInstance(): ManifestManager {
    if (!ManifestManager.instance) {
      ManifestManager.instance = new ManifestManager();
    }
    return ManifestManager.instance;
  }

  /**
   * Load manifest from disk or create new one
   */
  async load(): Promise<SyncManifest> {
    try {
      if (existsSync(this.manifestPath)) {
        const content = readFileSync(this.manifestPath, 'utf-8');
        const rawData = JSON.parse(content);

        // Parse dates and convert pages array to Map
        if (rawData.lastSyncTime) {
          rawData.lastSyncTime = new Date(rawData.lastSyncTime);
        }

        if (rawData.pages) {
          const pagesMap = new Map<string, Page>();

          // Handle both Map and Object formats for backwards compatibility
          if (Array.isArray(rawData.pages)) {
            // If it's stored as array of [key, value] pairs (Map serialization)
            for (const [id, page] of rawData.pages) {
              if (page.lastModified) {
                page.lastModified = new Date(page.lastModified);
              }
              pagesMap.set(id, page);
            }
          }
          else if (typeof rawData.pages === 'object') {
            // If it's stored as object
            for (const [id, page] of Object.entries(rawData.pages)) {
              if ((page as any).lastModified) {
                (page as any).lastModified = new Date((page as any).lastModified);
              }
              pagesMap.set(id, page as Page);
            }
          }
          rawData.pages = pagesMap;
        }

        // Validate with zod schema
        this.manifest = SyncManifestSchema.parse(rawData);
        logger.info('Loaded existing manifest');
        return this.manifest;
      }
      else {
        // Create new manifest
        this.manifest = await this.createNewManifest();
        await this.save();
        logger.info('Created new manifest');
        return this.manifest;
      }
    }
    catch (error) {
      logger.error('Failed to load manifest', error);

      // If manifest is corrupted, create a new one
      if (error instanceof z.ZodError) {
        logger.warn('Manifest validation failed, creating new manifest');
        this.manifest = await this.createNewManifest();
        await this.save();
        return this.manifest;
      }

      throw new Error(`CS-503: Failed to load manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save manifest to disk
   */
  async save(): Promise<void> {
    try {
      if (!this.manifest) {
        throw new Error('CS-500: No manifest to save');
      }

      // Convert Map to array for JSON serialization
      const toSave = {
        ...this.manifest,
        pages: Array.from(this.manifest.pages.entries()),
      };

      const content = JSON.stringify(toSave, null, 2);
      writeFileSync(this.manifestPath, content, 'utf-8');
      logger.info('Saved manifest');
    }
    catch (error) {
      logger.error('Failed to save manifest', error);
      // Re-throw if already a CS error
      if (error instanceof Error && error.message.startsWith('CS-')) {
        throw error;
      }
      throw new Error(`CS-503: Failed to save manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update or add a page in the manifest
   */
  async updatePage(page: Page): Promise<void> {
    try {
      if (!this.manifest) {
        await this.load();
      }

      if (!this.manifest) {
        throw new Error('CS-500: Failed to load manifest');
      }

      this.manifest.pages.set(page.id, page);
      this.manifest.lastSyncTime = new Date();

      await this.save();
      logger.info(`Updated page ${page.id} in manifest`);
    }
    catch (error) {
      logger.error('Failed to update page in manifest', error);
      // Re-throw if already a CS error
      if (error instanceof Error && error.message.startsWith('CS-')) {
        throw error;
      }
      throw new Error(`CS-503: Failed to update manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a page from the manifest
   */
  async getPage(pageId: string): Promise<Page | undefined> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    return this.manifest.pages.get(pageId);
  }

  /**
   * Get all pages from the manifest
   */
  async getAllPages(): Promise<Map<string, Page>> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    return this.manifest.pages;
  }

  /**
   * Create a new manifest
   */
  private async createNewManifest(): Promise<SyncManifest> {
    const authManager = AuthManager.getInstance();
    const credentials = await authManager.getStoredCredentials();

    return {
      version: '1.0.0',
      confluenceUrl: credentials?.url || '',
      lastSyncTime: new Date(),
      pages: new Map(),
    };
  }

  /**
   * Remove a page from the manifest
   */
  async removePage(pageId: string): Promise<void> {
    try {
      if (!this.manifest) {
        await this.load();
      }

      if (!this.manifest) {
        throw new Error('CS-500: Failed to load manifest');
      }

      this.manifest.pages.delete(pageId);
      this.manifest.lastSyncTime = new Date();

      await this.save();
      logger.info(`Removed page ${pageId} from manifest`);
    }
    catch (error) {
      logger.error('Failed to remove page from manifest', error);
      throw new Error(`CS-503: Failed to update manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear all pages from the manifest
   */
  async clearPages(): Promise<void> {
    try {
      if (!this.manifest) {
        await this.load();
      }

      if (!this.manifest) {
        throw new Error('CS-500: Failed to load manifest');
      }

      this.manifest.pages.clear();
      this.manifest.lastSyncTime = new Date();

      await this.save();
      logger.info('Cleared all pages from manifest');
    }
    catch (error) {
      logger.error('Failed to clear pages from manifest', error);
      throw new Error(`CS-503: Failed to update manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
