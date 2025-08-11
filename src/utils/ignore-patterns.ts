import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { logger } from './logger';

// Default patterns to always ignore
const DEFAULT_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '*.tmp',
  '*.swp',
  '.DS_Store',
  'Thumbs.db',
  '.confluence-sync.json',
  'dist/**',
  'build/**',
  'coverage/**',
  '.env*',
];

/**
 * Load ignore patterns from .syncignore file and combine with defaults
 * @param rootPath The root directory to look for .syncignore file
 * @returns Array of ignore patterns
 */
export async function loadIgnorePatterns(rootPath?: string): Promise<string[]> {
  const patterns = [...DEFAULT_PATTERNS];
  const syncignorePath = path.join(rootPath ?? process.cwd(), '.syncignore');

  try {
    const content = await fs.readFile(syncignorePath, 'utf-8');
    const customPatterns = parseIgnoreFile(content);
    patterns.push(...customPatterns);
    logger.debug(`Loaded ${customPatterns.length} custom ignore patterns from .syncignore`);
  }
  catch (error) {
    // .syncignore file doesn't exist or can't be read - that's ok
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.debug(`Could not read .syncignore: ${(error as Error).message}`);
    }
  }

  return patterns;
}

/**
 * Parse ignore file content into patterns
 * @param content The content of the ignore file
 * @returns Array of valid patterns
 */
export function parseIgnoreFile(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Handle negation patterns (!)
    if (trimmed.startsWith('!')) {
      // Chokidar doesn't support negation in the same way as gitignore
      // We'll need to handle these separately if needed
      logger.debug(`Negation pattern not fully supported: ${trimmed}`);
      continue;
    }

    patterns.push(convertGitignoreToGlob(trimmed));
  }

  return patterns;
}

/**
 * Convert gitignore pattern to glob pattern compatible with chokidar
 * @param pattern The gitignore pattern
 * @returns Glob pattern
 */
function convertGitignoreToGlob(pattern: string): string {
  let glob = pattern;

  // If pattern ends with /, it matches directories only
  if (glob.endsWith('/')) {
    glob = `${glob.slice(0, -1)}/**`;
  }

  // If pattern doesn't start with /, ** or *, make it match anywhere
  if (!glob.startsWith('/') && !glob.startsWith('**') && !glob.startsWith('*')) {
    glob = `**/${glob}`;
  }

  // If pattern starts with /, make it relative to root
  if (glob.startsWith('/')) {
    glob = glob.slice(1);
  }

  return glob;
}

/**
 * Check if a file path matches any of the ignore patterns
 * @param filePath The file path to check
 * @param patterns The ignore patterns
 * @returns True if the file should be ignored
 */
export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  // Normalize the file path
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (matchesPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple pattern matching for glob patterns
 * @param path The path to test
 * @param pattern The glob pattern
 * @returns True if the path matches the pattern
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
    .replace(/\?/g, '[^/]')
    .replace(/\./g, '\\.')
    .replace(/\//g, '\\/');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Create a .syncignore file with default patterns
 * @param rootPath The root directory to create the file in
 */
export async function createDefaultSyncignore(rootPath?: string): Promise<void> {
  const syncignorePath = path.join(rootPath ?? process.cwd(), '.syncignore');

  const content = `# Confluence Sync Ignore Patterns
# Similar to .gitignore syntax

# Dependencies
node_modules/
vendor/
bower_components/

# Build outputs
dist/
build/
out/
target/
*.dll
*.exe
*.so
*.dylib

# IDE files
.idea/
.vscode/
*.swp
*.swo
*~
.DS_Store
Thumbs.db

# Test coverage
coverage/
*.lcov
.nyc_output/

# Environment files
.env
.env.*
!.env.example

# Logs
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Temporary files
*.tmp
*.temp
tmp/
temp/

# Confluence sync files
.confluence-sync.json

# Custom patterns
# Add your custom ignore patterns below
`;

  try {
    await fs.writeFile(syncignorePath, content, 'utf-8');
    logger.info(`Created default .syncignore file at ${syncignorePath}`);
  }
  catch (error) {
    logger.error(`Failed to create .syncignore: ${(error as Error).message}`);
    throw error;
  }
}
