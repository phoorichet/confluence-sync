# confluence-sync

A powerful CLI tool for bidirectional synchronization between Confluence and local Markdown files. Built with TypeScript and Bun runtime for optimal performance.

> **⚠️ Disclaimer**: This is an independent, open-source tool and is not officially associated with, endorsed by, or supported by Atlassian or Confluence. "Confluence" is a trademark of Atlassian Corporation. This tool uses the public Confluence REST API for synchronization purposes.

> **🤖 AI-Powered Development**: This project is built using [Claude Code](https://claude.ai/code) with the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) methodology, combining AI assistance with structured software engineering practices throughout the development lifecycle.

## Features

- 🔄 Bidirectional sync between Confluence and local Markdown files
- 📁 Full page hierarchy and space support
- 🔐 Secure credential storage using system keychain
- 📝 Confluence storage format to Markdown conversion
- 👁️ Watch mode for automatic synchronization
- 🚀 Concurrent operations with rate limiting
- 🛡️ Conflict detection and resolution
- 📊 Progress tracking for bulk operations
- 🔧 Circuit breaker for API resilience
- 📈 Performance monitoring and caching

## Installation

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.2.0 or higher)
- Confluence instance (Cloud or Server)
- API token or password for authentication

### Install Dependencies

```bash
bun install
```

### Build the Project

```bash
bun run build
```

### Initial Setup

Initialize your Confluence sync configuration:

```bash
# Interactive mode (if running with Node.js)
bun run cli init

# Non-interactive mode (required when using Bun directly)
bun ./src/cli.ts init --url https://your-domain.atlassian.net --email your@email.com --token YOUR_API_TOKEN

# Optional: specify a custom sync directory
bun ./src/cli.ts init --url https://your-domain.atlassian.net --email your@email.com --token YOUR_API_TOKEN --dir ./my-docs
```

> **Note**: Due to Bun's TTY limitations, interactive prompts are not supported when running directly with Bun. All required options must be provided via command-line arguments.

## Authentication

Before using the sync commands, you need to authenticate with your Confluence instance:

```bash
# Authenticate with Confluence (interactive prompts)
bun run cli auth login

# Check current authentication status
bun run cli auth status

# Remove stored credentials
bun run cli auth logout
```

### Authentication Methods

- **Cloud**: Use your email and an API token from https://id.atlassian.com/manage/api-tokens
- **Server**: Use your username and password

## Usage Examples

### Pull Commands

#### Pull a Single Page

```bash
# Pull a specific page by ID
bun run cli pull 123456789

# Pull to a specific directory
bun run cli pull 123456789 --output ./docs

# Pull a page and all its children recursively
bun run cli pull 123456789 --recursive

# Limit recursion depth (default: 10)
bun run cli pull 123456789 --recursive --max-depth 5
```

#### Pull an Entire Space

```bash
# Pull all pages from a Confluence space
bun run cli pull --space MYSPACE

# Pull space to a specific directory
bun run cli pull --space MYSPACE --output ./wiki

# The space structure will be preserved as:
# ./wiki/
# ├── 001-homepage/
# │   ├── _index.md        (Homepage content)
# │   ├── 002-child-page.md
# │   └── 003-another-child/
# │       ├── _index.md
# │       └── 004-grandchild.md
```

### Push Commands

#### Push a Single File

```bash
# Push a Markdown file to update an existing Confluence page
bun run cli push ./docs/page.md --page-id 123456789

# Create a new page in a space
bun run cli push ./docs/new-page.md --space MYSPACE --title "New Page Title"

# Create a child page under a parent
bun run cli push ./docs/child.md --parent-id 987654321 --title "Child Page"
```

#### Push Multiple Files

```bash
# Push all Markdown files in a directory (bulk hierarchy push)
bun run cli push ./docs --recursive --space MYSPACE

# The tool will:
# 1. Scan the directory structure
# 2. Create parent pages before children
# 3. Maintain the hierarchy in Confluence
# 4. Report any failed pages at the end

# Example: Push a documentation directory
bun run cli push ./documentation --recursive --space DOCS

# With a specific parent page
bun run cli push ./docs/guides --recursive --parent-id 123456789
```

### Sync Commands

#### Intelligent Bidirectional Sync

```bash
# Sync current directory with Confluence
bun run cli sync

# Sync a specific directory
bun run cli sync ./docs

# Sync with specific conflict resolution strategy
bun run cli sync --strategy local-first  # Local changes take precedence
bun run cli sync --strategy remote-first # Confluence changes take precedence
bun run cli sync --strategy manual       # Prompt for each conflict (default)

# Dry run to preview changes without applying them
bun run cli sync --dry-run
```

### Watch Mode

#### Automatic Synchronization on File Changes

```bash
# Start watching for file changes and sync automatically
bun run cli watch

# Customize debounce delay (milliseconds)
bun run cli watch --debounce 5000

# Set max retry attempts on failure
bun run cli watch --retry 5

# Disable desktop notifications
bun run cli watch --no-notifications

# Output in JSON format for scripting
bun run cli watch --json
```

Watch mode features:
- Monitors all Markdown files for changes
- Debounces rapid edits to avoid excessive API calls
- Automatically retries on network failures
- Respects `.syncignore` patterns
- Shows real-time status indicators

### Working with Page Hierarchies

When pulling spaces or recursive pages, the tool preserves the Confluence hierarchy in your local filesystem:

```bash
# Example: Pull a documentation space
bun run cli pull --space DOCS --output ./documentation

# Result structure:
# ./documentation/
# ├── 001-getting-started/
# │   ├── _index.md           # Parent page content
# │   ├── 002-installation.md # Child page
# │   ├── 003-configuration.md # Child page
# │   └── 004-advanced/
# │       ├── _index.md       # Nested parent
# │       └── 005-api.md      # Grandchild page
# └── 006-troubleshooting.md  # Root-level page
```

**Note**:
- Folders with `_index.md` represent pages that have children
- Direct `.md` files represent leaf pages
- Numbers prefix (001, 002, etc.) maintain Confluence page ordering

### Status and Health Commands

```bash
# Show sync status of tracked files
bun run cli status

# Filter status by space
bun run cli status --space MYSPACE

# Output status in JSON format
bun run cli status --json

# Check system health and connectivity
bun run cli health

# Run all health checks
bun run cli health --all
```

### Conflict Resolution

```bash
# List all conflicted files
bun run cli conflicts list

# Resolve conflicts interactively
bun run cli conflicts resolve

# Resolve all conflicts with a strategy
bun run cli conflicts resolve --strategy local-first
bun run cli conflicts resolve --strategy remote-first
```

### Advanced Options

#### Global Options

```bash
# Specify a different config profile
bun run cli --profile production pull 123456789

# Increase verbosity for debugging
bun run cli --verbose sync

# Suppress all output except errors
bun run cli --quiet push ./docs
```

#### Performance Tuning

```bash
# Adjust concurrent operations (default: 5)
bun run cli sync --concurrent 10

# Set custom rate limits for API calls
bun run cli pull --space MYSPACE --rate-limit 100
```

## Configuration

The tool stores configuration and sync state in `.confluence-sync.json` in your project root:

```json
{
  "version": "2.0.0",
  "confluenceUrl": "https://mycompany.atlassian.net/wiki/api/v2",
  "lastSyncTime": "2025-01-09T10:30:00Z",
  "syncMode": "manual",
  "pages": [], // Tracked pages with metadata
  "spaces": [], // Space information
  "folders": [], // Folder hierarchy
  "config": {
    "profile": "default",
    "includePatterns": ["**/*.md"],
    "excludePatterns": [],
    "concurrentOperations": 5,
    "conflictStrategy": "manual",
    "cacheEnabled": true
  }
}
```

### Ignore Patterns

Create a `.syncignore` file to exclude files from synchronization:

```bash
# Dependencies
node_modules/
vendor/

# Build outputs
dist/
build/

# IDE files
.idea/
.vscode/

# Temporary files
*.tmp
*.swp

# Custom patterns
drafts/
**/README.md
```

## Manifest File

The tool maintains a `.confluence-sync.json` manifest that tracks:
- Page mappings between local files and Confluence IDs
- Version numbers for conflict detection
- Content hashes for change detection
- Space metadata and hierarchy information

**Note**: This file should be committed to version control to maintain sync state across team members.

## Available Commands

| Command | Description |
|---------|-------------|
| `auth` | Manage authentication (login/logout/status) |
| `completion` | Generate shell completion scripts |
| `conflicts` | Manage and resolve sync conflicts |
| `health` | Check system health and connectivity |
| `init` | Initialize sync configuration |
| `pull` | Pull pages from Confluence |
| `push` | Push files to Confluence |
| `status` | Show sync status |
| `sync` | Bidirectional synchronization |
| `watch` | Watch for changes and sync automatically |

## Error Codes

The tool uses specific error code ranges for different types of issues:

- `CS-100` to `CS-199`: Authentication errors
- `CS-200` to `CS-299`: API errors
- `CS-300` to `CS-399`: File system errors
- `CS-400` to `CS-499`: Sync errors
- `CS-500` to `CS-599`: Network errors
- `CS-600` to `CS-699`: Conflict errors
- `CS-700` to `CS-799`: Configuration errors
- `CS-800` to `CS-899`: Hierarchy errors
- `CS-900` to `CS-999`: Performance errors
- `CS-1000` to `CS-1099`: CLI errors
- `CS-1100` to `CS-1199`: Watch mode errors

## Development

This project is developed using [Claude Code](https://claude.ai/code) with the **BMAD method** (Business-Minded Agile Development). BMAD is a structured approach that combines business requirements, agile methodologies, and AI-assisted development to create high-quality software efficiently.

The codebase includes:
- User stories in `docs/stories/` following BMAD format
- Architecture documentation in `docs/architecture/`
- Product requirements in `docs/prd/`
- Development guidance in `CLAUDE.md` for AI-assisted coding

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test tests/unit/commands/pull.test.ts
```

### Building from Source

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run directly from source
bun run cli [command]
```

### Project Structure

```
confluence-sync/
├── src/
│   ├── api/          # Confluence API client and types
│   ├── auth/         # Authentication management
│   ├── commands/     # CLI command implementations
│   ├── converters/   # Format converters (Markdown ↔ Confluence)
│   ├── storage/      # File and manifest management
│   ├── sync/         # Sync engine and conflict resolution
│   └── utils/        # Utilities and helpers
├── tests/
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
└── docs/
    └── stories/      # Development stories and requirements
```

## Troubleshooting

### Common Issues

#### Authentication Fails
- For Confluence Cloud: Ensure you're using an API token, not your password
- For Confluence Server: Check if your instance URL includes the context path (e.g., `/confluence`)

#### Rate Limiting
- The tool automatically handles rate limits with exponential backoff
- For large spaces, consider using `--concurrent 3` to reduce parallel requests

#### Hierarchy Issues
- Circular references are automatically detected and logged
- Maximum depth is limited to prevent infinite recursion (configurable with `--max-depth`)

#### File Name Conflicts
- The tool sanitizes page titles for filesystem compatibility
- Reserved names (CON, PRN, etc.) are prefixed with `page-`
- Long titles are truncated to 100 characters

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Set log level to debug
export LOG_LEVEL=debug
bun run cli sync

# Or use verbose flag
bun run cli --verbose pull 123456789
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests, please create an issue on our GitHub repository.
