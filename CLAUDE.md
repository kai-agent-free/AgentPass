# AgentPass — The Identity Layer for Autonomous AI Agents

## Project Overview

AgentPass is a passport system for AI agents. Each agent receives a cryptographically signed digital identity (Agent Passport) enabling it to authenticate on any internet service. Works in two modes: **Native** (service integrated AgentPass SDK) and **Fallback** (agent registers as a human using passport infrastructure).

**Positioning:** "Auth0 for AI Agents"
**Tagline:** "Give your AI agents a passport to the internet."

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | TypeScript, @modelcontextprotocol/sdk |
| API Server | Hono (lightweight, edge-ready) |
| Database (API) | SQLite (dev) / Turso (prod) |
| Database (local) | SQLite (credential vault) |
| Email | Cloudflare Email Workers + Email Routing |
| SMS | Twilio Programmable SMS |
| Browser | Playwright |
| Proxy | SOCKS5/HTTP proxy (configurable) |
| Crypto | Node.js crypto (Ed25519, AES-256-GCM) |
| Dashboard | React + Tailwind CSS |
| Telegram Bot | grammY |
| Packaging | npm package (`npx agentpass`) + Docker |
| Runtime | Node.js 22+ with ESM modules |
| Package Manager | pnpm |
| Testing | Vitest |
| Linting | ESLint + Prettier |

## Project Structure

```
AgentPass/
├── CLAUDE.md                    # This file — project conventions
├── AGENTS.md                    # Subagent definitions
├── docs/                        # Project documentation
│   ├── prd.md                   # Product Requirements Document
│   ├── architecture.md          # System architecture
│   ├── user-stories.md          # User stories
│   └── roadmap.md               # Development roadmap
├── packages/
│   ├── mcp-server/              # MCP Server (core — what agents call)
│   │   ├── src/
│   │   │   ├── tools/           # MCP tool handlers
│   │   │   ├── services/        # Business logic services
│   │   │   └── index.ts         # Server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── api-server/              # AgentPass API Server (Hono)
│   │   ├── src/
│   │   │   ├── routes/          # API route handlers
│   │   │   ├── middleware/      # Auth, validation, rate limiting
│   │   │   ├── db/              # Database schema and migrations
│   │   │   └── index.ts         # Server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── core/                    # Shared core library
│   │   ├── src/
│   │   │   ├── crypto/          # Ed25519, AES-256-GCM
│   │   │   ├── passport/        # Passport types and validation
│   │   │   ├── vault/           # Credential vault (SQLite + encryption)
│   │   │   └── types/           # Shared TypeScript types
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── browser-service/         # Playwright browser automation
│   │   ├── src/
│   │   │   ├── automation/      # Page interaction helpers
│   │   │   ├── strategies/      # Per-site registration strategies
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── email-service/           # Cloudflare Email Workers
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── sdk/                     # Service SDK (@agentpass/sdk)
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── dashboard/               # Web Dashboard (React + Tailwind)
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   └── App.tsx
│       ├── package.json
│       └── tsconfig.json
├── .beads/                      # Issue tracking (beads)
├── .claude/                     # Claude Code config
│   ├── agents/                  # Subagent definitions
│   └── settings.local.json
├── pnpm-workspace.yaml
├── package.json                 # Root package.json
├── tsconfig.base.json           # Shared TS config
└── .gitignore
```

## Development Conventions

### Code Style
- Use TypeScript strict mode in all packages
- Use ESM modules (`"type": "module"` in package.json)
- Use `import`/`export` — never `require`/`module.exports`
- Prefer `const` over `let`; never use `var`
- Use early returns to reduce nesting
- Functions should do one thing; keep them under 50 lines
- Use descriptive names: `createPassport()` not `cp()`

### Error Handling
- Use custom error classes extending `Error`
- Never swallow errors silently — log or rethrow
- Max 2 retries on any external operation (per PRD)
- Escalate to owner on persistent failures

### Security
- Private key NEVER leaves the agent's machine
- All credentials encrypted at rest with AES-256-GCM
- Challenge-response authentication with Ed25519 signatures
- No plaintext credentials in logs or error messages
- Validate all external inputs at system boundaries

### Testing
- Run tests with `pnpm test` (Vitest)
- Test files co-located: `foo.ts` → `foo.test.ts`
- Cover crypto operations thoroughly
- Mock external services (Playwright, Twilio, Cloudflare)

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Branch from `main`; PR back to `main`
- Never commit secrets or `.env` files

### Package Management
- Use `pnpm` exclusively — never npm or yarn
- Keep shared types in `@agentpass/core`
- Internal packages reference each other via `workspace:*`

## Key Design Principles

1. **Agent isolation** — each agent has its own passport, keys, and credentials; compromise of one doesn't affect others
2. **Local-first credentials** — credential vault lives ONLY on the agent's machine, encrypted
3. **Bounded autonomy** — owner controls what agents can do without approval
4. **Graceful degradation** — if AgentPass API is down, fallback mode still works with local credentials
5. **Audit everything** — every action is logged with timestamp, details, result
6. **Web3-ready architecture** — design for future on-chain identity migration

## Working with Beads (Issue Tracking)

This project uses **beads** for issue tracking. Issues are stored in `.beads/issues/`.

- Prefix: `agentpass`
- Use `/beads:list` to see all issues
- Use `/beads:create` to create new issues
- Use `/beads:show <id>` to view issue details
- Use `/beads:update <id>` to update status
- Use `/beads:epic` for epic management
- Use `/beads:dep` for dependency management

## Important Work Principles

- When uncertain or encountering errors, research documentation first (via web search or context7) before guessing
- Always use the latest stable versions of dependencies
- Maintain code cleanliness, modularity, and avoid duplicate code/logic
- Follow best practices for each technology in the stack
- Keep CLAUDE.md under ~500 lines; move reference material to dedicated docs
- When working on a task, check beads first to understand context and dependencies
