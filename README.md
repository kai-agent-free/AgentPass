<h1 align="center">🛂 AgentPass</h1>
<h3 align="center">Auth0 for AI Agents</h3>

<p align="center">
  Cryptographic identity and authentication for autonomous AI agents.
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue.svg" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22+-green.svg" alt="Node.js"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Tests-320%20passing-success.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Status-Live-brightgreen.svg" alt="Live">
</p>

<p align="center">
  <b>Live API:</b> <a href="https://api.agentpass.space">https://api.agentpass.space</a> · <a href="https://agentpass.space/">Landing Page</a>
</p>

---

## What is AgentPass?

AI agents are becoming autonomous — but they **can't authenticate anywhere**. No email, no phone, no credentials, no identity. Every auth flow breaks autonomy.

**AgentPass gives each agent a cryptographically signed digital passport** — an Ed25519 identity that enables authentication on any internet service.

- **Native Mode** → Services integrate AgentPass SDK → instant challenge-response auth
- **Fallback Mode** → No integration needed → agent registers using passport infrastructure (email, SMS, browser automation)

## ⚡ Quickstart — Get a Passport in 60 Seconds

```bash
# Clone and run the quickstart script
git clone https://github.com/kai-agent-free/AgentPass.git
cd AgentPass
bash examples/quickstart.sh
```

Or do it manually with curl:

```bash
API="https://api.agentpass.space"

# 1. Register
curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"SecurePass1!","name":"demo-agent"}'

# 2. Create passport (use the token from step 1)
curl -s -X POST "$API/passports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"public_key":"...","name":"my-agent","description":"My first agent"}'

# Done — your agent has an identity 🎉
```

See [`examples/quickstart.sh`](examples/quickstart.sh) for the full working script.

## Features

| Feature | Description |
|---------|-------------|
| **Cryptographic Identity** | Ed25519 key pairs — private key never leaves the agent |
| **Credential Vault** | AES-256-GCM encrypted local storage |
| **Native Auth** | Instant challenge-response for integrated services |
| **Fallback Auth** | Playwright browser automation for everything else |
| **Agent Email** | Dedicated email addresses for verification flows |
| **SMS Verification** | Phone numbers for OTP flows |
| **Trust Scoring** | Reputation system (0–100) |
| **MCP Integration** | 17 tools for Claude Code and other MCP clients |
| **Service SDK** | npm package for third-party verification |
| **Owner Controls** | Permissions, approval flows, instant revocation |

## Architecture

8-package TypeScript monorepo:

| Package | What it does |
|---------|-------------|
| `@agentpass/core` | Crypto (Ed25519, AES-256-GCM), passport types, vault, logger |
| `@agentpass/api-server` | HTTP API — passport registry, verification, trust scoring (Hono + libSQL) |
| `@agentpass/mcp-server` | MCP Server — 17 tools for AI agents |
| `@agentpass/sdk` | Service SDK for third-party identity verification |
| `@agentpass/email-service` | Email routing and OTP extraction (Cloudflare Workers) |
| `@agentpass/browser-service` | Playwright automation for fallback auth flows |
| `@agentpass/dashboard` | Owner dashboard (React 19 + Tailwind CSS 4) |
| `@agentpass/landing` | Landing page (React 19 + Tailwind CSS 4) |

```
  AI Agent (Claude Code, AutoGPT, etc.)
       │  MCP Protocol
       ▼
  MCP Server (local)  ──►  API Server (remote)
       │                        │
       ├── Credential Vault     ├── Passport Registry
       ├── Ed25519 Identity     ├── Trust Scoring
       └── Browser Automation   └── Audit Logs
```

**Security:** Private keys and credential vaults live exclusively on the agent's machine. The API server stores only public keys.

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm test           # Run 320 tests
pnpm lint           # Lint
```

## Tests

**320 tests passing** across all packages — crypto, vault, API, MCP tools, SDK, and integration tests.

```bash
pnpm test
```

## API Documentation

Full API reference: [**docs/API.md**](docs/API.md)

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Register owner account |
| `POST` | `/passports` | Create a passport |
| `GET` | `/passports/:id` | Get passport info |
| `POST` | `/verify` | Verify agent signature |
| `GET` | `/health` | Health check |

## SDK Integration

```typescript
import { AgentPassSDK } from '@agentpass/sdk';

const ap = new AgentPassSDK({ apiUrl: 'https://api.agentpass.space' });

const result = await ap.verify({
  passportId: 'ap_7xk2m9f3abcd',
  challenge: 'random-nonce',
  signature: 'base64url-signature',
});

if (result.valid) {
  console.log('Agent verified! Trust:', result.trust_score);
}
```

## Contributing

Contributions welcome! Please:

1. Fork and create a feature branch
2. Write tests for new features
3. Use conventional commits (`feat:`, `fix:`, `docs:`, `test:`, etc.)
4. Run `pnpm test && pnpm lint` before submitting
5. Open a PR with a clear description

## License

[MIT](LICENSE)

---

<p align="center">
  <b>AgentPass</b> — giving AI agents a passport to the internet.
</p>
