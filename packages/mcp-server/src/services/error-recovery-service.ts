/**
 * Error recovery service.
 *
 * When an agent encounters an unrecoverable error during authentication
 * or registration, it reports the error and waits for the owner to decide
 * the next action: retry, skip, or provide manual credentials.
 *
 * Error records are kept in memory with webhook notifications to the owner.
 */

import crypto from "node:crypto";
import type { WebhookService } from "./webhook-service.js";

export type OwnerDecision = "retry" | "skip" | "manual";

export interface ManualCredentials {
  username?: string;
  password?: string;
  email?: string;
  token?: string;
}

export interface ErrorRecord {
  error_id: string;
  passport_id: string;
  agent_name: string;
  service: string;
  step: string;
  error: string;
  screenshot_url?: string;
  status: "pending_owner_action" | "resolved";
  actions: OwnerDecision[];
  decision?: OwnerDecision;
  manual_credentials?: ManualCredentials;
  created_at: string;
  resolved_at?: string;
}

export interface ReportErrorInput {
  passportId: string;
  agentName: string;
  service: string;
  step: string;
  error: string;
  screenshot?: Buffer;
}

export interface ReportErrorResult {
  error_id: string;
  status: "pending_owner_action";
  actions: OwnerDecision[];
}

export interface OwnerDecisionResult {
  decision?: OwnerDecision;
  manual_credentials?: ManualCredentials;
}

export class ErrorRecoveryService {
  private readonly errors = new Map<string, ErrorRecord>();

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Report an error and notify the owner via webhook.
   * Returns the error ID and available actions the owner can take.
   */
  async reportError(input: ReportErrorInput): Promise<ReportErrorResult> {
    const errorId = `err_${crypto.randomBytes(12).toString("hex")}`;
    const actions: OwnerDecision[] = ["retry", "skip", "manual"];

    const screenshotUrl = input.screenshot
      ? `data:image/png;base64,${input.screenshot.toString("base64")}`
      : undefined;

    const record: ErrorRecord = {
      error_id: errorId,
      passport_id: input.passportId,
      agent_name: input.agentName,
      service: input.service,
      step: input.step,
      error: input.error,
      screenshot_url: screenshotUrl,
      status: "pending_owner_action",
      actions,
      created_at: new Date().toISOString(),
    };

    this.errors.set(errorId, record);

    const event = this.webhookService.createEvent(
      "agent.error",
      { passport_id: input.passportId, name: input.agentName },
      {
        error_id: errorId,
        service: input.service,
        step: input.step,
        error: input.error,
        screenshot_url: screenshotUrl,
      },
      actions.map((action) => ({
        type: action,
        label: this.actionLabel(action),
        url: `https://dash.agentpass.dev/error/${errorId}/${action}`,
      })),
    );

    await this.webhookService.emit(event);

    return {
      error_id: errorId,
      status: "pending_owner_action",
      actions,
    };
  }

  /**
   * Check whether the owner has submitted a decision for the error.
   */
  getOwnerDecision(errorId: string): OwnerDecisionResult {
    const record = this.errors.get(errorId);

    if (!record || record.status !== "resolved") {
      return {};
    }

    return {
      decision: record.decision,
      manual_credentials: record.manual_credentials,
    };
  }

  /**
   * Submit the owner's decision for an error.
   */
  submitDecision(
    errorId: string,
    decision: OwnerDecision,
    manualCredentials?: ManualCredentials,
  ): boolean {
    const record = this.errors.get(errorId);

    if (!record || record.status !== "pending_owner_action") {
      return false;
    }

    record.decision = decision;
    record.manual_credentials = manualCredentials;
    record.status = "resolved";
    record.resolved_at = new Date().toISOString();
    return true;
  }

  /**
   * Human-readable label for an owner action.
   */
  private actionLabel(action: OwnerDecision): string {
    switch (action) {
      case "retry":
        return "Retry Operation";
      case "skip":
        return "Skip This Step";
      case "manual":
        return "Provide Manual Credentials";
    }
  }
}
