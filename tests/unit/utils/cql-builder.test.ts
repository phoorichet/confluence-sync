import { describe, expect, it } from 'vitest';
import { CQLBuilder } from '../../../src/utils/cql-builder';

describe('cQLBuilder', () => {
  describe('addTextSearch', () => {
    it('should add text search condition', () => {
      const cql = new CQLBuilder()
        .addTextSearch('test query')
        .build();

      expect(cql).toBe('text ~ "test query"');
    });

    it('should escape quotes in search text', () => {
      const cql = new CQLBuilder()
        .addTextSearch('test "quoted" text')
        .build();

      expect(cql).toBe('text ~ "test \\"quoted\\" text"');
    });
  });

  describe('addAuthorFilter', () => {
    it('should add author filter', () => {
      const cql = new CQLBuilder()
        .addAuthorFilter('john.doe')
        .build();

      expect(cql).toBe('creator = "john.doe"');
    });
  });

  describe('addDateFilter', () => {
    it('should format ISO date correctly', () => {
      const cql = new CQLBuilder()
        .addDateFilter('lastmodified', '>', '2025-01-15T10:30:00Z')
        .build();

      expect(cql).toBe('lastmodified > "2025-01-15"');
    });

    it('should handle different operators', () => {
      const builder = new CQLBuilder();

      builder.addDateFilter('created', '>=', '2025-01-01');
      expect(builder.build()).toContain('created >= "2025-01-01"');

      builder.reset();
      builder.addDateFilter('updated', '<', '2025-12-31');
      expect(builder.build()).toContain('updated < "2025-12-31"');
    });

    it('should throw error for invalid date', () => {
      const builder = new CQLBuilder();

      expect(() => {
        builder.addDateFilter('lastmodified', '>', 'invalid-date');
      }).toThrow('Invalid date format');
    });
  });

  describe('addLabelFilter', () => {
    it('should add single label filter', () => {
      const cql = new CQLBuilder()
        .addLabelFilter(['important'])
        .build();

      expect(cql).toBe('label = "important"');
    });

    it('should add multiple labels with OR', () => {
      const cql = new CQLBuilder()
        .addLabelFilter(['important', 'urgent', 'critical'])
        .build();

      expect(cql).toBe('(label = "important" OR label = "urgent" OR label = "critical")');
    });

    it('should handle empty label array', () => {
      const cql = new CQLBuilder()
        .addLabelFilter([])
        .build();

      expect(cql).toBe('type = "page"'); // Default when no conditions
    });
  });

  describe('addSpaceFilter', () => {
    it('should add single space filter', () => {
      const cql = new CQLBuilder()
        .addSpaceFilter(['DEV'])
        .build();

      expect(cql).toBe('space = "DEV"');
    });

    it('should add multiple spaces with OR', () => {
      const cql = new CQLBuilder()
        .addSpaceFilter(['DEV', 'PROD', 'TEST'])
        .build();

      expect(cql).toBe('(space = "DEV" OR space = "PROD" OR space = "TEST")');
    });
  });

  describe('addTypeFilter', () => {
    it('should add type filter for page', () => {
      const cql = new CQLBuilder()
        .addTypeFilter('page')
        .build();

      expect(cql).toBe('type = "page"');
    });

    it('should add type filter for blogpost', () => {
      const cql = new CQLBuilder()
        .addTypeFilter('blogpost')
        .build();

      expect(cql).toBe('type = "blogpost"');
    });
  });

  describe('complex queries', () => {
    it('should combine multiple conditions with AND', () => {
      const cql = new CQLBuilder()
        .addTextSearch('api documentation')
        .addAuthorFilter('john.doe')
        .addSpaceFilter(['DEV'])
        .addLabelFilter(['api', 'docs'])
        .addDateFilter('lastmodified', '>', '2025-01-01')
        .build();

      expect(cql).toContain('text ~ "api documentation"');
      expect(cql).toContain('AND');
      expect(cql).toContain('creator = "john.doe"');
      expect(cql).toContain('space = "DEV"');
      expect(cql).toContain('(label = "api" OR label = "docs")');
      expect(cql).toContain('lastmodified > "2025-01-01"');
    });
  });

  describe('reset', () => {
    it('should clear all conditions', () => {
      const builder = new CQLBuilder()
        .addTextSearch('test')
        .addAuthorFilter('john');

      expect(builder.build()).toContain('test');
      expect(builder.build()).toContain('john');

      builder.reset();
      expect(builder.build()).toBe('type = "page"'); // Default
    });
  });

  describe('static helper methods', () => {
    it('should create recentlyModified query', () => {
      const cql = CQLBuilder.recentlyModified(7);
      expect(cql).toMatch(/lastmodified > "\d{4}-\d{2}-\d{2}"/);
    });

    it('should create byAuthor query', () => {
      const cql = CQLBuilder.byAuthor('jane.smith');
      expect(cql).toBe('creator = "jane.smith"');
    });

    it('should create inSpace query', () => {
      const cql = CQLBuilder.inSpace('PROD');
      expect(cql).toBe('space = "PROD"');
    });

    it('should create withLabel query', () => {
      const cql = CQLBuilder.withLabel('archived');
      expect(cql).toBe('label = "archived"');
    });
  });
});
