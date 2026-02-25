# AgentPass Python SDK

Minimal Python client for the [AgentPass](https://agentpass.space) API — identity layer for AI agents.

## Install

```bash
pip install agentpass
```

## Quick Start

```python
from agentpass import AgentPassClient

client = AgentPassClient()

# Register / login
token = client.register("agent@example.com", "s3cret", "MyAgent")
# or: token = client.login("agent@example.com", "s3cret")

# Create a passport
passport = client.create_passport("my-agent", "<ed25519-public-key>")

# Look up public info (no auth needed)
info = client.get_public_passport(passport["id"])

# Verify a signature
result = client.verify(passport["id"], challenge="hello", signature="<sig>")

# Trust score
trust = client.get_trust(passport["id"])

# Messaging
client.send_message(from_id="ap_aaa", to_id="ap_bbb", subject="Hi", body="Hello!")
inbox = client.get_messages("ap_aaa")
```

## Error Handling

```python
from agentpass import AgentPassClient, AgentPassError

try:
    client.login("bad@email.com", "wrong")
except AgentPassError as e:
    print(e, e.status_code)
```
