/**
 * WebSocket relay manager for browser session streaming.
 *
 * Manages pairs of WebSocket connections per session (MCP ↔ Dashboard)
 * and forwards binary frames (JPEG screenshots) and text frames (JSON commands)
 * bidirectionally without touching the database.
 */

import type { WSContext } from "hono/ws";

export type WsRole = "mcp" | "dashboard";

export type StreamStatus = "none" | "mcp_connected" | "active" | "disconnected";

interface SessionRelay {
  mcp: WSContext | null;
  dashboard: WSContext | null;
}

export class WsRelayManager {
  private relays = new Map<string, SessionRelay>();

  /**
   * Register a WebSocket connection for a session + role.
   * If a connection already exists for that role, it is replaced (old one is not closed here).
   */
  register(sessionId: string, role: WsRole, ws: WSContext): void {
    let relay = this.relays.get(sessionId);
    if (!relay) {
      relay = { mcp: null, dashboard: null };
      this.relays.set(sessionId, relay);
    }
    relay[role] = ws;
  }

  /**
   * Forward data from one role to the other.
   * Binary data (screenshots) and text data (commands/metadata) are forwarded as-is.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forward(sessionId: string, fromRole: WsRole, data: string | ArrayBuffer | Uint8Array<any>): void {
    const relay = this.relays.get(sessionId);
    if (!relay) return;

    const target = fromRole === "mcp" ? relay.dashboard : relay.mcp;
    if (!target) return;

    try {
      target.send(data);
    } catch {
      // Target may have disconnected — ignore send errors
    }
  }

  /**
   * Unregister a WebSocket connection for a session + role.
   * If both sides are gone, clean up the relay entry.
   */
  unregister(sessionId: string, role: WsRole): void {
    const relay = this.relays.get(sessionId);
    if (!relay) return;

    relay[role] = null;

    if (!relay.mcp && !relay.dashboard) {
      this.relays.delete(sessionId);
    }
  }

  /**
   * Get the current stream status for a session.
   */
  getStatus(sessionId: string): StreamStatus {
    const relay = this.relays.get(sessionId);
    if (!relay) return "none";
    if (relay.mcp && relay.dashboard) return "active";
    if (relay.mcp) return "mcp_connected";
    return "disconnected";
  }

  /**
   * Clean up all connections for a session (e.g., on session close).
   */
  cleanup(sessionId: string): void {
    const relay = this.relays.get(sessionId);
    if (!relay) return;

    try { relay.mcp?.close(); } catch { /* ignore */ }
    try { relay.dashboard?.close(); } catch { /* ignore */ }

    this.relays.delete(sessionId);
  }

  /**
   * Check if a session has any active connections.
   */
  hasConnections(sessionId: string): boolean {
    const relay = this.relays.get(sessionId);
    return !!relay && (!!relay.mcp || !!relay.dashboard);
  }
}

/** Singleton relay manager shared across the API server. */
export const wsRelayManager = new WsRelayManager();
