/**
 * Browser session streaming service.
 *
 * Manages live CAPTCHA viewing using two modes:
 *
 * 1. **Primary (CDP + WebSocket)**: Uses Chrome DevTools Protocol `Page.startScreencast`
 *    for event-driven frame capture (only when page changes) and WebSocket relay through
 *    the API server for real-time delivery. Commands from the Dashboard arrive via WS.
 *
 * 2. **Fallback (HTTP polling)**: If WebSocket connection fails or CDP is unavailable,
 *    falls back to the original screenshot interval + command polling over HTTP.
 *
 * Public API is unchanged: startSession(), stopSession(), isSessionActive(),
 * getActiveSessions(), stopAll().
 */

import type { Page, CDPSession } from "playwright";
import WebSocket from "ws";
import type { ApiClient, BrowserCommand } from "./api-client.js";

const SCREENSHOT_INTERVAL_MS = 500;
const COMMAND_POLL_INTERVAL_MS = 300;
const WS_RECONNECT_DELAYS = [1000, 2000, 4000]; // exponential backoff

interface SessionState {
  sessionId: string;
  escalationId: string;
  page: Page;
  closed: boolean;
  mode: "ws" | "http";
  // WebSocket mode
  ws: WebSocket | null;
  cdp: CDPSession | null;
  reconnectAttempt: number;
  // HTTP fallback mode
  screenshotTimer: ReturnType<typeof setInterval> | null;
  commandTimer: ReturnType<typeof setInterval> | null;
}

export class BrowserSessionService {
  private sessions = new Map<string, SessionState>();

  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Start a browser session for live CAPTCHA viewing.
   *
   * Creates a session on the API server, then attempts WebSocket + CDP streaming.
   * Falls back to HTTP polling if WS/CDP is unavailable.
   *
   * @returns The session ID from the API server
   */
  async startSession(escalationId: string, page: Page): Promise<string> {
    const pageUrl = page.url();
    const viewport = page.viewportSize();

    const result = await this.apiClient.createBrowserSession({
      escalation_id: escalationId,
      page_url: pageUrl,
      viewport_w: viewport?.width ?? 1280,
      viewport_h: viewport?.height ?? 720,
    });

    const sessionId = result.session_id;

    const session: SessionState = {
      sessionId,
      escalationId,
      page,
      closed: false,
      mode: "http",
      ws: null,
      cdp: null,
      reconnectAttempt: 0,
      screenshotTimer: null,
      commandTimer: null,
    };

    this.sessions.set(sessionId, session);

    // Try WebSocket + CDP first
    const wsConnected = await this.tryStartWebSocket(session);

    if (!wsConnected) {
      // Fall back to HTTP polling
      this.startHttpPolling(session);
    }

    return sessionId;
  }

  /**
   * Stop a browser session.
   *
   * Cleans up WS/CDP or HTTP timers, closes the session on the API.
   * Does NOT close the page — the caller decides what to do with it.
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.closed = true;
    this.cleanupSession(session);

    try {
      await this.apiClient.closeBrowserSession(sessionId);
    } catch {
      // Non-critical — session will be cleaned up server-side
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Check if a session exists and is active.
   */
  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return !!session && !session.closed;
  }

  /**
   * Get all active session IDs.
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([, s]) => !s.closed)
      .map(([id]) => id);
  }

  /**
   * Stop all active sessions. Used during graceful shutdown.
   */
  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.allSettled(
      sessionIds.map((id) => this.stopSession(id)),
    );
  }

  // --- WebSocket + CDP mode ---

  /**
   * Attempt to start WebSocket connection and CDP screencast.
   * Returns true if both succeeded, false if either failed.
   */
  private async tryStartWebSocket(session: SessionState): Promise<boolean> {
    try {
      const wsUrl = this.apiClient.getWsUrl(session.sessionId);
      const ws = new WebSocket(wsUrl);

      const connected = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          ws.terminate();
          resolve(false);
        }, 5000);

        ws.on("open", () => {
          clearTimeout(timeout);
          resolve(true);
        });

        ws.on("error", () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      if (!connected || session.closed) {
        ws.terminate();
        return false;
      }

      // Send identify message
      ws.send(JSON.stringify({ type: "identify", role: "mcp" }));

      // Send initial metadata
      const viewport = session.page.viewportSize();
      ws.send(JSON.stringify({
        type: "metadata",
        page_url: session.page.url(),
        viewport_w: viewport?.width ?? 1280,
        viewport_h: viewport?.height ?? 720,
      }));

      // Start CDP screencast
      let cdp: CDPSession;
      try {
        cdp = await session.page.context().newCDPSession(session.page);
      } catch {
        ws.close();
        return false;
      }

      session.ws = ws;
      session.cdp = cdp;
      session.mode = "ws";
      session.reconnectAttempt = 0;

      // Listen for screencast frames
      cdp.on("Page.screencastFrame", (params: { data: string; sessionId: number }) => {
        if (session.closed || !session.ws) return;

        try {
          // Send raw JPEG bytes as binary frame
          const buffer = Buffer.from(params.data, "base64");
          session.ws.send(buffer);

          // Acknowledge the frame to CDP so it sends the next one
          cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
        } catch {
          // WS may have disconnected
        }
      });

      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 60,
        maxWidth: 1280,
        maxHeight: 720,
      });

      // Listen for commands from Dashboard via WebSocket
      ws.on("message", (data: Buffer | string) => {
        if (session.closed) return;

        // Only handle text (JSON) messages — commands from Dashboard
        if (typeof data === "string" || Buffer.isBuffer(data)) {
          try {
            const str = typeof data === "string" ? data : data.toString("utf-8");
            const msg = JSON.parse(str);

            if (msg.type === "command") {
              this.executeWsCommand(session.page, msg.command, msg.payload).catch(() => {});
            }
          } catch {
            // Invalid JSON — ignore
          }
        }
      });

      // Handle WS disconnect — try reconnect or fall back to HTTP
      ws.on("close", () => {
        if (session.closed) return;
        this.handleWsDisconnect(session);
      });

      ws.on("error", () => {
        // Error is followed by close event, which handles reconnection
      });

      // Also capture initial screenshot via HTTP for immediate display
      this.captureAndPushInitialScreenshot(session).catch(() => {});

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle WebSocket disconnection — attempt reconnect with backoff,
   * then fall back to HTTP if all attempts fail.
   */
  private async handleWsDisconnect(session: SessionState): Promise<void> {
    // Clean up current CDP session
    try {
      await session.cdp?.detach();
    } catch { /* ignore */ }
    session.cdp = null;
    session.ws = null;

    // Retry with exponential backoff
    while (session.reconnectAttempt < WS_RECONNECT_DELAYS.length && !session.closed) {
      const delay = WS_RECONNECT_DELAYS[session.reconnectAttempt];
      session.reconnectAttempt++;

      await this.delay(delay);
      if (session.closed) return;

      const reconnected = await this.tryStartWebSocket(session);
      if (reconnected) return;
    }

    // All reconnect attempts failed — fall back to HTTP polling
    if (!session.closed) {
      console.warn(`[BrowserSession] WS reconnection failed for ${session.sessionId}, falling back to HTTP`);
      session.mode = "http";
      this.startHttpPolling(session);
    }
  }

  /**
   * Execute a command received via WebSocket.
   */
  private async executeWsCommand(
    page: Page,
    command: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    switch (command) {
      case "click":
        await page.mouse.click(
          payload.x as number,
          payload.y as number,
        );
        break;
      case "type":
        await page.keyboard.type(payload.text as string);
        break;
      case "keypress":
        await page.keyboard.press(payload.key as string);
        break;
      case "scroll":
        await page.mouse.wheel(
          (payload.deltaX as number) ?? 0,
          (payload.deltaY as number) ?? 0,
        );
        break;
      default:
        console.warn(`[BrowserSession] Unknown WS command: ${command}`);
    }
  }

  // --- HTTP fallback mode ---

  /**
   * Start HTTP-based screenshot pushing and command polling (fallback mode).
   */
  private startHttpPolling(session: SessionState): void {
    session.mode = "http";

    // Start screenshot loop
    session.screenshotTimer = setInterval(async () => {
      if (session.closed) return;
      try {
        const buffer = await session.page.screenshot({ type: "jpeg", quality: 50 });
        const base64 = buffer.toString("base64");
        const screenshot = `data:image/jpeg;base64,${base64}`;
        await this.apiClient.updateBrowserScreenshot(
          session.sessionId,
          screenshot,
          session.page.url(),
        );
      } catch {
        // Page may have been closed — stop silently
      }
    }, SCREENSHOT_INTERVAL_MS);

    // Start command polling loop
    session.commandTimer = setInterval(async () => {
      if (session.closed) return;
      try {
        const commands = await this.apiClient.getBrowserCommands(session.sessionId);
        for (const cmd of commands) {
          await this.executeHttpCommand(session.page, cmd);
          await this.apiClient.updateBrowserCommandStatus(
            session.sessionId,
            cmd.id,
            "executed",
          );
        }
      } catch {
        // API may be unavailable — retry on next poll
      }
    }, COMMAND_POLL_INTERVAL_MS);

    // Capture initial screenshot immediately
    this.captureAndPushInitialScreenshot(session).catch(() => {});
  }

  /**
   * Execute a browser command received via HTTP polling.
   */
  private async executeHttpCommand(page: Page, command: BrowserCommand): Promise<void> {
    const payload = command.payload;

    switch (command.type) {
      case "click":
        await page.mouse.click(
          payload.x as number,
          payload.y as number,
        );
        break;
      case "type":
        await page.keyboard.type(payload.text as string);
        break;
      case "keypress":
        await page.keyboard.press(payload.key as string);
        break;
      case "scroll":
        await page.mouse.wheel(
          (payload.deltaX as number) ?? 0,
          (payload.deltaY as number) ?? 0,
        );
        break;
      default:
        console.warn(`[BrowserSession] Unknown command type: ${command.type}`);
    }
  }

  // --- Shared helpers ---

  /**
   * Capture and push an initial screenshot via HTTP for immediate display.
   */
  private async captureAndPushInitialScreenshot(session: SessionState): Promise<void> {
    const buffer = await session.page.screenshot({ type: "jpeg", quality: 50 });
    const base64 = buffer.toString("base64");
    const screenshot = `data:image/jpeg;base64,${base64}`;
    await this.apiClient.updateBrowserScreenshot(
      session.sessionId,
      screenshot,
      session.page.url(),
    );
  }

  /**
   * Clean up all resources for a session (WS, CDP, timers).
   */
  private cleanupSession(session: SessionState): void {
    // Clean up WebSocket
    if (session.ws) {
      try { session.ws.close(); } catch { /* ignore */ }
      session.ws = null;
    }

    // Clean up CDP session
    if (session.cdp) {
      session.cdp.detach().catch(() => {});
      session.cdp = null;
    }

    // Clean up HTTP polling timers
    if (session.screenshotTimer) {
      clearInterval(session.screenshotTimer);
      session.screenshotTimer = null;
    }

    if (session.commandTimer) {
      clearInterval(session.commandTimer);
      session.commandTimer = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
