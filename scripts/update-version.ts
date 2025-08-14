#!/usr/bin/env bun
/**
 * Script to update the hardcoded version in package-info.ts
 * This ensures the fallback version matches package.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const packageJsonPath = join(rootDir, 'package.json');
const packageInfoPath = join(rootDir, 'src', 'utils', 'package-info.ts');

// Read package.json
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;
const name = packageJson.name;
const description = packageJson.description;

console.log(`Updating package-info.ts with version ${version}`);

// Read package-info.ts
let packageInfoContent = readFileSync(packageInfoPath, 'utf-8');

// Update the version in the fallback section
const versionRegex = /version: '[^']+', \/\/ TODO: Update this with each release/;
packageInfoContent = packageInfoContent.replace(
  versionRegex,
  `version: '${version}', // TODO: Update this with each release`
);

// Also update name and description if they changed
const nameRegex = /name: 'confluence-sync',/;
packageInfoContent = packageInfoContent.replace(
  nameRegex,
  `name: '${name}',`
);

const descRegex = /description: '[^']+',/;
packageInfoContent = packageInfoContent.replace(
  descRegex,
  `description: '${description}',`
);

// Write back the updated content
writeFileSync(packageInfoPath, packageInfoContent);

console.log('✅ Version updated successfully');