# AgentPass — User Stories

## Personas

### Owner (Human/Organization)
A developer or company that creates and manages AI agents. Needs to give agents autonomous identity while maintaining control and visibility.

### Agent (AI)
An autonomous AI agent (Claude Code, CrewAI, AutoGPT, etc.) that needs to authenticate on internet services to complete tasks.

### Service (Third-party)
A website or API that wants to support agent authentication, either natively (via SDK) or passively (agents register like humans).

---

## Epic 1: Agent Identity Management

### US-1.1: Create Agent Passport
**As an** owner,
**I want to** create a new agent with a digital passport,
**So that** my agent has a cryptographic identity for authentication.

**Acceptance Criteria:**
- Owner can create an agent via CLI or dashboard
- System generates Ed25519 key pair
- Private key stored only locally
- Public key registered on AgentPass API
- Agent gets a unique email address (e.g., `agent-name@agentpass.dev`)
- Passport ID is returned for configuration

### US-1.2: List My Agents
**As an** owner,
**I want to** see all my agents and their status,
**So that** I can manage my agent fleet.

**Acceptance Criteria:**
- Dashboard shows all agents with name, status, trust score
- CLI `list_identities()` returns all agents
- Shows active/revoked status

### US-1.3: Revoke Agent Passport
**As an** owner,
**I want to** immediately revoke an agent's passport,
**So that** a compromised or unnecessary agent can no longer authenticate.

**Acceptance Criteria:**
- Revocation is immediate
- Native auth stops working instantly
- Option to wipe credential vault
- Webhook notification sent to owner

### US-1.4: Configure Agent Permissions
**As an** owner,
**I want to** set what my agent can do autonomously vs. what requires approval,
**So that** I maintain control over sensitive actions.

**Acceptance Criteria:**
- Three permission levels: auto_approved, requires_approval, blocked
- Configurable per action type and per domain
- Changes take effect immediately

---

## Epic 2: Fallback Authentication

### US-2.1: Register on a New Service
**As an** agent,
**I want to** register on a website using my passport email and a generated password,
**So that** I can access the service autonomously.

**Acceptance Criteria:**
- Agent calls `register(url)` via MCP
- Browser navigates to signup page
- Finds email/password form (skips OAuth buttons)
- Fills with passport email + secure generated password
- Handles email verification automatically
- Saves credentials to vault

### US-2.2: Login to an Existing Service
**As an** agent,
**I want to** login to a service where I already have credentials,
**So that** I can resume work without re-registering.

**Acceptance Criteria:**
- Agent calls `authenticate(url)` via MCP
- System checks credential vault
- If credentials exist, attempts login
- If session valid, returns immediately
- If expired, re-login with stored credentials
- Total time: ~5 seconds for repeat login

### US-2.3: Handle Email Verification
**As an** agent,
**I want to** automatically handle email verification during registration,
**So that** I can complete signup without human intervention.

**Acceptance Criteria:**
- Wait for verification email (timeout: 60s)
- Extract verification link from email body
- Navigate to link in browser
- Confirm verification success
- If email doesn't arrive, escalate to owner

### US-2.4: Handle CAPTCHA Escalation
**As an** agent,
**I want to** escalate CAPTCHAs to my owner,
**So that** registration can proceed despite anti-bot measures.

**Acceptance Criteria:**
- Detect CAPTCHA on page (reCAPTCHA, hCaptcha, Turnstile)
- Take screenshot of current page
- Send notification to owner via webhook
- Owner can view live browser session
- Owner solves CAPTCHA
- Agent detects CAPTCHA resolved and continues
- If owner doesn't respond within timeout, skip and notify

### US-2.5: Session Management
**As an** agent,
**I want to** have my sessions automatically refreshed,
**So that** I don't need to re-authenticate manually.

**Acceptance Criteria:**
- Try stored cookies/token first
- If expired (401/403), re-login with stored credentials
- If credentials invalid, notify owner
- No infinite retries — max 2 attempts then escalate

---

## Epic 3: Native Authentication

### US-3.1: Authenticate via AgentPass Protocol
**As an** agent,
**I want to** authenticate natively on services that support AgentPass,
**So that** I can access them instantly without email/password.

**Acceptance Criteria:**
- Check `/.well-known/agentpass.json` on target service
- If supported, use native flow: send passport + signature
- Service verifies via AgentPass API
- Receive session token
- Total time: ~500ms

### US-3.2: Integrate AgentPass SDK
**As a** service developer,
**I want to** add "Login with AgentPass" to my app,
**So that** AI agents can authenticate on my service.

**Acceptance Criteria:**
- npm package `@agentpass/sdk` available
- Simple verification middleware for Express/Hono/Next.js
- Well-known endpoint template provided
- Trust score accessible for authorization decisions

---

## Epic 4: Credential Management

### US-4.1: Encrypted Credential Vault
**As an** agent,
**I want to** store my credentials securely,
**So that** they're protected even if my machine is accessed.

**Acceptance Criteria:**
- SQLite database with AES-256-GCM encryption
- Master key derived from passport private key
- Store username, password, cookies per service
- CRUD operations: store, get, list, delete

### US-4.2: Credential Isolation
**As an** owner,
**I want to** ensure each agent has its own isolated credentials,
**So that** compromise of one agent doesn't affect others.

**Acceptance Criteria:**
- Each agent has its own vault file
- Different encryption keys per agent
- No cross-agent credential access

---

## Epic 5: Trust & Reputation

### US-5.1: Trust Score Calculation
**As a** service,
**I want to** see an agent's trust score,
**So that** I can make authorization decisions.

**Acceptance Criteria:**
- Score 0-100 based on: owner verification, age, successful auths, abuse reports
- Updated after each authentication event
- Accessible via verify API response

### US-5.2: Abuse Reporting
**As a** service,
**I want to** report abusive agents,
**So that** the ecosystem stays healthy.

**Acceptance Criteria:**
- API endpoint for abuse reports
- Trust score penalty (-50 per report)
- Owner notified of abuse reports
- Repeated abuse leads to passport revocation

---

## Epic 6: Owner Dashboard & Notifications

### US-6.1: Web Dashboard
**As an** owner,
**I want to** see all my agents' activity in a web dashboard,
**So that** I can monitor and manage them.

**Acceptance Criteria:**
- Agent list with status and trust scores
- Live activity feed (audit log)
- Credential vault overview (service count, no plaintext)
- Pending approval requests

### US-6.2: Webhook Notifications
**As an** owner,
**I want to** receive notifications about agent actions,
**So that** I stay informed in real-time.

**Acceptance Criteria:**
- Configurable webhook URL
- Events: registered, logged_in, login_failed, captcha_needed, approval_needed, email_received, error
- JSON payload with event type, agent info, details, actions

### US-6.3: Telegram Bot
**As an** owner,
**I want to** manage agents from Telegram,
**So that** I can approve actions and solve CAPTCHAs on mobile.

**Acceptance Criteria:**
- Approval requests with inline buttons
- CAPTCHA screenshots with solve link
- Error notifications with retry/skip options
- Activity digest

---

## Epic 7: SMS/Phone Verification

### US-7.1: Phone Number Provisioning
**As an** agent,
**I want to** have a phone number for SMS verification,
**So that** I can register on services that require phone verification.

**Acceptance Criteria:**
- Twilio number provisioned per agent (on demand)
- SMS received via webhook
- OTP extraction from SMS
- OTP entered automatically in browser

---

## Epic 8: Developer Experience

### US-8.1: CLI Setup
**As a** developer,
**I want to** set up AgentPass with a single command,
**So that** I can start using it quickly.

**Acceptance Criteria:**
- `npm install -g @agentpass/cli`
- `agentpass init` creates owner account + config
- `agentpass serve` starts MCP server + dashboard
- MCP config snippet for Claude Code provided

### US-8.2: MCP Integration
**As an** AI agent framework developer,
**I want to** connect to AgentPass via MCP,
**So that** any MCP-compatible agent can use it.

**Acceptance Criteria:**
- MCP Server implements all tools from the spec
- Works with stdio and SSE transport
- Compatible with Claude Code, OpenClaw, and other MCP clients
