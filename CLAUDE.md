# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript project for syncing with Confluence API, built with Bun runtime. It uses OpenAPI TypeScript generation to create type-safe API client interfaces.

## Essential Commands

### Development
- `bun install` - Install dependencies
- `bun run build` - Build the project using zshy bundler (creates dist/ with CJS/ESM outputs)
- `bun run cli` - Run the CLI tool directly from source
- `bun run lint` - Run ESLint on TypeScript files in src/
- `bun run lint:fix` - Auto-fix linting issues

### OpenAPI Management
- `bun run download:openapi` - Download latest Confluence OpenAPI spec
- `bun run gen:openapi` - Generate TypeScript types from OpenAPI spec (outputs to src/index.ts)

### Testing
- `bun run test` - Run tests with Vitest

## Architecture

### Key Files
- `src/index.ts` - Auto-generated OpenAPI types (DO NOT EDIT MANUALLY - use `gen:openapi`)
- `src/api-client.ts` - Creates typed OpenAPI fetch client using openapi-fetch
- `src/cli.ts` - CLI entry point (currently minimal implementation)
- `src/openapi.json` - Confluence OpenAPI specification (updated via `download:openapi`)

### Build System
- Uses `zshy` bundler-free TypeScript build tool
- Outputs both CommonJS (.cjs) and ES modules (.js) to dist/
- TypeScript configured for bundler mode with strict settings
- ESLint configured with @nyxb/eslint-config (indent: 2, quotes: single, semi: true)

### Type Safety
- Strict TypeScript configuration with `noUncheckedIndexedAccess` enabled
- OpenAPI types provide full type safety for Confluence API interactions
- Uses `openapi-fetch` for runtime-safe API calls

## Important Notes
- The project uses Bun runtime, not Node.js
- src/index.ts is auto-generated - never edit it directly
- API client is configured to use http://localhost:8787 as base URL