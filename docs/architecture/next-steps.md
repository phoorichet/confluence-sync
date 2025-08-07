# Next Steps

## Development Team Prompt

Begin implementing the Confluence Sync CLI tool following the architecture at @docs/architecture.md. Start with Epic 1 Story 1.1 (Project Foundation & CLI Bootstrap) from the PRD. Key points:

1. Use Bun 1.2.0 runtime with TypeScript 5.3.3
2. Follow the source tree structure exactly as specified
3. Implement components in this order: CLI layer → Auth Manager → API Client → Storage Manager
4. All credentials must use keytar, never store in files
5. Use the coding standards section for all development
6. Generate tests achieving 80% coverage for core modules

Focus on delivering Epic 1 (Foundation & Core Sync) first to provide immediate value with basic pull/push operations.
