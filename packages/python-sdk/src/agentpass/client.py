"""AgentPass REST API client."""

from __future__ import annotations

from typing import Any

import requests


class AgentPassError(Exception):
    """Raised when the AgentPass API returns an error."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AgentPassClient:
    """Minimal client for the AgentPass REST API."""

    def __init__(
        self,
        base_url: str = "https://api.agentpass.space",
        token: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    # -- helpers --

    def _headers(self, auth: bool = True) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if auth and self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        auth: bool = True,
    ) -> Any:
        url = f"{self.base_url}{path}"
        resp = requests.request(
            method, url, json=json, headers=self._headers(auth), timeout=30
        )
        if not resp.ok:
            body = resp.text
            try:
                body = resp.json().get("error", body)
            except Exception:
                pass
            raise AgentPassError(str(body), status_code=resp.status_code)
        if resp.status_code == 204:
            return None
        return resp.json()

    # -- auth --

    def register(self, email: str, password: str, name: str) -> str:
        """Register a new account. Sets and returns the auth token."""
        data = self._request(
            "POST", "/auth/register", json={"email": email, "password": password, "name": name}
        )
        self.token = data["token"]
        return self.token

    def login(self, email: str, password: str) -> str:
        """Log in. Sets and returns the auth token."""
        data = self._request(
            "POST", "/auth/login", json={"email": email, "password": password}
        )
        self.token = data["token"]
        return self.token

    # -- passports --

    def create_passport(self, name: str, public_key: str) -> dict[str, Any]:
        """Create a new passport."""
        return self._request(
            "POST", "/passports", json={"name": name, "publicKey": public_key}
        )

    def get_passport(self, passport_id: str) -> dict[str, Any]:
        """Get passport details (authenticated)."""
        return self._request("GET", f"/passports/{passport_id}")

    def get_public_passport(self, passport_id: str) -> dict[str, Any]:
        """Get public passport info (no auth needed)."""
        return self._request("GET", f"/passports/{passport_id}/public", auth=False)

    # -- verification --

    def verify(self, passport_id: str, challenge: str, signature: str) -> dict[str, Any]:
        """Verify a signature against a passport's public key."""
        return self._request(
            "POST",
            f"/passports/{passport_id}/verify",
            json={"challenge": challenge, "signature": signature},
            auth=False,
        )

    # -- trust --

    def get_trust(self, passport_id: str) -> dict[str, Any]:
        """Get trust score for a passport."""
        return self._request("GET", f"/passports/{passport_id}/trust")

    # -- messages --

    def send_message(
        self, from_id: str, to_id: str, subject: str, body: str
    ) -> dict[str, Any]:
        """Send a message between passports."""
        return self._request(
            "POST",
            "/messages",
            json={"from": from_id, "to": to_id, "subject": subject, "body": body},
        )

    def get_messages(self, passport_id: str) -> list[dict[str, Any]]:
        """Get inbox for a passport."""
        return self._request("GET", f"/passports/{passport_id}/messages")
