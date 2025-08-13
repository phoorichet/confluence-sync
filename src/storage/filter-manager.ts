import { logger } from '../utils/logger.js';
import { ManifestManager } from './manifest-manager.js';

export interface SavedFilter {
  name: string;
  description?: string;
  query?: string;
  cql?: string;
  filters: {
    author?: string;
    modifiedAfter?: string;
    label?: string[];
    space?: string[];
  };
  createdAt: Date;
  lastUsed?: Date;
}

interface FilterData {
  query?: string;
  cql?: string;
  filters: {
    author?: string;
    modifiedAfter?: string;
    label?: string[];
    space?: string[];
  };
  description?: string;
}

export class FilterManager {
  private static instance: FilterManager;
  private manifestManager: ManifestManager;

  private constructor() {
    this.manifestManager = ManifestManager.getInstance();
  }

  public static getInstance(): FilterManager {
    if (!FilterManager.instance) {
      FilterManager.instance = new FilterManager();
    }
    return FilterManager.instance;
  }

  public async saveFilter(name: string, data: FilterData): Promise<void> {
    const manifest = await this.manifestManager.load();

    if (!manifest.filters) {
      manifest.filters = {};
    }

    interface StoredFilter {
      name: string;
      description?: string;
      query?: string;
      cql?: string;
      filters: FilterData['filters'];
      createdAt: string;
      lastUsed?: string;
    }

    const filter: StoredFilter = {
      name,
      description: data.description,
      query: data.query,
      cql: data.cql,
      filters: data.filters,
      createdAt: new Date().toISOString(),
    };

    // Preserve lastUsed if updating existing filter
    if (manifest.filters[name]) {
      filter.lastUsed = manifest.filters[name].lastUsed;
    }

    manifest.filters[name] = filter;
    await this.manifestManager.save();

    logger.debug(`Saved filter: ${name}`);
  }

  public async getFilter(name: string): Promise<SavedFilter | null> {
    const manifest = await this.manifestManager.load();

    if (!manifest.filters || !manifest.filters[name]) {
      return null;
    }

    const filterData = manifest.filters[name];
    return {
      ...filterData,
      createdAt: new Date(filterData.createdAt),
      lastUsed: filterData.lastUsed ? new Date(filterData.lastUsed) : undefined,
    };
  }

  public async deleteFilter(name: string): Promise<void> {
    const manifest = await this.manifestManager.load();

    if (!manifest.filters || !manifest.filters[name]) {
      throw new Error(`Filter "${name}" not found`);
    }

    delete manifest.filters[name];
    await this.manifestManager.save();

    logger.debug(`Deleted filter: ${name}`);
  }

  public async listFilters(): Promise<SavedFilter[]> {
    const manifest = await this.manifestManager.load();

    if (!manifest.filters) {
      return [];
    }

    return Object.entries(manifest.filters).map(([name, data]: [string, any]) => ({
      ...data,
      name,
      createdAt: new Date(data.createdAt),
      lastUsed: data.lastUsed ? new Date(data.lastUsed) : undefined,
    }));
  }

  public async updateLastUsed(name: string): Promise<void> {
    const manifest = await this.manifestManager.load();

    if (!manifest.filters || !manifest.filters[name]) {
      return;
    }

    manifest.filters[name].lastUsed = new Date().toISOString();
    await this.manifestManager.save();

    logger.debug(`Updated lastUsed for filter: ${name}`);
  }

  public async renameFilter(oldName: string, newName: string): Promise<void> {
    const manifest = await this.manifestManager.load();

    if (!manifest.filters || !manifest.filters[oldName]) {
      throw new Error(`Filter "${oldName}" not found`);
    }

    if (manifest.filters[newName]) {
      throw new Error(`Filter "${newName}" already exists`);
    }

    manifest.filters[newName] = {
      ...manifest.filters[oldName],
      name: newName,
    };
    delete manifest.filters[oldName];

    await this.manifestManager.save();

    logger.debug(`Renamed filter from "${oldName}" to "${newName}"`);
  }
}
