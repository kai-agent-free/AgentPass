import { describe, it, expect, beforeEach, vi } from "vitest";
import { CaptchaService } from "./captcha-service.js";
import { WebhookService } from "./webhook-service.js";
import type { ApiClient } from "./api-client.js";

describe("CaptchaService", () => {
  let captchaService: CaptchaService;
  let webhookService: WebhookService;

  beforeEach(() => {
    webhookService = new WebhookService();
    captchaService = new CaptchaService(webhookService);
  });

  describe("escalate", () => {
    it("should create an escalation record and emit webhook", async () => {
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const result = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      expect(result.escalation_id).toMatch(/^esc_/);
      expect(result.status).toBe("pending");

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.event).toBe("agent.captcha_needed");
      expect(emittedEvent.agent.passport_id).toBe("ap_aabbccddee00");
      expect(emittedEvent.agent.name).toBe("test-agent");
      expect(emittedEvent.data.captcha_type).toBe("recaptcha_v2");
      expect(emittedEvent.data.escalation_id).toBe(result.escalation_id);
      expect(emittedEvent.actions).toHaveLength(1);
      expect(emittedEvent.actions![0]!.type).toBe("solve");
      expect(emittedEvent.actions![0]!.url).toContain(result.escalation_id);
    });

    it("should include screenshot URL when buffer is provided", async () => {
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);
      const screenshot = Buffer.from("fake-png-data");

      const result = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "hcaptcha",
        screenshot,
      );

      expect(result.escalation_id).toMatch(/^esc_/);

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.data.screenshot_url).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    it("should not include screenshot URL when no buffer is provided", async () => {
      const emitSpy = vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      const emittedEvent = emitSpy.mock.calls[0]![0]!;
      expect(emittedEvent.data.screenshot_url).toBeUndefined();
    });
  });

  describe("checkResolution", () => {
    it("should return pending for a newly created escalation", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      const result = await captchaService.checkResolution(escalation_id);

      expect(result.resolved).toBe(false);
      expect(result.timed_out).toBeUndefined();
    });

    it("should return resolved after resolve is called", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      captchaService.resolve(escalation_id);

      const result = await captchaService.checkResolution(escalation_id);
      expect(result.resolved).toBe(true);
    });

    it("should return not resolved for unknown escalation ID", async () => {
      const result = await captchaService.checkResolution("esc_nonexistent");

      expect(result.resolved).toBe(false);
    });

    it("should detect timeout after the timeout period", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      // Manually set the created_at to the past to simulate timeout
      vi.spyOn(Date, "now").mockReturnValue(
        Date.now() + captchaService.getTimeout() + 1000,
      );

      const result = await captchaService.checkResolution(escalation_id);

      expect(result.resolved).toBe(false);
      expect(result.timed_out).toBe(true);

      vi.restoreAllMocks();
    });
  });

  describe("resolve", () => {
    it("should mark a pending escalation as resolved", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      const resolved = captchaService.resolve(escalation_id);

      expect(resolved).toBe(true);
    });

    it("should return false for non-existent escalation", () => {
      const resolved = captchaService.resolve("esc_nonexistent");

      expect(resolved).toBe(false);
    });

    it("should return false for already resolved escalation", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_aabbccddee00",
        "test-agent",
        "recaptcha_v2",
      );

      captchaService.resolve(escalation_id);
      const secondAttempt = captchaService.resolve(escalation_id);

      expect(secondAttempt).toBe(false);
    });
  });

  describe("getTimeout", () => {
    it("should return 300000 (5 minutes)", () => {
      expect(captchaService.getTimeout()).toBe(300_000);
    });
  });

  describe("escalate with API client", () => {
    let mockApiClient: ApiClient;
    let captchaServiceWithApi: CaptchaService;

    beforeEach(() => {
      mockApiClient = {
        createEscalation: vi.fn().mockResolvedValue({
          escalation_id: "api-esc-123",
          status: "pending",
          created_at: new Date().toISOString(),
        }),
        createBrowserSession: vi.fn().mockResolvedValue({
          session_id: "bs-456",
          escalation_id: "api-esc-123",
          created_at: new Date().toISOString(),
        }),
        updateBrowserScreenshot: vi.fn().mockResolvedValue(undefined),
        getEscalationStatus: vi.fn().mockResolvedValue({
          id: "api-esc-123",
          status: "pending",
          resolved_at: null,
        }),
      } as unknown as ApiClient;

      captchaServiceWithApi = new CaptchaService(webhookService, mockApiClient);
    });

    it("should create escalation and browser session via API", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);
      const screenshot = Buffer.from("fake-png");

      const result = await captchaServiceWithApi.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
        screenshot,
        "https://example.com/login",
      );

      expect(result.escalation_id).toBe("api-esc-123");
      expect(result.browser_session_id).toBe("bs-456");
      expect(result.status).toBe("pending");

      expect(mockApiClient.createEscalation).toHaveBeenCalledWith({
        passport_id: "ap_test",
        captcha_type: "recaptcha_v2",
        service: "test-agent",
        screenshot: screenshot.toString("base64"),
      });

      expect(mockApiClient.createBrowserSession).toHaveBeenCalledWith({
        escalation_id: "api-esc-123",
        page_url: "https://example.com/login",
      });

      expect(mockApiClient.updateBrowserScreenshot).toHaveBeenCalledWith(
        "bs-456",
        `data:image/png;base64,${screenshot.toString("base64")}`,
        "https://example.com/login",
      );
    });

    it("should create escalation without browser session when no screenshot", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const result = await captchaServiceWithApi.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
      );

      expect(result.escalation_id).toBe("api-esc-123");
      expect(result.browser_session_id).toBe("bs-456");
      expect(mockApiClient.createBrowserSession).toHaveBeenCalled();
      expect(mockApiClient.updateBrowserScreenshot).not.toHaveBeenCalled();
    });

    it("should fall back to local ID when API escalation fails", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);
      (mockApiClient.createEscalation as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API down"),
      );

      const result = await captchaServiceWithApi.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
      );

      expect(result.escalation_id).toMatch(/^esc_/);
      expect(result.browser_session_id).toBeUndefined();
    });

    it("should still create escalation when browser session creation fails", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);
      (mockApiClient.createBrowserSession as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Session creation failed"),
      );

      const result = await captchaServiceWithApi.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
        Buffer.from("fake"),
      );

      expect(result.escalation_id).toBe("api-esc-123");
      expect(result.browser_session_id).toBeUndefined();
    });

    it("should poll API for resolution status", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaServiceWithApi.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
      );

      // First poll: pending. Second poll: resolved.
      (mockApiClient.getEscalationStatus as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: escalation_id, status: "pending", resolved_at: null })
        .mockResolvedValueOnce({ id: escalation_id, status: "resolved", resolved_at: new Date().toISOString() });

      const result = await captchaServiceWithApi.checkResolution(escalation_id);
      expect(result.resolved).toBe(false);

      const result2 = await captchaServiceWithApi.checkResolution(escalation_id);
      expect(result2.resolved).toBe(true);
    });
  });

  describe("waitForResolution", () => {
    it("should return resolved when escalation is resolved", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
      );

      // Resolve after a short delay
      setTimeout(() => captchaService.resolve(escalation_id), 50);

      const result = await captchaService.waitForResolution(escalation_id, 30);
      expect(result.resolved).toBe(true);
    });

    it("should return timed_out when deadline exceeded", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
      );

      // Mock Date.now to simulate timeout
      const originalNow = Date.now;
      let callCount = 0;
      vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        // After first call (deadline calc), jump past the timeout
        if (callCount > 1) {
          return originalNow() + 400_000;
        }
        return originalNow();
      });

      const result = await captchaService.waitForResolution(escalation_id, 30);
      expect(result.resolved).toBe(false);
      expect(result.timed_out).toBe(true);

      vi.restoreAllMocks();
    });

    it("should stop polling when aborted", async () => {
      vi.spyOn(webhookService, "emit").mockResolvedValue(0);

      const { escalation_id } = await captchaService.escalate(
        "ap_test",
        "test-agent",
        "recaptcha_v2",
      );

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);

      const result = await captchaService.waitForResolution(escalation_id, 30, controller.signal);
      expect(result.resolved).toBe(false);
    });
  });
});
