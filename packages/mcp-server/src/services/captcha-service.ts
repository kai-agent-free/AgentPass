/**
 * CAPTCHA escalation service.
 *
 * When an agent encounters a CAPTCHA it cannot solve, it escalates to
 * the owner via webhook notification. The owner can then solve the
 * CAPTCHA through the dashboard or a direct link.
 *
 * Escalation records are kept in memory with a configurable timeout
 * (default: 5 minutes). If the owner does not resolve within the timeout
 * the escalation is marked as timed out.
 */

import crypto from "node:crypto";
import type { WebhookService } from "./webhook-service.js";

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

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Create a CAPTCHA escalation and notify the owner via webhook.
   */
  async escalate(
    passportId: string,
    agentName: string,
    captchaType: string,
    screenshotBuffer?: Buffer,
  ): Promise<EscalateResult> {
    const escalationId = `esc_${crypto.randomBytes(12).toString("hex")}`;

    const screenshotUrl = screenshotBuffer
      ? `data:image/png;base64,${screenshotBuffer.toString("base64")}`
      : undefined;

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
          url: `https://dash.agentpass.dev/solve/${escalationId}`,
        },
      ],
    );

    await this.webhookService.emit(event);

    return { escalation_id: escalationId, status: "pending" };
  }

  /**
   * Check whether the owner has resolved a CAPTCHA escalation.
   * Automatically marks escalations as timed out after the timeout period.
   */
  checkResolution(escalationId: string): ResolutionResult {
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
