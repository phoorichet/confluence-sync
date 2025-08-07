# Source Tree

```
confluence-sync/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Test and lint on PR
│       └── release.yml                # NPM publish on tag
├── src/
│   ├── commands/                     # CLI command implementations
│   │   ├── auth.ts                   # Authentication command
│   │   ├── pull.ts                   # Pull command
│   │   ├── push.ts                   # Push command
│   │   ├── sync.ts                   # Sync command
│   │   ├── status.ts                 # Status command
│   │   ├── config.ts                 # Config management command
│   │   └── index.ts                  # Command registry
│   ├── api/                          # Confluence API layer
│   │   ├── client.ts                 # openapi-fetch client setup
│   │   ├── types.ts                  # Auto-generated Confluence types
│   │   ├── circuit-breaker.ts        # Circuit breaker implementation
│   │   └── rate-limiter.ts           # Rate limiting logic
│   ├── sync/                         # Core sync engine
│   │   ├── engine.ts                 # Main sync orchestrator
│   │   ├── change-detector.ts        # Change detection logic
│   │   ├── conflict-resolver.ts      # Conflict handling
│   │   └── operations.ts             # Sync operation tracking
│   ├── converters/                   # Format conversion
│   │   ├── markdown-to-confluence.ts # MD → Confluence HTML
│   │   ├── confluence-to-markdown.ts # Confluence HTML → MD
│   │   ├── converter-registry.ts     # Plugin registration
│   │   └── utils.ts                  # Shared conversion utilities
│   ├── storage/                      # File system operations
│   │   ├── file-manager.ts           # File I/O operations
│   │   ├── manifest-manager.ts       # Manifest CRUD
│   │   ├── backup-manager.ts         # Backup creation/restoration
│   │   └── watcher.ts                # File system watching
│   ├── auth/                         # Authentication management
│   │   ├── auth-manager.ts           # Auth orchestration
│   │   ├── keychain.ts               # Keytar integration
│   │   └── oauth.ts                  # OAuth flow for Cloud
│   ├── config/                       # Configuration management
│   │   ├── config-manager.ts         # Config loading/validation
│   │   ├── profiles.ts               # Profile management
│   │   └── schemas.ts                # Zod schemas for validation
│   ├── utils/                        # Shared utilities
│   │   ├── logger.ts                 # Logging utility
│   │   ├── errors.ts                 # Custom error classes
│   │   ├── hash.ts                   # Content hashing
│   │   └── progress.ts               # Progress indicators
│   ├── cli.ts                        # CLI entry point
│   └── index.ts                      # Main exports
├── tests/
│   ├── unit/                         # Unit tests (mirrors src/)
│   │   ├── converters/
│   │   ├── sync/
│   │   └── utils/
│   ├── integration/                  # Integration tests
│   │   ├── api/
│   │   └── sync/
│   └── fixtures/                     # Test data
│       ├── confluence-pages/
│       └── markdown-files/
├── scripts/                          # Development scripts
│   ├── download-openapi.ts           # Download Confluence OpenAPI
│   ├── generate-types.ts             # Generate TypeScript from OpenAPI
│   └── test-confluence.ts            # Manual testing utilities
├── docs/                             # Documentation
│   ├── prd.md                        # Product Requirements
│   ├── architecture.md               # This document
│   └── api/                          # API documentation
├── dist/                             # Build output (gitignored)
│   ├── cjs/                          # CommonJS build
│   └── esm/                          # ES Modules build
├── .confluence-sync.json             # Example manifest (gitignored)
├── .confluence-sync.yml              # Example config
├── .env.example                      # Environment variables template
├── .eslintrc.js                      # ESLint configuration
├── .gitignore
├── CLAUDE.md                         # AI development instructions
├── LICENSE
├── README.md
├── package.json                      # NPM package definition
├── tsconfig.json                     # TypeScript configuration
└── vitest.config.ts                  # Test configuration
```
