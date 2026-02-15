/**
 * Browser session streaming service.
 *
 * Manages the screenshot loop and command polling for live CAPTCHA viewing.
 * When a CAPTCHA is detected, the MCP server keeps the Playwright page open
 * and starts streaming screenshots to the API server. The owner can then
 * interact with the page through the Dashboard.
 */

import type { Page } from "playwright";
import type { ApiClient, BrowserCommand } from "./api-client.js";

const SCREENSHOT_INTERVAL_MS = 500;
const COMMAND_POLL_INTERVAL_MS = 300;

export class BrowserSessionService {
  private sessions = new Map<string, {
    sessionId: string;
    escalationId: string;
    page: Page;
    screenshotTimer: ReturnType<typeof setInterval> | null;
    commandTimer: ReturnType<typeof setInterval> | null;
    closed: boolean;
  }>();

  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Start a browser session for live CAPTCHA viewing.
   *
   * Creates a session on the API server, then starts:
   * 1. Screenshot loop (every 500ms) -- captures and pushes JPEG screenshots
   * 2. Command polling loop (every 300ms) -- fetches and executes pending commands
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

    const session = {
      sessionId,
      escalationId,
      page,
      screenshotTimer: null as ReturnType<typeof setInterval> | null,
      commandTimer: null as ReturnType<typeof setInterval> | null,
      closed: false,
    };

    this.sessions.set(sessionId, session);

    // Start screenshot loop
    session.screenshotTimer = setInterval(async () => {
      if (session.closed) return;
      try {
        const buffer = await page.screenshot({ type: "jpeg", quality: 50 });
        const base64 = buffer.toString("base64");
        const screenshot = `data:image/jpeg;base64,${base64}`;
        await this.apiClient.updateBrowserScreenshot(
          sessionId,
          screenshot,
          page.url(),
        );
      } catch {
        // Page may have been closed -- stop silently
      }
    }, SCREENSHOT_INTERVAL_MS);

    // Start command polling loop
    session.commandTimer = setInterval(async () => {
      if (session.closed) return;
      try {
        const commands = await this.apiClient.getBrowserCommands(sessionId);
        for (const cmd of commands) {
          await this.executeCommand(page, cmd);
          await this.apiClient.updateBrowserCommandStatus(
            sessionId,
            cmd.id,
            "executed",
          );
        }
      } catch {
        // API may be unavailable -- retry on next poll
      }
    }, COMMAND_POLL_INTERVAL_MS);

    // Capture initial screenshot immediately
    try {
      const buffer = await page.screenshot({ type: "jpeg", quality: 50 });
      const base64 = buffer.toString("base64");
      const screenshot = `data:image/jpeg;base64,${base64}`;
      await this.apiClient.updateBrowserScreenshot(sessionId, screenshot, pageUrl);
    } catch {
      // Non-critical
    }

    return sessionId;
  }

  /**
   * Stop a browser session.
   *
   * Clears the screenshot and command loops, closes the session on the API.
   * Does NOT close the page -- the caller decides what to do with it.
   */
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.closed = true;

    if (session.screenshotTimer) {
      clearInterval(session.screenshotTimer);
      session.screenshotTimer = null;
    }

    if (session.commandTimer) {
      clearInterval(session.commandTimer);
      session.commandTimer = null;
    }

    try {
      await this.apiClient.closeBrowserSession(sessionId);
    } catch {
      // Non-critical -- session will be cleaned up server-side
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

  /**
   * Execute a browser command on the page.
   */
  private async executeCommand(page: Page, command: BrowserCommand): Promise<void> {
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
}
