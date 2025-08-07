import { describe, expect, it } from 'vitest';
import { getPackageInfo, getPackageName, getVersion } from '../../../src/utils/package-info';

describe('Package Info Utilities', () => {
  it('should return package information', () => {
    const packageInfo = getPackageInfo();
    expect(packageInfo).toBeDefined();
    expect(packageInfo.name).toBe('confluence-sync');
    expect(packageInfo.version).toBeDefined();
    expect(packageInfo.description).toBeDefined();
  });

  it('should return package version', () => {
    const version = getVersion();
    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should return package name', () => {
    const name = getPackageName();
    expect(name).toBe('confluence-sync');
  });

  it('should cache package.json data', () => {
    // Call twice to ensure caching works
    const firstCall = getPackageInfo();
    const secondCall = getPackageInfo();
    expect(firstCall).toBe(secondCall); // Should be the same reference
  });
});