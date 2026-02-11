import { describe, it, expect, beforeEach, vi } from "vitest";
import { NativeAuthService, type FetchFn } from "./native-auth-service.js";

describe("NativeAuthService", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let service: NativeAuthService;

  beforeEach(() => {
    mockFetch = vi.fn();
    service = new NativeAuthService(mockFetch as unknown as FetchFn);
  });

  describe("checkNativeSupport", () => {
    it("should return supported when .well-known/agentpass.json exists", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          agentpass: true,
          auth_endpoint: "/api/agentpass/auth",
          capabilities: ["challenge-response", "session-tokens"],
        }),
      });

      const result = await service.checkNativeSupport("https://example.com");

      expect(result.supported).toBe(true);
      expect(result.auth_endpoint).toBe("/api/agentpass/auth");
      expect(result.capabilities).toEqual([
        "challenge-response",
        "session-tokens",
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/agentpass.json",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should return not supported when endpoint returns 404", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await service.checkNativeSupport("https://example.com");

      expect(result.supported).toBe(false);
      expect(result.auth_endpoint).toBeUndefined();
      expect(result.capabilities).toBeUndefined();
    });

    it("should return not supported when config is invalid", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ agentpass: false }),
      });

      const result = await service.checkNativeSupport("https://example.com");

      expect(result.supported).toBe(false);
    });

    it("should return not supported when config has no auth_endpoint", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ agentpass: true }),
      });

      const result = await service.checkNativeSupport("https://example.com");

      expect(result.supported).toBe(false);
    });

    it("should handle fetch errors (network down)", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await service.checkNativeSupport("https://example.com");

      expect(result.supported).toBe(false);
    });

    it("should normalize URLs without protocol", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await service.checkNativeSupport("example.com");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/agentpass.json",
        expect.anything(),
      );
    });

    it("should strip trailing slashes from URL", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await service.checkNativeSupport("https://example.com/");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/agentpass.json",
        expect.anything(),
      );
    });
  });

  describe("authenticateNative", () => {
    const passportId = "ap_aabbccddee00";
    const serviceUrl = "https://example.com";
    const fakePrivateKey = "fake-private-key-base64url";

    it("should complete the full native auth flow successfully", async () => {
      // Mock well-known discovery
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            agentpass: true,
            auth_endpoint: "/api/agentpass/auth",
          }),
        })
        // Mock challenge request
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ challenge: "abc123challenge" }),
        })
        // Mock verify request
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session_token: "tok_xyz789",
            trust_score: 0.95,
          }),
        });

      // We need to mock signChallenge since we don't have a real key
      const signModule = await import("@agentpass/core");
      const signSpy = vi
        .spyOn(signModule, "signChallenge")
        .mockReturnValue("mock-signature");

      const result = await service.authenticateNative(
        passportId,
        serviceUrl,
        fakePrivateKey,
      );

      expect(result.success).toBe(true);
      expect(result.session_token).toBe("tok_xyz789");
      expect(result.trust_score).toBe(0.95);
      expect(result.error).toBeUndefined();

      // Verify the challenge endpoint was called with passport_id
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/agentpass/auth/challenge",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ passport_id: passportId }),
        }),
      );

      // Verify the verify endpoint was called with signed challenge
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/agentpass/auth/verify",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            passport_id: passportId,
            challenge: "abc123challenge",
            signature: "mock-signature",
          }),
        }),
      );

      signSpy.mockRestore();
    });

    it("should return error when service does not support native auth", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await service.authenticateNative(
        passportId,
        serviceUrl,
        fakePrivateKey,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not support AgentPass");
    });

    it("should return error when challenge request fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            agentpass: true,
            auth_endpoint: "/api/agentpass/auth",
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await service.authenticateNative(
        passportId,
        serviceUrl,
        fakePrivateKey,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Challenge request failed: 500");
    });

    it("should return error when verification fails", async () => {
      const signModule = await import("@agentpass/core");
      const signSpy = vi
        .spyOn(signModule, "signChallenge")
        .mockReturnValue("mock-signature");

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            agentpass: true,
            auth_endpoint: "/api/agentpass/auth",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ challenge: "abc123challenge" }),
        })
        .mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await service.authenticateNative(
        passportId,
        serviceUrl,
        fakePrivateKey,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Verification failed: 403");

      signSpy.mockRestore();
    });

    it("should handle network errors during authentication", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            agentpass: true,
            auth_endpoint: "/api/agentpass/auth",
          }),
        })
        .mockRejectedValueOnce(new Error("Connection refused"));

      const result = await service.authenticateNative(
        passportId,
        serviceUrl,
        fakePrivateKey,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Native authentication failed");
      expect(result.error).toContain("Connection refused");
    });

    it("should resolve relative auth endpoints correctly", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            agentpass: true,
            auth_endpoint: "https://auth.example.com/v1",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ challenge: "test" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ session_token: "tok_abc" }),
        });

      const signModule = await import("@agentpass/core");
      const signSpy = vi
        .spyOn(signModule, "signChallenge")
        .mockReturnValue("sig");

      await service.authenticateNative(passportId, serviceUrl, fakePrivateKey);

      // Should use the absolute auth endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/v1/challenge",
        expect.anything(),
      );

      signSpy.mockRestore();
    });
  });
});
