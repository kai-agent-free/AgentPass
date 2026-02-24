# AgentPass Feature Audit

**Date:** 2026-02-24  
**Auditor:** Kai (automated)

---

## 1. Dashboard Settings Page

**STATUS: PARTIAL**

### What Exists
- Full UI for: Owner Profile, API Keys, Webhook URL, Telegram Bot linking, Notification Preferences
- **API Keys section is WORKING** — calls real `apiClient` methods (`listApiKeys`, `createApiKey`, `revokeApiKey`) that hit actual API endpoints with JWT auth
- API connection status check (pings `GET /passports?limit=1`)
- Nice UX: one-time key display with copy buttons, config snippets, revoke functionality

### What's Missing / Broken
- **Webhook URL, Telegram Chat ID, and Notification Preferences save ONLY to `localStorage`** — they never call any API endpoint. There is no server-side persistence for these settings. If the user clears browser data or switches devices, all settings are lost.
- No `PUT /settings` or `PATCH /owner/preferences` endpoint exists on the API server
- The "Telegram Bot Linked" confirmation is purely cosmetic — it sets a local flag but doesn't actually register the chat ID with the bot service
- Owner email is hardcoded to whatever's in localStorage (defaults to `owner@example.com`) — not fetched from the server
- No webhook delivery infrastructure exists on the backend (the webhook URL goes nowhere)

---

## 2. Telegram Bot

**STATUS: PARTIAL (code complete, not wired end-to-end)**

### What Exists
- **Full bot implementation** in `telegram-bot.ts` using grammY library
- Commands: `/start`, `/link <email>`, `/status`, `/help` — all implemented
- Inline keyboard callback handling for approve/deny/retry/skip/solve actions
- Notification methods: `notifyApprovalNeeded`, `notifyCaptchaDetected`, `notifyError`, `notifyRegistration`, `notifyLogin`
- Integration with `ApprovalService` for approve/deny callbacks
- In-memory storage of owner↔chatId mappings and notification history
- Backward-compatible sync API (`sendApprovalRequest`, `sendCaptchaScreenshot`, etc.)

### API Server Routes (`telegram.ts`)
- `POST /telegram/webhook` — **STUB** (returns `{ ok: true }`, doesn't forward to bot)
- `GET /telegram/link/:email` — generates deep link URL (working)
- `GET /telegram/status` — checks if `TELEGRAM_BOT_TOKEN` is set (working)

### What's Missing
- **Webhook route doesn't actually forward updates to the bot** — it's a placeholder
- Chat ID mappings are **in-memory only** (lost on restart) — no database persistence
- Dashboard "Link Bot" button saves to localStorage only, never calls the API or bot service
- No mechanism for the dashboard to register a chat ID with the actual bot service
- Screenshot upload via Telegram is **TODO** (code comment: `// TODO: Implement proper image upload with InputFile`)
- No `/start link_<email>` deep link handler (the `/link` command exists but `/start` doesn't parse the `link_` parameter)

---

## 3. CAPTCHA Escalation Flow

**STATUS: WORKING (impressive completeness)**

### What Exists

#### API Server — Escalations (`escalations.ts`)
- `POST /escalations` — create escalation (validates passport ownership) ✅
- `GET /escalations` — list with optional status filter ✅
- `GET /escalations/:id` — get single escalation ✅
- `POST /escalations/:id/resolve` — mark resolved ✅
- All routes have proper auth, ownership verification, Zod validation

#### API Server — Browser Sessions (`browser-sessions.ts`)
- `POST /browser-sessions` — create session linked to escalation ✅
- `PUT /:id/screenshot` — MCP pushes screenshots ✅
- `GET /:id` — dashboard polls session data ✅
- `GET /:id/stream` — **WebSocket relay** for real-time streaming ✅
- `POST /:id/command` — send click/type/scroll/keypress commands ✅
- `GET /:id/commands` — MCP polls pending commands ✅
- `PATCH /:id/commands/:cmdId` — mark command executed ✅
- `POST /:id/close` — close session with WS cleanup ✅
- Full WS relay with role-based identify (mcp/dashboard), binary frame forwarding

#### Dashboard — SolveCaptchaPage
- Fetches escalation details, shows screenshot or live browser view ✅
- Resolve button that marks escalation resolved and closes browser session ✅
- Status indicators (pending/resolved/timed_out) ✅
- Breadcrumb navigation ✅

#### Dashboard — LiveBrowserViewer
- **WebSocket connection with automatic HTTP polling fallback** ✅
- Binary JPEG frame rendering via blob URLs ✅
- Click-to-interact (coordinate mapping with viewport scaling) ✅
- Text input form for typing into remote browser ✅
- Keypress handling (Enter, Tab, Escape, Backspace) ✅
- Connection status indicator (WS vs HTTP mode) ✅
- Reconnection logic ✅

### What's Missing
- No actual browser automation (Playwright) integration on the MCP side that would push screenshots to the session — the API plumbing is complete but the MCP consumer isn't wired
- No timeout mechanism for escalations (the `timed_out` status exists in the UI but nothing sets it)
- No notification trigger when escalation is created (should notify owner via Telegram/webhook)

---

## 4. Trust Score

**STATUS: WORKING**

### Current Formula (from tests)
```
Score = owner_verified(+30) + payment_method(+20) + age_bonus + activity_bonus - abuse_penalty
```

| Factor | Points |
|--------|--------|
| `owner_verified` | +30 |
| `payment_method` | +20 |
| `age_days >= 30` | +10 |
| `age_days >= 90` | +10 (cumulative = +20) |
| `successful_auths` | +floor(count/10), capped at +20 |
| `abuse_reports` | -50 each |

- **Score clamped to [0, 100]**
- **Max achievable: 90** (30+20+20+20)

### Trust Levels
| Score Range | Level |
|-------------|-------|
| 0–19 | unverified |
| 20–49 | basic |
| 50–79 | verified |
| 80–100 | trusted |

### API Routes (all working with auth + ownership checks)
- `GET /passports/:id/trust` — get trust details with factors breakdown
- `PATCH /passports/:id/trust/verify-owner` — set owner_verified flag
- `PATCH /passports/:id/trust/payment-method` — set payment_method flag  
- `POST /passports/:id/report-abuse` — increment abuse count, stores reasons

### What Exists
- Full calculation engine with 5 factors ✅
- 25 unit tests covering all edge cases ✅
- API routes with proper auth, ownership verification, Zod validation ✅
- Persists to database (metadata JSONB + trust_score column) ✅
- Recalculates on every factor change ✅

### What's Missing
- No third-party verification (e.g., domain ownership, social proof)
- No decay mechanism (trust doesn't decrease over inactivity)
- `successful_auths` counts from `audit_log` — depends on audit logging being implemented
- Dashboard doesn't expose trust score management UI (no way to verify owner or add payment method from the dashboard)
- Max score is 90, not 100 — the formula can't reach "perfect trust"

---

## 5. Fallback Auth Service

**STATUS: PARTIAL (well-architected, needs real browser impl)**

### What Exists
- **Complete orchestration logic** with clean architecture:
  1. Verify identity exists ✅
  2. Session reuse (fast path) ✅
  3. Login with stored credentials ✅
  4. Register new account ✅
- CAPTCHA detection and escalation via `CaptchaService` ✅
- Email verification flow (wait for email → extract link → visit) ✅
- Credential storage after successful registration ✅
- Session creation after successful auth ✅
- Webhook notifications for all outcomes ✅
- Retry logic with configurable `MAX_RETRIES` (2) ✅
- Clean `BrowserOperations` interface for testability ✅
- Password generation (24-char with special chars) ✅

### What's Missing
- **No real `BrowserOperations` implementation** — the interface is defined but there's no Playwright/Puppeteer adapter that actually automates browsers
- Service URLs are naively constructed (`https://${service}/login`, `https://${service}/signup`) — real services have varied login page URLs
- No service-specific adapters or configuration (each service has different form fields, selectors, flows)
- No cookie/session persistence across restarts
- Email verification is best-effort (timeout silently swallowed)
- No 2FA/MFA handling
- No rate limiting awareness (could trigger service-side rate limits)
- `generatePassword` uses `Math.random()` — not cryptographically secure

---

## Summary Table

| Feature | Status | Completeness |
|---------|--------|-------------|
| Dashboard Settings | **PARTIAL** | API Keys work; webhook/telegram/notifications are localStorage-only stubs |
| Telegram Bot | **PARTIAL** | Bot code complete; not wired to DB, webhook route is stub, dashboard integration missing |
| CAPTCHA Escalation | **WORKING** | Full API + WebSocket + Dashboard UI; missing MCP browser-push consumer and timeout mechanism |
| Trust Score | **WORKING** | Complete formula, tests, API routes; missing dashboard UI and advanced factors |
| Fallback Auth | **PARTIAL** | Excellent orchestration design; no real browser automation implementation |
