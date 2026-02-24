# AgentPass API Documentation

> **Identity layer for autonomous AI agents** — Ed25519 verification, trust scoring, audit logging, and CAPTCHA escalation.

**Base URL:** `http://38.49.210.10:3846`  
**Version:** 0.1.0

---

## Table of Contents

- [Discovery](#discovery)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Auth](#auth)
  - [Passports](#passports)
  - [Verification](#verification)
  - [Trust](#trust)
  - [Audit Log](#audit-log)
  - [API Keys](#api-keys)
  - [Approvals](#approvals)
  - [Escalations](#escalations)
  - [Browser Sessions](#browser-sessions)
  - [Webhooks](#webhooks)
  - [Telegram](#telegram)

---

## Discovery

```bash
curl http://38.49.210.10:3846/.well-known/agentpass.json
```

```json
{
  "name": "AgentPass",
  "version": "0.1.0",
  "description": "Identity layer for autonomous AI agents",
  "endpoints": {
    "passports": "/passports",
    "verify": "/verify",
    "audit": "/passports/:id/audit",
    "webhook": "/webhook/email-received",
    "telegram": "/telegram/link/:email"
  },
  "capabilities": ["ed25519-verification", "trust-scoring", "audit-logging"]
}
```

---

## Authentication

AgentPass supports two authentication methods:

### 1. JWT Token (Owner Auth)

Obtained via `/auth/login` or `/auth/register`. Pass in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### 2. API Key

Created via `/api-keys`. Also passed in the `Authorization` header:

```
Authorization: Bearer apk_xxxxxxxxxxxxxxxx
```

> **Note:** API keys cannot manage other API keys — only JWT auth can create/list/revoke keys.

### 3. Webhook Secret

For webhook endpoints, use the `X-Webhook-Secret` header:

```
X-Webhook-Secret: <secret>
```

---

## Error Handling

All errors return JSON with `error` (message) and `code` (machine-readable) fields:

```json
{
  "error": "Passport not found",
  "code": "NOT_FOUND"
}
```

### Error Codes

| HTTP Status | Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body / missing fields |
| 401 | `AUTH_REQUIRED` | Missing or invalid authentication |
| 401 | `AUTH_FAILED` | Wrong credentials or invalid signature |
| 403 | `FORBIDDEN` | Access denied (not the owner) |
| 403 | `PASSPORT_REVOKED` | Passport has been revoked |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `EMAIL_EXISTS` | Email already registered |
| 409 | `CONFLICT` | Resource already exists |
| 409 | `ALREADY_REVOKED` | Already revoked |
| 409 | `ALREADY_RESPONDED` | Approval already responded to |
| 409 | `ALREADY_RESOLVED` | Escalation already resolved |
| 409 | `ALREADY_CLOSED` | Session already closed |
| 409 | `SESSION_CLOSED` | Cannot interact with closed session |
| 500 | `INTERNAL_ERROR` | Server error |
| 500 | `CONFIG_ERROR` | Server misconfiguration |

---

## Endpoints

---

### Auth

#### Register

```
POST /auth/register
```

```bash
curl -X POST http://38.49.210.10:3846/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "securepassword123",
    "name": "Alice"
  }'
```

**Response** `201`:
```json
{
  "owner_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "owner@example.com",
  "name": "Alice",
  "token": "eyJhbGciOi..."
}
```

#### Login

```
POST /auth/login
```

```bash
curl -X POST http://38.49.210.10:3846/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "securepassword123"
  }'
```

**Response** `200`:
```json
{
  "owner_id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "owner@example.com",
  "name": "Alice",
  "token": "eyJhbGciOi..."
}
```

#### Get Current Owner

```
GET /auth/me
```

🔒 Requires JWT

```bash
curl http://38.49.210.10:3846/auth/me \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "owner_id": "550e8400-...",
  "email": "owner@example.com",
  "name": "Alice",
  "verified": false,
  "created_at": "2026-02-20T10:00:00.000Z"
}
```

#### Logout

```
POST /auth/logout
```

**Response** `200`:
```json
{ "ok": true }
```

---

### Passports

#### List Passports

```
GET /passports?limit=50&offset=0
```

🔒 Requires Auth — returns only passports owned by the authenticated user.

```bash
curl http://38.49.210.10:3846/passports \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "passports": [
    {
      "id": "ap_abc123def456",
      "public_key": "base64-ed25519-pubkey",
      "owner_email": "owner@example.com",
      "name": "my-agent",
      "description": "My AI assistant",
      "trust_score": 35,
      "trust_level": "basic",
      "status": "active",
      "metadata": { "owner_verified": false, "payment_method": false, "abuse_reports": 0 },
      "created_at": "2026-02-20T10:00:00.000Z",
      "updated_at": "2026-02-20T10:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

#### Create Passport

```
POST /passports
```

🔒 Requires Auth · Rate limited

```bash
curl -X POST http://38.49.210.10:3846/passports \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "base64-ed25519-public-key",
    "name": "my-agent",
    "description": "My AI assistant"
  }'
```

| Field | Type | Required | Description |
|---|---|---|---|
| `passport_id` | string | No | Custom ID (format: `ap_xxxxxxxxxxxx`). Auto-generated if omitted. |
| `public_key` | string | Yes | Ed25519 public key (base64) |
| `name` | string | Yes | 1–64 chars, alphanumeric/hyphens/underscores |
| `description` | string | No | Up to 256 chars |

**Response** `201`:
```json
{
  "passport_id": "ap_abc123def456",
  "email": "my-agent@agent-mail.xyz",
  "created_at": "2026-02-20T10:00:00.000Z"
}
```

#### Get Passport

```
GET /passports/:id
```

🔒 Requires Auth (owner only)

```bash
curl http://38.49.210.10:3846/passports/ap_abc123def456 \
  -H "Authorization: Bearer <token>"
```

**Response** `200`: Full passport object (same shape as list item).

#### Revoke Passport

```
DELETE /passports/:id
```

🔒 Requires Auth + Ed25519 Signature

The `X-AgentPass-Signature` header must contain a valid Ed25519 signature of the passport ID, signed with the passport's private key.

```bash
curl -X DELETE http://38.49.210.10:3846/passports/ap_abc123def456 \
  -H "Authorization: Bearer <token>" \
  -H "X-AgentPass-Signature: base64-signature-of-passport-id"
```

**Response** `200`:
```json
{ "revoked": true }
```

---

### Verification

#### Verify Passport (Challenge-Response)

```
POST /verify
```

🔓 Public (rate limited)

Verifies an agent's identity using Ed25519 challenge-response. The agent signs a challenge string with its private key; the server verifies against the stored public key.

```bash
curl -X POST http://38.49.210.10:3846/verify \
  -H "Content-Type: application/json" \
  -d '{
    "passport_id": "ap_abc123def456",
    "challenge": "random-challenge-string",
    "signature": "base64-ed25519-signature"
  }'
```

**Response** `200`:
```json
{
  "valid": true,
  "passport_id": "ap_abc123def456",
  "trust_score": 35,
  "trust_level": "basic",
  "status": "active"
}
```

On successful verification, the trust score is recalculated automatically.

---

### Trust

All trust routes are scoped to `/passports/:id/trust` and require owner auth.

#### Get Trust Details

```
GET /passports/:id/trust
```

🔒 Requires Auth (owner only)

```bash
curl http://38.49.210.10:3846/passports/ap_abc123def456/trust \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "passport_id": "ap_abc123def456",
  "trust_score": 35,
  "trust_level": "basic",
  "factors": {
    "owner_verified": false,
    "payment_method": false,
    "age_days": 5,
    "successful_auths": 12,
    "abuse_reports": 0
  }
}
```

#### Verify Owner

```
PATCH /passports/:id/trust/verify-owner
```

🔒 Requires Auth (owner only)

Sets the `owner_verified` flag and recalculates trust score.

```bash
curl -X PATCH http://38.49.210.10:3846/passports/ap_abc123def456/trust/verify-owner \
  -H "Authorization: Bearer <token>"
```

**Response** `200`: Same shape as GET trust details.

#### Add Payment Method

```
PATCH /passports/:id/trust/payment-method
```

🔒 Requires Auth (owner only)

Sets the `payment_method` flag and recalculates trust score.

```bash
curl -X PATCH http://38.49.210.10:3846/passports/ap_abc123def456/trust/payment-method \
  -H "Authorization: Bearer <token>"
```

**Response** `200`: Same shape as GET trust details.

#### Report Abuse

```
POST /passports/:id/report-abuse
```

🔒 Requires Auth

```bash
curl -X POST http://38.49.210.10:3846/passports/ap_abc123def456/report-abuse \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Spamming service X" }'
```

**Response** `200`:
```json
{
  "passport_id": "ap_abc123def456",
  "trust_score": 15,
  "trust_level": "untrusted",
  "abuse_reports": 1
}
```

---

### Audit Log

#### List All Audit Entries (Owner)

```
GET /audit?limit=50&offset=0
```

🔒 Requires Auth — returns entries across all owner's passports.

```bash
curl http://38.49.210.10:3846/audit \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "entries": [
    {
      "id": "uuid",
      "passport_id": "ap_abc123def456",
      "action": "verify",
      "service": "agentpass",
      "method": "challenge-response",
      "result": "success",
      "duration_ms": 0,
      "details": { "challenge": "..." },
      "created_at": "2026-02-20T10:05:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

#### List Passport Audit Entries

```
GET /passports/:id/audit?limit=50&offset=0
```

🔒 Requires Auth (owner only)

```bash
curl http://38.49.210.10:3846/passports/ap_abc123def456/audit \
  -H "Authorization: Bearer <token>"
```

**Response** `200`: Same shape as global audit list.

#### Append Audit Entry

```
POST /passports/:id/audit
```

🔒 Requires Auth (owner only)

```bash
curl -X POST http://38.49.210.10:3846/passports/ap_abc123def456/audit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "service": "github.com",
    "method": "oauth",
    "result": "success",
    "duration_ms": 1200,
    "details": { "scope": "repo" }
  }'
```

| Field | Type | Required | Values |
|---|---|---|---|
| `action` | string | Yes | Free text |
| `service` | string | No | Service name |
| `method` | string | No | Auth method used |
| `result` | enum | No | `success`, `failure`, `pending_approval`, `resolved_by_owner` |
| `duration_ms` | number | No | Duration in milliseconds |
| `details` | object | No | Arbitrary JSON |

**Response** `201`:
```json
{
  "id": "uuid",
  "created_at": "2026-02-20T10:05:00.000Z"
}
```

---

### API Keys

All routes require **JWT auth only** (API keys cannot manage other API keys).

#### Create API Key

```
POST /api-keys
```

🔒 JWT only

```bash
curl -X POST http://38.49.210.10:3846/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "my-mcp-server" }'
```

**Response** `201`:
```json
{
  "id": "uuid",
  "name": "my-mcp-server",
  "key": "apk_xxxxxxxxxxxxxxxxxxxx",
  "key_prefix": "apk_xxxx",
  "created_at": "2026-02-20T10:00:00.000Z"
}
```

> ⚠️ The full `key` is only returned once. Store it securely.

#### List API Keys

```
GET /api-keys
```

🔒 JWT only

```bash
curl http://38.49.210.10:3846/api-keys \
  -H "Authorization: Bearer <jwt_token>"
```

**Response** `200`:
```json
{
  "api_keys": [
    {
      "id": "uuid",
      "name": "my-mcp-server",
      "key_prefix": "apk_xxxx",
      "last_used": "2026-02-20T12:00:00.000Z",
      "created_at": "2026-02-20T10:00:00.000Z",
      "revoked_at": null
    }
  ]
}
```

#### Revoke API Key

```
DELETE /api-keys/:id
```

🔒 JWT only

```bash
curl -X DELETE http://38.49.210.10:3846/api-keys/<key-id> \
  -H "Authorization: Bearer <jwt_token>"
```

**Response** `200`:
```json
{ "revoked": true }
```

---

### Approvals

Agent requests that need owner approval (e.g., sensitive actions).

#### List Approvals

```
GET /approvals?status=pending
```

🔒 Requires Auth

```bash
curl http://38.49.210.10:3846/approvals \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "approvals": [
    {
      "id": "uuid",
      "passport_id": "ap_abc123def456",
      "action": "delete_repository",
      "service": "github.com",
      "details": "Agent wants to delete repo foo/bar",
      "status": "pending",
      "responded_at": null,
      "created_at": "2026-02-20T10:00:00.000Z"
    }
  ]
}
```

#### Create Approval Request

```
POST /approvals
```

🔒 Requires Auth

```bash
curl -X POST http://38.49.210.10:3846/approvals \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "passport_id": "ap_abc123def456",
    "action": "delete_repository",
    "service": "github.com",
    "details": "Agent wants to delete repo foo/bar"
  }'
```

**Response** `201`:
```json
{
  "id": "uuid",
  "created_at": "2026-02-20T10:00:00.000Z"
}
```

#### Respond to Approval

```
POST /approvals/:id/respond
```

🔒 Requires Auth (owner only)

```bash
curl -X POST http://38.49.210.10:3846/approvals/<approval-id>/respond \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "approved": true }'
```

**Response** `200`:
```json
{ "status": "approved" }
```

---

### Escalations

CAPTCHA escalation flow: Agent detects CAPTCHA → creates escalation → owner resolves → agent continues.

#### Create Escalation

```
POST /escalations
```

🔒 Requires Auth

```bash
curl -X POST http://38.49.210.10:3846/escalations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "passport_id": "ap_abc123def456",
    "captcha_type": "recaptcha_v2",
    "service": "example.com",
    "screenshot": "data:image/png;base64,..."
  }'
```

**Response** `201`:
```json
{
  "escalation_id": "uuid",
  "status": "pending",
  "created_at": "2026-02-20T10:00:00.000Z"
}
```

#### List Escalations

```
GET /escalations?status=pending
```

🔒 Requires Auth

```bash
curl http://38.49.210.10:3846/escalations \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "escalations": [
    {
      "id": "uuid",
      "passport_id": "ap_abc123def456",
      "captcha_type": "recaptcha_v2",
      "service": "example.com",
      "screenshot": "data:image/png;base64,...",
      "status": "pending",
      "created_at": "2026-02-20T10:00:00.000Z",
      "resolved_at": null
    }
  ]
}
```

#### Get Escalation

```
GET /escalations/:id
```

🔒 Requires Auth (owner only)

#### Resolve Escalation

```
POST /escalations/:id/resolve
```

🔒 Requires Auth (owner only)

```bash
curl -X POST http://38.49.210.10:3846/escalations/<escalation-id>/resolve \
  -H "Authorization: Bearer <token>"
```

**Response** `200`:
```json
{
  "status": "resolved",
  "resolved_at": "2026-02-20T10:05:00.000Z"
}
```

---

### Browser Sessions

Live browser session management for remote CAPTCHA solving. Supports both HTTP polling and WebSocket streaming.

#### List Sessions

```
GET /browser-sessions?escalation_id=<uuid>
```

🔒 Requires Auth

#### Create Session

```
POST /browser-sessions
```

🔒 Requires Auth

```bash
curl -X POST http://38.49.210.10:3846/browser-sessions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "escalation_id": "uuid",
    "page_url": "https://example.com/captcha",
    "viewport_w": 1280,
    "viewport_h": 720
  }'
```

**Response** `201`:
```json
{
  "session_id": "uuid",
  "escalation_id": "uuid",
  "created_at": "2026-02-20T10:00:00.000Z"
}
```

#### Get Session

```
GET /browser-sessions/:id
```

🔒 Requires Auth — returns session with latest screenshot.

#### Update Screenshot (MCP → Server)

```
PUT /browser-sessions/:id/screenshot
```

🔒 Requires Auth

```bash
curl -X PUT http://38.49.210.10:3846/browser-sessions/<session-id>/screenshot \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "screenshot": "data:image/jpeg;base64,...",
    "page_url": "https://example.com/captcha"
  }'
```

#### Send Command (Dashboard → Agent)

```
POST /browser-sessions/:id/command
```

🔒 Requires Auth

```bash
curl -X POST http://38.49.210.10:3846/browser-sessions/<session-id>/command \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "click",
    "payload": { "x": 150, "y": 300 }
  }'
```

Command types: `click`, `type`, `scroll`, `keypress`

**Response** `201`:
```json
{ "command_id": "uuid", "status": "pending" }
```

#### Poll Commands (Agent polls)

```
GET /browser-sessions/:id/commands?status=pending
```

🔒 Requires Auth

#### Update Command Status

```
PATCH /browser-sessions/:id/commands/:cmdId
```

🔒 Requires Auth

```bash
curl -X PATCH http://38.49.210.10:3846/browser-sessions/<session-id>/commands/<cmd-id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "executed" }'
```

Status values: `executed`, `failed`

#### WebSocket Stream

```
GET /browser-sessions/:id/stream?token=<jwt_or_api_key>
```

WebSocket endpoint for real-time screenshot streaming. After connecting, send an identify message:

```json
{ "type": "identify", "role": "mcp" }
```
or
```json
{ "type": "identify", "role": "dashboard" }
```

Binary frames (JPEG screenshots) are forwarded between MCP and Dashboard automatically.

#### Close Session

```
POST /browser-sessions/:id/close
```

🔒 Requires Auth

**Response** `200`:
```json
{
  "closed": true,
  "closed_at": "2026-02-20T10:10:00.000Z"
}
```

---

### Webhooks

#### Email Received

```
POST /webhook/email-received
```

🔐 Requires `X-Webhook-Secret` header

Called by Cloudflare Email Worker when a new email arrives for an agent.

```bash
curl -X POST http://38.49.210.10:3846/webhook/email-received \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: <secret>" \
  -d '{
    "email_id": "msg-123",
    "to": "my-agent@agent-mail.xyz",
    "from": "sender@example.com",
    "subject": "Welcome",
    "received_at": "2026-02-20T10:00:00.000Z"
  }'
```

**Response** `200`:
```json
{ "ok": true }
```

#### Poll Email Notifications

```
GET /webhook/email-notifications/:address
```

🔓 Public

Returns unprocessed email notifications for the given address and marks them as retrieved.

```bash
curl http://38.49.210.10:3846/webhook/email-notifications/my-agent@agent-mail.xyz
```

**Response** `200`:
```json
{
  "notifications": [
    {
      "email_id": "msg-123",
      "recipient": "my-agent@agent-mail.xyz",
      "sender": "sender@example.com",
      "subject": "Welcome",
      "received_at": "2026-02-20T10:00:00.000Z",
      "notified_at": "2026-02-20T10:00:01.000Z"
    }
  ]
}
```

#### SMS Received

```
POST /webhook/sms-received
```

🔐 Requires `X-Webhook-Secret` header (+ optional Twilio signature validation)

Called by Twilio when a new SMS arrives. Returns TwiML.

#### Poll SMS Notifications

```
GET /webhook/sms-notifications/:phoneNumber
```

🔓 Public

```bash
curl http://38.49.210.10:3846/webhook/sms-notifications/+15551234567
```

**Response** `200`:
```json
{
  "notifications": [
    {
      "id": "SMxxxxxxxx",
      "to": "+15551234567",
      "from": "+15559876543",
      "body": "Your verification code is 123456",
      "received_at": "2026-02-20T10:00:00.000Z"
    }
  ]
}
```

---

### Telegram

#### Webhook (Bot Updates)

```
POST /telegram/webhook
```

Placeholder for Telegram bot webhook integration. Returns `{ "ok": true }`.

#### Generate Link

```
GET /telegram/link/:email
```

🔓 Public

```bash
curl http://38.49.210.10:3846/telegram/link/owner@example.com
```

**Response** `200`:
```json
{
  "email": "owner@example.com",
  "link": "https://t.me/AgentPass_bot?start=link_owner%40example.com",
  "instructions": "Click the link to open Telegram and link your account to receive notifications from your AI agents."
}
```

#### Status

```
GET /telegram/status
```

🔓 Public

```bash
curl http://38.49.210.10:3846/telegram/status
```

**Response** `200`:
```json
{
  "enabled": true,
  "bot_username": "AgentPass_bot",
  "message": "Telegram notifications are enabled"
}
```

---

## Rate Limiting

The API applies rate limiting to all endpoints. Stricter limits apply to:
- `POST /passports` — passport creation
- `POST /verify` — verification requests

## CORS

Allowed origins are configured via `ALLOWED_ORIGINS` environment variable. Default development origins:
- `http://localhost:3847`
- `http://localhost:3848`
- `http://localhost:3849`
- `http://localhost:5173`

## Custom Headers

| Header | Usage |
|---|---|
| `Authorization` | `Bearer <jwt>` or `Bearer <api_key>` |
| `X-Webhook-Secret` | Webhook authentication |
| `X-AgentPass-ID` | Optional passport ID header |
| `X-AgentPass-Signature` | Ed25519 signature (required for revocation) |
| `X-Request-ID` | Optional request tracing ID |
