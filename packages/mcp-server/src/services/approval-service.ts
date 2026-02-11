/**
 * Owner approval service.
 *
 * Manages per-domain permission levels (auto_approved, requires_approval,
 * blocked) and coordinates with the WebhookService to notify owners when
 * manual approval is needed.
 *
 * Approval states:
 *  - auto_approved  — action proceeds without owner interaction
 *  - requires_approval — webhook emitted, blocks until owner responds
 *  - blocked — action is immediately rejected
 */

import crypto from "node:crypto";
import type { WebhookService } from "./webhook-service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionLevel = "auto_approved" | "requires_approval" | "blocked";

export interface ApprovalRequest {
  passportId: string;
  agentName: string;
  action: string;
  details: Record<string, unknown>;
  domain?: string;
}

export interface ApprovalResult {
  approved: boolean;
  method: "auto" | "blocked" | "owner";
  approvalId?: string;
  reason?: string;
}

export interface PendingApproval {
  id: string;
  request: ApprovalRequest;
  status: "pending" | "approved" | "denied";
  reason?: string;
  created_at: string;
  resolved_at?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ApprovalService {
  private readonly webhookService: WebhookService;

  /** Per-domain permission overrides. Unlisted domains default to auto_approved. */
  private readonly permissionMap = new Map<string, PermissionLevel>();

  /** In-flight approvals waiting for an owner response. */
  private readonly pendingApprovals = new Map<string, PendingApproval>();

  /** Resolve callbacks for pending approvals. */
  private readonly resolvers = new Map<
    string,
    (result: ApprovalResult) => void
  >();

  constructor(webhookService: WebhookService) {
    this.webhookService = webhookService;
  }

  // -----------------------------------------------------------------------
  // Permission management
  // -----------------------------------------------------------------------

  /**
   * Configure the permission level for a domain.
   *
   * Pass `"auto_approved"` to allow actions without owner consent,
   * `"requires_approval"` to gate them behind a webhook handshake,
   * or `"blocked"` to deny them outright.
   */
  setPermissionLevel(domain: string, level: PermissionLevel): void {
    this.permissionMap.set(domain, level);
  }

  /**
   * Return the permission level for a domain, defaulting to `"auto_approved"`.
   */
  getPermissionLevel(domain: string): PermissionLevel {
    return this.permissionMap.get(domain) ?? "auto_approved";
  }

  // -----------------------------------------------------------------------
  // Approval flow
  // -----------------------------------------------------------------------

  /**
   * Request approval for an agent action.
   *
   * Depending on the domain's permission level the result is:
   *
   *  - `auto_approved`      → resolves immediately with `{ approved: true }`
   *  - `blocked`            → resolves immediately with `{ approved: false }`
   *  - `requires_approval`  → emits a webhook and waits for the owner to call
   *                           `submitResponse()`.
   */
  async requestApproval(input: ApprovalRequest): Promise<ApprovalResult> {
    const level = this.getPermissionLevel(input.domain ?? "*");

    if (level === "auto_approved") {
      return { approved: true, method: "auto" };
    }

    if (level === "blocked") {
      return { approved: false, method: "blocked" };
    }

    // --- requires_approval path ---
    const approvalId = `apr_${crypto.randomBytes(8).toString("hex")}`;

    const pending: PendingApproval = {
      id: approvalId,
      request: input,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    this.pendingApprovals.set(approvalId, pending);

    // Emit a webhook to notify the owner
    const event = this.webhookService.createEvent(
      "agent.approval_needed",
      { passport_id: input.passportId, name: input.agentName },
      {
        approval_id: approvalId,
        action: input.action,
        domain: input.domain,
        details: input.details,
      },
      [
        {
          type: "approve",
          label: "Approve",
          url: `/approvals/${approvalId}/approve`,
        },
        {
          type: "deny",
          label: "Deny",
          url: `/approvals/${approvalId}/deny`,
        },
      ],
    );

    await this.webhookService.emit(event);

    // Wait for the owner to respond (via submitResponse)
    return new Promise<ApprovalResult>((resolve) => {
      this.resolvers.set(approvalId, resolve);
    });
  }

  /**
   * Submit the owner's approval or denial for a pending request.
   */
  submitResponse(
    approvalId: string,
    approved: boolean,
    reason?: string,
  ): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending || pending.status !== "pending") {
      return false;
    }

    pending.status = approved ? "approved" : "denied";
    pending.reason = reason;
    pending.resolved_at = new Date().toISOString();

    const resolver = this.resolvers.get(approvalId);
    if (resolver) {
      resolver({
        approved,
        method: "owner",
        approvalId,
        reason,
      });
      this.resolvers.delete(approvalId);
    }

    return true;
  }

  /**
   * Look up a pending or resolved approval by ID.
   */
  getApproval(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }
}
