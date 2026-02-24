import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AgentPassClient,
  createVerificationMiddleware,
  generateWellKnownConfig,
} from "./index.js";

describe("AgentPassClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  describe("verifyPassport", () => {
    it("sends correct POST request and returns result", async () => {
      const verifyResult = {
        valid: true,
        passport_id: "ap_abc123",
        trust_score: 5,
        status: "active",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => verifyResult,
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.verifyPassport(
        "ap_abc123",
        "challenge-hex",
        "signature-b64",
      );

      expect(result).toEqual(verifyResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/verify",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passport_id: "ap_abc123",
            challenge: "challenge-hex",
            signature: "signature-b64",
          }),
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Passport not found" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(
        client.verifyPassport("ap_unknown", "ch", "sig"),
      ).rejects.toThrow("Passport not found");
    });

    it("strips trailing slashes from apiUrl", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, passport_id: "ap_1", trust_score: 0, status: "active" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space///" },
        mockFetch,
      );

      await client.verifyPassport("ap_1", "ch", "sig");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/verify",
        expect.anything(),
      );
    });
  });

  describe("getPassport", () => {
    it("sends correct GET request and returns passport info", async () => {
      const passportInfo = {
        id: "ap_abc123",
        public_key: "pk-base64url",
        name: "test-agent",
        description: "A test agent",
        owner_email: "owner@example.com",
        trust_score: 10,
        status: "active",
        created_at: "2025-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => passportInfo,
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.getPassport("ap_abc123");

      expect(result).toEqual(passportInfo);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/passports/ap_abc123",
        expect.objectContaining({
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(client.getPassport("ap_nope")).rejects.toThrow("Not found");
    });
  });

  describe("reportAbuse", () => {
    it("sends correct POST request and returns result", async () => {
      const abuseResult = { success: true, message: "Report filed" };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => abuseResult,
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.reportAbuse("ap_abc123", "spam activity");

      expect(result).toEqual(abuseResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/passports/ap_abc123/report-abuse",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "spam activity" }),
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server error" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(
        client.reportAbuse("ap_abc123", "spam"),
      ).rejects.toThrow("Server error");
    });
  });

  describe("sendMessage", () => {
    it("sends correct POST request and returns result", async () => {
      const sendResult = {
        id: "msg-uuid-1",
        from_passport_id: "ap_sender",
        to_passport_id: "ap_receiver",
        subject: "Hello",
        created_at: "2026-02-24T00:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => sendResult,
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.sendMessage(
        "ap_sender",
        "ap_receiver",
        "Hello",
        "Hi there!",
      );

      expect(result).toEqual(sendResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/messages",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from_passport_id: "ap_sender",
            to_passport_id: "ap_receiver",
            subject: "Hello",
            body: "Hi there!",
          }),
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "You do not own this passport" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(
        client.sendMessage("ap_sender", "ap_receiver", "Hi", "Body"),
      ).rejects.toThrow("You do not own this passport");
    });
  });

  describe("getInbox", () => {
    it("sends correct GET request and returns inbox", async () => {
      const inboxResult = {
        messages: [
          {
            id: "msg-1",
            from_passport_id: "ap_other",
            to_passport_id: "ap_mine",
            subject: "Test",
            body: "Hello",
            read: false,
            created_at: "2026-02-24T00:00:00Z",
          },
        ],
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => inboxResult,
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.getInbox("ap_mine");

      expect(result).toEqual(inboxResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/messages?passport_id=ap_mine",
        expect.objectContaining({
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Passport not found or not owned by you" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(client.getInbox("ap_nope")).rejects.toThrow(
        "Passport not found or not owned by you",
      );
    });
  });

  describe("getMessage", () => {
    it("sends correct GET request and returns message", async () => {
      const message = {
        id: "msg-1",
        from_passport_id: "ap_sender",
        to_passport_id: "ap_receiver",
        subject: "Hi",
        body: "Hello!",
        read: true,
        created_at: "2026-02-24T00:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => message,
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.getMessage("msg-1");

      expect(result).toEqual(message);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/messages/msg-1",
        expect.objectContaining({
          method: "GET",
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Message not found" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(client.getMessage("msg-nope")).rejects.toThrow(
        "Message not found",
      );
    });
  });

  describe("deleteMessage", () => {
    it("sends correct DELETE request and returns result", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ deleted: true }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      const result = await client.deleteMessage("msg-1");

      expect(result).toEqual({ deleted: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.agentpass.space/messages/msg-1",
        expect.objectContaining({
          method: "DELETE",
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Message not found" }),
      });

      const client = new AgentPassClient(
        { apiUrl: "https://api.agentpass.space" },
        mockFetch,
      );

      await expect(client.deleteMessage("msg-nope")).rejects.toThrow(
        "Message not found",
      );
    });
  });
});

describe("generateWellKnownConfig", () => {
  it("returns correct structure with default capabilities", () => {
    const config = generateWellKnownConfig({
      authEndpoint: "/api/auth/agent",
    });

    expect(config).toEqual({
      agentpass: true,
      auth_endpoint: "/api/auth/agent",
      capabilities: ["ed25519-verification"],
    });
  });

  it("uses custom capabilities when provided", () => {
    const config = generateWellKnownConfig({
      authEndpoint: "/auth",
      capabilities: ["ed25519-verification", "trust-scoring"],
    });

    expect(config.capabilities).toEqual([
      "ed25519-verification",
      "trust-scoring",
    ]);
  });

  it("sets agentpass to true", () => {
    const config = generateWellKnownConfig({ authEndpoint: "/auth" });
    expect(config.agentpass).toBe(true);
  });
});

describe("createVerificationMiddleware", () => {
  it("returns a function", () => {
    const verifyFn = createVerificationMiddleware({
      apiUrl: "https://api.agentpass.space",
    });

    expect(typeof verifyFn).toBe("function");
  });

  it("returns null when headers are missing", async () => {
    const verifyFn = createVerificationMiddleware({
      apiUrl: "https://api.agentpass.space",
    });

    const result = await verifyFn({
      get: () => null,
    });

    expect(result).toBeNull();
  });

  it("returns null when X-AgentPass-ID is missing", async () => {
    const verifyFn = createVerificationMiddleware({
      apiUrl: "https://api.agentpass.space",
    });

    const result = await verifyFn({
      get: (name: string) => (name === "X-AgentPass-Signature" ? "sig" : null),
    });

    expect(result).toBeNull();
  });

  it("returns agent context on successful verification", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        passport_id: "ap_abc123",
        trust_score: 5,
        status: "active",
      }),
    });

    const verifyFn = createVerificationMiddleware(
      { apiUrl: "https://api.agentpass.space" },
      mockFetch,
    );

    const result = await verifyFn({
      get: (name: string) => {
        if (name === "X-AgentPass-ID") return "ap_abc123";
        if (name === "X-AgentPass-Signature") return "valid-sig";
        return null;
      },
    });

    expect(result).toEqual({
      passport_id: "ap_abc123",
      valid: true,
      trust_score: 5,
      status: "active",
    });
  });

  it("returns null when verification returns valid=false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: false,
        passport_id: "ap_abc123",
        trust_score: 0,
        status: "active",
      }),
    });

    const verifyFn = createVerificationMiddleware(
      { apiUrl: "https://api.agentpass.space" },
      mockFetch,
    );

    const result = await verifyFn({
      get: (name: string) => {
        if (name === "X-AgentPass-ID") return "ap_abc123";
        if (name === "X-AgentPass-Signature") return "bad-sig";
        return null;
      },
    });

    expect(result).toBeNull();
  });

  it("returns null when API call throws", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const verifyFn = createVerificationMiddleware(
      { apiUrl: "https://api.agentpass.space" },
      mockFetch,
    );

    const result = await verifyFn({
      get: (name: string) => {
        if (name === "X-AgentPass-ID") return "ap_abc123";
        if (name === "X-AgentPass-Signature") return "sig";
        return null;
      },
    });

    expect(result).toBeNull();
  });
});
