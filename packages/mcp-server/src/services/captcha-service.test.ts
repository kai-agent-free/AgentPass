import { describe, it, expect, beforeEach, vi } from "vitest";
import { CaptchaService } from "./captcha-service.js";
import { WebhookService } from "./webhook-service.js";

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
});
