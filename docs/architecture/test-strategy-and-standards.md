# Test Strategy and Standards

## Testing Philosophy

- **Approach:** Test-after development with mandatory coverage before merge
- **Coverage Goals:** 80% for core modules, 60% for utilities
- **Test Pyramid:** 70% unit, 20% integration, 10% E2E

## Test Types and Organization

### Unit Tests

- **Framework:** Vitest 1.2.0
- **File Convention:** `{module}.test.ts` in tests/unit/{module}/
- **Location:** tests/unit/ mirroring src/ structure
- **Mocking Library:** vitest built-in mocks
- **Coverage Requirement:** 80% for sync/, converters/, 60% for utils/

**AI Agent Requirements:**
- Generate tests for all public methods
- Cover edge cases and error conditions
- Follow AAA pattern (Arrange, Act, Assert)
- Mock all external dependencies

### Integration Tests

- **Scope:** API client, manifest persistence, converter accuracy
- **Location:** tests/integration/
- **Test Infrastructure:**
  - **Confluence API:** Mock server using MSW (Mock Service Worker)
  - **File System:** Temp directories using Bun.tempdir()
  - **Keychain:** Mock keytar implementation

### End-to-End Tests

- **Scope:** Critical user workflows (auth, pull, push, sync)
- **Environment:** Local test Confluence instance or sandbox
- **Test Data:** Fixtures in tests/fixtures/

## Test Data Management

- **Strategy:** Fixtures for predictable tests, factories for dynamic data
- **Fixtures:** tests/fixtures/ with sample Confluence pages and markdown
- **Factories:** Test data builders for complex objects
- **Cleanup:** Automatic cleanup after each test using afterEach hooks

## Continuous Testing

- **CI Integration:** All tests run on every PR
- **Performance Tests:** Benchmark sync operations with 50+ pages
- **Security Tests:** Credential handling, no secrets in logs
