import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FallbackAuthService,
  type BrowserOperations,
  type LoginResult,
  type RegistrationResult,
} from "./fallback-auth-service.js";
import { IdentityService } from "./identity-service.js";
import { CredentialService } from "./credential-service.js";
import { SessionService } from "./session-service.js";
import { WebhookService } from "./webhook-service.js";
import { EmailServiceAdapter } from "./email-service-adapter.js";

// ---------------------------------------------------------------------------
// Mock BrowserOperations
// ---------------------------------------------------------------------------

function createMockBrowserOps(overrides?: {
  login?: (
    url: string,
    creds: { username: string; password: string },
  ) => Promise<LoginResult>;
  register?: (
    url: string,
    opts: { email: string; password: string; name?: string },
  ) => Promise<RegistrationResult>;
}): BrowserOperations {
  return {
    login: overrides?.login ?? vi.fn<BrowserOperations["login"]>().mockResolvedValue({
      success: true,
      session_token: "tok_abc",
      cookies: "sid=xyz",
    }),
    register: overrides?.register ?? vi.fn<BrowserOperations["register"]>().mockResolvedValue({
      success: true,
      credentials: {
        username: "agent@agentpass.dev",
        password: "generated-pw",
        email: "agent@agentpass.dev",
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("FallbackAuthService", () => {
  let identityService: IdentityService;
  let credentialService: CredentialService;
  let sessionService: SessionService;
  let webhookService: WebhookService;
  let emailAdapter: EmailServiceAdapter;
  let browserOps: BrowserOperations;
  let service: FallbackAuthService;

  /** Helper: create an identity and return its passport_id. */
  function createTestIdentity(name = "test-agent"): string {
    const { passport } = identityService.createIdentity({
      name,
      owner_email: "owner@test.com",
    });
    return passport.passport_id;
  }

  beforeEach(() => {
    identityService = new IdentityService();
    credentialService = new CredentialService();
    sessionService = new SessionService();
    webhookService = new WebhookService();
    emailAdapter = new EmailServiceAdapter();
    browserOps = createMockBrowserOps();

    service = new FallbackAuthService(
      identityService,
      credentialService,
      sessionService,
      webhookService,
      emailAdapter,
      browserOps,
    );
  });

  // -----------------------------------------------------------------------
  // Identity not found
  // -----------------------------------------------------------------------

  describe("non-existent identity", () => {
    it("should return error when identity does not exist", async () => {
      const result = await service.authenticateOnService(
        "ap_does_not_exist",
        "https://github.com",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Identity not found");
      expect(result.passport_id).toBe("ap_does_not_exist");
      expect(result.service).toBe("github.com");
      expect(result.retries_used).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Session reuse
  // -----------------------------------------------------------------------

  describe("session reuse", () => {
    it("should return session_reuse when a valid session exists", async () => {
      const passportId = createTestIdentity();

      sessionService.createSession({
        passport_id: passportId,
        service: "github.com",
        token: "existing-token",
        cookies: "existing-cookies",
      });

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe("session_reuse");
      expect(result.session?.token).toBe("existing-token");
      expect(result.session?.cookies).toBe("existing-cookies");
      expect(result.retries_used).toBe(0);

      // Browser ops should NOT have been called
      expect(browserOps.login).not.toHaveBeenCalled();
      expect(browserOps.register).not.toHaveBeenCalled();
    });

    it("should NOT reuse an expired session", async () => {
      const passportId = createTestIdentity();

      sessionService.createSession({
        passport_id: passportId,
        service: "github.com",
        token: "old-token",
        ttl_ms: -1000, // already expired
      });

      // No credentials stored either — should attempt registration
      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.method).not.toBe("session_reuse");
    });
  });

  // -----------------------------------------------------------------------
  // Fallback login
  // -----------------------------------------------------------------------

  describe("fallback login", () => {
    it("should attempt login when credentials exist", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot-user",
        password: "s3cret",
        email: "bot@agentpass.dev",
      });

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe("fallback_login");
      expect(result.session?.token).toBe("tok_abc");
      expect(result.session?.cookies).toBeDefined();
      expect(result.retries_used).toBe(0);

      // Verify browser login was invoked with the correct URL and creds
      expect(browserOps.login).toHaveBeenCalledWith(
        "https://github.com/login",
        { username: "bot-user", password: "s3cret" },
      );
    });

    it("should create a session after successful login", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      await service.authenticateOnService(passportId, "https://github.com");

      expect(sessionService.hasValidSession(passportId, "github.com")).toBe(
        true,
      );
    });

    it("should retry login on failure up to max retries", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      const loginFn = vi
        .fn<BrowserOperations["login"]>()
        .mockResolvedValue({ success: false, error: "Network timeout" });

      browserOps = createMockBrowserOps({ login: loginFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(false);
      expect(result.method).toBe("fallback_login");
      expect(result.retries_used).toBe(2);
      expect(result.error).toBe("Network timeout");

      // 1 initial attempt + 2 retries = 3 calls
      expect(loginFn).toHaveBeenCalledTimes(3);
    });

    it("should stop retrying on CAPTCHA and return needs_human", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      const loginFn = vi.fn<BrowserOperations["login"]>().mockResolvedValue({
        success: false,
        captcha_detected: true,
        captcha_type: "recaptcha_v2",
        error: "CAPTCHA detected",
      });

      browserOps = createMockBrowserOps({ login: loginFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(false);
      expect(result.needs_human).toBe(true);
      expect(result.captcha_type).toBe("recaptcha_v2");
      // Only one attempt -- no retries after CAPTCHA
      expect(loginFn).toHaveBeenCalledTimes(1);
      expect(result.retries_used).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Fallback registration
  // -----------------------------------------------------------------------

  describe("fallback registration", () => {
    it("should attempt registration when no credentials exist", async () => {
      const passportId = createTestIdentity();

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe("fallback_register");
      expect(result.retries_used).toBe(0);

      // Browser register should have been called
      expect(browserOps.register).toHaveBeenCalledTimes(1);
      // Login should NOT have been called
      expect(browserOps.login).not.toHaveBeenCalled();
    });

    it("should store credentials after successful registration", async () => {
      const passportId = createTestIdentity();

      await service.authenticateOnService(passportId, "https://github.com");

      const stored = credentialService.getCredential(passportId, "github.com");
      expect(stored).not.toBeNull();
      expect(stored!.email).toBe("agent@agentpass.dev");
    });

    it("should create a session after successful registration", async () => {
      const passportId = createTestIdentity();

      await service.authenticateOnService(passportId, "https://github.com");

      expect(sessionService.hasValidSession(passportId, "github.com")).toBe(
        true,
      );
    });

    it("should handle CAPTCHA during registration", async () => {
      const passportId = createTestIdentity();

      const registerFn = vi
        .fn<BrowserOperations["register"]>()
        .mockResolvedValue({
          success: false,
          captcha_detected: true,
          captcha_type: "hcaptcha",
          error: "CAPTCHA detected during registration",
        });

      browserOps = createMockBrowserOps({ register: registerFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(false);
      expect(result.method).toBe("fallback_register");
      expect(result.needs_human).toBe(true);
      expect(result.captcha_type).toBe("hcaptcha");
      // Only one attempt -- no retries after CAPTCHA
      expect(registerFn).toHaveBeenCalledTimes(1);
    });

    it("should retry registration on failure up to max retries", async () => {
      const passportId = createTestIdentity();

      const registerFn = vi
        .fn<BrowserOperations["register"]>()
        .mockResolvedValue({
          success: false,
          error: "Form submission failed",
        });

      browserOps = createMockBrowserOps({ register: registerFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(false);
      expect(result.retries_used).toBe(2);
      expect(result.error).toBe("Form submission failed");
      // 1 initial + 2 retries = 3 calls
      expect(registerFn).toHaveBeenCalledTimes(3);
    });

    it("should handle email verification during registration", async () => {
      const passportId = createTestIdentity();

      const registerFn = vi
        .fn<BrowserOperations["register"]>()
        .mockResolvedValue({
          success: true,
          needs_email_verification: true,
          credentials: {
            username: "agent@agentpass.dev",
            password: "pw",
            email: "agent@agentpass.dev",
          },
        });

      const loginFn = vi
        .fn<BrowserOperations["login"]>()
        .mockResolvedValue({ success: true });

      // Mock the email adapter to return a verification email
      const mockEmail = {
        id: "email-1",
        to: "agent@agentpass.dev",
        from: "noreply@github.com",
        subject: "Verify your email",
        text: "Click here: https://github.com/verify?token=abc",
        html: '<a href="https://github.com/verify?token=abc">Verify</a>',
        received_at: new Date().toISOString(),
      };

      vi.spyOn(emailAdapter, "waitForEmail").mockResolvedValue(mockEmail);
      vi.spyOn(emailAdapter, "extractVerificationLink").mockReturnValue(
        "https://github.com/verify?token=abc",
      );

      browserOps = createMockBrowserOps({
        login: loginFn,
        register: registerFn,
      });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(true);
      expect(result.method).toBe("fallback_register");

      // Verification link should have been visited
      expect(loginFn).toHaveBeenCalledWith(
        "https://github.com/verify?token=abc",
        { username: "", password: "" },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Webhook events
  // -----------------------------------------------------------------------

  describe("webhook events", () => {
    it("should emit agent.logged_in on successful login", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      const emitSpy = vi.spyOn(webhookService, "emit");

      await service.authenticateOnService(passportId, "https://github.com");

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0]![0]!;
      expect(event.event).toBe("agent.logged_in");
      expect(event.data.service).toBe("github.com");
      expect(event.data.method).toBe("fallback_login");
    });

    it("should emit agent.login_failed after all login retries exhausted", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      const loginFn = vi
        .fn<BrowserOperations["login"]>()
        .mockResolvedValue({ success: false, error: "Auth failed" });

      browserOps = createMockBrowserOps({ login: loginFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const emitSpy = vi.spyOn(webhookService, "emit");

      await service.authenticateOnService(passportId, "https://github.com");

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0]![0]!;
      expect(event.event).toBe("agent.login_failed");
    });

    it("should emit agent.captcha_needed when CAPTCHA detected during login", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      const loginFn = vi.fn<BrowserOperations["login"]>().mockResolvedValue({
        success: false,
        captcha_detected: true,
        captcha_type: "recaptcha_v3",
      });

      browserOps = createMockBrowserOps({ login: loginFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const emitSpy = vi.spyOn(webhookService, "emit");

      await service.authenticateOnService(passportId, "https://github.com");

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0]![0]!;
      expect(event.event).toBe("agent.captcha_needed");
      expect(event.data.captcha_type).toBe("recaptcha_v3");
    });

    it("should emit agent.registered and agent.credential_stored on successful registration", async () => {
      const passportId = createTestIdentity();
      const emitSpy = vi.spyOn(webhookService, "emit");

      await service.authenticateOnService(passportId, "https://github.com");

      expect(emitSpy).toHaveBeenCalledTimes(2);

      const events = emitSpy.mock.calls.map((call) => call[0]!.event);
      expect(events).toContain("agent.registered");
      expect(events).toContain("agent.credential_stored");
    });

    it("should emit agent.captcha_needed when CAPTCHA detected during registration", async () => {
      const passportId = createTestIdentity();

      const registerFn = vi
        .fn<BrowserOperations["register"]>()
        .mockResolvedValue({
          success: false,
          captcha_detected: true,
          captcha_type: "hcaptcha",
        });

      browserOps = createMockBrowserOps({ register: registerFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const emitSpy = vi.spyOn(webhookService, "emit");

      await service.authenticateOnService(passportId, "https://github.com");

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0]![0]!;
      expect(event.event).toBe("agent.captcha_needed");
      expect(event.data.phase).toBe("registration");
    });

    it("should emit agent.error after all registration retries exhausted", async () => {
      const passportId = createTestIdentity();

      const registerFn = vi
        .fn<BrowserOperations["register"]>()
        .mockResolvedValue({ success: false, error: "Server error" });

      browserOps = createMockBrowserOps({ register: registerFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const emitSpy = vi.spyOn(webhookService, "emit");

      await service.authenticateOnService(passportId, "https://github.com");

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const event = emitSpy.mock.calls[0]![0]!;
      expect(event.event).toBe("agent.error");
      expect(event.data.phase).toBe("registration");
    });
  });

  // -----------------------------------------------------------------------
  // Retries
  // -----------------------------------------------------------------------

  describe("retry behaviour", () => {
    it("should succeed on second attempt after first failure (login)", async () => {
      const passportId = createTestIdentity();

      credentialService.storeCredential({
        passport_id: passportId,
        service: "github.com",
        username: "bot",
        password: "pw",
        email: "bot@test.com",
      });

      const loginFn = vi
        .fn<BrowserOperations["login"]>()
        .mockResolvedValueOnce({ success: false, error: "Timeout" })
        .mockResolvedValueOnce({
          success: true,
          session_token: "tok_retry",
        });

      browserOps = createMockBrowserOps({ login: loginFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(true);
      expect(result.retries_used).toBe(1);
      expect(loginFn).toHaveBeenCalledTimes(2);
    });

    it("should succeed on second attempt after first failure (registration)", async () => {
      const passportId = createTestIdentity();

      const registerFn = vi
        .fn<BrowserOperations["register"]>()
        .mockResolvedValueOnce({ success: false, error: "Timeout" })
        .mockResolvedValueOnce({
          success: true,
          credentials: {
            username: "agent@agentpass.dev",
            password: "pw",
            email: "agent@agentpass.dev",
          },
        });

      browserOps = createMockBrowserOps({ register: registerFn });
      service = new FallbackAuthService(
        identityService,
        credentialService,
        sessionService,
        webhookService,
        emailAdapter,
        browserOps,
      );

      const result = await service.authenticateOnService(
        passportId,
        "https://github.com",
      );

      expect(result.success).toBe(true);
      expect(result.retries_used).toBe(1);
      expect(registerFn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Domain extraction
  // -----------------------------------------------------------------------

  describe("domain extraction", () => {
    it("should extract domain from full URL", async () => {
      const passportId = createTestIdentity();

      const result = await service.authenticateOnService(
        passportId,
        "https://app.example.com/some/path?q=1",
      );

      expect(result.service).toBe("app.example.com");
    });

    it("should handle URL without protocol", async () => {
      const passportId = createTestIdentity();

      const result = await service.authenticateOnService(
        passportId,
        "github.com",
      );

      expect(result.service).toBe("github.com");
    });
  });
});
