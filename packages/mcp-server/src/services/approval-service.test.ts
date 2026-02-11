import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApprovalService } from "./approval-service.js";
import { WebhookService } from "./webhook-service.js";

describe("ApprovalService", () => {
  let webhookService: WebhookService;
  let service: ApprovalService;

  beforeEach(() => {
    webhookService = new WebhookService();
    service = new ApprovalService(webhookService);
  });

  // -----------------------------------------------------------------------
  // auto_approved
  // -----------------------------------------------------------------------

  describe("auto-approved actions", () => {
    it("returns approved immediately for unlisted domains (default)", async () => {
      const result = await service.requestApproval({
        passportId: "ap_abc123",
        agentName: "test-agent",
        action: "register",
        details: { url: "https://example.com" },
        domain: "example.com",
      });

      expect(result.approved).toBe(true);
      expect(result.method).toBe("auto");
    });

    it("returns approved immediately for explicitly auto_approved domains", async () => {
      service.setPermissionLevel("github.com", "auto_approved");

      const result = await service.requestApproval({
        passportId: "ap_abc123",
        agentName: "test-agent",
        action: "login",
        details: {},
        domain: "github.com",
      });

      expect(result.approved).toBe(true);
      expect(result.method).toBe("auto");
    });
  });

  // -----------------------------------------------------------------------
  // blocked
  // -----------------------------------------------------------------------

  describe("blocked actions", () => {
    it("returns rejected immediately for blocked domains", async () => {
      service.setPermissionLevel("malware.example", "blocked");

      const result = await service.requestApproval({
        passportId: "ap_abc123",
        agentName: "test-agent",
        action: "register",
        details: {},
        domain: "malware.example",
      });

      expect(result.approved).toBe(false);
      expect(result.method).toBe("blocked");
    });
  });

  // -----------------------------------------------------------------------
  // requires_approval
  // -----------------------------------------------------------------------

  describe("requires_approval actions", () => {
    it("creates a pending request and emits a webhook", async () => {
      service.setPermissionLevel("sensitive.example", "requires_approval");

      // Mock emit to capture the event synchronously and resolve immediately
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      // Start the approval — do NOT await yet; it blocks until owner responds
      const approvalPromise = service.requestApproval({
        passportId: "ap_abc123",
        agentName: "test-agent",
        action: "register",
        details: { url: "https://sensitive.example" },
        domain: "sensitive.example",
      });

      // Let microtasks flush so emit() is awaited inside requestApproval
      await vi.waitFor(() => {
        expect(emitSpy).toHaveBeenCalledTimes(1);
      });

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.event).toBe("agent.approval_needed");
      expect(emittedEvent.agent.passport_id).toBe("ap_abc123");
      expect(emittedEvent.data.action).toBe("register");

      // Extract the approval ID from the emitted event data
      const approvalId = emittedEvent.data.approval_id as string;
      expect(approvalId).toMatch(/^apr_/);

      // The approval should be pending
      const pending = service.getApproval(approvalId);
      expect(pending).toBeDefined();
      expect(pending!.status).toBe("pending");

      // Owner approves — this resolves the promise
      const submitted = service.submitResponse(approvalId, true, "Looks good");
      expect(submitted).toBe(true);

      // Now we can safely await the result
      const result = await approvalPromise;
      expect(result.approved).toBe(true);
      expect(result.method).toBe("owner");
      expect(result.approvalId).toBe(approvalId);
      expect(result.reason).toBe("Looks good");
    });

    it("resolves with denied when owner rejects", async () => {
      service.setPermissionLevel("restricted.io", "requires_approval");
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const approvalPromise = service.requestApproval({
        passportId: "ap_def456",
        agentName: "another-agent",
        action: "register",
        details: {},
        domain: "restricted.io",
      });

      // Wait for emit to be called
      await vi.waitFor(() => {
        expect(emitSpy).toHaveBeenCalledTimes(1);
      });

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      const approvalId = emittedEvent.data.approval_id as string;

      // Owner denies
      service.submitResponse(approvalId, false, "Not authorised");

      const result = await approvalPromise;
      expect(result.approved).toBe(false);
      expect(result.method).toBe("owner");
      expect(result.reason).toBe("Not authorised");
    });

    it("updates the approval record after submission", async () => {
      service.setPermissionLevel("corp.dev", "requires_approval");
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const approvalPromise = service.requestApproval({
        passportId: "ap_789",
        agentName: "agent-3",
        action: "login",
        details: {},
        domain: "corp.dev",
      });

      await vi.waitFor(() => {
        expect(emitSpy).toHaveBeenCalledTimes(1);
      });

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      const approvalId = emittedEvent.data.approval_id as string;

      service.submitResponse(approvalId, true);
      await approvalPromise;

      const resolved = service.getApproval(approvalId);
      expect(resolved!.status).toBe("approved");
      expect(resolved!.resolved_at).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // submitResponse edge cases
  // -----------------------------------------------------------------------

  describe("submitResponse", () => {
    it("returns false for unknown approval ID", () => {
      const result = service.submitResponse("apr_nonexistent", true);
      expect(result).toBe(false);
    });

    it("returns false for already resolved approval", async () => {
      service.setPermissionLevel("test.dev", "requires_approval");
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const approvalPromise = service.requestApproval({
        passportId: "ap_abc",
        agentName: "agent",
        action: "register",
        details: {},
        domain: "test.dev",
      });

      await vi.waitFor(() => {
        expect(emitSpy).toHaveBeenCalledTimes(1);
      });

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      const approvalId = emittedEvent.data.approval_id as string;

      // First submission succeeds
      expect(service.submitResponse(approvalId, true)).toBe(true);
      await approvalPromise;

      // Second submission fails (already resolved)
      expect(service.submitResponse(approvalId, false)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setPermissionLevel / getPermissionLevel
  // -----------------------------------------------------------------------

  describe("setPermissionLevel / getPermissionLevel", () => {
    it("defaults to auto_approved for unknown domains", () => {
      expect(service.getPermissionLevel("unknown.com")).toBe("auto_approved");
    });

    it("changes behavior after being set", async () => {
      // Initially auto_approved
      const r1 = await service.requestApproval({
        passportId: "ap_1",
        agentName: "agent",
        action: "register",
        details: {},
        domain: "changeme.com",
      });
      expect(r1.approved).toBe(true);
      expect(r1.method).toBe("auto");

      // Block it
      service.setPermissionLevel("changeme.com", "blocked");

      const r2 = await service.requestApproval({
        passportId: "ap_1",
        agentName: "agent",
        action: "register",
        details: {},
        domain: "changeme.com",
      });
      expect(r2.approved).toBe(false);
      expect(r2.method).toBe("blocked");
    });

    it("stores and retrieves the correct level", () => {
      service.setPermissionLevel("a.com", "auto_approved");
      service.setPermissionLevel("b.com", "requires_approval");
      service.setPermissionLevel("c.com", "blocked");

      expect(service.getPermissionLevel("a.com")).toBe("auto_approved");
      expect(service.getPermissionLevel("b.com")).toBe("requires_approval");
      expect(service.getPermissionLevel("c.com")).toBe("blocked");
    });
  });

  // -----------------------------------------------------------------------
  // getApproval
  // -----------------------------------------------------------------------

  describe("getApproval", () => {
    it("returns undefined for unknown approval ID", () => {
      expect(service.getApproval("apr_nope")).toBeUndefined();
    });
  });
});
