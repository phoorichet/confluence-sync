import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger } from './logger.js';

/**
 * Calculate SHA-256 hash of a string
 */
export function calculateStringHash(content: string): string {
  try {
    const hash = createHash('sha256');
    hash.update(content, 'utf-8');
    return hash.digest('hex');
  }
  catch (error) {
    logger.error('Failed to calculate string hash', error);
    throw new Error(`CS-504: Failed to calculate hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate SHA-256 hash of a file
 */
export function calculateFileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return calculateStringHash(content);
  }
  catch (error) {
    logger.error('Failed to calculate file hash', error);
    throw new Error(`CS-504: Failed to calculate file hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compare two hashes for equality
 */
export function hashesMatch(hash1: string, hash2: string): boolean {
  return hash1 === hash2;
}

/**
 * Create a short hash for display purposes (first 8 characters)
 */
export function getShortHash(hash: string): string {
  return hash.substring(0, 8);
}
