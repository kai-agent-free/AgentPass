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

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->
