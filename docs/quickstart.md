# AgentPass Quickstart — 5 Minutes to Agent Identity

Give your AI agent a cryptographic identity in 5 minutes.

## What You Get

- **Ed25519 keypair** — your agent's unique, verifiable identity
- **Passport ID** — `ap_xxxxxxxxxxxx` — portable across platforms
- **Email address** — `your-agent@agent-mail.xyz` — for signups and verification
- **Challenge-response verification** — prove your agent is who it claims to be

## 1. Install

```bash
npm install @agentpass/core
```

## 2. Register and Create a Passport

```typescript
import { generateKeyPair, signChallenge } from '@agentpass/core';

const API = 'https://api.agentpass.space';

// Generate Ed25519 keypair
const { publicKey, privateKey } = generateKeyPair();

// Register owner account (one-time)
const { token } = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'you@example.com',
    password: 'your-secure-password',
    name: 'My Agent Project',
  }),
}).then(r => r.json());

// Create a passport
const passport = await fetch(`${API}/passports`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    name: 'my-agent',
    public_key: publicKey,
    capabilities: ['code', 'web', 'email'],
  }),
}).then(r => r.json());

console.log('Passport ID:', passport.passport_id);
console.log('Agent Email:', passport.email);
// => ap_08f23da045c1
// => my-agent@agent-mail.xyz

// ⚠️ Save privateKey securely — you need it to prove identity
```

## 3. Verify Your Agent

Other agents or services can verify your agent's identity via challenge-response:

```typescript
const challenge = 'verify-' + Date.now();
const signature = signChallenge(challenge, privateKey);

const result = await fetch(`${API}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    passport_id: passport.passport_id,
    challenge,
    signature,
  }),
}).then(r => r.json());

console.log(result.valid); // true
```

## 4. Use with MCP (Model Context Protocol)

AgentPass includes an MCP server with 17 tools for identity, credentials, email, and auth:

```bash
npx @agentpass/mcp-server serve
```

Your agent gets tools like:
- `create_identity` — generate a new passport
- `verify_identity` — verify another agent
- `send_email` / `check_inbox` — email via @agent-mail.xyz
- `authenticate_on_service` — auto-login/register on websites with fallback auth

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register an owner account |
| `/auth/login` | POST | Login and get JWT token |
| `/passports` | POST | Create a new passport |
| `/passports/:id` | GET | Get passport details |
| `/verify` | POST | Challenge-response verification |
| `/trust/:id` | GET | Get trust score and history |

**Base URL:** `https://api.agentpass.space`

## Why AgentPass?

Without identity, your agent is anonymous. It can't:
- Prove it completed a task
- Build reputation across platforms
- Authenticate on services without hardcoded credentials
- Be verified by other agents

AgentPass fixes this with one Ed25519 keypair and a simple API.

## Links

- **API:** https://api.agentpass.space
- **Dashboard:** https://dashboard.agentpass.space
- **GitHub:** https://github.com/romirom11/AgentPass
- **Spec:** [MVA Credential](https://github.com/kai-agent-free/mva-credential)
