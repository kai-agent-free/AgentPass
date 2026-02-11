# AgentPass — System Architecture

## Overview

AgentPass is a distributed system with components running both locally (on the agent's machine) and remotely (API server, email workers). The architecture prioritizes security through local-first credential storage and cryptographic identity.

## System Components

### 1. MCP Server (Local)

The MCP Server runs locally alongside the AI agent and provides tools via the Model Context Protocol. This is the primary interface agents use.

**Responsibilities:**
- Expose MCP tools for identity management, authentication, email, browser, credentials, approvals
- Orchestrate authentication flows (native and fallback)
- Manage local credential vault
- Communicate with AgentPass API for verification

**Transport:** stdio (for Claude Code) or SSE (for other clients)

### 2. Core Library (Shared)

Shared TypeScript library used by MCP Server and API Server.

**Contains:**
- Cryptographic primitives (Ed25519 key management, AES-256-GCM encryption)
- Passport types and validation logic
- Credential vault implementation (SQLite + encryption)
- Shared TypeScript types

### 3. API Server (Remote)

Public HTTP API for passport registration, verification, and trust score management.

**Responsibilities:**
- Store public keys and passport metadata
- Verify passport signatures (challenge-response)
- Calculate and maintain trust scores
- Store audit logs
- Manage passport lifecycle (create, verify, revoke)

**Stack:** Hono + SQLite (dev) / Turso (prod)

### 4. Browser Service (Local)

Playwright-based browser automation for fallback authentication.

**Responsibilities:**
- Navigate to service signup/login pages
- Fill forms with agent credentials
- Detect and escalate CAPTCHAs
- Handle proxy configuration
- Take screenshots for error reporting

### 5. Email Service (Remote)

Cloudflare Email Workers for receiving and processing agent emails.

**Responsibilities:**
- Create email inboxes per agent (e.g., `agent-name@agentpass.dev`)
- Receive incoming emails via webhook
- Parse verification links and OTP codes
- Forward emails to MCP Server for processing

### 6. Dashboard (Local/Remote)

React + Tailwind web dashboard for agent owners.

**Responsibilities:**
- Display all agents and their passports
- Show live activity feed (audit log)
- Handle CAPTCHA solving (live browser session)
- Process approval requests
- View agent email inboxes
- Configure webhooks

### 7. Service SDK (npm package)

SDK for third-party services to integrate AgentPass native authentication.

**Responsibilities:**
- Verify agent passports
- Check trust scores
- Provide well-known endpoint templates

## Data Flow

### Native Authentication Flow

```
Agent → MCP Server → AgentPass API → Verify signature → Return trust info
                                    ↓
                          Service creates session
```

### Fallback Authentication Flow

```
Agent → MCP Server → Check credential vault
                   ↓ (no credentials)
                   Browser Service → Navigate to site
                   ↓
                   Fill registration form
                   ↓
                   Email Service → Receive verification email
                   ↓
                   Browser Service → Click verification link
                   ↓
                   Store credentials in vault
```

## Security Architecture

### Key Distribution

```
Agent Machine (LOCAL):
├── private_key (Ed25519) — NEVER transmitted
├── credential_vault.db (SQLite, AES-256-GCM encrypted)
└── passport.json (local cache)

AgentPass API (REMOTE):
├── public_key (Ed25519) — for verification
├── owner info
├── trust score
├── audit log
└── passport status (active/revoked)
```

### Encryption

- **At rest:** Credential vault encrypted with AES-256-GCM, key derived from private key via HKDF
- **In transit:** HTTPS for all API communication
- **Signatures:** Ed25519 for passport authentication (challenge-response)

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| API server compromised | Only public keys stored; can't forge signatures |
| Agent machine compromised | Credentials isolated per agent; revoke passport immediately |
| MitM attack | HTTPS + Ed25519 signatures |
| Credential vault theft | AES-256-GCM encryption; key requires private key |
| Spam/abuse | Trust scores, rate limiting, owner verification |

## Infrastructure

### Development

- All packages in a pnpm monorepo
- SQLite for local database
- Playwright for browser automation
- Vitest for testing

### Production

- API Server: Cloudflare Workers or any Node.js host
- Database: Turso (distributed SQLite)
- Email: Cloudflare Email Workers
- SMS: Twilio
- Dashboard: Static hosting (Vercel, Cloudflare Pages)
