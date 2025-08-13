import { describe, expect, it } from 'vitest';
import { createGlobFilter, globMatch, globMatchMultiple } from '../../../src/utils/glob-matcher';

describe('glob-matcher', () => {
  describe('globMatch', () => {
    it('should match simple wildcards', () => {
      expect(globMatch('test.md', '*.md')).toBe(true);
      expect(globMatch('test.txt', '*.md')).toBe(false);
      expect(globMatch('src/test.js', 'src/*.js')).toBe(true);
      expect(globMatch('lib/test.js', 'src/*.js')).toBe(false);
    });

    it('should match double wildcards', () => {
      expect(globMatch('src/components/Button.tsx', '**/*.tsx')).toBe(true);
      expect(globMatch('deep/nested/path/file.tsx', '**/*.tsx')).toBe(true);
      expect(globMatch('file.js', '**/*.tsx')).toBe(false);
    });

    it('should match question marks', () => {
      expect(globMatch('test.md', 'test.?d')).toBe(true);
      expect(globMatch('test.md', 'te?t.md')).toBe(true);
      expect(globMatch('test.md', 't??t.md')).toBe(true);
      expect(globMatch('test.md', 't????.md')).toBe(false);
    });

    it('should match character classes', () => {
      expect(globMatch('test1.md', 'test[0-9].md')).toBe(true);
      expect(globMatch('test5.md', 'test[0-9].md')).toBe(true);
      expect(globMatch('testa.md', 'test[0-9].md')).toBe(false);
      expect(globMatch('testA.md', 'test[A-Z].md')).toBe(true);
    });

    it('should handle negative patterns', () => {
      expect(globMatch('test.md', '!*.txt')).toBe(true);
      expect(globMatch('test.txt', '!*.txt')).toBe(false);
      expect(globMatch('src/test.js', '!lib/*')).toBe(true);
      expect(globMatch('lib/test.js', '!lib/*')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(globMatch('Test.MD', '*.md')).toBe(true);
      expect(globMatch('TEST.md', 'test.*')).toBe(true);
      expect(globMatch('TeSt.Md', 'test.md')).toBe(true);
    });
  });

  describe('globMatchMultiple', () => {
    it('should match if any positive pattern matches', () => {
      const patterns = ['*.md', '*.txt', '*.doc'];
      expect(globMatchMultiple('test.md', patterns)).toBe(true);
      expect(globMatchMultiple('test.txt', patterns)).toBe(true);
      expect(globMatchMultiple('test.pdf', patterns)).toBe(false);
    });

    it('should exclude if any negative pattern matches', () => {
      const patterns = ['*.md', '!draft-*'];
      expect(globMatchMultiple('test.md', patterns)).toBe(true);
      expect(globMatchMultiple('draft-test.md', patterns)).toBe(false);
    });

    it('should handle mixed positive and negative patterns', () => {
      const patterns = ['src/**/*.js', '!src/vendor/**', '!**/*.test.js'];
      expect(globMatchMultiple('src/components/Button.js', patterns)).toBe(true);
      expect(globMatchMultiple('src/vendor/library.js', patterns)).toBe(false);
      expect(globMatchMultiple('src/components/Button.test.js', patterns)).toBe(false);
    });

    it('should include by default with only negative patterns', () => {
      const patterns = ['!*.tmp', '!*.bak'];
      expect(globMatchMultiple('test.md', patterns)).toBe(true);
      expect(globMatchMultiple('test.tmp', patterns)).toBe(false);
      expect(globMatchMultiple('test.bak', patterns)).toBe(false);
    });
  });

  describe('createGlobFilter', () => {
    it('should create filter function from single pattern', () => {
      const filter = createGlobFilter('*.md');
      expect(filter('test.md')).toBe(true);
      expect(filter('test.txt')).toBe(false);
    });

    it('should create filter function from multiple patterns', () => {
      const filter = createGlobFilter(['*.md', '*.txt', '!draft-*']);
      expect(filter('test.md')).toBe(true);
      expect(filter('test.txt')).toBe(true);
      expect(filter('draft-test.md')).toBe(false);
      expect(filter('test.pdf')).toBe(false);
    });

    it('should handle complex filtering scenarios', () => {
      const filter = createGlobFilter([
        'docs/**/*.md',
        '!docs/internal/**',
        '!**/_*.md',
      ]);

      expect(filter('docs/guide/intro.md')).toBe(true);
      expect(filter('docs/api/reference.md')).toBe(true);
      expect(filter('docs/internal/secret.md')).toBe(false);
      expect(filter('docs/guide/_draft.md')).toBe(false);
      expect(filter('src/test.md')).toBe(false);
    });
  });
});
