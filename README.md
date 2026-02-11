# AgentPass -- The Identity Layer for Autonomous AI Agents

> **Give your AI agents a passport to the internet.**

AgentPass is a passport system for AI agents. Each agent receives a cryptographically signed digital identity (Agent Passport) enabling it to authenticate on any internet service. AgentPass works in two modes: **Native** (service integrated AgentPass SDK for instant auth) and **Fallback** (agent registers as a human using passport infrastructure -- email, SMS, browser automation).

**Positioning:** "Auth0 for AI Agents"

## Features

- **Cryptographic Identity** -- Ed25519 key pairs per agent; private key never leaves the agent's machine
- **Credential Vault** -- AES-256-GCM encrypted local storage for service credentials
- **Native Authentication** -- instant challenge-response auth for integrated services (like "Login with Google" but for agents)
- **Fallback Authentication** -- browser automation with Playwright for non-integrated services
- **Dedicated Email** -- per-agent email addresses for verification flows
- **SMS Verification** -- phone numbers for OTP flows
- **Trust Scoring** -- reputation system (0-100) based on owner verification, age, and usage history
- **Audit Logging** -- every agent action is logged with timestamp, details, and result
- **Owner Controls** -- bounded autonomy with configurable permissions, approval flows, and instant revocation
- **MCP Integration** -- full Model Context Protocol support for Claude Code and other MCP clients
- **Service SDK** -- npm package for third-party services to verify agents server-side

## Quick Start

```bash
# Clone and install
git clone https://github.com/romirom11/AgentPass.git
cd AgentPass
pnpm install

# Run all 523 tests
pnpm test

# Build all packages
pnpm build

# Run E2E demo
node packages/mcp-server/dist/cli.js demo

# Start API server (port 3846)
pnpm --filter @agentpass/api-server dev

# Start owner dashboard (port 3847)
pnpm --filter @agentpass/dashboard dev

# Start landing page (port 3848)
pnpm --filter @agentpass/landing dev
```

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 10.0.0

## Architecture

AgentPass is a distributed system with components running locally (on the agent's machine) and remotely (API server).

```
AI Agent (Claude Code, etc.)
    |
    | MCP Protocol (stdio/SSE)
    v
AgentPass MCP Server (local)
    |
    +---> Credential Vault (local, SQLite + AES-256-GCM)
    +---> AgentPass API Server (remote -- passport registry, verification, trust)
    +---> Email Service (verification links, OTP codes)
    +---> SMS Service (phone verification)
    +---> Browser Service (Playwright -- fallback registration/login)
```

**Key principle:** The agent's private key and credential vault live exclusively on the agent's machine. The API server stores only public keys and metadata. A compromised API server cannot forge agent signatures or access credentials.

For the full architecture document, see [docs/architecture.md](docs/architecture.md).

## MCP Tools

AgentPass exposes 17 tools via the Model Context Protocol:

### Identity Management

| Tool | Description |
|------|-------------|
| `create_identity` | Create a new agent identity with an Ed25519 key pair |
| `list_identities` | List all locally stored agent identities |
| `get_identity` | Get full passport details for a specific agent |

### Credential Management

| Tool | Description |
|------|-------------|
| `store_credential` | Store a service credential in the encrypted local vault |
| `get_credential` | Retrieve a stored credential for a specific service |
| `list_credentials` | List all stored credentials (service names and usernames only, never passwords) |

### Authentication

| Tool | Description |
|------|-------------|
| `authenticate` | Authenticate on a service (auto-detects native vs fallback mode) |
| `check_auth_status` | Check if credentials exist for a service without triggering auth |

### Email

| Tool | Description |
|------|-------------|
| `get_email_address` | Get the agent's dedicated email address |
| `wait_for_email` | Wait for an email to arrive, optionally filtered by sender or subject |
| `read_email` | Read the full content of an email by ID |
| `extract_verification_link` | Extract a verification URL from an email body |
| `extract_otp_code` | Extract a one-time password (4-8 digits) from an email |
| `list_emails` | List all emails received at an address |

### SMS

| Tool | Description |
|------|-------------|
| `get_phone_number` | Get the agent's dedicated phone number for SMS verification |
| `wait_for_sms` | Wait for an SMS message to arrive |
| `extract_otp_from_sms` | Extract a one-time password from an SMS message |

## Claude Code Integration

Add AgentPass to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "agentpass": {
      "command": "node",
      "args": ["/path/to/AgentPass/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Generate the config automatically:

```bash
node packages/mcp-server/dist/cli.js config
```

## API Endpoints

The AgentPass API Server (default port 3846) provides:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/passports` | Register a new passport |
| `GET` | `/passports/:id` | Get passport public info |
| `DELETE` | `/passports/:id` | Revoke a passport |
| `POST` | `/verify` | Verify a passport signature (challenge-response) |
| `GET` | `/passports/:id/trust` | Get trust score details |
| `POST` | `/passports/:id/report-abuse` | Report abuse against a passport |
| `POST` | `/passports/:id/audit` | Append an audit log entry |
| `GET` | `/passports/:id/audit` | List audit log entries (paginated) |
| `GET` | `/.well-known/agentpass.json` | Discovery endpoint |
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Readiness check |

For full request/response documentation, see [docs/api-reference.md](docs/api-reference.md).

## Docker (API Server)

```bash
docker build -f packages/api-server/Dockerfile -t agentpass-api .
docker run -p 3846:3846 -v agentpass-data:/data agentpass-api
```

## Project Structure

```
AgentPass/
├── packages/
│   ├── core/                  # Shared library: crypto, passport, vault, types, errors, logger
│   ├── mcp-server/            # MCP Server + CLI (what agents call via Claude Code)
│   ├── api-server/            # HTTP API Server (Hono + libSQL)
│   ├── sdk/                   # Service SDK (@agentpass/sdk)
│   ├── email-service/         # Email handling (verification links, OTP extraction)
│   ├── browser-service/       # Playwright browser automation + proxy management
│   ├── dashboard/             # Owner Web Dashboard (React + Tailwind)
│   └── landing/               # Landing Page (React + Tailwind)
├── docs/                      # Project documentation
│   ├── architecture.md        # System architecture
│   ├── api-reference.md       # API endpoint reference
│   ├── sdk-guide.md           # SDK integration guide
│   ├── prd.md                 # Product Requirements Document
│   ├── roadmap.md             # Development roadmap
│   └── user-stories.md        # User stories
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | TypeScript, @modelcontextprotocol/sdk |
| API Server | Hono (lightweight, edge-ready) |
| Database | libSQL / Turso |
| Crypto | Node.js crypto (Ed25519, AES-256-GCM) |
| Dashboard | React 19 + Tailwind CSS 4 |
| Browser | Playwright |
| Runtime | Node.js 22+ with ESM modules |
| Package Manager | pnpm 10+ |
| Testing | Vitest (523 tests) |
| Linting | ESLint + Prettier |
| Containerization | Docker |

## Development

```bash
pnpm build          # Build all packages
pnpm test           # Run all 523 tests
pnpm lint           # Lint code
pnpm format         # Format code
pnpm clean          # Clean build artifacts
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTPASS_PORT` | `3846` | API server port |
| `AGENTPASS_DB_PATH` | `agentpass.db` | Database file path |

## Documentation

- [System Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [SDK Integration Guide](docs/sdk-guide.md)
- [Product Requirements](docs/prd.md)
- [Development Roadmap](docs/roadmap.md)
- [User Stories](docs/user-stories.md)

## License

MIT
