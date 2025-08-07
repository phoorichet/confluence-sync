# Epic 1: Foundation & Core Sync Infrastructure

Establish the foundational CLI application with TypeScript/Bun setup, Confluence authentication, and basic pull/push operations that allow users to edit documentation locally and sync changes back to Confluence. This delivers immediate value by enabling the core workflow of local editing with AI assistance.

## Story 1.1: Project Foundation & CLI Bootstrap

As a developer,
I want a properly configured TypeScript/Bun project with CLI entry point,
so that I have a solid foundation for building the sync tool.

### Acceptance Criteria

1: TypeScript project initialized with Bun runtime configuration and strict mode enabled
2: CLI framework (Commander.js) integrated with basic `confluence-sync` command that displays version and help
3: Build system configured using zshy to output both CJS and ESM modules to dist/
4: ESLint configured with project standards (2-space indent, single quotes, semicolons)
5: Vitest testing framework set up with sample test passing
6: Package.json configured for npm publishing with proper metadata and bin entry
7: Basic project structure created (src/commands, src/api, src/sync, src/utils)
8: Health check command implemented showing "Confluence Sync v{version} - OK"

## Story 1.2: Confluence Authentication

As a user,
I want to authenticate with my Confluence instance using API tokens,
so that I can securely access my documentation.

### Acceptance Criteria

1: `confluence-sync auth` command prompts for Confluence URL, username, and API token
2: Credentials stored securely in system keychain using keytar (never plain text)
3: Support for both Cloud (OAuth 2.0) and Server (PAT) authentication methods
4: Authentication verified by making test API call to Confluence
5: Clear error messages for invalid credentials or network issues
6: `confluence-sync auth:status` command shows current authentication status
7: `confluence-sync auth:clear` command removes stored credentials

## Story 1.3: OpenAPI Client Generation & Setup

As a developer,
I want auto-generated TypeScript types from Confluence OpenAPI spec,
so that I have type-safe API interactions.

### Acceptance Criteria

1: Script to download latest Confluence OpenAPI specification implemented
2: OpenAPI TypeScript generation configured to output to src/types/confluence.ts
3: openapi-fetch client initialized with authentication headers
4: Type-safe wrapper functions created for core API operations (getPage, updatePage)
5: Error handling middleware added for API responses
6: Rate limiting compliance built into client (respecting 5000 req/hour)
7: Generated types successfully compile with strict TypeScript settings

## Story 1.4: Basic Pull Command

As a user,
I want to pull Confluence pages to my local filesystem,
so that I can edit them with my preferred tools.

### Acceptance Criteria

1: `confluence-sync pull <pageId>` downloads single page content from Confluence
2: Page content converted from Confluence storage format to Markdown
3: Page saved to local filesystem with .md extension in current directory
4: Page metadata (ID, version, lastModified) stored in .confluence-sync.json manifest
5: Basic formatting preserved (headers, paragraphs, lists, links, code blocks)
6: Progress indicator shown during download
7: Success message displays local file path after completion

## Story 1.5: Basic Push Command

As a user,
I want to push my local changes back to Confluence,
so that my edits are reflected in the central documentation.

### Acceptance Criteria

1: `confluence-sync push <file>` uploads local Markdown file to Confluence
2: Markdown converted to Confluence storage format preserving formatting
3: Page version automatically incremented on Confluence
4: Manifest file updated with new version number
5: Simple conflict detection - warns if remote changed since last pull
6: Dry-run mode available with --dry-run flag showing what would change
7: Success message confirms page updated with link to Confluence page
