# PayLock × AgentPass Integration Guide

## Overview

This guide shows how PayLock can use AgentPass to verify agent identity before releasing escrow funds. The flow ensures that both parties in a contract are who they claim to be.

## Installation

```bash
npm install @agentpass/sdk
# or
pnpm add @agentpass/sdk
```

## Quick Start

```typescript
import { AgentPassClient } from '@agentpass/sdk';

const client = new AgentPassClient({
  apiUrl: 'https://api.agentpass.space'
});

// Verify an agent's identity before releasing escrow
async function verifyAgentForEscrow(passportId: string, challenge: string, signature: string) {
  const result = await client.verifyPassport(passportId, challenge, signature);
  
  if (result.valid && result.trust_score > 0) {
    // Agent verified — safe to release escrow
    return { verified: true, trust_score: result.trust_score };
  }
  
  return { verified: false, reason: 'Identity verification failed' };
}
```

## Integration Flow

```
┌─────────┐     ┌──────────┐     ┌───────────┐
│  Payer   │────▶│ PayLock  │────▶│ AgentPass │
│  Agent   │     │  Escrow  │     │   API     │
└─────────┘     └──────────┘     └───────────┘
     │               │                │
     │  1. Fund       │                │
     │  contract      │                │
     │───────────────▶│                │
     │               │                │
     │  2. Submit     │                │
     │  deliverable   │                │
     │───────────────▶│                │
     │               │  3. Verify      │
     │               │  agent identity │
     │               │───────────────▶│
     │               │                │
     │               │  4. Return      │
     │               │  verify result  │
     │               │◀───────────────│
     │               │                │
     │  5. Release    │                │
     │  escrow        │                │
     │◀──────────────│                │
```

## API Reference

### Verify a Passport

```typescript
const result = await client.verifyPassport(passportId, challenge, signature);
// Returns: { valid: boolean, passport_id: string, trust_score: number, status: string }
```

### Get Passport Info

```typescript
const passport = await client.getPassport(passportId);
// Returns: { id, public_key, name, description, trust_score, status, created_at }
```

### Middleware (for PayLock API endpoints)

```typescript
import { createVerificationMiddleware } from '@agentpass/sdk';

const verify = createVerificationMiddleware({
  apiUrl: 'https://api.agentpass.space'
});

// In your request handler:
async function handleRequest(req) {
  const agent = await verify(req.headers);
  if (!agent) {
    return { status: 401, body: 'AgentPass verification failed' };
  }
  // agent.passport_id, agent.trust_score available
}
```

### Well-Known Discovery

Add to PayLock's `/.well-known/agentpass.json`:

```typescript
import { generateWellKnownConfig } from '@agentpass/sdk';

const config = generateWellKnownConfig({
  authEndpoint: 'https://paylock.xyz/auth/agentpass',
  capabilities: ['ed25519-verification', 'escrow-release']
});
// Serve this at /.well-known/agentpass.json
```

## Environment

| Variable | Value | Description |
|----------|-------|-------------|
| `AGENTPASS_API_URL` | `https://api.agentpass.space` | Production API |
| `AGENTPASS_PASSPORT_ID` | Your passport ID | Agent's passport |

## Error Handling

```typescript
try {
  const result = await client.verifyPassport(id, challenge, sig);
} catch (error) {
  // Network error or API unavailable
  // Recommended: fail-closed (deny escrow release)
  console.error('AgentPass verification error:', error.message);
}
```

## Security Notes

- Always verify agent identity **before** releasing funds
- Use a fresh challenge per verification (don't reuse)
- Fail-closed: if AgentPass API is unreachable, don't release escrow
- Check `trust_score > 0` as minimum threshold
