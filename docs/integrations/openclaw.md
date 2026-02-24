# AgentPass × OpenClaw Integration Guide

> Give your OpenClaw agent a verifiable identity, email, and the ability to register on websites autonomously.

## Prerequisites

- OpenClaw agent running (gateway active)
- Node.js ≥ 18
- `pnpm` or `npm`

## 1. Install AgentPass MCP Server

```bash
# Clone the repo (or use an existing checkout)
git clone https://github.com/kai-agent-free/AgentPass.git
cd AgentPass

# Install dependencies & build
pnpm install
pnpm -r build

# Verify it works
node packages/mcp-server/dist/cli.js info
```

You should see 17 tools listed.

## 2. Configure in OpenClaw

Add the MCP server to your OpenClaw agent config (`~/.openclaw/config.yaml` or via the dashboard):

```yaml
mcpServers:
  agentpass:
    command: node
    args:
      - /path/to/AgentPass/packages/mcp-server/dist/index.js
    env:
      AGENTPASS_API_URL: https://api.agentpass.space
      AGENTPASS_EMAIL_DOMAIN: agent-mail.xyz
```

Or if you installed globally via npm:

```yaml
mcpServers:
  agentpass:
    command: agentpass-mcp
    env:
      AGENTPASS_API_URL: https://api.agentpass.space
```

Restart your OpenClaw gateway after config changes:

```bash
openclaw gateway restart
```

## 3. Available MCP Tools (17)

| Category | Tools |
|---|---|
| **Identity** | `create_identity`, `list_identities`, `get_identity` |
| **Credentials** | `store_credential`, `get_credential`, `list_credentials` |
| **Auth** | `authenticate`, `check_auth_status` |
| **Email** | `get_email_address`, `wait_for_email`, `read_email`, `extract_verification_link`, `extract_otp_code`, `list_emails` |
| **SMS** | `get_phone_number`, `wait_for_sms`, `extract_otp_from_sms` |

## 4. Usage Examples

### Create an Identity (Passport)

Your agent calls the `create_identity` tool:

```
Tool: create_identity
Input: { "name": "my-agent", "description": "OpenClaw autonomous agent" }
```

This returns a passport ID (e.g., `ap_a622a643aa71`) and a private key. **Store the private key securely** — you'll need it for all future operations.

### Get Your Email Address

```
Tool: get_email_address
Input: { "identity_id": "ap_a622a643aa71" }
```

Returns: `ap_a622a643aa71@agent-mail.xyz`

### Register on a Website Automatically

Here's the full flow your agent follows:

```
1. Tool: create_identity → get passport ID
2. Tool: get_email_address → get your @agent-mail.xyz address
3. Tool: authenticate → fill in the signup form with your identity
4. Tool: wait_for_email → wait for verification email
5. Tool: extract_verification_link → get the confirm link
6. Tool: store_credential → save the login credentials
```

### Check Auth Status

```
Tool: check_auth_status
Input: { "service": "example.com", "identity_id": "ap_a622a643aa71" }
```

### Store & Retrieve Credentials

```
Tool: store_credential
Input: {
  "identity_id": "ap_a622a643aa71",
  "service": "github.com",
  "username": "my-agent",
  "password": "..."
}

Tool: get_credential
Input: { "identity_id": "ap_a622a643aa71", "service": "github.com" }
```

### Send/Receive Messages (via Email)

**Receive messages:**
```
Tool: list_emails
Input: { "identity_id": "ap_a622a643aa71" }

Tool: read_email
Input: { "identity_id": "ap_a622a643aa71", "email_id": "msg_123" }
```

**Send messages to other agents:**
Other agents can reach you at `<your-passport-id>@agent-mail.xyz`. You can read incoming messages with `wait_for_email` or `list_emails`.

### Extract OTP Codes

```
Tool: wait_for_email
Input: { "identity_id": "ap_a622a643aa71", "timeout_seconds": 60 }

Tool: extract_otp_code
Input: { "email_id": "msg_456" }
```

## 5. Direct API Access (curl)

You can also hit the API directly from your agent:

```bash
# Health check
curl -s https://api.agentpass.space/health
# → {"status":"ok","version":"0.1.0",...}

# Create a passport (via API)
curl -s -X POST https://api.agentpass.space/passports \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "description": "OpenClaw agent"}'
```

## 6. Practical Workflow: Full Registration

Here's what a typical autonomous registration looks like in your OpenClaw agent's reasoning:

```
1. "I need to sign up for example.com"
2. create_identity → ap_abc123
3. get_email_address → ap_abc123@agent-mail.xyz
4. [Browser: go to example.com/signup, fill form with identity + email]
5. wait_for_email (timeout: 120s) → verification email arrives
6. extract_verification_link → https://example.com/verify?token=...
7. [Browser: visit verification link]
8. store_credential → save username/password for future use
9. "Registration complete ✓"
```

## Troubleshooting

| Problem | Solution |
|---|---|
| MCP server not showing in tools | Check config path is absolute; restart gateway |
| `ECONNREFUSED` to API | Verify `https://api.agentpass.space/health` is reachable |
| Email not arriving | Check spam; verify identity exists with `get_identity` |
| `identity not found` | Ensure you're using the correct passport ID |
| Tool timeout | Increase `timeout_seconds` in `wait_for_email` / `wait_for_sms` |
| Build fails | Run `pnpm install && pnpm -r build` from repo root |

## Links

- **API:** https://api.agentpass.space
- **Dashboard:** https://dashboard.agentpass.space
- **Landing:** https://agentpass.space
- **GitHub:** https://github.com/kai-agent-free/AgentPass
