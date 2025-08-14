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

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.2.0 or higher) or Node.js (v14 or higher)
- Confluence instance (Cloud or Server)
- API token or password for authentication

### Installation

No installation required! You can run confluence-sync directly using `bunx`:

```bash
# Run any command directly with bunx
bunx confluence-sync@latest --help
```

Alternatively, install globally:

```bash
# Using npm
npm install -g confluence-sync

# Using bun
bun install -g confluence-sync
```

### Initial Setup

#### 1. Create an API Token

**For Confluence Cloud (Atlassian):**
1. Go to [https://id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens)
2. Click **Create API token**
3. Give your token a descriptive name (e.g., "confluence-sync")
4. Click **Create**
5. Copy the generated token immediately (you won't be able to see it again)

**For Confluence Server/Data Center:**
- Use your regular username and password instead of an API token

#### 2. Initialize Configuration

Initialize your Confluence sync configuration:

```bash
# Interactive mode (will prompt for URL, email, and token)
bunx confluence-sync@latest init

# Non-interactive mode (provide all options)
bunx confluence-sync@latest init --url https://your-domain.atlassian.net --email your@email.com --token YOUR_API_TOKEN

# Optional: specify a custom sync directory
bunx confluence-sync@latest init --url https://your-domain.atlassian.net --email your@email.com --token YOUR_API_TOKEN --dir ./my-docs
```

**Note:** Replace `YOUR_API_TOKEN` with the token you created in step 1.

## Authentication

Before using the sync commands, you need to authenticate with your Confluence instance:

```bash
# Authenticate with Confluence (interactive prompts)
bunx confluence-sync@latest auth login

# Check current authentication status
bunx confluence-sync@latest auth status

# Remove stored credentials
bunx confluence-sync@latest auth logout
```

### Authentication Methods

- **Cloud**: Use your email and an API token from https://id.atlassian.com/manage/api-tokens
- **Server**: Use your username and password

## Usage Examples

### Pull Commands

#### Pull a Single Page

```bash
# Pull a specific page by ID
bunx confluence-sync@latest pull 123456789

# Pull to a specific directory
bunx confluence-sync@latest pull 123456789 --output ./docs

# Pull a page and all its children recursively
bunx confluence-sync@latest pull 123456789 --recursive

# Limit recursion depth (default: 10)
bunx confluence-sync@latest pull 123456789 --recursive --max-depth 5
```

#### Pull an Entire Space

```bash
# Pull all pages from a Confluence space
bunx confluence-sync@latest pull --space MYSPACE

# Pull space to a specific directory
bunx confluence-sync@latest pull --space MYSPACE --output ./wiki

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
bunx confluence-sync@latest push ./docs/page.md --page-id 123456789

# Create a new page in a space
bunx confluence-sync@latest push ./docs/new-page.md --space MYSPACE --title "New Page Title"

# Create a child page under a parent
bunx confluence-sync@latest push ./docs/child.md --parent-id 987654321 --title "Child Page"
```

#### Push Multiple Files

```bash
# Push all Markdown files in a directory (bulk hierarchy push)
bunx confluence-sync@latest push ./docs --recursive --space MYSPACE

# The tool will:
# 1. Scan the directory structure
# 2. Create parent pages before children
# 3. Maintain the hierarchy in Confluence
# 4. Report any failed pages at the end

# Example: Push a documentation directory
bunx confluence-sync@latest push ./documentation --recursive --space DOCS

# With a specific parent page
bunx confluence-sync@latest push ./docs/guides --recursive --parent-id 123456789
```

### Sync Commands

#### Intelligent Bidirectional Sync

```bash
# Sync current directory with Confluence
bunx confluence-sync@latest sync

# Sync a specific directory
bunx confluence-sync@latest sync ./docs

# Sync with specific conflict resolution strategy
bunx confluence-sync@latest sync --strategy local-first  # Local changes take precedence
bunx confluence-sync@latest sync --strategy remote-first # Confluence changes take precedence
bunx confluence-sync@latest sync --strategy manual       # Prompt for each conflict (default)

# Dry run to preview changes without applying them
bunx confluence-sync@latest sync --dry-run
```

### Watch Mode

#### Automatic Synchronization on File Changes

```bash
# Start watching for file changes and sync automatically
bunx confluence-sync@latest watch

# Customize debounce delay (milliseconds)
bunx confluence-sync@latest watch --debounce 5000

# Set max retry attempts on failure
bunx confluence-sync@latest watch --retry 5

# Disable desktop notifications
bunx confluence-sync@latest watch --no-notifications

# Output in JSON format for scripting
bunx confluence-sync@latest watch --json
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
bunx confluence-sync@latest pull --space DOCS --output ./documentation

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
bunx confluence-sync@latest status

# Filter status by space
bunx confluence-sync@latest status --space MYSPACE

# Output status in JSON format
bunx confluence-sync@latest status --json

# Check system health and connectivity
bunx confluence-sync@latest health

# Run all health checks
bunx confluence-sync@latest health --all
```

### Conflict Resolution

```bash
# List all conflicted files
bunx confluence-sync@latest conflicts list

# Resolve conflicts interactively
bunx confluence-sync@latest conflicts resolve

# Resolve all conflicts with a strategy
bunx confluence-sync@latest conflicts resolve --strategy local-first
bunx confluence-sync@latest conflicts resolve --strategy remote-first
```

### Advanced Options

#### Global Options

```bash
# Use a specific configuration profile for a single command
bunx confluence-sync@latest --profile production pull 123456789

# Or switch profiles permanently
bunx confluence-sync@latest use production
bunx confluence-sync@latest pull 123456789  # Uses production profile

# Increase verbosity for debugging
bunx confluence-sync@latest --verbose sync

# Suppress all output except errors
bunx confluence-sync@latest --quiet push ./docs
```

#### Performance Tuning

```bash
# Adjust concurrent operations (default: 5)
bunx confluence-sync@latest sync --concurrent 10

# Set custom rate limits for API calls
bunx confluence-sync@latest pull --space MYSPACE --rate-limit 100
```

## Configuration

The tool uses separate files for configuration and sync state:

### File Structure

- `csconfig.json` - Configuration profiles and settings
- `.csmanifest.json` - Sync state and page metadata (hidden file)
- `.csprofile` - Active profile marker (hidden file)

### Configuration File (`csconfig.json`)

Stores authentication profiles and settings:

```json
{
  "version": "1.0.0",
  "defaultProfile": "default",
  "profiles": {
    "default": {
      "confluenceUrl": "https://mycompany.atlassian.net/wiki/api/v2",
      "spaceKey": "MYSPACE",
      "authType": "token",
      "concurrentOperations": 5,
      "conflictStrategy": "manual",
      "includePatterns": ["**/*.md"],
      "excludePatterns": ["**/node_modules/**", "**/.git/**"],
      "cacheEnabled": true
    }
  },
  "shared": {
    "logLevel": "info",
    "retryAttempts": 3,
    "retryDelay": 1000
  }
}
```

### Managing Profiles

```bash
# List all configuration profiles
bunx confluence-sync@latest config list-profiles

# View current configuration
bunx confluence-sync@latest config view

# Create a new profile
bunx confluence-sync@latest config create-profile staging --url https://staging.atlassian.net --space STAGE

# Switch between profiles
bunx confluence-sync@latest use staging
bunx confluence-sync@latest use default

# Delete a profile
bunx confluence-sync@latest config delete-profile staging --force

# Get/set configuration values
bunx confluence-sync@latest config get spaceKey
bunx confluence-sync@latest config set concurrentOperations 10
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

The tool maintains a `.csmanifest.json` file that tracks:
- Page mappings between local files and Confluence IDs
- Version numbers for conflict detection
- Content hashes for change detection
- Space metadata and hierarchy information
- Sync operations history

The manifest file is automatically managed by the tool and contains:
```json
{
  "version": "1.0.0",
  "confluenceUrl": "https://mycompany.atlassian.net/wiki/api/v2",
  "lastSyncTime": "2025-01-09T10:30:00Z",
  "syncMode": "manual",
  "pages": {}, // Tracked pages with metadata
  "spaces": {}, // Space information
  "folders": {}, // Folder hierarchy
  "operations": [] // Sync history
}
```

**Note**: This file should be committed to version control to maintain sync state across team members.

## Available Commands

| Command | Description |
|---------|-------------|
| `auth` | Manage authentication (login/logout/status) |
| `completion` | Generate shell completion scripts |
| `config` | Manage configuration profiles and settings |
| `conflicts` | Manage and resolve sync conflicts |
| `health` | Check system health and connectivity |
| `init` | Initialize sync configuration |
| `pull` | Pull pages from Confluence |
| `push` | Push files to Confluence |
| `search` | Search for Confluence pages |
| `status` | Show sync status |
| `sync` | Bidirectional synchronization |
| `use` | Switch between configuration profiles |
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

### CI/CD Pipelines

This project uses GitHub Actions for continuous integration and deployment:

#### Continuous Integration (CI)
- **Branch**: `develop` (default branch)
- **Triggers**: Push and pull requests to `develop`
- **Actions**: Install dependencies, lint, build, and test
- **Purpose**: Ensure code quality and test coverage

#### Continuous Deployment (CD)
- **Branch**: `main` (release branch)
- **Triggers**: Push/merge to `main`
- **Actions**: CI steps + publish to npm registry
- **Purpose**: Automated releases to npmjs.com

#### Setting up GitHub Secrets

For the CD pipeline to publish to npm, you need to:

1. Generate an npm access token:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the generated token

2. Add the token to GitHub repository secrets:
   - Go to your repository's Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click "Add secret"

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
bunx confluence-sync@latest sync

# Or use verbose flag
bunx confluence-sync@latest --verbose pull 123456789
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests, please create an issue on our GitHub repository.
