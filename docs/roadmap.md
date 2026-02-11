# AgentPass — Development Roadmap

## Sprint Overview

The project is structured for a 4-day hackathon with clear deliverables per sprint.

---

## Sprint 1: Foundation (Day 1-2) — "Core Identity & Auth"

**Goal:** Agent can create a passport, register on a real website, and re-login automatically.

### Epic 1.1: Project Bootstrap
- Initialize pnpm monorepo with all package stubs
- Configure TypeScript, ESLint, Prettier, Vitest
- Set up shared tsconfig and build pipeline
- Create `.gitignore`, `pnpm-workspace.yaml`

### Epic 1.2: Cryptographic Core
- Ed25519 key pair generation
- Signing and signature verification
- AES-256-GCM encryption/decryption for credential vault
- Key derivation (HKDF) from private key
- Passport data structure and validation
- Unit tests for all crypto operations

### Epic 1.3: Credential Vault
- SQLite database setup with better-sqlite3
- Encrypted CRUD operations (store, get, list, delete)
- Master key derivation from passport private key
- Per-agent vault isolation

### Epic 1.4: MCP Server (Core Tools)
- MCP Server scaffolding with @modelcontextprotocol/sdk
- Identity tools: `create_identity`, `list_identities`, `get_identity`
- Credential tools: `store_credential`, `get_credential`, `list_credentials`
- Authentication orchestrator: `authenticate(url)` — main entry point

### Epic 1.5: Email Service
- Cloudflare Email Workers setup
- Create agent mailboxes
- Receive and store incoming emails
- Parse verification links and OTP codes from email body
- MCP tools: `get_email_address`, `wait_for_email`, `extract_verification_link`, `extract_otp_code`

### Epic 1.6: Browser Service
- Playwright setup with configurable proxy
- Core automation: navigate, fill form, click, screenshot
- Registration strategy: find email form → fill → submit
- Login strategy: find login form → fill stored credentials → submit
- CAPTCHA detection (identify reCAPTCHA, hCaptcha, Turnstile elements)

### Epic 1.7: End-to-End Fallback Auth
- Full flow: register on a real website → email verify → save credentials → re-login
- Session management: detect expired session → re-login
- Error handling: max 2 retries → escalate

---

## Sprint 2: API & Native Auth (Day 3) — "Verification & Trust"

**Goal:** AgentPass API works, native auth flow demonstrated, trust scores calculated.

### Epic 2.1: API Server
- Hono server setup with SQLite/Turso
- `POST /passports` — register passport (public key + metadata)
- `GET /passports/:id` — get passport info
- `POST /verify` — verify passport signature (challenge-response)
- `DELETE /passports/:id` — revoke passport
- Rate limiting middleware
- Input validation with Zod

### Epic 2.2: Native Authentication Flow
- Well-known endpoint: `/.well-known/agentpass.json`
- Challenge-response flow implementation
- MCP `authenticate()` auto-detects native vs. fallback
- Demo service that supports "Login with AgentPass"

### Epic 2.3: Trust Score System
- Score calculation: owner verification + age + successful auths + penalties
- Update trust score on each auth event
- Include trust score in verify response
- Abuse reporting endpoint

### Epic 2.4: Dashboard (Basic)
- React + Tailwind setup
- Agent list page (name, status, trust score)
- Audit log page (real-time activity feed)
- Agent detail page (passport info, credentials overview)

### Epic 2.5: Webhook Notifications
- Webhook event system
- Events: registered, logged_in, captcha_needed, approval_needed, error
- JSON payload delivery to configured URL
- Owner webhook URL configuration

### Epic 2.6: CAPTCHA Escalation
- Screenshot current page on CAPTCHA detection
- Send to owner via webhook with browser session link
- Owner views live session in dashboard
- Detect CAPTCHA resolution and continue flow

### Epic 2.7: Error Recovery
- Track step-by-step progress during registration
- On failure: save state, screenshot, notify owner
- Owner actions: retry, skip, do manually
- Manual credential input via dashboard

---

## Sprint 3: Advanced Features (Day 4) — "Polish & Extend"

**Goal:** Telegram bot, SMS verification, approval flows, production-ready polish.

### Epic 3.1: SMS Verification
- Twilio integration for phone number provisioning
- Receive SMS via webhook
- OTP extraction from SMS
- Auto-enter OTP in browser
- MCP tools: `get_phone_number`, `wait_for_sms`, `extract_otp_from_sms`

### Epic 3.2: Telegram Bot
- grammY bot setup
- Approval requests with inline buttons (approve/deny)
- CAPTCHA screenshots with solve link
- Error notifications with retry/skip actions
- Activity digest messages

### Epic 3.3: Owner Approval Flow
- Permission system: auto_approved, requires_approval, blocked
- MCP tool: `request_approval(action, details)`
- Webhook delivery to owner
- Approve/deny via dashboard or Telegram
- Approval timeout and escalation

### Epic 3.4: Service SDK
- npm package `@agentpass/sdk`
- Verification middleware for Hono/Express/Next.js
- Well-known endpoint generator
- Trust score access helper
- Documentation and examples

### Epic 3.5: Advanced Dashboard
- Live browser session viewing
- CAPTCHA solving interface (embedded browser)
- Email inbox viewer
- Webhook configuration UI
- Passport revocation UI

### Epic 3.6: Proxy Support
- Configurable proxy per agent
- Sticky proxy per service domain
- Proxy pool rotation
- No-proxy rules for specific domains

### Epic 3.7: Production Hardening
- Comprehensive error handling across all packages
- Logging with structured output
- Health check endpoints
- Graceful shutdown handling
- Environment-based configuration

---

## Sprint 4: Demo & Documentation (Day 4+) — "Ship It"

### Epic 4.1: Demo Scenario
- End-to-end demo: agent registers on 3 services, logs in, performs actions
- Video recording of the full flow
- Live demo preparation

### Epic 4.2: Documentation
- README with quick start guide
- API documentation
- MCP tool documentation
- SDK integration guide
- Architecture diagrams

### Epic 4.3: Packaging
- npm package `@agentpass/cli`
- Docker image
- `npx agentpass` setup command
- MCP config generation for Claude Code

---

## Priority Matrix

| Priority | Item | Sprint |
|----------|------|--------|
| P0 | Ed25519 key management | Sprint 1 |
| P0 | Credential vault (SQLite + AES) | Sprint 1 |
| P0 | MCP Server with core tools | Sprint 1 |
| P0 | Browser automation (Playwright) | Sprint 1 |
| P0 | Email service (Cloudflare) | Sprint 1 |
| P0 | End-to-end fallback auth | Sprint 1 |
| P1 | API Server (Hono) | Sprint 2 |
| P1 | Native auth flow | Sprint 2 |
| P1 | Trust score system | Sprint 2 |
| P1 | Basic dashboard | Sprint 2 |
| P1 | Webhook notifications | Sprint 2 |
| P1 | CAPTCHA escalation | Sprint 2 |
| P2 | SMS verification (Twilio) | Sprint 3 |
| P2 | Telegram bot | Sprint 3 |
| P2 | Approval flow | Sprint 3 |
| P2 | Service SDK | Sprint 3 |
| P3 | Demo video | Sprint 4 |
| P3 | Full documentation | Sprint 4 |
| P3 | npm/Docker packaging | Sprint 4 |
