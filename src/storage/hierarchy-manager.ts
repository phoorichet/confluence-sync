import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

export interface HierarchyNode {
  pageId: string;
  title: string;
  children: HierarchyNode[];
  depth: number;
  localPath: string;
  parentId?: string | null;
}

export class HierarchyManager {
  private static instance: HierarchyManager;
  private readonly INDEX_FILE = '_index.md';
  private readonly MAX_FILENAME_LENGTH = 100;
  private readonly RESERVED_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];

  private constructor() {}

  public static getInstance(): HierarchyManager {
    if (!HierarchyManager.instance) {
      HierarchyManager.instance = new HierarchyManager();
    }
    return HierarchyManager.instance;
  }

  /**
   * Build a hierarchical path for a page based on its ancestry
   */
  public buildHierarchyPath(
    pageTitle: string,
    parentPath?: string,
    hasChildren = false,
    isHomepageId = false,
  ): string {
    // Check if the title already has a position prefix (e.g., "001-Title")
    const hasBothParentAndChildren = parentPath && hasChildren;

    // Don't sanitize if it already has a position prefix
    const processedTitle = hasBothParentAndChildren ? pageTitle : this.sanitizeTitle(pageTitle);

    if (parentPath) {
      const basePath = path.join(parentPath, processedTitle);

      if (hasChildren) {
        // Pages with children use _index.md pattern
        return path.join(basePath, this.INDEX_FILE);
      }
      else {
        // Leaf pages use direct .md files
        return `${basePath}.md`;
      }
    }
    else {
      // Root level page
      if (hasChildren) {
        return path.join(processedTitle, this.INDEX_FILE);
      }
      else {
        if (isHomepageId) {
          return path.join(pageTitle, this.INDEX_FILE);
        }
        else {
          return `${processedTitle}.md`;
        }
      }
    }
  }

  /**
   * Create directory structure for a hierarchical path
   */
  public async ensureDirectoryStructure(filePath: string): Promise<void> {
    const directory = path.dirname(filePath);

    if (!existsSync(directory)) {
      try {
        mkdirSync(directory, { recursive: true });
        logger.info(`Created directory structure: ${directory}`);
      }
      catch (error) {
        throw new Error(`CS-807: Failed to create directory structure: ${error}`);
      }
    }
  }

  /**
   * Build a complete hierarchy tree from a flat list of pages
   */
  public buildHierarchyTree(pages: Array<{
    id: string;
    title: string;
    parentId: string | null;
    localPath?: string;
  }>): Map<string, HierarchyNode> {
    const nodeMap = new Map<string, HierarchyNode>();
    const rootNodes = new Map<string, HierarchyNode>();

    // First pass: create all nodes
    for (const page of pages) {
      const node: HierarchyNode = {
        pageId: page.id,
        title: page.title,
        children: [],
        depth: 0,
        localPath: page.localPath || '',
        parentId: page.parentId,
      };
      nodeMap.set(page.id, node);
    }

    // Second pass: build parent-child relationships
    for (const node of nodeMap.values()) {
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
          node.depth = parent.depth + 1;
        }
        else {
          // Parent not found, treat as root
          rootNodes.set(node.pageId, node);
        }
      }
      else {
        // No parent, it's a root node
        rootNodes.set(node.pageId, node);
      }
    }

    // Sort children by title for consistent ordering
    for (const node of nodeMap.values()) {
      node.children.sort((a, b) => a.title.localeCompare(b.title));
    }

    return rootNodes;
  }

  /**
   * Detect circular references in page hierarchy
   */
  public detectCircularReferences(pages: Array<{
    id: string;
    parentId: string | null;
  }>): string[] {
    const circularPages: string[] = [];

    for (const page of pages) {
      const visited = new Set<string>();
      let current = page;

      while (current && current.parentId) {
        if (visited.has(current.id)) {
          circularPages.push(current.id);
          logger.warn(`CS-808: Circular reference detected for page ${current.id}`);
          break;
        }

        visited.add(current.id);
        const nextPage = pages.find(p => p.id === current.parentId);
        if (!nextPage)
          break;
        current = nextPage;
      }
    }

    return circularPages;
  }

  /**
   * Parse directory structure to determine hierarchy
   */
  public parseDirectoryStructure(
    dirPath: string,
    files: string[],
  ): Map<string, { parentPath?: string; isIndex: boolean }> {
    const structure = new Map<string, { parentPath?: string; isIndex: boolean }>();

    for (const file of files) {
      const relativePath = path.relative(dirPath, file);
      const parts = relativePath.split(path.sep);
      const filename = parts[parts.length - 1];

      if (filename === this.INDEX_FILE) {
        // This is a parent page
        const parentPath = parts.slice(0, -1).join(path.sep);
        structure.set(file, {
          parentPath: parentPath || undefined,
          isIndex: true,
        });
      }
      else {
        // This is a leaf page or standalone page
        const parentPath = parts.slice(0, -1).join(path.sep);
        structure.set(file, {
          parentPath: parentPath || undefined,
          isIndex: false,
        });
      }
    }

    return structure;
  }

  /**
   * Sanitize a page title for use as a filesystem path
   */
  private sanitizeTitle(title: string): string {
    // Remove or replace invalid characters
    let sanitized = title
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid chars with dash
      .replace(/\s+/g, '-') // Replace spaces with dash
      .replace(/-+/g, '-') // Collapse multiple dashes
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
      .toLowerCase();

    // Truncate if too long
    if (sanitized.length > this.MAX_FILENAME_LENGTH) {
      sanitized = sanitized.substring(0, this.MAX_FILENAME_LENGTH);
    }

    // Handle reserved names
    if (this.RESERVED_NAMES.includes(sanitized.toUpperCase())) {
      sanitized = `page-${sanitized}`;
    }

    // Ensure we have something
    if (!sanitized) {
      sanitized = 'untitled';
    }

    return sanitized;
  }

  /**
   * Get parent path from a file path
   */
  public getParentPath(filePath: string): string | null {
    const directory = path.dirname(filePath);
    const filename = path.basename(filePath);

    if (filename === this.INDEX_FILE) {
      // The parent is one level up
      const parentDir = path.dirname(directory);
      return parentDir === '.' ? null : parentDir;
    }
    else {
      // The parent is the current directory's _index.md if it exists
      return directory === '.' ? null : directory;
    }
  }

  /**
   * Clear singleton instance (for testing)
   */
  public static clearInstance(): void {
    HierarchyManager.instance = null as any;
  }
}
