import { minimatch } from 'minimatch';

export function globMatch(text: string, pattern: string): boolean {
  // Support negative patterns with ! prefix
  if (pattern.startsWith('!')) {
    return !minimatch(text, pattern.substring(1), { nocase: true });
  }

  return minimatch(text, pattern, { nocase: true });
}

export function globMatchMultiple(text: string, patterns: string[]): boolean {
  // If any negative pattern matches, exclude the item
  for (const pattern of patterns) {
    if (pattern.startsWith('!') && minimatch(text, pattern.substring(1), { nocase: true })) {
      return false;
    }
  }

  // Check if any positive pattern matches
  const positivePatterns = patterns.filter(p => !p.startsWith('!'));
  if (positivePatterns.length === 0) {
    // If only negative patterns, include by default
    return true;
  }

  return positivePatterns.some(pattern => minimatch(text, pattern, { nocase: true }));
}

export function createGlobFilter(patterns: string | string[]): (text: string) => boolean {
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];
  return (text: string) => globMatchMultiple(text, patternArray);
}
