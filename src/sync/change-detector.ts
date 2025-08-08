import type { Page } from '../storage/manifest-manager.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { apiClient } from '../api/client.js';
import { calculateFileHash, hashesMatch } from '../utils/hash.js';
import { logger } from '../utils/logger.js';

export type ChangeState = 'local-only' | 'remote-only' | 'both-changed' | 'unchanged';

export interface ChangeDetectionResult {
  pageId: string;
  localPath: string;
  state: ChangeState;
  localHash?: string;
  remoteVersion?: number;
  manifestHash?: string;
  manifestVersion?: number;
}

export class ChangeDetector {
  private static instance: ChangeDetector;

  private constructor() {}

  public static getInstance(): ChangeDetector {
    if (!ChangeDetector.instance) {
      ChangeDetector.instance = new ChangeDetector();
    }
    return ChangeDetector.instance;
  }

  /**
   * Detect local changes by comparing file hash with manifest
   */
  async detectLocalChanges(page: Page): Promise<boolean> {
    try {
      const absolutePath = path.resolve(page.localPath);

      if (!existsSync(absolutePath)) {
        logger.warn(`Local file not found: ${absolutePath}`);
        return false;
      }

      const currentHash = calculateFileHash(absolutePath);
      const hasChanges = !hashesMatch(currentHash, page.contentHash);

      if (hasChanges) {
        logger.debug(`Local changes detected for ${page.localPath}`);
      }

      return hasChanges;
    }
    catch (error) {
      logger.error('Failed to detect local changes', error);
      throw new Error(`CS-505: Failed to detect local changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect remote changes by comparing version numbers
   */
  async detectRemoteChanges(page: Page): Promise<boolean> {
    try {
      // Initialize API client if needed
      await apiClient.initialize();

      // Fetch current page version from Confluence
      const remotePage = await apiClient.getPage(page.id);

      if (!remotePage) {
        logger.warn(`Remote page not found: ${page.id}`);
        return false;
      }

      const hasChanges = (remotePage.version?.number || 0) > page.version;

      if (hasChanges) {
        logger.debug(`Remote changes detected for page ${page.id}: v${page.version} -> v${remotePage.version?.number}`);
      }

      return hasChanges;
    }
    catch (error) {
      logger.error('Failed to detect remote changes', error);
      throw new Error(`CS-506: Failed to detect remote changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the change state for a page
   */
  async getChangeState(page: Page): Promise<ChangeState> {
    try {
      const [localChanged, remoteChanged] = await Promise.all([
        this.detectLocalChanges(page),
        this.detectRemoteChanges(page),
      ]);

      if (localChanged && remoteChanged) {
        return 'both-changed';
      }
      else if (localChanged) {
        return 'local-only';
      }
      else if (remoteChanged) {
        return 'remote-only';
      }
      else {
        return 'unchanged';
      }
    }
    catch (error) {
      logger.error('Failed to get change state', error);
      throw new Error(`CS-507: Failed to get change state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch change detection for multiple pages
   */
  async detectBatchChanges(pages: Page[]): Promise<ChangeDetectionResult[]> {
    try {
      // Initialize API client once for all pages
      await apiClient.initialize();

      const results: ChangeDetectionResult[] = [];

      // Process pages in parallel with concurrency limit
      const batchSize = 5; // Process 5 pages at a time
      for (let i = 0; i < pages.length; i += batchSize) {
        const batch = pages.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (page) => {
            try {
              const state = await this.getChangeState(page);
              const absolutePath = path.resolve(page.localPath);

              let localHash: string | undefined;
              if (existsSync(absolutePath)) {
                localHash = calculateFileHash(absolutePath);
              }

              let remoteVersion: number | undefined;
              try {
                const remotePage = await apiClient.getPage(page.id);
                remoteVersion = remotePage?.version?.number;
              }
              catch {
                // Remote page might not exist
              }

              return {
                pageId: page.id,
                localPath: page.localPath,
                state,
                localHash,
                remoteVersion,
                manifestHash: page.contentHash,
                manifestVersion: page.version,
              };
            }
            catch (error) {
              logger.warn(`Failed to detect changes for page ${page.id}`, error);
              return {
                pageId: page.id,
                localPath: page.localPath,
                state: 'unchanged' as ChangeState,
                manifestHash: page.contentHash,
                manifestVersion: page.version,
              };
            }
          }),
        );

        results.push(...batchResults);
      }

      return results;
    }
    catch (error) {
      logger.error('Failed to detect batch changes', error);
      throw new Error(`CS-508: Failed to detect batch changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a local file exists for a page
   */
  isLocalFilePresent(page: Page): boolean {
    const absolutePath = path.resolve(page.localPath);
    return existsSync(absolutePath);
  }

  /**
   * Get current file hash
   */
  getCurrentFileHash(page: Page): string | null {
    try {
      const absolutePath = path.resolve(page.localPath);
      if (!existsSync(absolutePath)) {
        return null;
      }
      return calculateFileHash(absolutePath);
    }
    catch {
      return null;
    }
  }
}
