import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AuthManager } from '../auth/auth-manager.js';
import { logger } from '../utils/logger.js';

// Define the SyncConfig schema
const SyncConfigSchema = z.object({
  profile: z.string().default('default'),
  includePatterns: z.array(z.string()).default(['**/*.md']),
  excludePatterns: z.array(z.string()).default([]),
  concurrentOperations: z.number().default(5),
  conflictStrategy: z.enum(['manual', 'local-first', 'remote-first']).default('manual'),
  cacheEnabled: z.boolean().default(true),
});

// Define the SyncOperation schema
const SyncOperationSchema = z.object({
  id: z.string(),
  type: z.enum(['pull', 'push', 'sync']),
  pageIds: z.array(z.string()),
  startTime: z.date(),
  endTime: z.date().nullable(),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed']),
  error: z.string().nullable(),
});

// Resolution history schema for tracking conflict resolutions
const ResolutionRecordSchema = z.object({
  timestamp: z.date(),
  strategy: z.enum(['manual', 'local-first', 'remote-first']),
  previousLocalHash: z.string().optional(),
  previousRemoteHash: z.string().optional(),
});

// Define the Space schema
const SpaceSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  type: z.enum(['global', 'personal', 'collaboration', 'knowledge_base']).default('global'),
  permissions: z.object({
    view: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
  }),
  homepageId: z.string().optional(),
  lastSyncTime: z.date().optional(),
});

// Define the Folder schema with same fields as FolderSingle from API
const FolderSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  status: z.enum(['current', 'draft', 'archived', 'historical', 'trashed', 'deleted', 'any']).optional(),
  title: z.string().optional(),
  parentId: z.string().nullable().optional(),
  parentType: z.enum(['page', 'whiteboard', 'database', 'embed', 'folder']).nullish(),
  position: z.number().nullable().optional(),
  authorId: z.string().optional(),
  ownerId: z.string().optional(),
  createdAt: z.union([z.string(), z.number()]).optional(),
  version: z.object({
    createdAt: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
    number: z.number().optional(),
    minorEdit: z.boolean().optional(),
    authorId: z.string().optional(),
  }).optional(),
});

// Define the Page schema with hierarchy support
const PageSchema = z.object({
  id: z.string(),
  spaceKey: z.string(),
  title: z.string(),
  version: z.number(),
  parentId: z.string().nullable(),
  parentType: z.enum(['page', 'whiteboard', 'database', 'embed', 'folder']).nullable().optional(),
  position: z.number().optional(), // Order among siblings
  lastModified: z.date(),
  localPath: z.string(),
  contentHash: z.string(),
  remoteHash: z.string().optional(), // Hash of remote content for conflict detection
  status: z.enum(['synced', 'modified', 'conflicted']),
  children: z.array(z.string()).optional(), // Child page IDs for hierarchy
  resolutionHistory: z.array(ResolutionRecordSchema).optional(), // Track conflict resolutions
});

// Define the SyncManifest schema (v2)
const SyncManifestSchema = z.object({
  version: z.string().default('2.0.0'), // Version for migration support
  confluenceUrl: z.string(),
  lastSyncTime: z.date(),
  syncMode: z.enum(['manual', 'watch']).default('manual'),
  pages: z.map(z.string(), PageSchema),
  spaces: z.map(z.string(), SpaceSchema).optional(), // Space metadata storage
  folders: z.map(z.string(), FolderSchema).optional(), // Folder metadata storage
  config: SyncConfigSchema.optional(),
  operations: z.array(SyncOperationSchema).optional(),
});

// Legacy v1 schema for migration - not used directly but kept for reference
const _SyncManifestV1Schema = z.object({
  version: z.string(),
  confluenceUrl: z.string(),
  lastSyncTime: z.date(),
  pages: z.map(z.string(), PageSchema),
});

export type ResolutionRecord = z.infer<typeof ResolutionRecordSchema>;
export type Space = z.infer<typeof SpaceSchema>;
export type Folder = z.infer<typeof FolderSchema>;
export type Page = z.infer<typeof PageSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type SyncOperation = z.infer<typeof SyncOperationSchema>;
export type SyncManifest = z.infer<typeof SyncManifestSchema>;
export type SyncManifestV1 = z.infer<typeof _SyncManifestV1Schema>;

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

        // Check if migration is needed (v1 to v2)
        if (!rawData.version || rawData.version === '1.0.0') {
          logger.info('Detected v1 manifest, migrating to v2...');
          this.manifest = await this.migrateV1ToV2(rawData);
          await this.save();
          logger.info('Successfully migrated manifest to v2');
          return this.manifest;
        }

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

        // Parse operations dates if present
        if (rawData.operations && Array.isArray(rawData.operations)) {
          rawData.operations = rawData.operations.map((op: any) => ({
            ...op,
            startTime: new Date(op.startTime),
            endTime: op.endTime ? new Date(op.endTime) : null,
          }));
        }

        // Parse spaces if present
        if (rawData.spaces) {
          const spacesMap = new Map<string, Space>();

          if (Array.isArray(rawData.spaces)) {
            // If it's stored as array of [key, value] pairs (Map serialization)
            for (const [key, space] of rawData.spaces) {
              if (space.lastSyncTime) {
                space.lastSyncTime = new Date(space.lastSyncTime);
              }
              spacesMap.set(key, space);
            }
          }
          else if (typeof rawData.spaces === 'object') {
            // If it's stored as object
            for (const [key, space] of Object.entries(rawData.spaces)) {
              if ((space as any).lastSyncTime) {
                (space as any).lastSyncTime = new Date((space as any).lastSyncTime);
              }
              spacesMap.set(key, space as Space);
            }
          }
          rawData.spaces = spacesMap;
        }

        // Parse folders if present
        if (rawData.folders) {
          const foldersMap = new Map<string, Folder>();

          if (Array.isArray(rawData.folders)) {
            // If it's stored as array of [key, value] pairs (Map serialization)
            for (const [id, folder] of rawData.folders) {
              foldersMap.set(id, folder);
            }
          }
          else if (typeof rawData.folders === 'object') {
            // If it's stored as object
            for (const [id, folder] of Object.entries(rawData.folders)) {
              foldersMap.set(id, folder as Folder);
            }
          }
          rawData.folders = foldersMap;
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
        logger.warn('Manifest validation failed, attempting migration or creating new manifest');

        // Try to recover data if possible
        try {
          const content = readFileSync(this.manifestPath, 'utf-8');
          const rawData = JSON.parse(content);
          if (!rawData.version || rawData.version === '1.0.0') {
            this.manifest = await this.migrateV1ToV2(rawData);
            await this.save();
            return this.manifest;
          }
        }
        catch {
          // If recovery fails, create new manifest
        }

        this.manifest = await this.createNewManifest();
        await this.save();
        return this.manifest;
      }

      throw new Error(`CS-503: Failed to load manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate v1 manifest to v2 format
   */
  private async migrateV1ToV2(v1Data: any): Promise<SyncManifest> {
    // Parse dates
    if (v1Data.lastSyncTime) {
      v1Data.lastSyncTime = new Date(v1Data.lastSyncTime);
    }

    // Convert pages to Map and add children field
    const pagesMap = new Map<string, Page>();
    if (v1Data.pages) {
      if (Array.isArray(v1Data.pages)) {
        for (const [id, page] of v1Data.pages) {
          if (page.lastModified) {
            page.lastModified = new Date(page.lastModified);
          }
          // Add children field for hierarchy support
          page.children = [];
          pagesMap.set(id, page);
        }
      }
      else if (typeof v1Data.pages === 'object') {
        for (const [id, page] of Object.entries(v1Data.pages)) {
          if ((page as any).lastModified) {
            (page as any).lastModified = new Date((page as any).lastModified);
          }
          // Add children field for hierarchy support
          (page as any).children = [];
          pagesMap.set(id, page as Page);
        }
      }
    }

    // Build parent-child relationships
    for (const [id, page] of pagesMap) {
      if (page.parentId) {
        const parent = pagesMap.get(page.parentId);
        if (parent && !parent.children?.includes(id)) {
          if (!parent.children) {
            parent.children = [];
          }
          parent.children.push(id);
        }
      }
    }

    // Create v2 manifest with default config
    const v2Manifest: SyncManifest = {
      version: '2.0.0',
      confluenceUrl: v1Data.confluenceUrl || '',
      lastSyncTime: v1Data.lastSyncTime || new Date(),
      syncMode: 'manual',
      pages: pagesMap,
      spaces: new Map(), // Initialize empty spaces map
      folders: new Map(), // Initialize empty folders map
      config: {
        profile: 'default',
        includePatterns: ['**/*.md'],
        excludePatterns: [],
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        cacheEnabled: true,
      },
      operations: [],
    };

    return v2Manifest;
  }

  /**
   * Get the current manifest
   */
  async getManifest(): Promise<SyncManifest | null> {
    if (!this.manifest) {
      await this.load();
    }
    return this.manifest;
  }

  /**
   * Save manifest to disk
   */
  async save(): Promise<void> {
    try {
      if (!this.manifest) {
        throw new Error('CS-500: No manifest to save');
      }

      // Convert Maps to arrays for JSON serialization
      const toSave = {
        ...this.manifest,
        pages: Array.from(this.manifest.pages.entries()),
        spaces: this.manifest.spaces ? Array.from(this.manifest.spaces.entries()) : undefined,
        folders: this.manifest.folders ? Array.from(this.manifest.folders.entries()) : undefined,
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

      this.manifest.pages.set(page.id.toString(), page);
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
   * Get pages by space key
   */
  async getPagesBySpace(spaceKey: string): Promise<Page[]> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    const pages: Page[] = [];
    for (const page of this.manifest.pages.values()) {
      if (page.spaceKey === spaceKey) {
        pages.push(page);
      }
    }

    return pages;
  }

  /**
   * Get page hierarchy starting from a root page
   */
  async getPageHierarchy(rootPageId?: string): Promise<Map<string, Page[]>> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    const hierarchy = new Map<string, Page[]>();

    // Build parent-child relationships
    for (const page of this.manifest.pages.values()) {
      const parentId = page.parentId || 'root';

      if (!hierarchy.has(parentId)) {
        hierarchy.set(parentId, []);
      }

      hierarchy.get(parentId)!.push(page);
    }

    // If rootPageId specified, filter to only that subtree
    if (rootPageId) {
      const subtree = new Map<string, Page[]>();
      const queue = [rootPageId];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId))
          continue;
        visited.add(currentId);

        const children = hierarchy.get(currentId) || [];
        if (children.length > 0) {
          subtree.set(currentId, children);
          queue.push(...children.map(c => c.id.toString()));
        }
      }

      return subtree;
    }

    return hierarchy;
  }

  /**
   * Create a new manifest
   */
  private async createNewManifest(): Promise<SyncManifest> {
    const authManager = AuthManager.getInstance();
    const credentials = await authManager.getStoredCredentials();

    return {
      version: '2.0.0',
      confluenceUrl: credentials?.url || '',
      lastSyncTime: new Date(),
      syncMode: 'manual',
      pages: new Map(),
      spaces: new Map(),
      folders: new Map(),
      config: {
        profile: 'default',
        includePatterns: ['**/*.md'],
        excludePatterns: [],
        concurrentOperations: 5,
        conflictStrategy: 'manual',
        cacheEnabled: true,
      },
      operations: [],
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

  /**
   * Update or add a space in the manifest
   */
  async updateSpace(space: Space): Promise<void> {
    try {
      if (!this.manifest) {
        await this.load();
      }

      if (!this.manifest) {
        throw new Error('CS-500: Failed to load manifest');
      }

      // Initialize spaces map if not present
      if (!this.manifest.spaces) {
        this.manifest.spaces = new Map();
      }

      this.manifest.spaces.set(space.key, space);
      this.manifest.lastSyncTime = new Date();

      await this.save();
      logger.info(`Updated space ${space.key} in manifest`);
    }
    catch (error) {
      logger.error('Failed to update space in manifest', error);
      // Re-throw if already a CS error
      if (error instanceof Error && error.message.startsWith('CS-')) {
        throw error;
      }
      throw new Error(`CS-503: Failed to update manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a space from the manifest
   */
  async getSpace(spaceKey: string): Promise<Space | undefined> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    return this.manifest.spaces?.get(spaceKey);
  }

  /**
   * Get all spaces from the manifest
   */
  async getAllSpaces(): Promise<Map<string, Space>> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    return this.manifest.spaces || new Map();
  }

  /**
   * Update or add a folder in the manifest
   */
  async updateFolder(folder: Folder): Promise<void> {
    try {
      if (!this.manifest) {
        await this.load();
      }

      if (!this.manifest) {
        throw new Error('CS-500: Failed to load manifest');
      }

      // Initialize folders map if not present
      if (!this.manifest.folders) {
        this.manifest.folders = new Map();
      }

      this.manifest.folders.set(folder.id, folder);
      this.manifest.lastSyncTime = new Date();

      await this.save();
      logger.info(`Updated folder ${folder.id} in manifest`);
    }
    catch (error) {
      logger.error('Failed to update folder in manifest', error);
      // Re-throw if already a CS error
      if (error instanceof Error && error.message.startsWith('CS-')) {
        throw error;
      }
      throw new Error(`CS-503: Failed to update manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a folder from the manifest
   */
  async getFolder(folderId: string): Promise<Folder | undefined> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    return this.manifest.folders?.get(folderId);
  }

  /**
   * Get all folders from the manifest
   */
  async getAllFolders(): Promise<Map<string, Folder>> {
    if (!this.manifest) {
      await this.load();
    }

    if (!this.manifest) {
      throw new Error('CS-500: Failed to load manifest');
    }

    return this.manifest.folders || new Map();
  }

  /**
   * Clear singleton instance (for testing)
   */
  static clearInstance(): void {
    ManifestManager.instance = null as any;
  }
}
