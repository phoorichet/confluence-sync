# Confluence Sync Product Requirements Document (PRD)

## Goals and Background Context

### Goals

- Enable developers and technical writers to edit Confluence content using their preferred local text editors and AI assistants
- Provide seamless bi-directional synchronization between Confluence and local filesystem
- Reduce documentation creation time by 40% through local tooling and AI integration
- Maintain Confluence as the single source of truth while enabling flexible local workflows
- Support bulk operations and Git-based version control for documentation
- Achieve 100+ active users within 6 months with 80% retention rate

### Background Context

Confluence Sync addresses the significant friction technical teams face when working with Confluence's web-based editor. Currently, teams must choose between Confluence's collaboration features and the advanced capabilities of modern development environments. This tool bridges that gap by treating Confluence pages as local files, enabling developers to leverage AI assistants (Copilot, Claude), advanced editing features, and familiar Git workflows while maintaining Confluence as the central documentation platform. The solution is particularly critical as teams report 30-50% slower content creation in web editors compared to local IDEs, and the absence of AI assistance means missing productivity gains that can accelerate writing by 2-3x.

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-07 | 1.0 | Initial PRD creation | John (PM) |

## Requirements

### Functional

- **FR1:** The system shall authenticate with Confluence instances using API tokens or OAuth for both Cloud and Server/Data Center versions
- **FR2:** The system shall pull Confluence pages to local filesystem as Markdown files while preserving page hierarchy and metadata
- **FR3:** The system shall push local changes back to Confluence with automatic format conversion and version incrementing
- **FR4:** The system shall provide intelligent bi-directional synchronization detecting changes on both sides
- **FR5:** The system shall maintain a manifest file (.confluence-sync.json) tracking relationships between local files and Confluence page IDs
- **FR6:** The system shall detect conflicts when remote pages have changed since last pull and require manual resolution
- **FR7:** The system shall convert reliably between Markdown and Confluence storage format for standard content elements
- **FR8:** The system shall support concurrent processing for multi-page operations
- **FR9:** The system shall respect Confluence permissions for read/write access
- **FR10:** The system shall provide clear error messages for conflict scenarios

### Non Functional

- **NFR1:** The system shall complete single page sync operations in under 2 seconds
- **NFR2:** The system shall maintain memory usage under 100MB for typical operations
- **NFR3:** The system shall handle pages up to 100KB without performance degradation
- **NFR4:** The system shall achieve >99% sync reliability for standard operations
- **NFR5:** The system shall install via npm in under 1 minute
- **NFR6:** The system shall maintain formatting fidelity for 95% of common content patterns
- **NFR7:** The system shall comply with Confluence API rate limits (5000 requests/hour for Cloud)
- **NFR8:** The system shall store credentials securely using system keychain, never in plain text
- **NFR9:** The system shall use HTTPS only for all API communications
- **NFR10:** The system shall support macOS, Linux, and Windows platforms

## Technical Assumptions

### Repository Structure: Monorepo

Single repository containing all CLI components, documentation, and tests for simplified dependency management and atomic commits

### Service Architecture

Modular monolithic CLI application with clear separation of concerns:
- Commands layer for CLI interface
- API client layer using openapi-fetch
- Sync engine for bi-directional operations
- Converter modules for format transformations
- Plugin architecture for future extensibility

### Testing Requirements

- Unit tests for all converter and sync logic using Vitest
- Integration tests for API client with mocked Confluence responses
- End-to-end tests for critical user workflows
- Manual testing convenience scripts for developer validation
- Target 80% code coverage for core modules

### Additional Technical Assumptions and Requests

- **Runtime:** Bun runtime (not Node.js) for improved performance and built-in TypeScript support
- **Language:** TypeScript with strict mode enabled including `noUncheckedIndexedAccess`
- **CLI Framework:** Commander.js or similar for robust command parsing
- **API Client:** openapi-fetch with auto-generated types from Confluence OpenAPI spec
- **Build System:** zshy bundler-free TypeScript build tool outputting both CJS and ESM
- **Storage:** Local JSON manifest (.confluence-sync.json) for sync state, SQLite considered for caching if needed
- **Authentication:** System keychain integration via keytar for secure credential storage
- **Formatting:** ESLint with 2-space indentation, single quotes, semicolons required
- **Distribution:** npm registry with package size under 100MB unpacked
- **Version Control:** Git with conventional commits for clear history
- **CI/CD:** GitHub Actions for automated testing and npm publishing

## Epic List

- **Epic 1: Foundation & Core Sync Infrastructure:** Establish project setup, authentication, and basic pull/push operations to enable fundamental local editing workflow
- **Epic 2: Bi-directional Sync & Conflict Management:** Implement intelligent synchronization with change detection, conflict handling, and reliable format conversion for production-ready usage
- **Epic 3: Performance & Developer Experience:** Optimize multi-page operations, enhance CLI usability, and add advanced features for power users and bulk operations

## Epic 1: Foundation & Core Sync Infrastructure

Establish the foundational CLI application with TypeScript/Bun setup, Confluence authentication, and basic pull/push operations that allow users to edit documentation locally and sync changes back to Confluence. This delivers immediate value by enabling the core workflow of local editing with AI assistance.

### Story 1.1: Project Foundation & CLI Bootstrap

As a developer,
I want a properly configured TypeScript/Bun project with CLI entry point,
so that I have a solid foundation for building the sync tool.

#### Acceptance Criteria

1: TypeScript project initialized with Bun runtime configuration and strict mode enabled
2: CLI framework (Commander.js) integrated with basic `confluence-sync` command that displays version and help
3: Build system configured using zshy to output both CJS and ESM modules to dist/
4: ESLint configured with project standards (2-space indent, single quotes, semicolons)
5: Vitest testing framework set up with sample test passing
6: Package.json configured for npm publishing with proper metadata and bin entry
7: Basic project structure created (src/commands, src/api, src/sync, src/utils)
8: Health check command implemented showing "Confluence Sync v{version} - OK"

### Story 1.2: Confluence Authentication

As a user,
I want to authenticate with my Confluence instance using API tokens,
so that I can securely access my documentation.

#### Acceptance Criteria

1: `confluence-sync auth` command prompts for Confluence URL, username, and API token
2: Credentials stored securely in system keychain using keytar (never plain text)
3: Support for both Cloud (OAuth 2.0) and Server (PAT) authentication methods
4: Authentication verified by making test API call to Confluence
5: Clear error messages for invalid credentials or network issues
6: `confluence-sync auth:status` command shows current authentication status
7: `confluence-sync auth:clear` command removes stored credentials

### Story 1.3: OpenAPI Client Generation & Setup

As a developer,
I want auto-generated TypeScript types from Confluence OpenAPI spec,
so that I have type-safe API interactions.

#### Acceptance Criteria

1: Script to download latest Confluence OpenAPI specification implemented
2: OpenAPI TypeScript generation configured to output to src/types/confluence.ts
3: openapi-fetch client initialized with authentication headers
4: Type-safe wrapper functions created for core API operations (getPage, updatePage)
5: Error handling middleware added for API responses
6: Rate limiting compliance built into client (respecting 5000 req/hour)
7: Generated types successfully compile with strict TypeScript settings

### Story 1.4: Basic Pull Command

As a user,
I want to pull Confluence pages to my local filesystem,
so that I can edit them with my preferred tools.

#### Acceptance Criteria

1: `confluence-sync pull <pageId>` downloads single page content from Confluence
2: Page content converted from Confluence storage format to Markdown
3: Page saved to local filesystem with .md extension in current directory
4: Page metadata (ID, version, lastModified) stored in .confluence-sync.json manifest
5: Basic formatting preserved (headers, paragraphs, lists, links, code blocks)
6: Progress indicator shown during download
7: Success message displays local file path after completion

### Story 1.5: Basic Push Command

As a user,
I want to push my local changes back to Confluence,
so that my edits are reflected in the central documentation.

#### Acceptance Criteria

1: `confluence-sync push <file>` uploads local Markdown file to Confluence
2: Markdown converted to Confluence storage format preserving formatting
3: Page version automatically incremented on Confluence
4: Manifest file updated with new version number
5: Simple conflict detection - warns if remote changed since last pull
6: Dry-run mode available with --dry-run flag showing what would change
7: Success message confirms page updated with link to Confluence page

## Epic 2: Bi-directional Sync & Conflict Management

Build intelligent synchronization capabilities that detect changes on both local and remote sides, handle conflicts gracefully, and provide reliable format conversion between Markdown and Confluence storage format. This makes the tool production-ready for real-world documentation workflows.

### Story 2.1: Enhanced Manifest & Change Detection

As a developer,
I want the system to track file states and detect changes,
so that sync operations can be intelligent and efficient.

#### Acceptance Criteria

1: Manifest schema enhanced with file hashes, timestamps, and sync states
2: Local file change detection using content hashing (MD5 or SHA-256)
3: Remote change detection via Confluence version API comparison
4: Three-way state tracking: local changes, remote changes, or both changed
5: `confluence-sync status` command shows changed files and their states
6: Manifest supports multiple pages with hierarchical structure
7: Automatic manifest migration from v1 to v2 format

### Story 2.2: Advanced Format Conversion

As a user,
I want comprehensive format conversion between Markdown and Confluence,
so that my content maintains fidelity across systems.

#### Acceptance Criteria

1: Table conversion with proper column alignment and headers
2: Nested list support (ordered, unordered, mixed)
3: Image reference preservation with relative paths
4: Code block language hints maintained
5: Confluence info/warning/note panels mapped to Markdown equivalents
6: Link conversion handling both internal and external links
7: Format conversion test suite with 20+ test cases covering edge cases

### Story 2.3: Conflict Detection & Resolution

As a user,
I want clear conflict detection and resolution options,
so that I never lose work during synchronization.

#### Acceptance Criteria

1: Automatic conflict detection when both local and remote changed
2: Conflict markers added to files (similar to Git <<<<<<< ======= >>>>>>>)
3: `confluence-sync conflicts` command lists all conflicted files
4: Manual resolution supported with `--force-local` or `--force-remote` flags
5: Backup created before any destructive operation (.backup extension)
6: Diff display showing local vs remote changes
7: Resolution tracking in manifest to prevent re-conflicts

### Story 2.4: Intelligent Sync Command

As a user,
I want a single sync command that handles bi-directional updates,
so that keeping documents synchronized is effortless.

#### Acceptance Criteria

1: `confluence-sync sync` detects and syncs all changes in both directions
2: Local-only changes pushed automatically
3: Remote-only changes pulled automatically
4: Conflicts reported with manual resolution required
5: Dry-run mode shows all operations before execution
6: Batch operations with progress bar for multiple files
7: Summary report showing files pulled, pushed, conflicted, and unchanged

### Story 2.5: Page Hierarchy & Space Support

As a user,
I want to sync entire page hierarchies and spaces,
so that I can manage complete documentation sets.

#### Acceptance Criteria

1: `confluence-sync pull --space <key>` pulls all pages in a space
2: Page hierarchy preserved in local directory structure
3: Parent-child relationships maintained in manifest
4: `confluence-sync pull --recursive <pageId>` pulls page and all children
5: Bulk push supports directory structures mapping to page hierarchy
6: Space metadata stored for context (space key, name, permissions)
7: Maximum depth configuration to limit recursive operations

## Epic 3: Performance & Developer Experience

Optimize the tool for real-world usage with large documentation sets, enhance CLI usability with better commands and feedback, and add power-user features that multiply productivity. This transforms the tool from functional to delightful.

### Story 3.1: Concurrent Operations & Performance

As a power user,
I want fast operations even with many pages,
so that the tool remains responsive at scale.

#### Acceptance Criteria

1: Concurrent API calls for multi-page operations (configurable parallelism)
2: Connection pooling for HTTP requests with keep-alive
3: Local caching layer to avoid redundant API calls
4: Batch API operations where Confluence supports them
5: Memory-efficient streaming for large pages (>1MB)
6: Performance metrics displayed with --verbose flag
7: Operations on 50 pages complete in under 10 seconds

### Story 3.2: Enhanced CLI Experience

As a user,
I want intuitive commands and helpful feedback,
so that using the tool feels natural and efficient.

#### Acceptance Criteria

1: Interactive mode for auth and conflict resolution (using prompts)
2: Colored output for better readability (success=green, error=red, warning=yellow)
3: Progress bars with ETA for long operations
4: `confluence-sync init` wizard for initial setup
5: Shell completion scripts for bash/zsh/fish
6: Helpful error messages with suggested fixes
7: `--json` flag for machine-readable output

### Story 3.3: Watch Mode & Continuous Sync

As a developer,
I want automatic synchronization as I work,
so that changes flow seamlessly between local and remote.

#### Acceptance Criteria

1: `confluence-sync watch` monitors file changes and syncs automatically
2: Debouncing to avoid excessive API calls during rapid edits
3: File system watcher using native OS capabilities for efficiency
4: Configurable ignore patterns (.syncignore file support)
5: Status indicator showing watch mode active and last sync time
6: Graceful handling of network interruptions with retry logic
7: Notification (desktop or terminal) when sync completes or fails

### Story 3.4: Configuration & Profiles

As a user working with multiple Confluence instances,
I want configuration profiles and settings,
so that I can easily switch contexts.

#### Acceptance Criteria

1: `.confluence-sync.yml` configuration file with all settings
2: Multiple named profiles for different Confluence instances
3: Profile switching with `confluence-sync use <profile>`
4: Environment variable support for CI/CD scenarios
5: Global and project-specific configuration with proper precedence
6: Configuration validation with helpful error messages
7: `confluence-sync config` command to view/edit settings

### Story 3.5: Advanced Search & Filtering

As a user,
I want to find and sync specific content efficiently,
so that I can work with subsets of documentation.

#### Acceptance Criteria

1: `confluence-sync search <query>` finds pages by title or content
2: Filter flags: --author, --modified-after, --label, --space
3: Glob pattern support for selective sync operations
4: CQL (Confluence Query Language) support for power users
5: Search results with preview snippets
6: Bulk operations on search results (pull all matching)
7: Save search queries as named filters for reuse

## Checklist Results Report

### Executive Summary

- **Overall PRD Completeness:** 92%
- **MVP Scope Appropriateness:** Just Right
- **Readiness for Architecture Phase:** Ready
- **Most Critical Gaps:** No blockers identified; minor areas for enhancement in cross-functional requirements

### Category Analysis

| Category                         | Status  | Critical Issues |
| -------------------------------- | ------- | --------------- |
| 1. Problem Definition & Context  | PASS    | None            |
| 2. MVP Scope Definition          | PASS    | None            |
| 3. User Experience Requirements  | N/A     | CLI tool - no traditional UI |
| 4. Functional Requirements       | PASS    | None            |
| 5. Non-Functional Requirements   | PASS    | None            |
| 6. Epic & Story Structure        | PASS    | None            |
| 7. Technical Guidance            | PASS    | None            |
| 8. Cross-Functional Requirements | PARTIAL | Data migration and operational monitoring could be more detailed |
| 9. Clarity & Communication       | PASS    | None            |

### Top Issues by Priority

**BLOCKERS:** None identified

**HIGH:**
- None

**MEDIUM:**
- Data migration strategy for manifest schema evolution could be more detailed
- Operational monitoring and alerting specifics need definition
- Integration testing approach for Confluence API could be expanded

**LOW:**
- Could add more specific performance benchmarks for concurrent operations
- Documentation requirements for end-users could be specified

### MVP Scope Assessment

**Scope Appropriateness:** The MVP scope is well-balanced and achievable:
- Core functionality (auth, pull, push, sync) delivers immediate value
- Advanced features properly deferred to post-MVP
- 3-month timeline realistic with part-time development
- Clear progression from basic to advanced functionality

**Features Correctly Excluded from MVP:**
- GUI/web interface
- Advanced Confluence macros
- Attachment synchronization
- Automated conflict resolution
- Real-time collaboration

**Essential Features Included:**
- Authentication with secure storage
- Basic pull/push operations
- Format conversion (Markdown ↔ Confluence)
- Conflict detection
- Manifest-based state tracking

### Technical Readiness

**Clarity of Technical Constraints:** Excellent
- Runtime environment (Bun) clearly specified
- TypeScript with strict mode defined
- Build system (zshy) documented
- API client approach (openapi-fetch) established

**Identified Technical Risks:**
- Confluence API rate limiting at scale
- Format conversion fidelity for complex content
- Conflict resolution complexity
- Performance with large spaces (1000+ pages)

**Areas for Architect Investigation:**
- Optimal caching strategy for API responses
- Diff algorithm selection for conflict detection
- Concurrent operation limits and backpressure
- Plugin architecture design for extensibility

### Recommendations

1. **Immediate Actions:** None required - PRD is ready for architect

2. **Suggested Enhancements:**
   - Add specific metrics for monitoring (response times, sync failures, API usage)
   - Define data migration test scenarios for manifest evolution
   - Specify user documentation deliverables per epic

3. **Next Steps:**
   - Proceed with architect engagement using provided prompt
   - Consider creating technical spike stories for high-risk areas
   - Plan user research sessions to validate workflow assumptions

### Final Decision

**✅ READY FOR ARCHITECT:** The PRD and epics are comprehensive, properly structured, and ready for architectural design. The requirements are clear, testable, and appropriately scoped for MVP delivery within the 3-month timeline.

## Next Steps

### UX Expert Prompt

N/A - This is a CLI tool without traditional UI requirements. UX considerations have been incorporated into the CLI command structure and user feedback mechanisms within the functional requirements.

### Architect Prompt

Please create the technical architecture for the Confluence Sync CLI tool based on the attached PRD. Focus on designing a modular, extensible system using Bun/TypeScript with openapi-fetch for API interactions. Key areas requiring architectural decisions include: concurrent operation strategies, caching layer design, conflict detection algorithms, and plugin architecture for future extensibility. Ensure the design supports the 3-epic MVP delivery within a 3-month timeline with part-time development resources.
