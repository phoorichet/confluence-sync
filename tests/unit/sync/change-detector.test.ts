import type { Page } from '../../../src/storage/manifest-manager';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { apiClient } from '../../../src/api/client';
import { ChangeDetector } from '../../../src/sync/change-detector';
import * as hashUtils from '../../../src/utils/hash';

describe('ChangeDetector', () => {
  let changeDetector: ChangeDetector;
  let apiClientSpy: Mock<any>;
  let existsSyncSpy: Mock<any>;
  let calculateFileHashSpy: Mock<any>;

  const mockPage: Page = {
    id: '123',
    spaceKey: 'TEST',
    title: 'Test Page',
    version: 1,
    parentId: null,
    lastModified: new Date(),
    localPath: 'test.md',
    contentHash: 'abc123',
    status: 'synced',
  };

  beforeEach(() => {
    changeDetector = ChangeDetector.getInstance();

    // Mock API client
    vi.spyOn(apiClient, 'initialize').mockResolvedValue();
    apiClientSpy = vi.spyOn(apiClient, 'getPage').mockResolvedValue({
      id: '123',
      title: 'Test Page',
      version: { number: 1 },
    });

    // Mock file system
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    // Mock hash utilities
    calculateFileHashSpy = vi.spyOn(hashUtils, 'calculateFileHash').mockReturnValue('abc123');
  });

  afterEach(() => {
    apiClientSpy.mockRestore();
    existsSyncSpy.mockRestore();
    calculateFileHashSpy.mockRestore();
  });

  describe('detectLocalChanges', () => {
    it('should detect no changes when hashes match', async () => {
      calculateFileHashSpy.mockReturnValue('abc123');

      const hasChanges = await changeDetector.detectLocalChanges(mockPage);

      expect(hasChanges).toBe(false);
    });

    it('should detect changes when hashes differ', async () => {
      calculateFileHashSpy.mockReturnValue('xyz789');

      const hasChanges = await changeDetector.detectLocalChanges(mockPage);

      expect(hasChanges).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      existsSyncSpy.mockReturnValue(false);

      const hasChanges = await changeDetector.detectLocalChanges(mockPage);

      expect(hasChanges).toBe(false);
      expect(calculateFileHashSpy).not.toHaveBeenCalled();
    });

    it('should handle absolute paths correctly', async () => {
      await changeDetector.detectLocalChanges(mockPage);

      expect(existsSyncSpy).toHaveBeenCalledWith(path.resolve('test.md'));
    });
  });

  describe('detectRemoteChanges', () => {
    it('should detect no changes when versions match', async () => {
      apiClientSpy.mockResolvedValue({
        id: '123',
        version: { number: 1 },
      });

      const hasChanges = await changeDetector.detectRemoteChanges(mockPage);

      expect(hasChanges).toBe(false);
    });

    it('should detect changes when remote version is higher', async () => {
      apiClientSpy.mockResolvedValue({
        id: '123',
        version: { number: 2 },
      });

      const hasChanges = await changeDetector.detectRemoteChanges(mockPage);

      expect(hasChanges).toBe(true);
    });

    it('should return false when remote page not found', async () => {
      apiClientSpy.mockResolvedValue(null);

      const hasChanges = await changeDetector.detectRemoteChanges(mockPage);

      expect(hasChanges).toBe(false);
    });

    it('should handle missing version field', async () => {
      apiClientSpy.mockResolvedValue({
        id: '123',
      });

      const hasChanges = await changeDetector.detectRemoteChanges(mockPage);

      expect(hasChanges).toBe(false);
    });
  });

  describe('getChangeState', () => {
    it('should return unchanged when no changes', async () => {
      calculateFileHashSpy.mockReturnValue('abc123');
      apiClientSpy.mockResolvedValue({
        id: '123',
        version: { number: 1 },
      });

      const state = await changeDetector.getChangeState(mockPage);

      expect(state).toBe('unchanged');
    });

    it('should return local-only when only local changes', async () => {
      calculateFileHashSpy.mockReturnValue('xyz789');
      apiClientSpy.mockResolvedValue({
        id: '123',
        version: { number: 1 },
      });

      const state = await changeDetector.getChangeState(mockPage);

      expect(state).toBe('local-only');
    });

    it('should return remote-only when only remote changes', async () => {
      calculateFileHashSpy.mockReturnValue('abc123');
      apiClientSpy.mockResolvedValue({
        id: '123',
        version: { number: 2 },
      });

      const state = await changeDetector.getChangeState(mockPage);

      expect(state).toBe('remote-only');
    });

    it('should return both-changed when both have changes', async () => {
      calculateFileHashSpy.mockReturnValue('xyz789');
      apiClientSpy.mockResolvedValue({
        id: '123',
        version: { number: 2 },
      });

      const state = await changeDetector.getChangeState(mockPage);

      expect(state).toBe('both-changed');
    });
  });

  describe('detectBatchChanges', () => {
    it('should process multiple pages', async () => {
      const pages: Page[] = [
        mockPage,
        { ...mockPage, id: '456', localPath: 'test2.md' },
        { ...mockPage, id: '789', localPath: 'test3.md' },
      ];

      const results = await changeDetector.detectBatchChanges(pages);

      expect(results).toHaveLength(3);
      expect(results[0].pageId).toBe('123');
      expect(results[1].pageId).toBe('456');
      expect(results[2].pageId).toBe('789');
    });

    it('should handle errors gracefully', async () => {
      apiClientSpy.mockRejectedValueOnce(new Error('API error'));

      const results = await changeDetector.detectBatchChanges([mockPage]);

      expect(results).toHaveLength(1);
      expect(results[0].state).toBe('unchanged');
    });

    it('should process in batches', async () => {
      const pages: Page[] = [];
      for (let i = 0; i < 12; i++) {
        pages.push({ ...mockPage, id: `page-${i}`, localPath: `test${i}.md` });
      }

      const results = await changeDetector.detectBatchChanges(pages);

      expect(results).toHaveLength(12);
      // API should be called for each page (12 times) plus once for each page in getChangeState (12 times) = 24 total
      expect(apiClient.getPage).toHaveBeenCalledTimes(24);
    });
  });

  describe('isLocalFilePresent', () => {
    it('should return true when file exists', () => {
      existsSyncSpy.mockReturnValue(true);

      const present = changeDetector.isLocalFilePresent(mockPage);

      expect(present).toBe(true);
    });

    it('should return false when file does not exist', () => {
      existsSyncSpy.mockReturnValue(false);

      const present = changeDetector.isLocalFilePresent(mockPage);

      expect(present).toBe(false);
    });
  });

  describe('getCurrentFileHash', () => {
    it('should return hash when file exists', () => {
      existsSyncSpy.mockReturnValue(true);
      calculateFileHashSpy.mockReturnValue('newhash');

      const hash = changeDetector.getCurrentFileHash(mockPage);

      expect(hash).toBe('newhash');
    });

    it('should return null when file does not exist', () => {
      existsSyncSpy.mockReturnValue(false);

      const hash = changeDetector.getCurrentFileHash(mockPage);

      expect(hash).toBeNull();
    });

    it('should return null on error', () => {
      existsSyncSpy.mockReturnValue(true);
      calculateFileHashSpy.mockImplementation(() => {
        throw new Error('Hash error');
      });

      const hash = changeDetector.getCurrentFileHash(mockPage);

      expect(hash).toBeNull();
    });
  });
});
