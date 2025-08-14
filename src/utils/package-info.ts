import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  [key: string]: unknown;
}

let cachedPackageJson: PackageJson | null = null;

/**
 * Get the package.json contents. Uses caching to avoid repeated file reads.
 * @returns The parsed package.json object
 */
export function getPackageInfo(): PackageJson {
  if (cachedPackageJson) {
    return cachedPackageJson;
  }

  // Try multiple strategies to find package.json
  const possiblePaths = [
    // Try from current working directory (for local development)
    join(process.cwd(), 'package.json'),
    // Try from parent directories (for installed packages)
    join(process.cwd(), '..', 'package.json'),
    join(process.cwd(), '..', '..', 'package.json'),
    // Try from node_modules (when installed as dependency)
    join(process.cwd(), 'node_modules', 'confluence-sync', 'package.json'),
  ];
  
  // For bunx/npx, try to find package.json relative to the CLI script location
  // This uses a different approach that works in CommonJS
  if (typeof __dirname !== 'undefined') {
    possiblePaths.push(
      join(__dirname, '..', '..', 'package.json'),
      join(__dirname, '..', 'package.json'),
      join(__dirname, 'package.json'),
    );
  }

  for (const path of possiblePaths) {
    try {
      if (existsSync(path)) {
        cachedPackageJson = JSON.parse(
          readFileSync(path, 'utf-8'),
        ) as PackageJson;
        
        // Verify this is the right package
        if (cachedPackageJson.name === 'confluence-sync') {
          return cachedPackageJson;
        }
      }
    } catch {
      // Continue to next path
    }
  }

  // Fallback to hardcoded values if package.json can't be found
  // This ensures the CLI always works, even in unusual environments
  cachedPackageJson = {
    name: 'confluence-sync',
    version: '0.1.5', // TODO: Update this with each release
    description: 'Bi-directional sync tool for Confluence and local markdown files',
  };

  return cachedPackageJson;
}

/**
 * Get the package version
 * @returns The version string from package.json
 */
export function getVersion(): string {
  return getPackageInfo().version;
}

/**
 * Get the package name
 * @returns The name from package.json
 */
export function getPackageName(): string {
  return getPackageInfo().name;
}
