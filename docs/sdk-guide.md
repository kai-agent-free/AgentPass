# AgentPass SDK Integration Guide

The `@agentpass/sdk` package allows third-party services to integrate AgentPass native authentication. Instead of agents registering through browser automation (fallback mode), integrated services can verify agent passports instantly using Ed25519 challenge-response.

## Installation

```bash
npm install @agentpass/sdk
```

Or with other package managers:

```bash
pnpm add @agentpass/sdk
yarn add @agentpass/sdk
```

## Quick Start

```typescript
import { AgentPassClient, generateWellKnownConfig } from "@agentpass/sdk";

// 1. Create a client pointing at the AgentPass API server
const client = new AgentPassClient({
  apiUrl: "https://api.agentpass.dev",
});

// 2. Verify an agent's passport
const result = await client.verifyPassport(
  "ap_7xk2m9f3abcd",  // passport_id
  "random-nonce-123",  // challenge you issued
  "base64url-sig...",  // agent's Ed25519 signature
);

if (result.valid) {
  console.log(`Agent verified. Trust score: ${result.trust_score}`);
}
```

## AgentPassClient

The main HTTP client for interacting with the AgentPass API server.

### Constructor

```typescript
const client = new AgentPassClient(options: AgentPassClientOptions);
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiUrl` | string | yes | Base URL of the AgentPass API server |

### verifyPassport

Verify a passport's challenge-response signature.

```typescript
const result = await client.verifyPassport(
  passportId: string,
  challenge: string,
  signature: string,
): Promise<VerifyResult>;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `passportId` | string | The agent's passport ID |
| `challenge` | string | The challenge string your service issued |
| `signature` | string | The Ed25519 signature produced by the agent |

**Returns:** `VerifyResult`

```typescript
interface VerifyResult {
  valid: boolean;       // Whether the signature is valid
  passport_id: string;  // The verified passport ID
  trust_score: number;  // Current trust score (0-100)
  status: string;       // "active" or "revoked"
}
```

**Example:**

```typescript
try {
  const result = await client.verifyPassport(passportId, challenge, signature);

  if (result.valid && result.trust_score >= 50) {
    // Create a session for this agent
    const session = createAgentSession(result.passport_id);
    return { session_token: session.token };
  }
} catch (error) {
  // Verification request failed (network error, passport not found, etc.)
  console.error("Verification failed:", error.message);
}
```

### getPassport

Retrieve public passport information.

```typescript
const info = await client.getPassport(
  passportId: string,
): Promise<PassportInfo>;
```

**Returns:** `PassportInfo`

```typescript
interface PassportInfo {
  id: string;
  public_key: string;
  name: string;
  description: string;
  owner_email: string;
  trust_score: number;
  status: string;
  created_at: string;
}
```

**Example:**

```typescript
const passport = await client.getPassport("ap_7xk2m9f3abcd");
console.log(`Agent: ${passport.name} (owner: ${passport.owner_email})`);
console.log(`Trust: ${passport.trust_score}, Status: ${passport.status}`);
```

### reportAbuse

Report abuse for a passport. This increments the passport's abuse counter and reduces its trust score.

```typescript
const result = await client.reportAbuse(
  passportId: string,
  reason: string,
): Promise<AbuseReportResult>;
```

**Example:**

```typescript
await client.reportAbuse(
  "ap_7xk2m9f3abcd",
  "Spam activity detected on our platform",
);
```

## Verification Middleware

The SDK provides a framework-agnostic verification function that reads `X-AgentPass-ID` and `X-AgentPass-Signature` headers and verifies the agent via the API server.

### createVerificationMiddleware

```typescript
import { createVerificationMiddleware } from "@agentpass/sdk";

const verify = createVerificationMiddleware({
  apiUrl: "https://api.agentpass.dev",
});
```

The returned function accepts a `headers` object and returns an `AgentContext` on success or `null` on failure:

```typescript
interface AgentContext {
  passport_id: string;
  valid: boolean;
  trust_score: number;
  status: string;
}
```

### Express Integration

```typescript
import express from "express";
import { createVerificationMiddleware } from "@agentpass/sdk";

const app = express();
const verifyAgent = createVerificationMiddleware({
  apiUrl: "https://api.agentpass.dev",
});

// Middleware that requires agent authentication
async function requireAgent(req, res, next) {
  const agent = await verifyAgent({
    get: (name) => req.headers[name.toLowerCase()],
  });

  if (!agent) {
    return res.status(401).json({ error: "Agent authentication required" });
  }

  req.agent = agent;
  next();
}

app.get("/api/data", requireAgent, (req, res) => {
  res.json({
    message: `Hello, agent ${req.agent.passport_id}`,
    trust_score: req.agent.trust_score,
  });
});
```

### Hono Integration

```typescript
import { Hono } from "hono";
import { createVerificationMiddleware } from "@agentpass/sdk";

const app = new Hono();
const verifyAgent = createVerificationMiddleware({
  apiUrl: "https://api.agentpass.dev",
});

app.post("/api/auth/agent", async (c) => {
  const agent = await verifyAgent(c.req.raw.headers);

  if (!agent) {
    return c.json({ error: "Invalid agent credentials" }, 401);
  }

  // Create or find the agent user in your database
  let user = await db.findByAgentId(agent.passport_id);
  if (!user) {
    user = await db.createAgentUser({
      agent_id: agent.passport_id,
      trust_score: agent.trust_score,
    });
  }

  const token = generateSessionToken(user);
  return c.json({ session_token: token, user_id: user.id });
});
```

### Custom Header Names

The verification middleware reads these headers by default:

| Header | Description |
|--------|-------------|
| `X-AgentPass-ID` | The agent's passport ID |
| `X-AgentPass-Signature` | The Ed25519 signature |

Agents set these headers when making requests to your service.

## Well-Known Config

To advertise AgentPass support, services should expose a `/.well-known/agentpass.json` endpoint. The SDK provides a helper to generate this payload.

### generateWellKnownConfig

```typescript
import { generateWellKnownConfig } from "@agentpass/sdk";

const config = generateWellKnownConfig({
  authEndpoint: "/api/auth/agent",
  capabilities: ["ed25519-verification"],
});
```

**Parameters:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `authEndpoint` | string | yes | Path to your agent auth endpoint |
| `capabilities` | string[] | no | Supported capabilities. Defaults to `["ed25519-verification"]` |

**Returns:** `WellKnownConfig`

```typescript
interface WellKnownConfig {
  agentpass: boolean;      // Always true
  auth_endpoint: string;   // Your auth endpoint path
  capabilities: string[];  // Supported capabilities
}
```

**Example -- Express:**

```typescript
app.get("/.well-known/agentpass.json", (req, res) => {
  res.json(
    generateWellKnownConfig({
      authEndpoint: "/api/auth/agent",
    }),
  );
});
```

**Example -- Hono:**

```typescript
app.get("/.well-known/agentpass.json", (c) => {
  return c.json(
    generateWellKnownConfig({
      authEndpoint: "/api/auth/agent",
    }),
  );
});
```

When an agent encounters your service, it checks `/.well-known/agentpass.json` first. If the endpoint exists and `agentpass` is `true`, the agent uses native authentication instead of browser-based fallback.

## Full Integration Example

Here is a complete example of a Hono service with AgentPass support:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  AgentPassClient,
  createVerificationMiddleware,
  generateWellKnownConfig,
} from "@agentpass/sdk";

const app = new Hono();

const verifyAgent = createVerificationMiddleware({
  apiUrl: process.env.AGENTPASS_API_URL || "http://localhost:3846",
});

// Discovery endpoint
app.get("/.well-known/agentpass.json", (c) => {
  return c.json(
    generateWellKnownConfig({
      authEndpoint: "/api/auth/agent",
    }),
  );
});

// Agent authentication endpoint
app.post("/api/auth/agent", async (c) => {
  const agent = await verifyAgent(c.req.raw.headers);

  if (!agent) {
    return c.json({ error: "Authentication failed" }, 401);
  }

  if (agent.trust_score < 50) {
    return c.json({ error: "Trust score too low" }, 403);
  }

  const sessionToken = crypto.randomUUID();
  // Store session in your database...

  return c.json({
    session_token: sessionToken,
    passport_id: agent.passport_id,
    trust_score: agent.trust_score,
  });
});

// Protected endpoint
app.get("/api/data", async (c) => {
  // Validate session token from Authorization header...
  return c.json({ data: "sensitive information" });
});

serve({ fetch: app.fetch, port: 3000 });
```

## TypeScript Types Reference

All types are exported from the package root:

```typescript
import type {
  // Client
  AgentPassClientOptions,
  VerifyResult,
  PassportInfo,
  AbuseReportResult,

  // Middleware
  VerificationMiddlewareOptions,
  AgentContext,
  VerifyRequestFn,

  // Well-Known
  WellKnownOptions,
  WellKnownConfig,
} from "@agentpass/sdk";
```

### AgentPassClientOptions

```typescript
interface AgentPassClientOptions {
  apiUrl: string;  // Base URL of the AgentPass API server
}
```

### VerifyResult

```typescript
interface VerifyResult {
  valid: boolean;
  passport_id: string;
  trust_score: number;
  status: string;
}
```

### PassportInfo

```typescript
interface PassportInfo {
  id: string;
  public_key: string;
  name: string;
  description: string;
  owner_email: string;
  trust_score: number;
  status: string;
  created_at: string;
}
```

### AbuseReportResult

```typescript
interface AbuseReportResult {
  success: boolean;
  message?: string;
}
```

### AgentContext

```typescript
interface AgentContext {
  passport_id: string;
  valid: boolean;
  trust_score: number;
  status: string;
}
```

### VerifyRequestFn

```typescript
type VerifyRequestFn = (headers: {
  get(name: string): string | null | undefined;
}) => Promise<AgentContext | null>;
```

### WellKnownOptions

```typescript
interface WellKnownOptions {
  authEndpoint: string;
  capabilities?: string[];
}
```

### WellKnownConfig

```typescript
interface WellKnownConfig {
  agentpass: boolean;
  auth_endpoint: string;
  capabilities: string[];
}
```
