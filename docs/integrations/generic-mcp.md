# AgentPass — Generic MCP Integration Guide

> Integrate AgentPass with any MCP-compatible agent or framework.

## Prerequisites

- Any agent/host that supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) stdio transport
- Node.js ≥ 18

## 1. Install

```bash
git clone https://github.com/kai-agent-free/AgentPass.git
cd AgentPass
pnpm install && pnpm -r build
```

The MCP server binary is at:
```
packages/mcp-server/dist/index.js   # stdio MCP server
packages/mcp-server/dist/cli.js     # CLI (serve/info/config)
```

## 2. Configure

AgentPass uses **stdio transport** — your MCP host spawns it as a child process.

### Standard MCP config (JSON)

```json
{
  "mcpServers": {
    "agentpass": {
      "command": "node",
      "args": ["/absolute/path/to/AgentPass/packages/mcp-server/dist/index.js"],
      "env": {
        "AGENTPASS_API_URL": "https://api.agentpass.space",
        "AGENTPASS_EMAIL_DOMAIN": "agent-mail.xyz"
      }
    }
  }
}
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTPASS_API_URL` | `https://api.agentpass.space` | API base URL |
| `AGENTPASS_EMAIL_DOMAIN` | `agent-mail.xyz` | Email domain for identities |

### Manual spawn (for custom hosts)

```bash
# Start the server on stdio
node /path/to/AgentPass/packages/mcp-server/dist/index.js

# Or via CLI
/path/to/AgentPass/packages/mcp-server/dist/cli.js serve
```

The server communicates via JSON-RPC over stdin/stdout per the MCP spec.

## 3. Tools Reference (17)

### Identity Management
| Tool | Description |
|---|---|
| `create_identity` | Create a new agent passport/identity |
| `list_identities` | List all identities |
| `get_identity` | Get details of a specific identity |

### Credential Storage
| Tool | Description |
|---|---|
| `store_credential` | Store login credentials for a service |
| `get_credential` | Retrieve stored credentials |
| `list_credentials` | List all stored credentials |

### Authentication
| Tool | Description |
|---|---|
| `authenticate` | Authenticate with a service |
| `check_auth_status` | Check if authenticated with a service |

### Email (`@agent-mail.xyz`)
| Tool | Description |
|---|---|
| `get_email_address` | Get the email for an identity |
| `wait_for_email` | Wait for an incoming email (polling) |
| `read_email` | Read a specific email |
| `extract_verification_link` | Extract verification URL from email body |
| `extract_otp_code` | Extract OTP/verification code from email |
| `list_emails` | List all emails in inbox |

### SMS
| Tool | Description |
|---|---|
| `get_phone_number` | Get a phone number for an identity |
| `wait_for_sms` | Wait for an incoming SMS |
| `extract_otp_from_sms` | Extract OTP code from SMS |

## 4. Usage Patterns

### Create identity → register on a site

```
1. create_identity({ name: "my-agent" })
   → { id: "ap_abc123", privateKey: "..." }

2. get_email_address({ identity_id: "ap_abc123" })
   → "ap_abc123@agent-mail.xyz"

3. [Your agent fills signup form with email + generated password]

4. wait_for_email({ identity_id: "ap_abc123", timeout_seconds: 120 })
   → { email_id: "msg_789", subject: "Verify your email" }

5. extract_verification_link({ email_id: "msg_789" })
   → "https://example.com/verify?token=abc"

6. [Your agent visits the verification link]

7. store_credential({ identity_id: "ap_abc123", service: "example.com", username: "my-agent", password: "..." })
```

### Agent-to-agent messaging

Agents can communicate via their `@agent-mail.xyz` addresses:

- **Send:** Use your agent's own email/SMTP capability to send to `<other-passport-id>@agent-mail.xyz`
- **Receive:** `list_emails` / `wait_for_email` / `read_email`

### Credential vault

```
store_credential → securely save service logins
get_credential   → retrieve when needed
list_credentials → see all stored services
```

## 5. Testing the API

```bash
# Health check
curl -s https://api.agentpass.space/health
# → {"status":"ok","version":"0.1.0",...}

# Verify tools are listed
node /path/to/AgentPass/packages/mcp-server/dist/cli.js info
```

## 6. Framework-Specific Notes

### LangChain / LangGraph
Use the [MCP adapter for LangChain](https://github.com/langchain-ai/langchain/tree/master/libs/partners/mcp) to connect stdio MCP servers.

### AutoGen / CrewAI
Spawn the MCP server as a subprocess and communicate via JSON-RPC on stdio.

### Custom Python host
```python
import subprocess, json

proc = subprocess.Popen(
    ["node", "/path/to/dist/index.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    text=True
)

# Send MCP JSON-RPC request
request = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
proc.stdin.write(json.dumps(request) + "\n")
proc.stdin.flush()
response = proc.stdout.readline()
print(json.loads(response))
```

## Troubleshooting

| Problem | Solution |
|---|---|
| Server exits immediately | Check Node.js ≥ 18; run `pnpm -r build` first |
| No tools returned | Ensure you're connecting to `dist/index.js`, not `cli.js` |
| API errors | Verify `https://api.agentpass.space/health` returns OK |
| Email not received | Check identity exists; increase `timeout_seconds` |
| JSON parse errors | Ensure nothing else writes to stdout (no `console.log` in plugins) |

## Links

- **MCP Spec:** https://modelcontextprotocol.io
- **API:** https://api.agentpass.space
- **Dashboard:** https://dashboard.agentpass.space
- **GitHub:** https://github.com/kai-agent-free/AgentPass
