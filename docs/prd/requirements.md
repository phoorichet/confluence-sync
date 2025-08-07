# Requirements

## Functional

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

## Non Functional

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
