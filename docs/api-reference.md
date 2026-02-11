# AgentPass API Reference

Base URL: `http://localhost:3846` (default)

All endpoints accept and return JSON (`Content-Type: application/json`). CORS is enabled for all origins.

---

## Passports

### POST /passports

Register a new passport (public key) on the API server.

**Request body:**

```json
{
  "public_key": "MCowBQYDK2VwAyEA...",
  "owner_email": "owner@example.com",
  "name": "my-sales-agent",
  "description": "Handles lead outreach"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `public_key` | string | yes | Non-empty Ed25519 public key (base64url) |
| `owner_email` | string | yes | Valid email address |
| `name` | string | yes | 1-64 chars, alphanumeric + hyphens + underscores |
| `description` | string | no | Max 256 chars. Defaults to `""` |

**Response (201 Created):**

```json
{
  "passport_id": "ap_7xk2m9f3abcd",
  "created_at": "2026-02-11T10:00:00.000Z"
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid or missing fields |

---

### GET /passports/:id

Retrieve public passport information.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Passport ID (e.g., `ap_7xk2m9f3abcd`) |

**Response (200 OK):**

```json
{
  "id": "ap_7xk2m9f3abcd",
  "public_key": "MCowBQYDK2VwAyEA...",
  "owner_email": "owner@example.com",
  "name": "my-sales-agent",
  "description": "Handles lead outreach",
  "trust_score": 42,
  "status": "active",
  "metadata": null,
  "created_at": "2026-02-11T10:00:00.000Z",
  "updated_at": "2026-02-11T12:30:00.000Z"
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Passport does not exist |

---

### DELETE /passports/:id

Revoke a passport. Once revoked, the passport can no longer pass verification. This action is irreversible via the API.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Passport ID to revoke |

**Response (200 OK):**

```json
{
  "revoked": true
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Passport does not exist |
| 409 | `ALREADY_REVOKED` | Passport was already revoked |

---

## Verification

### POST /verify

Verify an agent passport using Ed25519 challenge-response authentication. The caller provides a challenge string and the agent's signature over that challenge. The API looks up the passport's public key and verifies the signature.

On successful verification, the passport's trust score is incremented by 1.

**Request body:**

```json
{
  "passport_id": "ap_7xk2m9f3abcd",
  "challenge": "random-nonce-abc123",
  "signature": "base64url-encoded-ed25519-signature"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passport_id` | string | yes | The passport to verify |
| `challenge` | string | yes | The challenge string that was signed |
| `signature` | string | yes | Ed25519 signature of the challenge (base64url) |

**Response (200 OK) -- valid signature:**

```json
{
  "valid": true,
  "passport_id": "ap_7xk2m9f3abcd",
  "trust_score": 43,
  "status": "active"
}
```

**Response (200 OK) -- invalid signature:**

```json
{
  "valid": false,
  "passport_id": "ap_7xk2m9f3abcd",
  "trust_score": 42,
  "status": "active"
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Missing or invalid fields |
| 403 | `PASSPORT_REVOKED` | Passport has been revoked |
| 404 | `NOT_FOUND` | Passport does not exist |

**Response (403 Forbidden) -- revoked passport:**

```json
{
  "valid": false,
  "passport_id": "ap_7xk2m9f3abcd",
  "trust_score": 42,
  "status": "revoked",
  "error": "Passport has been revoked",
  "code": "PASSPORT_REVOKED"
}
```

---

## Trust

### GET /passports/:id/trust

Get the current trust score details for a passport. The score is dynamically calculated from multiple factors.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Passport ID |

**Response (200 OK):**

```json
{
  "passport_id": "ap_7xk2m9f3abcd",
  "trust_score": 62,
  "trust_level": "verified",
  "factors": {
    "owner_verified": true,
    "payment_method": false,
    "age_days": 30,
    "successful_auths": 156,
    "abuse_reports": 0
  }
}
```

**Trust score calculation:**

| Factor | Points |
|--------|--------|
| Owner verified (email confirmed) | +30 |
| Owner has payment method | +20 |
| Passport age > 7 days | +10 |
| Passport age > 30 days | +10 |
| Per 10 successful authentications (max +20) | +1 each |
| Each abuse report | -50 |

**Trust levels:**

| Level | Score Range |
|-------|------------|
| `unverified` | 0-19 |
| `basic` | 20-49 |
| `verified` | 50-79 |
| `trusted` | 80-100 |

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Passport does not exist |

---

### POST /passports/:id/report-abuse

Report abuse against a passport. Increments the abuse counter and recalculates the trust score.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Passport ID to report |

**Request body:**

```json
{
  "reason": "Spam activity detected on our platform"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `reason` | string | yes | 1-512 chars |

**Response (200 OK):**

```json
{
  "passport_id": "ap_7xk2m9f3abcd",
  "trust_score": 12,
  "trust_level": "unverified",
  "abuse_reports": 1
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Missing or invalid reason |
| 404 | `NOT_FOUND` | Passport does not exist |

---

## Audit Log

### POST /passports/:id/audit

Append an audit log entry for a passport. Used by the MCP server to record agent actions.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Passport ID |

**Request body:**

```json
{
  "action": "register",
  "service": "github.com",
  "method": "fallback_human_mode",
  "result": "success",
  "duration_ms": 34500,
  "details": {
    "email_used": "my-agent@agentpass.dev",
    "username_created": "my-agent-7x"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | Action name (e.g., `register`, `login`, `verify`) |
| `service` | string | no | Service domain. Defaults to `""` |
| `method` | string | no | Auth method used. Defaults to `""` |
| `result` | enum | no | `success`, `failure`, `pending_approval`, or `resolved_by_owner`. Defaults to `success` |
| `duration_ms` | integer | no | Duration in milliseconds. Defaults to `0` |
| `details` | object | no | Arbitrary JSON metadata |

**Response (201 Created):**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "created_at": "2026-02-11T10:15:00.000Z"
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid fields |
| 404 | `NOT_FOUND` | Passport does not exist |

---

### GET /passports/:id/audit

List audit log entries for a passport with pagination. Entries are ordered by creation time (newest first).

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Passport ID |

**Query parameters:**

| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| `limit` | integer | 50 | 1-200 | Max entries to return |
| `offset` | integer | 0 | >= 0 | Number of entries to skip |

**Response (200 OK):**

```json
{
  "entries": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "passport_id": "ap_7xk2m9f3abcd",
      "action": "register",
      "service": "github.com",
      "method": "fallback_human_mode",
      "result": "success",
      "duration_ms": 34500,
      "details": {
        "email_used": "my-agent@agentpass.dev"
      },
      "created_at": "2026-02-11T10:15:00.000Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

**Error responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Passport does not exist |

---

## Discovery

### GET /.well-known/agentpass.json

Returns the AgentPass discovery payload. Agents check this endpoint on the API server (and on third-party services) to determine AgentPass support.

**Response (200 OK):**

```json
{
  "name": "AgentPass",
  "version": "0.1.0",
  "description": "Identity layer for autonomous AI agents",
  "endpoints": {
    "passports": "/passports",
    "verify": "/verify",
    "audit": "/passports/:id/audit"
  },
  "capabilities": [
    "ed25519-verification",
    "trust-scoring",
    "audit-logging"
  ]
}
```

---

## Health Checks

### GET /health

Basic health check. Always returns 200 if the server is running.

**Response (200 OK):**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 3600
}
```

---

### GET /ready

Readiness check. Returns 200 only when the database is accessible.

**Response (200 OK):**

```json
{
  "ready": true
}
```

**Response (503 Service Unavailable):**

```json
{
  "ready": false,
  "error": "database unavailable"
}
```

---

## Error Format

All error responses follow a consistent structure:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `ALREADY_REVOKED` | 409 | Passport was already revoked |
| `PASSPORT_REVOKED` | 403 | Operation denied -- passport is revoked |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
