# AgentPass — Development Roadmap v2

**Date:** 2026-02-24  
**Status:** Production live, 608 tests passing, core gaps identified  
**Goal:** Make AgentPass the default identity layer for AI agents

---

## 🎯 Minimum Viable Demo

The demo that would impress a potential user in 3 minutes:

1. `npm install @agentpass/sdk` → create passport with 3 lines of code
2. Open dashboard.agentpass.space → see the passport appear
3. Show trust score going from "unverified" → "basic" → "verified" as you verify owner
4. Trigger a CAPTCHA escalation → watch it appear in dashboard with live browser view
5. Resolve it → show the agent continuing automatically

**What must work perfectly for this:**
- SDK → API → Dashboard passport creation flow (✅ already works)
- Trust score visible in dashboard (❌ needs UI)
- CAPTCHA escalation notification (❌ needs Telegram/webhook wiring)
- Live browser viewer (✅ already works, needs MCP push)

---

## Phase 1: Stabilize — This Week (Feb 24–28)

**Goal:** Make the core demo path work flawlessly end-to-end.

### 1.1 Dashboard Settings → Server Persistence
**Effort: 1–1.5 days**

- [ ] Create `PUT /owner/settings` endpoint on API server (~2h)
  - Schema: `{ webhookUrl, telegramChatId, notifications: { email, telegram, webhook } }`
  - Store in new `owner_settings` table or as JSONB on owner record
- [ ] Create `GET /owner/settings` endpoint (~1h)
- [ ] Update dashboard SettingsPage to call API instead of localStorage (~2h)
- [ ] Migration script for DB schema (~30min)
- [ ] Tests for new endpoints (~1h)

### 1.2 Telegram Bot → Working Webhook + Persistent Chat IDs
**Effort: 1–1.5 days**

- [ ] Wire `POST /telegram/webhook` to actually forward updates to bot instance (~2h)
- [ ] Persist chat ID mappings to database instead of in-memory Map (~2h)
  - Table: `telegram_links (owner_email, chat_id, linked_at)`
- [ ] Handle `/start link_<email>` deep link parameter in bot (~1h)
- [ ] Dashboard "Link Bot" button → call API to register chat ID (~1h)
- [ ] Test: full flow from dashboard → deep link → Telegram → bot linked (~1h)

### 1.3 Trust Score → Dashboard UI
**Effort: 0.5–1 day**

- [ ] TrustScoreCard component: circular gauge + level badge + factor breakdown (~3h)
- [ ] "Verify Owner" button that calls `PATCH /passports/:id/trust/verify-owner` (~1h)
- [ ] "Add Payment Method" placeholder (can be simple flag toggle for now) (~30min)
- [ ] Show trust score on passport detail page (~1h)

### 1.4 Quick Wins
**Effort: 0.5 day**

- [ ] Fix `generatePassword` to use `crypto.randomBytes` instead of `Math.random` (~15min)
- [ ] Add escalation timeout mechanism (cron or check-on-access, 15min TTL) (~1h)
- [ ] Wire escalation creation → Telegram notification to owner (~1h)

**Phase 1 Total: ~4–5 days**

---

## Phase 2: Complete Core — Next 1–2 Weeks (Mar 1–14)

**Goal:** Fill the remaining technical gaps so every advertised feature actually works.

### 2.1 Playwright Browser Adapter
**Effort: 3–4 days**

- [ ] Implement `BrowserOperations` interface with Playwright (~1 day)
  - `navigateTo`, `fillField`, `clickButton`, `getPageContent`, `detectCaptcha`
- [ ] Screenshot push to browser-session API (JPEG frames via WebSocket) (~0.5 day)
- [ ] Command polling loop (receive click/type commands from dashboard) (~0.5 day)
- [ ] Service-specific adapter config format (~0.5 day)
  - JSON config per service: `{ loginUrl, selectors: { email, password, submit }, captchaIndicators }`
- [ ] 3 example adapters: GitHub, Google, generic (~1 day)
- [ ] Integration tests with test pages (~0.5 day)

### 2.2 CAPTCHA Escalation MCP → Dashboard Flow
**Effort: 1–2 days**

- [ ] MCP tool `escalate_captcha` → creates escalation + browser session + pushes frames (~1 day)
- [ ] Notification trigger: escalation created → Telegram + webhook (~0.5 day)
- [ ] Test full loop: MCP detects CAPTCHA → escalates → owner solves in dashboard → MCP continues (~0.5 day)

### 2.3 Email Verification End-to-End
**Effort: 1–1.5 days**

- [ ] Wire email checking in fallback auth (poll inbox for verification link) (~0.5 day)
- [ ] Handle common email verification patterns (link click, code entry) (~0.5 day)
- [ ] Timeout + retry logic with clear error states (~0.5 day)

### 2.4 Webhook Delivery Infrastructure
**Effort: 1 day**

- [ ] Background job that POSTs to owner's webhook URL on events (~0.5 day)
- [ ] Retry with exponential backoff (3 attempts) (~0.5 day)
- [ ] Event types: `passport.created`, `escalation.created`, `auth.completed`, `trust.changed`

**Phase 2 Total: ~7–10 days**

---

## Phase 3: Launch & Growth — Weeks 3–6 (Mar 15 – Apr 5)

### 3.1 Get First 10 Real Agent Users

**Strategy: Go where agents already are.**

1. **OpenClaw community** — AgentPass solves a real problem for OpenClaw agents (auth to services). Write an integration guide, post in community channels. *Target: 3–5 users.*
2. **AutoGPT / CrewAI Discord** — these users constantly hit auth walls. Post a "how I solved auth for my agent" walkthrough. *Target: 2–3 users.*
3. **Show HN post** — "AgentPass: Auth0 for AI Agents" with a compelling demo video. *Target: 2–5 users.*
4. **dev.to article** — technical deep dive on agent identity problems. *Target: 1–2 users.*
5. **Direct outreach** — find 5 agent builders on Twitter/X, offer free setup help. *Target: 2–3 users.*

### 3.2 Content Strategy

| Content | Platform | When |
|---------|----------|------|
| "Why AI Agents Need Identity" (problem framing) | dev.to + HN | Week 3 |
| "AgentPass in 5 Minutes" demo video | Twitter/X + YouTube | Week 3 |
| Integration guide: OpenClaw + AgentPass | GitHub README + blog | Week 4 |
| Integration guide: CrewAI + AgentPass | dev.to | Week 4 |
| "Building Trust Scores for AI Agents" (technical) | dev.to + HN | Week 5 |
| "How My AI Agent Authenticates to 50 Services" | Twitter thread | Week 5 |

### 3.3 Integration Guides
**Effort: 1 day each**

- [ ] OpenClaw integration (MCP server as tool provider)
- [ ] AutoGPT plugin template
- [ ] CrewAI tool wrapper
- [ ] LangChain tool integration
- [ ] Generic REST API guide

### 3.4 Pricing Model

**Phase 1 — Free forever tier:**
- 1 passport, 5 stored credentials, 100 auth/month, basic trust score
- This is enough for solo agent builders to try it

**Phase 2 — Pro ($9/mo):**
- 10 passports, unlimited credentials, 1000 auth/month
- CAPTCHA escalation (10/month), webhook notifications
- Priority support

**Phase 3 — Team ($29/mo):**
- 50 passports, agent-to-agent messaging
- Custom trust factors, SLA

**Phase 4 — Enterprise (custom):**
- Unlimited, federation, on-prem, audit logs

*Don't charge until there are at least 20 active users. Free tier is the growth engine.*

---

## Phase 4: Advanced — Months 2–3 (Apr – May)

### 4.1 Agent-to-Agent Messaging
**Effort: 1 week polish**
- Already built, needs: message persistence, delivery guarantees, rate limiting
- [ ] Store messages in DB instead of in-memory (~2 days)
- [ ] Read receipts and delivery status (~1 day)
- [ ] Rate limiting per passport (~0.5 day)
- [ ] Dashboard inbox UI (~1.5 days)

### 4.2 Federation / Cross-Platform Identity
**Effort: 2–3 weeks**
- [ ] Design federation protocol (based on ActivityPub or custom) (~1 week)
- [ ] Allow passport verification across AgentPass instances (~1 week)
- [ ] Trust score portability (~0.5 week)

### 4.3 Python SDK
**Effort: 1 week**
- [ ] Port core SDK functionality (passport CRUD, auth, trust) (~3 days)
- [ ] PyPI package with proper typing (~1 day)
- [ ] Documentation + examples (~1 day)

### 4.4 Advanced Trust
**Effort: 1–2 weeks**
- [ ] Domain ownership verification (DNS TXT record) (~2 days)
- [ ] Social proof (linked GitHub/Twitter) (~2 days)
- [ ] Trust decay over inactivity (~1 day)
- [ ] Reputation from agent-to-agent interactions (~3 days)

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| No one cares about agent auth yet | High | Focus on concrete pain (CAPTCHA solving, credential management) not abstract identity |
| Playwright adapter too fragile | Medium | Start with 3 services, build robust retry/fallback, let community add adapters |
| Security concerns with credential storage | High | Encryption at rest, clear security docs, optional self-hosting |
| Competing solutions emerge | Medium | Move fast on community + integrations, be the default early |

---

## Success Metrics

| Milestone | Target Date | Metric |
|-----------|-------------|--------|
| Demo path works perfectly | Feb 28 | Can do full walkthrough without errors |
| First external user | Mar 7 | Someone not-us creates a passport |
| 10 active passports | Mar 21 | 10 passports with >1 auth each |
| Show HN post | Mar 15 | Posted with demo video |
| First paying user | Apr 15 | $9 MRR |
| 50 active passports | May 1 | Growing organically |

---

*Quality > Speed. Ship Phase 1 perfectly before starting Phase 2. A flawless 3-minute demo is worth more than 10 half-working features.*
