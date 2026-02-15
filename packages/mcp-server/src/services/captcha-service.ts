/**
 * CAPTCHA escalation service.
 *
 * When an agent encounters a CAPTCHA it cannot solve, it escalates to
 * the owner via webhook notification. The owner can then solve the
 * CAPTCHA through the dashboard or a direct link.
 *
 * Supports two modes:
 * - **With API**: escalation is persisted on the API server and the owner
 *   resolves it via the Dashboard. The agent polls the API for status.
 * - **Without API**: falls back to in-memory records + webhook notification
 *   (existing behavior).
 *
 * Escalation records are kept in memory with a configurable timeout
 * (default: 5 minutes). If the owner does not resolve within the timeout
 * the escalation is marked as timed out.
 */

import crypto from "node:crypto";
import type { WebhookService } from "./webhook-service.js";
import type { ApiClient } from "./api-client.js";

export interface EscalationRecord {
  escalation_id: string;
  passport_id: string;
  agent_name: string;
  captcha_type: string;
  screenshot_url?: string;
  status: "pending" | "resolved" | "timed_out";
  created_at: string;
  resolved_at?: string;
}

export interface EscalateResult {
  escalation_id: string;
  status: "pending";
}

export interface ResolutionResult {
  resolved: boolean;
  timed_out?: boolean;
}

export class CaptchaService {
  private readonly escalations = new Map<string, EscalationRecord>();
  private readonly timeoutMs = 300_000; // 5 minutes

  constructor(
    private readonly webhookService: WebhookService,
    private readonly apiClient?: ApiClient,
  ) {}

  /**
   * Create a CAPTCHA escalation and notify the owner via webhook.
   *
   * When an API client is available the escalation is also persisted on the
   * API server so the owner can resolve it through the Dashboard.
   */
  async escalate(
    passportId: string,
    agentName: string,
    captchaType: string,
    screenshotBuffer?: Buffer,
  ): Promise<EscalateResult> {
    const screenshotBase64 = screenshotBuffer
      ? screenshotBuffer.toString("base64")
      : undefined;

    const screenshotUrl = screenshotBase64
      ? `data:image/png;base64,${screenshotBase64}`
      : undefined;

    // Try to persist escalation via API first
    let escalationId: string;

    if (this.apiClient) {
      try {
        const apiResult = await this.apiClient.createEscalation({
          passport_id: passportId,
          captcha_type: captchaType,
          service: agentName,
          screenshot: screenshotBase64,
        });
        escalationId = apiResult.escalation_id;
      } catch {
        // API unavailable — fall back to local ID generation
        escalationId = `esc_${crypto.randomBytes(12).toString("hex")}`;
      }
    } else {
      escalationId = `esc_${crypto.randomBytes(12).toString("hex")}`;
    }

    // Always keep an in-memory record as fallback
    const record: EscalationRecord = {
      escalation_id: escalationId,
      passport_id: passportId,
      agent_name: agentName,
      captcha_type: captchaType,
      screenshot_url: screenshotUrl,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    this.escalations.set(escalationId, record);

    // Notify via webhook
    const event = this.webhookService.createEvent(
      "agent.captcha_needed",
      { passport_id: passportId, name: agentName },
      {
        escalation_id: escalationId,
        captcha_type: captchaType,
        screenshot_url: screenshotUrl,
      },
      [
        {
          type: "solve",
          label: "Solve CAPTCHA",
          url: `https://dashboard.agentpass.space/solve/${escalationId}`,
        },
      ],
    );

    await this.webhookService.emit(event);

    return { escalation_id: escalationId, status: "pending" };
  }

  /**
   * Check whether the owner has resolved a CAPTCHA escalation.
   *
   * When an API client is available, polls the API server for the latest
   * status (the owner may have resolved it through the Dashboard). Falls
   * back to the in-memory record when the API is unavailable.
   *
   * Automatically marks escalations as timed out after the timeout period.
   */
  async checkResolution(escalationId: string): Promise<ResolutionResult> {
    // Try API first for the freshest status
    if (this.apiClient) {
      try {
        const apiStatus =
          await this.apiClient.getEscalationStatus(escalationId);

        if (apiStatus.status === "resolved") {
          // Sync the in-memory record
          const record = this.escalations.get(escalationId);
          if (record) {
            record.status = "resolved";
            record.resolved_at =
              apiStatus.resolved_at ?? new Date().toISOString();
          }
          return { resolved: true };
        }

        if (apiStatus.status === "timed_out") {
          const record = this.escalations.get(escalationId);
          if (record) {
            record.status = "timed_out";
          }
          return { resolved: false, timed_out: true };
        }
      } catch {
        // API unavailable — fall through to in-memory check
      }
    }

    // In-memory fallback
    const record = this.escalations.get(escalationId);

    if (!record) {
      return { resolved: false };
    }

    if (record.status === "resolved") {
      return { resolved: true };
    }

    // Check for timeout
    const elapsed = Date.now() - new Date(record.created_at).getTime();
    if (elapsed >= this.timeoutMs) {
      record.status = "timed_out";
      return { resolved: false, timed_out: true };
    }

    return { resolved: false };
  }

  /**
   * Mark a CAPTCHA escalation as resolved (called when the owner solves it).
   */
  resolve(escalationId: string): boolean {
    const record = this.escalations.get(escalationId);

    if (!record || record.status !== "pending") {
      return false;
    }

    record.status = "resolved";
    record.resolved_at = new Date().toISOString();
    return true;
  }

  /**
   * Get the timeout duration in milliseconds.
   */
  getTimeout(): number {
    return this.timeoutMs;
  }
}
