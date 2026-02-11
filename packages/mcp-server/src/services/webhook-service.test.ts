import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebhookService } from "./webhook-service.js";

describe("WebhookService", () => {
  let service: WebhookService;

  beforeEach(() => {
    service = new WebhookService();
  });

  describe("webhook config management", () => {
    it("should add and list webhooks", () => {
      service.addWebhook({ url: "https://example.com/hook" });
      service.addWebhook({
        url: "https://other.com/hook",
        secret: "s3cret",
      });

      const hooks = service.listWebhooks();
      expect(hooks).toHaveLength(2);
      expect(hooks[0]!.url).toBe("https://example.com/hook");
      expect(hooks[1]!.secret).toBe("s3cret");
    });

    it("should remove a webhook by URL", () => {
      service.addWebhook({ url: "https://example.com/hook" });
      expect(service.removeWebhook("https://example.com/hook")).toBe(true);
      expect(service.listWebhooks()).toHaveLength(0);
    });

    it("should return false when removing non-existent webhook", () => {
      expect(service.removeWebhook("https://nope.com")).toBe(false);
    });
  });

  describe("createEvent", () => {
    it("should create a properly structured event", () => {
      const event = service.createEvent(
        "agent.registered",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
        { service: "github.com" },
      );

      expect(event.event).toBe("agent.registered");
      expect(event.agent.passport_id).toBe("ap_aabbccddee00");
      expect(event.data.service).toBe("github.com");
      expect(event.timestamp).toBeTruthy();
    });

    it("should include actions when provided", () => {
      const event = service.createEvent(
        "agent.captcha_needed",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
        {},
        [
          {
            type: "solve",
            label: "Solve CAPTCHA",
            url: "https://dash.agentpass.dev/solve/123",
          },
        ],
      );

      expect(event.actions).toHaveLength(1);
      expect(event.actions![0]!.type).toBe("solve");
    });
  });

  describe("emit", () => {
    it("should log events even without webhooks configured", async () => {
      const event = service.createEvent(
        "agent.registered",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
      );

      const delivered = await service.emit(event);
      expect(delivered).toBe(0);
      expect(service.getEventLog()).toHaveLength(1);
    });

    it("should deliver to matching webhooks", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      service.addWebhook({ url: "https://example.com/hook" });

      const event = service.createEvent(
        "agent.registered",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
      );

      const delivered = await service.emit(event);
      expect(delivered).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/hook",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(event),
        }),
      );

      vi.unstubAllGlobals();
    });

    it("should filter by event type when configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      service.addWebhook({
        url: "https://example.com/hook",
        events: ["agent.error"],
      });

      const event = service.createEvent(
        "agent.registered",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
      );

      const delivered = await service.emit(event);
      expect(delivered).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it("should include secret header when configured", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      service.addWebhook({
        url: "https://example.com/hook",
        secret: "my-secret",
      });

      const event = service.createEvent(
        "agent.registered",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
      );

      await service.emit(event);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/hook",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-AgentPass-Secret": "my-secret",
          }),
        }),
      );

      vi.unstubAllGlobals();
    });

    it("should handle delivery failures gracefully", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal("fetch", mockFetch);

      service.addWebhook({ url: "https://example.com/hook" });

      const event = service.createEvent(
        "agent.error",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
      );

      const delivered = await service.emit(event);
      expect(delivered).toBe(0);

      const log = service.getDeliveryLog();
      expect(log).toHaveLength(1);
      expect(log[0]!.status).toBe("failed");

      vi.unstubAllGlobals();
    });
  });

  describe("event log", () => {
    it("should track all emitted events", async () => {
      service.createEvent(
        "agent.registered",
        { passport_id: "ap_aabbccddee00", name: "test-agent" },
      );

      await service.emit(
        service.createEvent("agent.registered", {
          passport_id: "ap_aabbccddee00",
          name: "test-agent",
        }),
      );
      await service.emit(
        service.createEvent("agent.logged_in", {
          passport_id: "ap_aabbccddee00",
          name: "test-agent",
        }),
      );

      const log = service.getEventLog();
      expect(log).toHaveLength(2);
      expect(log[0]!.event).toBe("agent.registered");
      expect(log[1]!.event).toBe("agent.logged_in");
    });
  });
});
