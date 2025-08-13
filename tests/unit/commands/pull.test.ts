import { describe, expect, it } from 'vitest';

describe('pull Command', () => {
  it('should be defined', async () => {
    const { pullCommand } = await import('../../../src/commands/pull');
    expect(pullCommand).toBeDefined();
    expect(pullCommand.name()).toBe('pull');
  });

  it('should have correct description', async () => {
    const { pullCommand } = await import('../../../src/commands/pull');
    expect(pullCommand.description()).toBe('Pull Confluence page(s) to local filesystem as Markdown');
  });

  it('should accept page ID argument', async () => {
    const { pullCommand } = await import('../../../src/commands/pull');
    // Check the command usage includes the optional pageId argument
    const usage = pullCommand.usage();
    expect(usage).toContain('[pageId]');
  });

  it('should have correct options', async () => {
    const { pullCommand } = await import('../../../src/commands/pull');
    const options = pullCommand.options;
    
    // Check we have the expected number of options
    expect(options.length).toBe(4);
    
    const outputOption = options.find((opt: any) => opt.short === '-o');
    expect(outputOption).toBeDefined();
    expect(outputOption?.long).toBe('--output');
    expect(outputOption?.description).toContain('Output directory');
    
    const spaceOption = options.find((opt: any) => opt.short === '-s');
    expect(spaceOption).toBeDefined();
    expect(spaceOption?.long).toBe('--space');
    expect(spaceOption?.description).toContain('Confluence space');
    
    const recursiveOption = options.find((opt: any) => opt.short === '-r');
    expect(recursiveOption).toBeDefined();
    expect(recursiveOption?.long).toBe('--recursive');
    expect(recursiveOption?.description).toContain('children');
    
    const depthOption = options.find((opt: any) => opt.long === '--max-depth');
    expect(depthOption).toBeDefined();
    expect(depthOption?.description).toContain('Maximum depth');
  });

  it('should have correct argument definition', async () => {
    const { pullCommand } = await import('../../../src/commands/pull');
    // Command should accept an optional pageId argument
    const usage = pullCommand.usage();
    expect(usage).toContain('[pageId]');
    expect(pullCommand.description()).toContain('Markdown');
  });
});

// Note: Full integration testing of the pull command with mocked dependencies
// requires a test runner with proper module mocking support (like Jest or Vitest with Node.js).
// Bun's test runner doesn't support vi.mock() for module-level mocking, which is needed
// to test the actual pull logic since apiClient is instantiated at the module level.