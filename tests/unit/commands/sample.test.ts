import { describe, expect, it } from 'vitest';

describe('sample Test Suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle strings correctly', () => {
    const message = 'Confluence Sync';
    expect(message).toContain('Sync');
  });
});
