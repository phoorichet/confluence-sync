# Introduction

This document outlines the overall project architecture for Confluence Sync, including backend systems, shared services, and non-UI specific concerns. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development, ensuring consistency and adherence to chosen patterns and technologies.

**Relationship to Frontend Architecture:**
If the project includes a significant user interface, a separate Frontend Architecture Document will detail the frontend-specific design and MUST be used in conjunction with this document. Core technology stack choices documented herein (see "Tech Stack") are definitive for the entire project, including any frontend components.

## Starter Template or Existing Project

This project is being built on a custom foundation with Bun/TypeScript already initialized. No formal starter template is being used, but the project has existing configuration including:
- Bun runtime with TypeScript support
- openapi-fetch for API interactions
- zshy build system
- Basic project structure

We'll proceed with architecture design building upon this existing foundation.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-07 | 1.0 | Initial architecture document | Winston (Architect) |
