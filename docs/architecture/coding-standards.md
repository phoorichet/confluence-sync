# Coding Standards

## Core Standards

- **Languages & Runtimes:** TypeScript 5.3.3 on Bun 1.1.0 (strict mode enabled)
- **Style & Linting:** ESLint with @nyxb/eslint-config (2-space indent, single quotes, semicolons)
- **Test Organization:** Tests in `tests/unit/{module}/*.test.ts` mirroring src structure

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `sync-engine.ts` |
| Classes | PascalCase | `SyncEngine` |
| Interfaces | PascalCase | `SyncOptions` |
| Functions | camelCase | `detectChanges()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Private fields | underscore prefix | `_manifest` |

## Critical Rules

- **Never use console.log:** Always use the logger utility from `src/utils/logger.ts`
- **Always use apliClient for API calls:** Never use fetch directly, use `src/api/client.ts`
- **All API responses must use type guards:** Never cast API responses directly, validate with zod schemas
- **Database queries must use ManifestManager:** Never read/write .confluence-sync.json directly
- **All file paths must be absolute:** Use path.resolve() for all file system operations
- **Error messages must include error codes:** Every thrown error must have a CS-XXX code
- **Never store credentials in code:** All auth data must go through AuthManager/keytar
- **Always handle rate limits:** Every API call must go through the rate-limited client
- **Format conversion must preserve data:** Never lose content during MD↔HTML conversion
