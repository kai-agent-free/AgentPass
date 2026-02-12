# Integration Tests

This directory contains end-to-end integration tests for AgentPass MCP Server.

## Tests

### 1. Create Identity → Get Email (`create-identity-email.test.ts`)

Tests the full flow of creating an agent identity and retrieving its dedicated email address.

**What it tests:**
- Creating an agent identity with Ed25519 key pair
- Generating email address from agent name
- Email address sanitization (lowercase, hyphenation)
- Identity persistence in encrypted vault
- Multiple agents with unique identities and emails

**Status:** ✅ All 7 tests passing

### 2. Fallback Registration Flow (`fallback-registration.test.ts`)

Tests the complete fallback registration workflow including identity creation, email address generation, credential storage, and email verification.

**What it tests:**
- Preparing agent for fallback registration
- Email address generation and validation
- Credential storage in encrypted vault
- Multiple service registrations
- Email-based verification flow
- Credential retrieval for authentication

**Status:** ✅ 5/6 tests passing (1 skipped - requires browser)

**Skipped test:** Full browser registration on GitHub
- Requires Playwright browser setup
- Requires network access to GitHub
- May require CAPTCHA solving
- Can be run manually when browser automation is ready

## Running Tests

```bash
# Run all integration tests
pnpm --filter @agentpass/mcp-server test src/integration/

# Run specific integration test
pnpm --filter @agentpass/mcp-server test src/integration/create-identity-email.test.ts

# Run with coverage
pnpm --filter @agentpass/mcp-server test --coverage src/integration/
```

## Test Principles

1. **Use Real Services**: Integration tests use real implementations (not mocks) where possible
2. **In-Memory Database**: Tests use `:memory:` SQLite database for speed and isolation
3. **Proper Cleanup**: Each test cleans up resources (closes vault) in `afterEach`
4. **Async/Await**: All async operations properly awaited
5. **Descriptive Names**: Test names clearly describe what is being tested

## Test Helpers

Common test utilities are available in `/Users/romankudin/Developer/hackathon/AgentPass/packages/mcp-server/src/test-helpers.ts`:

- `createTestIdentityService()`: Creates IdentityService with in-memory vault

## Dependencies

Integration tests depend on:
- `@agentpass/core`: Crypto, vault, passport types
- `@agentpass/email-service`: Email address generation
- `vitest`: Test framework

## Future Tests

Potential integration tests to add:
- [ ] Full browser registration flow (once browser service is ready)
- [ ] Email verification with OTP codes
- [ ] SMS verification flow
- [ ] Native authentication with AgentPass API
- [ ] Multi-factor authentication scenarios
- [ ] Session management and reuse
- [ ] Error recovery and retry logic
