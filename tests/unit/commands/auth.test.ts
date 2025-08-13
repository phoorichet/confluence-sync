import { describe, expect, it } from 'vitest';

describe('auth command', () => {
  it('should be defined', async () => {
    const authCommandModule = await import('../../../src/commands/auth');
    const authCommand = authCommandModule.default || authCommandModule.authCommand;
    expect(authCommand).toBeDefined();
    expect(authCommand.name()).toBe('auth');
  });

  it('should have correct description', async () => {
    const authCommandModule = await import('../../../src/commands/auth');
    const authCommand = authCommandModule.default || authCommandModule.authCommand;
    expect(authCommand.description()).toBe('Authenticate with your Confluence instance');
  });

  it('should have correct options', async () => {
    const authCommandModule = await import('../../../src/commands/auth');
    const authCommand = authCommandModule.default || authCommandModule.authCommand;
    const options = authCommand.options;
    
    const urlOption = options.find((opt: any) => opt.short === '-u');
    expect(urlOption).toBeDefined();
    expect(urlOption?.long).toBe('--url');
    
    const emailOption = options.find((opt: any) => opt.short === '-e');
    expect(emailOption).toBeDefined();
    expect(emailOption?.long).toBe('--email');
    
    const tokenOption = options.find((opt: any) => opt.short === '-t');
    expect(tokenOption).toBeDefined();
    expect(tokenOption?.long).toBe('--token');
    
    const profileOption = options.find((opt: any) => opt.short === '-p');
    expect(profileOption).toBeDefined();
    expect(profileOption?.long).toBe('--profile');
  });

  it('should have subcommands', async () => {
    const authCommandModule = await import('../../../src/commands/auth');
    const authCommand = authCommandModule.default || authCommandModule.authCommand;
    const commands = authCommand.commands;
    
    const statusCommand = commands.find((cmd: any) => cmd.name() === 'status');
    expect(statusCommand).toBeDefined();
    expect(statusCommand?.description()).toContain('Check authentication status');
    
    const clearCommand = commands.find((cmd: any) => cmd.name() === 'clear');
    expect(clearCommand).toBeDefined();
    expect(clearCommand?.description()).toContain('Remove stored credentials');
  });
});

// Note: Full integration testing of the auth command with mocked dependencies
// requires a test runner with proper module mocking support (like Jest or Vitest with Node.js).
// Bun's test runner doesn't support vi.mock() for module-level mocking, which is needed
// to test the actual authentication flow since AuthManager.getInstance() is called
// at the module level when the auth command is imported.