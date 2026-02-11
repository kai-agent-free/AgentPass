import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "./auth-service.js";
import { IdentityService } from "./identity-service.js";
import { CredentialService } from "./credential-service.js";

describe("AuthService", () => {
  let authService: AuthService;
  let identityService: IdentityService;
  let credentialService: CredentialService;

  beforeEach(() => {
    identityService = new IdentityService();
    credentialService = new CredentialService();
    authService = new AuthService(identityService, credentialService);
  });

  describe("authenticate", () => {
    it("should return error for non-existent identity", async () => {
      const result = await authService.authenticate({
        passport_id: "ap_000000000000",
        service_url: "https://github.com",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Identity not found");
    });

    it("should return fallback_register when no credentials exist", async () => {
      const { passport } = identityService.createIdentity({
        name: "test-agent",
        owner_email: "owner@test.com",
      });

      const result = await authService.authenticate({
        passport_id: passport.passport_id,
        service_url: "https://github.com",
      });

      expect(result.success).toBe(false);
      expect(result.method).toBe("fallback_register");
      expect(result.requires_action).toBe("browser_registration");
      expect(result.service).toBe("github.com");
    });

    it("should return fallback_login when credentials exist", async () => {
      const { passport } = identityService.createIdentity({
        name: "test-agent",
        owner_email: "owner@test.com",
      });

      credentialService.storeCredential({
        passport_id: passport.passport_id,
        service: "github.com",
        username: "bot",
        password: "secret",
        email: "bot@test.com",
      });

      const result = await authService.authenticate({
        passport_id: passport.passport_id,
        service_url: "https://github.com/login",
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe("fallback_login");
      expect(result.requires_action).toBe("browser_login");
      expect(result.service).toBe("github.com");
    });

    it("should extract domain from URL correctly", async () => {
      const { passport } = identityService.createIdentity({
        name: "test-agent",
        owner_email: "owner@test.com",
      });

      const result = await authService.authenticate({
        passport_id: passport.passport_id,
        service_url: "https://app.example.com/signup?ref=123",
      });

      expect(result.service).toBe("app.example.com");
    });

    it("should handle URLs without protocol", async () => {
      const { passport } = identityService.createIdentity({
        name: "test-agent",
        owner_email: "owner@test.com",
      });

      const result = await authService.authenticate({
        passport_id: passport.passport_id,
        service_url: "github.com",
      });

      expect(result.service).toBe("github.com");
    });
  });

  describe("checkAuthStatus", () => {
    it("should return has_credentials: false when no credentials", () => {
      const { passport } = identityService.createIdentity({
        name: "test-agent",
        owner_email: "owner@test.com",
      });

      const status = authService.checkAuthStatus(
        passport.passport_id,
        "https://github.com",
      );

      expect(status.has_credentials).toBe(false);
      expect(status.service).toBe("github.com");
    });

    it("should return has_credentials: true when credentials exist", () => {
      const { passport } = identityService.createIdentity({
        name: "test-agent",
        owner_email: "owner@test.com",
      });

      credentialService.storeCredential({
        passport_id: passport.passport_id,
        service: "github.com",
        username: "bot",
        password: "secret",
        email: "bot@test.com",
      });

      const status = authService.checkAuthStatus(
        passport.passport_id,
        "https://github.com",
      );

      expect(status.has_credentials).toBe(true);
    });
  });
});
