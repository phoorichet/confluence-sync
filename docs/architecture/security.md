# Security

## Input Validation

- **Validation Library:** zod for all external inputs
- **Validation Location:** Command layer before processing
- **Required Rules:**
  - All external inputs MUST be validated
  - Validation at API boundary before processing
  - Whitelist approach preferred over blacklist

## Authentication & Authorization

- **Auth Method:** API tokens stored in system keychain via keytar
- **Session Management:** Stateless - credentials retrieved per operation
- **Required Patterns:**
  - Never store tokens in files or environment variables
  - Validate auth on every API call
  - Clear credentials on auth failure

## Secrets Management

- **Development:** .env files (gitignored) for test credentials only
- **Production:** System keychain via keytar
- **Code Requirements:**
  - NEVER hardcode secrets
  - Access via AuthManager only
  - No secrets in logs or error messages

## API Security

- **Rate Limiting:** Built-in rate limiter respecting Confluence limits
- **CORS Policy:** N/A (CLI tool, not web service)
- **Security Headers:** N/A (CLI tool)
- **HTTPS Enforcement:** All API calls use HTTPS only

## Data Protection

- **Encryption at Rest:** Rely on OS file system encryption
- **Encryption in Transit:** HTTPS for all API communication
- **PII Handling:** No user PII stored locally, only page IDs and content
- **Logging Restrictions:** Never log credentials, API tokens, or user content

## Dependency Security

- **Scanning Tool:** npm audit / Snyk for vulnerability scanning
- **Update Policy:** Security patches applied immediately
- **Approval Process:** New dependencies reviewed for security/license

## Security Testing

- **SAST Tool:** ESLint security plugins
- **DAST Tool:** N/A (CLI tool)
- **Penetration Testing:** Community-driven security reviews
