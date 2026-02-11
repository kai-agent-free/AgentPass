# AgentPass — Subagent Definitions

This file documents the specialized subagents available for the AgentPass project.
Subagent configurations live in `.claude/agents/`.

## Available Subagents

### 1. `crypto-agent` — Cryptography Specialist
- **Focus:** Ed25519 key management, AES-256-GCM encryption, challenge-response auth
- **When to use:** Any task involving key generation, signing, verification, credential vault encryption
- **Skills:** Node.js crypto APIs, libsodium patterns, secure key derivation

### 2. `mcp-agent` — MCP Server Developer
- **Focus:** Building and testing MCP tools for the AgentPass MCP Server
- **When to use:** Adding new MCP tools, debugging MCP protocol issues, testing tool handlers
- **Skills:** @modelcontextprotocol/sdk, tool schema design, stdio/SSE transport

### 3. `browser-agent` — Browser Automation Specialist
- **Focus:** Playwright-based browser automation for fallback auth flows
- **When to use:** Building registration/login strategies, CAPTCHA detection, form filling
- **Skills:** Playwright API, page selectors, proxy configuration, screenshot capture

### 4. `api-agent` — API Server Developer
- **Focus:** Hono API server, routes, middleware, database operations
- **When to use:** Building API endpoints, verification logic, trust score calculations
- **Skills:** Hono framework, SQLite/Turso, REST API design, middleware patterns

### 5. `frontend-agent` — Dashboard Developer
- **Focus:** React + Tailwind web dashboard
- **When to use:** Building dashboard UI, real-time activity feed, agent management views
- **Skills:** React, Tailwind CSS, WebSocket, responsive design

### 6. `test-agent` — Testing Specialist
- **Focus:** Writing and running tests across all packages
- **When to use:** After implementing a feature, before PRs, when debugging failures
- **Skills:** Vitest, test patterns, mocking, integration testing

### 7. `docs-agent` — Documentation Writer
- **Focus:** Technical documentation, API docs, user guides
- **When to use:** Documenting new features, updating architecture docs, writing guides
- **Skills:** Technical writing, API documentation, markdown

## Usage in Claude Code

Subagents are invoked via the Task tool with `subagent_type` parameter.
Custom agents in `.claude/agents/` are available as dedicated subagent types.

### Best Practices for Subagent Usage

1. **Delegate research** to Explore agents to protect main context
2. **Run independent tasks in parallel** — e.g., crypto and frontend work simultaneously
3. **Avoid file conflicts** — ensure each agent works on different files
4. **Keep communication clear** — provide full context in task prompts
5. **Use Plan agents** for architectural decisions before implementation

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
