import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');

  cachedPackageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf-8'),
  ) as PackageJson;

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
