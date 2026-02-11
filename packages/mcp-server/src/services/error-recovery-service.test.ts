import { describe, it, expect, beforeEach, vi } from "vitest";
import { ErrorRecoveryService } from "./error-recovery-service.js";
import { WebhookService } from "./webhook-service.js";

describe("ErrorRecoveryService", () => {
  let errorService: ErrorRecoveryService;
  let webhookService: WebhookService;

  beforeEach(() => {
    webhookService = new WebhookService();
    errorService = new ErrorRecoveryService(webhookService);
  });

  describe("reportError", () => {
    it("should create an error record and emit webhook", async () => {
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const result = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "registration_form_submit",
        error: "Form validation failed: email already in use",
      });

      expect(result.error_id).toMatch(/^err_/);
      expect(result.status).toBe("pending_owner_action");
      expect(result.actions).toEqual(["retry", "skip", "manual"]);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.event).toBe("agent.error");
      expect(emittedEvent.agent.passport_id).toBe("ap_aabbccddee00");
      expect(emittedEvent.agent.name).toBe("test-agent");
      expect(emittedEvent.data.service).toBe("github.com");
      expect(emittedEvent.data.step).toBe("registration_form_submit");
      expect(emittedEvent.data.error).toBe(
        "Form validation failed: email already in use",
      );
      expect(emittedEvent.data.error_id).toBe(result.error_id);
    });

    it("should include screenshot URL when buffer is provided", async () => {
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Unexpected page layout",
        screenshot: Buffer.from("fake-screenshot"),
      });

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.data.screenshot_url).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    it("should include actions in the webhook event", async () => {
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const result = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Login failed",
      });

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.actions).toHaveLength(3);

      const actionTypes = emittedEvent.actions!.map((a) => a.type);
      expect(actionTypes).toEqual(["retry", "skip", "manual"]);

      // Each action should have a URL with the error ID
      for (const action of emittedEvent.actions!) {
        expect(action.url).toContain(result.error_id);
        expect(action.label).toBeTruthy();
      }
    });
  });

  describe("getOwnerDecision", () => {
    it("should return empty object for pending error", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { error_id } = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Login failed",
      });

      const decision = errorService.getOwnerDecision(error_id);

      expect(decision.decision).toBeUndefined();
      expect(decision.manual_credentials).toBeUndefined();
    });

    it("should return decision after owner submits", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { error_id } = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Login failed",
      });

      errorService.submitDecision(error_id, "retry");

      const result = errorService.getOwnerDecision(error_id);

      expect(result.decision).toBe("retry");
    });

    it("should return manual credentials when provided", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { error_id } = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Login failed",
      });

      errorService.submitDecision(error_id, "manual", {
        username: "manual-user",
        password: "manual-pass",
        email: "manual@test.com",
      });

      const result = errorService.getOwnerDecision(error_id);

      expect(result.decision).toBe("manual");
      expect(result.manual_credentials).toEqual({
        username: "manual-user",
        password: "manual-pass",
        email: "manual@test.com",
      });
    });

    it("should return empty for non-existent error ID", () => {
      const result = errorService.getOwnerDecision("err_nonexistent");

      expect(result.decision).toBeUndefined();
      expect(result.manual_credentials).toBeUndefined();
    });
  });

  describe("submitDecision", () => {
    it("should store the decision for a pending error", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { error_id } = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Login failed",
      });

      const success = errorService.submitDecision(error_id, "skip");

      expect(success).toBe(true);
    });

    it("should return false for non-existent error", () => {
      const success = errorService.submitDecision("err_nonexistent", "retry");

      expect(success).toBe(false);
    });

    it("should return false for already resolved error", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { error_id } = await errorService.reportError({
        passportId: "ap_aabbccddee00",
        agentName: "test-agent",
        service: "github.com",
        step: "login",
        error: "Login failed",
      });

      errorService.submitDecision(error_id, "retry");
      const secondAttempt = errorService.submitDecision(error_id, "skip");

      expect(secondAttempt).toBe(false);
    });

    it("should accept all three decision types", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const decisions = ["retry", "skip", "manual"] as const;

      for (const decision of decisions) {
        const { error_id } = await errorService.reportError({
          passportId: "ap_aabbccddee00",
          agentName: "test-agent",
          service: "github.com",
          step: "login",
          error: `Test error for ${decision}`,
        });

        const success = errorService.submitDecision(error_id, decision);
        expect(success).toBe(true);

        const result = errorService.getOwnerDecision(error_id);
        expect(result.decision).toBe(decision);
      }
    });
  });
});
