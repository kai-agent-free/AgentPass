# Owner Authentication

## Overview

The AgentPass API server now includes owner authentication using JWT tokens. Each passport belongs to an owner (human) who manages their agents' passports through authenticated endpoints.

## Authentication Flow

1. **Register**: Create an owner account with email, password, and name
2. **Login**: Authenticate with email/password to receive a JWT token
3. **Use Token**: Include the JWT token in the `Authorization: Bearer <token>` header for all protected endpoints

## API Endpoints

### Auth Routes

#### POST /auth/register
Create a new owner account.

**Request:**
```json
{
  "email": "owner@example.com",
  "password": "secure-password-123",
  "name": "Owner Name"
}
```

**Response (201):**
```json
{
  "owner_id": "uuid",
  "email": "owner@example.com",
  "name": "Owner Name",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Validation:**
- Email must be valid format
- Password must be at least 8 characters
- Name must be 1-64 characters
- Email must be unique (returns 409 if already exists)

#### POST /auth/login
Login with existing credentials.

**Request:**
```json
{
  "email": "owner@example.com",
  "password": "secure-password-123"
}
```

**Response (200):**
```json
{
  "owner_id": "uuid",
  "email": "owner@example.com",
  "name": "Owner Name",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### GET /auth/me
Get current owner info (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "owner_id": "uuid",
  "email": "owner@example.com",
  "name": "Owner Name",
  "verified": false,
  "created_at": "2026-02-12T18:00:00.000Z"
}
```

#### POST /auth/logout
Logout (stateless, client should delete token).

**Response (200):**
```json
{
  "ok": true
}
```

## Protected Endpoints

The following endpoints now require authentication:

### Passports
- `GET /passports` — Returns only owner's passports
- `POST /passports` — Creates passport owned by authenticated user (owner_email set from JWT)
- `GET /passports/:id` — Requires owner owns the passport
- `DELETE /passports/:id` — Requires owner owns the passport (also requires signature)

### Audit
- `GET /audit` — Returns audit entries for owner's passports only
- `GET /passports/:id/audit` — Requires owner owns the passport
- `POST /passports/:id/audit` — Requires owner owns the passport

### Trust
- `GET /passports/:id/trust` — Requires owner owns the passport
- `POST /passports/:id/report-abuse` — Requires owner owns the passport

## Unprotected Endpoints

These endpoints remain public (no authentication required):

- `POST /verify` — Services call this to verify agent signatures
- `GET /health`, `GET /ready` — Health check endpoints
- `GET /.well-known/agentpass.json` — Discovery endpoint
- `POST /webhook/*` — Webhooks use their own authentication (webhook secret)
- `POST /telegram/webhook` — Telegram bot webhook

## Security

### Password Hashing
- Passwords are hashed using bcryptjs with 12 salt rounds
- Plain text passwords are never stored

### JWT Tokens
- Algorithm: HS256
- Expiration: 7 days
- Secret: Set via `JWT_SECRET` environment variable (required in production)

### JWT Secret Configuration

**Production:**
```bash
# Generate a secure secret (min 32 characters)
openssl rand -base64 32

# Set in environment
export JWT_SECRET="your-generated-secret-here"
```

**Development:**
```bash
# If JWT_SECRET is not set, a development default is used with a warning
# DO NOT use this in production
```

### Error Codes

- `AUTH_REQUIRED` (401) — No Authorization header or malformed header
- `AUTH_INVALID` (401) — Invalid or expired JWT token
- `AUTH_FAILED` (401) — Invalid email or password during login
- `EMAIL_EXISTS` (409) — Email already registered
- `FORBIDDEN` (403) — Authenticated but not authorized (e.g., accessing another owner's passport)
- `VALIDATION_ERROR` (400) — Request validation failed

## Database Schema

### owners table
```sql
CREATE TABLE owners (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_owners_email ON owners(email);
```

## Example Usage

### Register and create a passport
```bash
# Register
curl -X POST http://localhost:3846/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "secure-password-123",
    "name": "My Name"
  }'

# Response includes token
# {
#   "owner_id": "...",
#   "email": "owner@example.com",
#   "name": "My Name",
#   "token": "eyJ..."
# }

# Create passport using token
curl -X POST http://localhost:3846/passports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." \
  -d '{
    "public_key": "MCowBQYDK2VwAyEA...",
    "name": "my-agent",
    "description": "My AI agent"
  }'
```

### Login and list passports
```bash
# Login
curl -X POST http://localhost:3846/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "secure-password-123"
  }'

# List passports
curl -X GET http://localhost:3846/passports \
  -H "Authorization: Bearer eyJ..."
```

## Testing

All routes include comprehensive tests. Run tests with:

```bash
pnpm test
```

Tests cover:
- Registration with valid/invalid data
- Login with correct/incorrect credentials
- Token validation and expiration
- Protected endpoints with/without auth
- Owner isolation (can't access other owners' passports)
- Backward compatibility (verify route remains public)
