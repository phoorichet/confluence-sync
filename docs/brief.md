# Project Brief: Confluence Sync

## Executive Summary

Confluence Sync is a Node.js command-line tool that bridges the gap between Confluence's web-based editing and modern local development workflows. It enables bi-directional synchronization of Confluence pages with local files, allowing users to leverage their preferred text editors (like VS Code) and AI assistants for content creation and editing. Users can pull Confluence content to their local machine, edit with familiar tools and AI assistance, then push changes back to Confluence—all through simple CLI commands.

## Problem Statement

Technical writers, developers, and documentation teams currently face significant friction when working with Confluence content. The web-based editor, while functional, lacks the advanced features and AI integration capabilities of modern text editors. Users must choose between Confluence's collaboration features and their preferred writing environment. This creates several pain points:

- **Editor Limitations:** No access to AI assistants (Copilot, Claude, etc.), advanced find/replace, multi-cursor editing, or custom extensions that boost productivity
- **Workflow Disruption:** Constant context switching between local development and web-based documentation breaks flow and reduces efficiency
- **Bulk Operations:** Difficult to perform mass updates, refactoring, or apply consistent formatting across multiple pages
- **Version Control Integration:** No ability to use Git workflows for documentation changes, making it hard to track changes or collaborate using familiar developer patterns
- **Offline Accessibility:** Cannot work on documentation during commutes or without internet connectivity

The impact is measurable: documentation teams report 30-50% slower content creation in web editors compared to local IDEs, and the lack of AI assistance means missing out on productivity gains that can accelerate writing by 2-3x. With the rise of AI-powered development tools, this gap is becoming a critical bottleneck for teams trying to maintain comprehensive, up-to-date documentation alongside rapid development cycles.

## Proposed Solution

Confluence Sync provides a seamless command-line interface that treats Confluence pages as local files, enabling developers and technical writers to work in their natural environment. The solution leverages the Confluence REST API to create a reliable synchronization layer between the cloud and local filesystem.

**Core Approach:**
- **Local-First Editing:** Pull entire Confluence spaces or specific pages to local markdown/HTML files that preserve formatting and structure
- **Bi-directional Sync:** Push local changes back to Confluence with intelligent conflict detection and resolution
- **CLI-Driven Workflow:** Simple commands like `confluence-sync pull`, `confluence-sync push`, and `confluence-sync sync` that feel natural to developers
- **Format Preservation:** Maintains Confluence-specific features (macros, attachments, page hierarchy) while enabling local editing

**Key Differentiators:**
- **AI-Ready:** Unlike browser-based solutions, enables full integration with AI coding assistants for content generation, editing, and improvement
- **Editor Agnostic:** Works with any text editor—VS Code, Vim, Sublime, or even command-line tools
- **Git-Compatible:** Local files can be version controlled, branched, and merged using standard Git workflows
- **Bulk Operations:** Leverage powerful command-line tools (grep, sed, awk) or scripts for mass updates across documentation
- **Developer-First Design:** Built by developers for developers, following Unix philosophy of doing one thing well

**Why This Succeeds:**
This approach succeeds because it doesn't try to replace Confluence—it enhances it. By treating Confluence as a "remote" similar to Git remotes, it provides a familiar mental model for developers while preserving all of Confluence's collaboration, permissions, and publishing capabilities. The tool becomes an enabler rather than another system to manage.

## Target Users

### Primary User Segment: Developer Documentation Teams

**Profile:**
- Software developers and DevOps engineers responsible for maintaining technical documentation
- Working in teams of 5-50 developers within technology companies
- Already using Confluence as their primary documentation platform
- Comfortable with command-line interfaces and Git workflows

**Current Behaviors:**
- Write documentation in Confluence's web editor with frequent interruptions
- Copy-paste between IDEs and Confluence, losing formatting in the process
- Maintain separate notes locally before transferring to Confluence
- Struggle to keep documentation synchronized with code changes

**Specific Needs:**
- Ability to write documentation in the same environment as code
- Integration with AI assistants for generating examples, explanations, and API documentation
- Bulk updates when refactoring or updating API references across multiple pages
- Offline access for writing during focus time or travel

**Goals:**
- Reduce documentation debt by making it easier to write docs alongside code
- Improve documentation quality through AI assistance and better tooling
- Maintain single source of truth while enabling flexible workflows

### Secondary User Segment: Technical Writers & Documentation Specialists

**Profile:**
- Professional technical writers working with engineering teams
- Managing large documentation sets (100+ pages) in Confluence
- Familiar with markup languages (Markdown, AsciiDoc) and basic command-line usage
- Often working across multiple products or teams

**Current Behaviors:**
- Spend significant time formatting and structuring content in web interface
- Manually track changes across related documentation pages
- Use external tools for writing before copying to Confluence

**Specific Needs:**
- Professional writing tools (grammar checkers, style guides, terminology management)
- Ability to perform find-and-replace across entire documentation spaces
- Version control for major documentation updates
- Standardization and consistency tools

**Goals:**
- Increase writing velocity without sacrificing quality
- Maintain consistency across large documentation sets
- Collaborate more effectively with development teams using shared tools

## Goals & Success Metrics

### Business Objectives

- **Adoption:** Achieve 100+ active users within 6 months of launch, with 25% monthly active usage rate
- **Productivity Gain:** Demonstrate 40% reduction in time to create/update documentation for regular users
- **Documentation Quality:** Increase documentation update frequency by 2x without additional headcount
- **Tool Stickiness:** Achieve 80% retention rate after 3 months of initial usage
- **Community Growth:** Build contributor base of 10+ developers for ongoing feature development

### User Success Metrics

- **Time to First Sync:** New users successfully sync their first Confluence page within 5 minutes of installation
- **Editing Efficiency:** Users report 50% faster documentation workflows compared to web editor
- **AI Integration Usage:** 60% of users actively utilize AI assistants through the tool
- **Error Rate:** Less than 1% sync failure rate for standard operations
- **Bulk Operation Success:** Users can update 50+ pages in under 10 minutes for common operations

### Key Performance Indicators (KPIs)

- **Daily Active Users (DAU):** Number of unique users executing sync commands per day (Target: 30+ by month 6)
- **Sync Volume:** Total pages synced per week (Target: 1,000+ pages/week by month 6)
- **Sync Reliability:** Percentage of successful sync operations (Target: >99%)
- **Installation Growth:** New installations per month (Target: 20% MoM growth)
- **Command Usage Distribution:** Variety of commands used per user (Target: Users utilize 3+ different commands)
- **Performance Metrics:** Average sync time per page (Target: <2 seconds for standard pages)
- **Conflict Resolution Rate:** Percentage of conflicts resolved without manual intervention (Target: >95%)

## MVP Scope

### Core Features (Must Have)

- **Authentication & Connection:** Secure authentication with Confluence instance using API tokens or OAuth, with support for both Cloud and Server/Data Center versions
- **Pull Command:** Download Confluence pages to local filesystem as Markdown files, preserving page hierarchy, metadata (page ID, version, last modified), and basic formatting
- **Push Command:** Upload local changes back to Confluence, converting Markdown to Confluence storage format, with automatic version incrementing
- **Sync Command:** Intelligent bi-directional synchronization that detects changes on both sides and handles simple merges automatically
- **Page Mapping:** Maintain a manifest file (.confluence-sync.json) that tracks the relationship between local files and Confluence page IDs
- **Basic Conflict Detection:** Warn users when the remote page has changed since last pull, requiring manual resolution before push
- **Format Conversion:** Reliable Markdown ↔ Confluence storage format conversion for text, headers, lists, links, code blocks, and tables

### Out of Scope for MVP

- GUI or web interface (pure CLI only)
- Advanced Confluence macros support (focus on standard content)
- Attachment/media file synchronization
- Space-wide permissions management
- Real-time collaborative editing
- Automated conflict resolution algorithms
- Support for Confluence templates
- Page creation from scratch (only sync existing pages)
- Custom workspace layouts or virtual page structures
- Integration with other documentation platforms

### MVP Success Criteria

The MVP will be considered successful when a developer can:
1. Install the tool via npm in under 1 minute
2. Authenticate with their Confluence instance on first run
3. Pull a set of documentation pages to local Markdown files
4. Edit those files using VS Code with GitHub Copilot
5. Push changes back to Confluence without data loss
6. See their changes reflected immediately in Confluence web UI
7. Handle basic conflict scenarios with clear error messages

Performance targets: Support syncing 10-50 pages reliably with <5 second total operation time. The tool should handle pages up to 100KB without issues and maintain formatting fidelity for 95% of common content patterns.

## Post-MVP Vision

### Phase 2 Features

**Enhanced Format Support:**
- Full Confluence macro support (info panels, expand sections, table of contents)
- Multiple format options (AsciiDoc, reStructuredText, HTML)
- Attachment synchronization with intelligent binary diff
- Inline image support with local caching

**Advanced Sync Capabilities:**
- Three-way merge for automatic conflict resolution
- Watch mode for continuous synchronization
- Selective sync with glob patterns and .syncignore files
- Batch operations with transaction support

**Collaboration Features:**
- Multi-user awareness (show who's editing what)
- Comment synchronization and threading
- Change attribution preservation
- Draft/publish workflows

**Developer Experience:**
- Plugin system for custom transformations
- Git hooks integration for documentation CI/CD
- VS Code extension for visual diff/merge
- Configuration profiles for different spaces/projects

### Long-term Vision

Within 1-2 years, Confluence Sync becomes the de facto standard for developer-driven documentation workflows. The tool evolves into a platform supporting:

- **Documentation as Code:** Full GitOps workflows for documentation with review, approval, and deployment pipelines
- **AI-Powered Documentation:** Built-in AI agents that can generate, update, and maintain documentation based on code changes
- **Cross-Platform Support:** Extend beyond Confluence to support Notion, SharePoint, GitHub Wiki, and other platforms with adapter pattern
- **Enterprise Features:** SSO, audit logs, compliance controls, and admin dashboards for organization-wide deployment

The ultimate vision is to make documentation as seamless as code development, where docs live alongside code, use the same tools and workflows, and benefit from the same automation and intelligence that modern development enjoys.

### Expansion Opportunities

- **Confluence Sync Pro:** Commercial version with enterprise features, support, and SLA
- **Documentation Intelligence:** Analytics on documentation quality, coverage, and staleness
- **Template Marketplace:** Community-contributed templates and transformation plugins
- **Training & Certification:** Official courses for teams adopting docs-as-code workflows
- **Managed Cloud Service:** Hosted sync service for teams without CLI access
- **IDE Integrations:** Native plugins for IntelliJ, VS Code, Vim, and Emacs
- **API Platform:** RESTful API for building custom integrations and workflows

## Technical Considerations

### Platform Requirements

- **Target Platforms:** macOS, Linux, Windows (via WSL or native Node.js)
- **Browser/OS Support:** N/A - CLI tool with no browser requirements
- **Performance Requirements:**
  - Sub-second response for single page operations
  - Memory usage under 100MB for typical operations
  - Support for pages up to 1MB without performance degradation
  - Concurrent processing for multi-page operations

### Technology Preferences

- **Frontend:** N/A (CLI only for MVP)
- **Backend:**
  - Node.js (v18+ LTS) with TypeScript for type safety
  - Commander.js or Yargs for CLI framework
  - openapi-fetch for API calls with automatic type generation
- **Database:**
  - Local JSON file for sync manifest (.confluence-sync.json)
  - SQLite for local cache if needed for performance
- **Hosting/Infrastructure:**
  - npm registry for distribution
  - GitHub for source control and issue tracking
  - GitHub Actions for CI/CD

### Architecture Considerations

- **Repository Structure:**
  ```
  confluence-sync/
  ├── src/
  │   ├── commands/     # CLI command implementations
  │   ├── api/          # Confluence API client
  │   ├── converters/   # Format conversion logic
  │   ├── sync/         # Sync engine and conflict detection
  │   └── utils/        # Shared utilities
  ├── tests/            # Test suites
  └── docs/             # Documentation
  ```

- **Service Architecture:**
  - Modular design with clear separation of concerns
  - Plugin architecture for future extensibility
  - Stateless operations where possible for reliability
  - Local-first with network operations batched for efficiency

- **Integration Requirements:**
  - Confluence REST API v2 for Cloud
  - Confluence REST API v1 for Server/Data Center
  - OAuth 2.0 for Cloud authentication
  - Personal Access Tokens for Server authentication
  - Git for optional version control integration

- **Security/Compliance:**
  - Secure credential storage using system keychain (keytar)
  - No credentials in plain text files
  - HTTPS only for API communications
  - Respect Confluence permissions (read/write access)
  - Optional audit logging for enterprise compliance
  - Rate limiting compliance with Confluence API limits

## Constraints & Assumptions

### Constraints

- **Budget:** Open-source project with no dedicated budget; development through community contribution and personal time investment
- **Timeline:** MVP target of 3 months with part-time development (10-15 hours/week)
- **Resources:** Single developer initially, with hopes for 2-3 contributors post-launch
- **Technical:**
  - Limited by Confluence API capabilities and rate limits (5000 requests/hour for Cloud)
  - Cannot modify Confluence server-side behavior
  - Must work within npm package size limits (< 100MB unpacked)
  - Performance constrained by network latency to Confluence servers

### Key Assumptions

- Confluence REST API will remain stable and backwards compatible
- Users have appropriate permissions to read/write target Confluence pages
- Local filesystem has sufficient space for storing synchronized content
- Users are comfortable with command-line interfaces and basic Git concepts
- Markdown format is sufficient for 80% of documentation use cases
- Network connectivity is available during sync operations (no offline queuing for MVP)
- Confluence page IDs remain stable and don't change between syncs
- Most documentation pages are under 100KB in size
- Teams are willing to adopt new tooling for productivity gains
- AI assistant adoption will continue to grow among developers
- Single-user editing model is acceptable (no real-time collaboration needed)
- English-only interface and documentation is sufficient for initial release

## Risks & Open Questions

### Key Risks

- **API Changes:** Atlassian deprecates or significantly modifies Confluence REST API, breaking core functionality
- **Rate Limiting:** Large documentation sets hit API rate limits, making tool unusable for enterprise teams
- **Format Fidelity:** Complex Confluence content (macros, dynamic content) loses critical information in conversion, limiting adoption
- **Authentication Complexity:** OAuth implementation proves too complex for average users, creating high barrier to entry
- **Conflict Resolution:** Inadequate conflict handling leads to data loss, destroying user trust
- **Performance at Scale:** Tool becomes unusably slow with spaces containing 1000+ pages
- **Competition:** Atlassian releases official CLI tool or Microsoft/GitHub enter space with superior solution
- **Adoption Resistance:** Teams too entrenched in existing workflows to adopt new tooling despite benefits

### Open Questions

- What percentage of Confluence content uses advanced macros that would be difficult to preserve?
- Should we support Confluence Data Center in addition to Cloud, given different API versions?
- How do we handle Confluence permissions that are more granular than filesystem permissions?
- What's the best format for local storage - Markdown, HTML, or Confluence's XHTML storage format?
- Should page comments be synchronized, and if so, how to handle threaded discussions?
- How to manage attachments and embedded images without bloating local storage?
- What's the optimal sync strategy for minimizing API calls while maintaining data freshness?
- Should we build our own diff algorithm or leverage existing Git mechanisms?
- How to handle Confluence spaces with 10,000+ pages efficiently?
- What telemetry is acceptable to collect for improving the tool without violating privacy?

### Areas Needing Further Research

- Confluence API v2 capabilities and limitations documentation review
- Competitive analysis of existing tools (Confluence CLI, Mark, etc.)
- User research on documentation workflows and pain points
- Performance benchmarking of Markdown/HTML conversion libraries
- Security audit of credential storage mechanisms
- Legal review of Atlassian API terms of service
- Investigation of Confluence macro usage statistics
- Study of Git merge algorithms for text content
- Analysis of enterprise requirements for documentation tools
- Research on documentation-as-code adoption trends
