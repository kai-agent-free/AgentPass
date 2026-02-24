# AgentPass × Claude Code / Claude Desktop

> Add identity, email, and autonomous registration capabilities to Claude Code or Claude Desktop.

## Prerequisites

- Claude Code CLI or Claude Desktop installed
- Node.js ≥ 18
- Git

## 1. Install

```bash
git clone https://github.com/kai-agent-free/AgentPass.git
cd AgentPass
pnpm install
pnpm -r build
```

Or generate the config snippet automatically:

```bash
node packages/mcp-server/dist/cli.js config
```

## 2. Configure for Claude Code

Add to your project's `.mcp.json` (or `~/.claude/mcp.json` for global):

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

## 3. Configure for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop after saving.

## 4. Available Tools (17)

Once configured, Claude will have access to:

**Identity:** `create_identity`, `list_identities`, `get_identity`
**Credentials:** `store_credential`, `get_credential`, `list_credentials`
**Auth:** `authenticate`, `check_auth_status`
**Email:** `get_email_address`, `wait_for_email`, `read_email`, `extract_verification_link`, `extract_otp_code`, `list_emails`
**SMS:** `get_phone_number`, `wait_for_sms`, `extract_otp_from_sms`

## 5. Usage Examples

Just ask Claude naturally:

> "Create me an AgentPass identity called 'claude-assistant'"

Claude will call `create_identity` and return your passport ID.

> "What's my email address?"

→ `get_email_address` → `ap_xxxx@agent-mail.xyz`

> "Check if I have any new emails"

→ `list_emails` → shows inbox

> "Sign me up for example.com using my AgentPass identity"

Claude will orchestrate: `get_email_address` → fill form → `wait_for_email` → `extract_verification_link` → `store_credential`

### Store credentials securely

> "Save my GitHub login — username: mybot, password: secret123"

→ `store_credential` with service `github.com`

> "What's my GitHub password?"

→ `get_credential` for `github.com`

## 6. Verify Setup

In Claude Code, run:

```bash
claude mcp list
```

You should see `agentpass` with 17 tools.

Or ask Claude: *"List all AgentPass tools available to you"*

## Troubleshooting

| Problem | Solution |
|---|---|
| Tools not appearing | Check JSON syntax; use absolute path; restart Claude |
| `spawn node ENOENT` | Ensure `node` is in your PATH |
| `Cannot find module` | Run `pnpm -r build` in the AgentPass repo |
| API unreachable | Test: `curl https://api.agentpass.space/health` |
| Permission denied on CLI | `chmod +x packages/mcp-server/dist/cli.js` |

## Links

- **API:** https://api.agentpass.space
- **Dashboard:** https://dashboard.agentpass.space
- **GitHub:** https://github.com/kai-agent-free/AgentPass
