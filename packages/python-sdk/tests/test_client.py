"""Tests for AgentPassClient."""

import pytest
import responses

from agentpass import AgentPassClient, AgentPassError

BASE = "https://api.agentpass.space"


@responses.activate
def test_register():
    responses.post(f"{BASE}/auth/register", json={"token": "tok123"})
    c = AgentPassClient()
    assert c.register("a@b.com", "pw", "Agent") == "tok123"
    assert c.token == "tok123"


@responses.activate
def test_login():
    responses.post(f"{BASE}/auth/login", json={"token": "tok456"})
    c = AgentPassClient()
    assert c.login("a@b.com", "pw") == "tok456"
    assert c.token == "tok456"


@responses.activate
def test_create_passport():
    responses.post(f"{BASE}/passports", json={"id": "ap_1", "name": "bot"})
    c = AgentPassClient(token="t")
    p = c.create_passport("bot", "pubkey")
    assert p["id"] == "ap_1"
    assert "Bearer t" in responses.calls[0].request.headers["Authorization"]


@responses.activate
def test_get_passport():
    responses.get(f"{BASE}/passports/ap_1", json={"id": "ap_1"})
    c = AgentPassClient(token="t")
    assert c.get_passport("ap_1")["id"] == "ap_1"


@responses.activate
def test_get_public_passport_no_auth():
    responses.get(f"{BASE}/passports/ap_1/public", json={"id": "ap_1", "name": "bot"})
    c = AgentPassClient()  # no token
    p = c.get_public_passport("ap_1")
    assert p["name"] == "bot"
    assert "Authorization" not in responses.calls[0].request.headers


@responses.activate
def test_verify():
    responses.post(f"{BASE}/passports/ap_1/verify", json={"valid": True})
    c = AgentPassClient()
    assert c.verify("ap_1", "ch", "sig")["valid"] is True


@responses.activate
def test_get_trust():
    responses.get(f"{BASE}/passports/ap_1/trust", json={"score": 0.95})
    c = AgentPassClient(token="t")
    assert c.get_trust("ap_1")["score"] == 0.95


@responses.activate
def test_send_message():
    responses.post(f"{BASE}/messages", json={"id": "m1"})
    c = AgentPassClient(token="t")
    assert c.send_message("ap_a", "ap_b", "Hi", "Hello")["id"] == "m1"


@responses.activate
def test_get_messages():
    responses.get(f"{BASE}/passports/ap_a/messages", json=[{"id": "m1"}])
    c = AgentPassClient(token="t")
    msgs = c.get_messages("ap_a")
    assert len(msgs) == 1


@responses.activate
def test_error_handling():
    responses.post(f"{BASE}/auth/login", json={"error": "Invalid credentials"}, status=401)
    c = AgentPassClient()
    with pytest.raises(AgentPassError) as exc_info:
        c.login("bad@x.com", "wrong")
    assert exc_info.value.status_code == 401
    assert "Invalid credentials" in str(exc_info.value)
