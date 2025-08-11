import chalk from 'chalk';

export interface ErrorSuggestion {
  code: string;
  message: string;
  suggestions: string[];
  documentation?: string;
}

// Error code ranges:
// CS-001 to CS-099: General errors
// CS-100 to CS-199: Authentication errors
// CS-200 to CS-299: API errors
// CS-300 to CS-399: File system errors
// CS-400 to CS-499: Sync errors
// CS-500 to CS-599: Network errors
// CS-600 to CS-699: Conflict errors
// CS-700 to CS-799: Configuration errors
// CS-800 to CS-899: Hierarchy errors
// CS-900 to CS-999: Performance errors
// CS-1000 to CS-1099: CLI errors

const ERROR_SUGGESTIONS: Map<string, ErrorSuggestion> = new Map([
  // Authentication errors
  ['CS-101', {
    code: 'CS-101',
    message: 'Authentication failed',
    suggestions: [
      'Check your username/email and API token',
      'For Atlassian Cloud, use your email address and API token',
      'For Server/Data Center, use your username and Personal Access Token',
      'Verify your Confluence instance URL is correct',
    ],
    documentation: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  }],
  ['CS-102', {
    code: 'CS-102',
    message: 'Invalid credentials',
    suggestions: [
      'Run "confluence-sync auth" to re-authenticate',
      'Ensure your API token has not expired',
      'Check if your account has the necessary permissions',
    ],
  }],
  ['CS-103', {
    code: 'CS-103',
    message: 'Authentication token expired',
    suggestions: [
      'Run "confluence-sync auth" to refresh your authentication',
      'Generate a new API token if the current one has expired',
    ],
  }],

  // API errors
  ['CS-201', {
    code: 'CS-201',
    message: 'API rate limit exceeded',
    suggestions: [
      'Wait a few minutes before retrying',
      'Reduce the concurrency limit in your configuration',
      'Consider using batch operations for multiple pages',
    ],
  }],
  ['CS-202', {
    code: 'CS-202',
    message: 'Page not found',
    suggestions: [
      'Verify the page ID or URL is correct',
      'Check if you have permission to access this page',
      'Run "confluence-sync pull" to refresh the page list',
    ],
  }],

  // File system errors
  ['CS-301', {
    code: 'CS-301',
    message: 'Permission denied',
    suggestions: [
      'Check file permissions in your sync directory',
      'Ensure you have write access to the target directory',
      'Try running with appropriate permissions',
    ],
  }],
  ['CS-302', {
    code: 'CS-302',
    message: 'Directory not found',
    suggestions: [
      'Create the directory first using "mkdir -p <directory>"',
      'Check if the path is correct',
      'Use absolute paths to avoid confusion',
    ],
  }],

  // Sync errors
  ['CS-401', {
    code: 'CS-401',
    message: 'Sync conflict detected',
    suggestions: [
      'Run "confluence-sync status" to see conflicted files',
      'Use "--strategy" flag to specify resolution strategy',
      'Manually edit the conflicted files and resolve markers',
    ],
  }],
  ['CS-402', {
    code: 'CS-402',
    message: 'Manifest corrupted',
    suggestions: [
      'Back up your current work',
      'Delete .confluence-sync.json and run "confluence-sync init"',
      'Check if the manifest file has valid JSON',
    ],
  }],

  // Network errors
  ['CS-501', {
    code: 'CS-501',
    message: 'Connection timeout',
    suggestions: [
      'Check your internet connection',
      'Verify the Confluence URL is accessible',
      'Check if you\'re behind a proxy or firewall',
      'Try increasing the timeout in configuration',
    ],
  }],
  ['CS-502', {
    code: 'CS-502',
    message: 'DNS resolution failed',
    suggestions: [
      'Verify the Confluence URL is correct',
      'Check your DNS settings',
      'Try using the IP address instead of hostname',
    ],
  }],

  // Configuration errors
  ['CS-701', {
    code: 'CS-701',
    message: 'Configuration file not found',
    suggestions: [
      'Run "confluence-sync init" to create a configuration',
      'Check if .confluence-sync.json exists in the current directory',
      'Specify the config file path using --config flag',
    ],
  }],
  ['CS-702', {
    code: 'CS-702',
    message: 'Invalid configuration',
    suggestions: [
      'Check the JSON syntax in .confluence-sync.json',
      'Ensure all required fields are present',
      'Run "confluence-sync config validate" to check configuration',
    ],
  }],

  // CLI errors
  ['CS-1001', {
    code: 'CS-1001',
    message: 'Interactive prompt required but TTY not available',
    suggestions: [
      'Provide all required arguments via command line flags',
      'Set environment variables for required values',
      'Run in an interactive terminal',
    ],
  }],
  ['CS-1002', {
    code: 'CS-1002',
    message: 'User cancelled operation',
    suggestions: [
      'Run the command again when ready',
      'Use --force flag to skip confirmations',
    ],
  }],
]);

export class ConfluenceSyncError extends Error {
  public readonly code: string;
  public readonly suggestions: readonly string[];
  public readonly documentation?: string;

  // Store original error for debugging
  public readonly originalError?: Error;

  constructor(code: string, message?: string, originalError?: Error) {
    const errorSuggestion = ERROR_SUGGESTIONS.get(code);
    const errorMessage = message || errorSuggestion?.message || 'Unknown error';

    super(`${code}: ${errorMessage}`);

    this.name = 'ConfluenceSyncError';
    this.code = code;
    this.suggestions = Object.freeze(errorSuggestion?.suggestions || []);
    this.documentation = errorSuggestion?.documentation;
    this.originalError = originalError;

    // Preserve original stack trace if available
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ConfluenceSyncError.prototype);
  }

  public format(verbose = false): string {
    let output = chalk.red(`Error ${this.code}: ${this.message}`);

    if (this.suggestions.length > 0) {
      output += `\n\n${chalk.yellow('Suggestions:')}`;
      this.suggestions.forEach((suggestion) => {
        output += `\n  • ${chalk.gray(suggestion)}`;
      });
    }

    if (this.documentation) {
      output += `\n\n${chalk.blue('Documentation: ')}${chalk.gray(this.documentation)}`;
    }

    if (verbose && this.stack) {
      output += `\n\n${chalk.gray('Stack trace:')}`;
      output += `\n${chalk.gray(this.stack)}`;
    }

    return output;
  }
}

/**
 * Helper class for command typo suggestions
 */
export class CommandSuggester {
  private static commands = [
    'auth',
    'pull',
    'push',
    'sync',
    'status',
    'init',
    'config',
    'completion',
    'help',
  ];

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize first column
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    // Initialize first row
    for (let j = 0; j <= a.length; j++) {
      const row = matrix[0];
      if (row) {
        row[j] = j;
      }
    }

    // Calculate distances
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const currentRow = matrix[i];
        const prevRow = matrix[i - 1];

        if (!currentRow || !prevRow)
          continue;

        const prevValue = prevRow[j - 1];
        if (prevValue === undefined)
          continue;

        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          currentRow[j] = prevValue;
        }
        else {
          const substitution = prevValue + 1;
          const insertion = currentRow[j - 1] ?? Number.MAX_SAFE_INTEGER;
          const deletion = prevRow[j] ?? Number.MAX_SAFE_INTEGER;

          currentRow[j] = Math.min(substitution, insertion + 1, deletion + 1);
        }
      }
    }

    const finalRow = matrix[b.length];
    return finalRow?.[a.length] ?? 0;
  }

  /**
   * Find similar commands based on user input
   */
  public static suggestCommand(input: string, threshold = 2): string[] {
    const suggestions: Array<{ command: string; distance: number }> = [];

    for (const command of this.commands) {
      const distance = this.levenshteinDistance(input.toLowerCase(), command);
      if (distance <= threshold) {
        suggestions.push({ command, distance });
      }
    }

    // Sort by distance and return command names
    return suggestions
      .sort((a, b) => a.distance - b.distance)
      .map(s => s.command);
  }

  /**
   * Format "Did you mean?" message
   */
  public static formatDidYouMean(input: string): string | null {
    const suggestions = this.suggestCommand(input);

    if (suggestions.length === 0) {
      return null;
    }

    if (suggestions.length === 1) {
      return chalk.yellow(`Did you mean "${suggestions[0]}"?`);
    }

    return chalk.yellow(`Did you mean one of these?\n`)
      + suggestions.map(s => `  • ${s}`).join('\n');
  }
}

/**
 * Global error handler for the CLI
 */
export function handleError(error: unknown, verbose = false): void {
  if (error instanceof ConfluenceSyncError) {
    console.error(error.format(verbose));
  }
  else if (error instanceof Error) {
    // Try to map known error patterns to our error codes
    let code = 'CS-001'; // Default general error

    if (error.message.includes('EACCES')) {
      code = 'CS-301';
    }
    else if (error.message.includes('ENOENT')) {
      code = 'CS-302';
    }
    else if (error.message.includes('ETIMEDOUT')) {
      code = 'CS-501';
    }
    else if (error.message.includes('ENOTFOUND')) {
      code = 'CS-502';
    }
    else if (error.message.includes('401')) {
      code = 'CS-101';
    }
    else if (error.message.includes('429')) {
      code = 'CS-201';
    }
    else if (error.message.includes('404')) {
      code = 'CS-202';
    }

    const syncError = new ConfluenceSyncError(code, error.message, error);
    console.error(syncError.format(verbose));
  }
  else {
    console.error(chalk.red('An unexpected error occurred'));
    if (verbose) {
      console.error(error);
    }
  }
}

/**
 * Error mapper for sanitizing and formatting errors
 */
export class ErrorMapper {
  /**
   * Sanitize error messages to remove sensitive information
   */
  public static sanitizeError(error: Error): Error {
    let message = error.message;

    // Remove API tokens, passwords, and other sensitive data
    message = message.replace(/Bearer\s+[\w-]+/gi, 'Bearer [REDACTED]');
    message = message.replace(/Basic\s+[\w=+/]+/gi, 'Basic [REDACTED]');
    message = message.replace(/apiToken":\s*"[^"]+"/gi, 'apiToken":"[REDACTED]"');
    message = message.replace(/password":\s*"[^"]+"/gi, 'password":"[REDACTED]"');
    message = message.replace(/token=[\w-]+/gi, 'token=[REDACTED]');

    const sanitized = new Error(message);
    sanitized.name = error.name;
    sanitized.stack = error.stack;

    return sanitized;
  }
}
