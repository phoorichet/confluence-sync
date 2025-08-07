# Technical Assumptions

## Repository Structure: Monorepo

Single repository containing all CLI components, documentation, and tests for simplified dependency management and atomic commits

## Service Architecture

Modular monolithic CLI application with clear separation of concerns:
- Commands layer for CLI interface
- API client layer using openapi-fetch
- Sync engine for bi-directional operations
- Converter modules for format transformations
- Plugin architecture for future extensibility

## Testing Requirements

- Unit tests for all converter and sync logic using Vitest
- Integration tests for API client with mocked Confluence responses
- End-to-end tests for critical user workflows
- Manual testing convenience scripts for developer validation
- Target 80% code coverage for core modules

## Additional Technical Assumptions and Requests

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
