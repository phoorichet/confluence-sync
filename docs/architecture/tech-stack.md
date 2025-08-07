# Tech Stack

## Cloud Infrastructure

- **Provider:** N/A (CLI tool runs locally)
- **Key Services:** NPM Registry for distribution
- **Deployment Regions:** Global via NPM

## Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|------------|---------|---------|-----------|
| **Runtime** | Bun | 1.1.0 | JavaScript/TypeScript runtime | Superior performance, built-in TypeScript, faster package installation |
| **Language** | TypeScript | 5.3.3 | Primary development language | Type safety, excellent IDE support, prevents runtime errors |
| **CLI Framework** | Commander.js | 12.0.0 | Command-line interface parsing | Industry standard, declarative API, built-in help generation |
| **API Client** | openapi-fetch | 0.9.0 | Type-safe Confluence API calls | Auto-generated types from OpenAPI spec, lightweight |
| **API Types** | openapi-typescript | 6.7.0 | Generate TypeScript from OpenAPI | Ensures API contract compliance |
| **Build Tool** | zshy | 1.0.0 | TypeScript compilation | Bundler-free, outputs CJS/ESM, simple configuration |
| **Test Framework** | Vitest | 1.2.0 | Unit and integration testing | Bun-compatible, fast, Jest-compatible API |
| **LinterFormatter** | ESLint | 8.56.0 | Code quality and formatting | @nyxb/eslint-config handles both linting and formatting |
| **Format Converter** | unified/remark | 15.0.0 | Markdown processing | Extensible, reliable MD↔HTML conversion |
| **HTML Parser** | node-html-parser | 6.1.0 | Parse Confluence storage format | Fast, lightweight HTML manipulation |
| **Credential Storage** | keytar | 7.9.0 | Secure credential management | OS keychain integration, never plain text |
| **HTTP Client** | Native fetch | Built-in | HTTP requests via openapi-fetch | Bun's optimized native implementation |
| **CLI Utilities** | chalk | 5.3.0 | Colored terminal output | Better UX, error highlighting |
| **Progress Bars** | ora | 8.0.0 | Loading spinners and progress | Clean progress indication |
| **File Watcher** | chokidar | 3.6.0 | Watch mode implementation | Cross-platform, efficient, battle-tested |
| **Config Parser** | yaml | 2.3.0 | Parse .confluence-sync.yml | Human-readable configuration |
| **JSON Schema** | zod | 3.22.0 | Runtime validation | Type-safe config and manifest validation |
| **Concurrency** | p-limit | 5.0.0 | Concurrent operation control | Rate limiting, prevent API overload |
| **Diff Tool** | diff | 5.2.0 | Conflict detection | Text comparison for sync conflicts |
