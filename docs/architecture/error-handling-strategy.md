# Error Handling Strategy

## General Approach

- **Error Model:** Custom error classes extending base Error with error codes
- **Exception Hierarchy:** ConfluenceSyncError → (AuthError, APIError, SyncError, ConfigError, FileError)
- **Error Propagation:** Errors bubble up to command layer for user presentation

## Logging Standards

- **Library:** Console with chalk for now (consider winston for future)
- **Format:** `[timestamp] [level] [component] message {context}`
- **Levels:** ERROR, WARN, INFO, DEBUG, TRACE
- **Required Context:**
  - Correlation ID: UUID per command execution
  - Service Context: Component name
  - User Context: No PII, only anonymous session ID

## Error Handling Patterns

### External API Errors

- **Retry Policy:** Exponential backoff with jitter, max 3 retries
- **Circuit Breaker:** Open after 5 consecutive failures, half-open after 30s
- **Timeout Configuration:** 30s for single page, 5min for bulk operations
- **Error Translation:** Map HTTP status codes to user-friendly messages

### Business Logic Errors

- **Custom Exceptions:** ConflictError, ValidationError, PermissionError
- **User-Facing Errors:** Clear action items (e.g., "Run 'confluence-sync auth' to authenticate")
- **Error Codes:** CS-XXX format (CS-001: Auth failed, CS-002: Network error, etc.)

### Data Consistency

- **Transaction Strategy:** Atomic manifest updates, rollback on failure
- **Compensation Logic:** Restore backups on failed push operations
- **Idempotency:** All operations safe to retry, using version checks
