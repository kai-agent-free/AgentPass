import { describe, it, expect, beforeEach } from "vitest";
import { EmailServiceAdapter } from "../services/email-service-adapter.js";

describe("EmailServiceAdapter", () => {
  let service: EmailServiceAdapter;

  beforeEach(() => {
    service = new EmailServiceAdapter();
  });

  describe("getEmailAddress", () => {
    it("should return a valid email address for an agent name", () => {
      const address = service.getEmailAddress("my-agent");
      expect(address).toBe("my-agent@agentpass.dev");
    });

    it("should sanitize agent names with special characters", () => {
      const address = service.getEmailAddress("My Agent 42");
      expect(address).toBe("my-agent-42@agentpass.dev");
    });

    it("should throw for empty/invalid agent names", () => {
      expect(() => service.getEmailAddress("!!!")).toThrow();
    });
  });

  describe("listEmails", () => {
    it("should return empty array for new address", () => {
      const emails = service.listEmails("fresh@agentpass.dev");
      expect(emails).toEqual([]);
    });
  });

  describe("addTestEmail + listEmails", () => {
    it("should store and retrieve an email", () => {
      service.addTestEmail({
        id: "test-001",
        to: "bot@agentpass.dev",
        from: "noreply@example.com",
        subject: "Welcome",
        body: "Hello, bot!",
        received_at: new Date().toISOString(),
      });

      const emails = service.listEmails("bot@agentpass.dev");
      expect(emails).toHaveLength(1);
      expect(emails[0]!.id).toBe("test-001");
      expect(emails[0]!.subject).toBe("Welcome");
    });

    it("should store multiple emails for the same address", () => {
      const addr = "multi@agentpass.dev";

      service.addTestEmail({
        id: "e1",
        to: addr,
        from: "a@example.com",
        subject: "First",
        body: "one",
        received_at: "2025-01-01T00:00:00Z",
      });

      service.addTestEmail({
        id: "e2",
        to: addr,
        from: "b@example.com",
        subject: "Second",
        body: "two",
        received_at: "2025-01-02T00:00:00Z",
      });

      const emails = service.listEmails(addr);
      expect(emails).toHaveLength(2);
    });
  });

  describe("readEmail", () => {
    it("should return the email by ID", () => {
      service.addTestEmail({
        id: "read-test",
        to: "bot@agentpass.dev",
        from: "sender@example.com",
        subject: "Test",
        body: "Body content",
        received_at: new Date().toISOString(),
      });

      const email = service.readEmail("read-test");
      expect(email).toBeDefined();
      expect(email!.body).toBe("Body content");
    });

    it("should return undefined for unknown ID", () => {
      const email = service.readEmail("nonexistent");
      expect(email).toBeUndefined();
    });
  });

  describe("extractVerificationLink", () => {
    it("should find a verification URL in the email body", () => {
      service.addTestEmail({
        id: "verify-1",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "Verify your email",
        body: "Click here to verify: https://service.com/verify?token=abc123",
        received_at: new Date().toISOString(),
      });

      const link = service.extractVerificationLink("verify-1");
      expect(link).toBe("https://service.com/verify?token=abc123");
    });

    it("should find a verification URL in HTML", () => {
      service.addTestEmail({
        id: "verify-2",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "Confirm account",
        body: "Please confirm",
        html: '<a href="https://service.com/confirm?t=xyz">Confirm</a>',
        received_at: new Date().toISOString(),
      });

      const link = service.extractVerificationLink("verify-2");
      expect(link).toBe("https://service.com/confirm?t=xyz");
    });

    it("should return undefined when no link found", () => {
      service.addTestEmail({
        id: "no-link",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "Hello",
        body: "No links here.",
        received_at: new Date().toISOString(),
      });

      const link = service.extractVerificationLink("no-link");
      expect(link).toBeUndefined();
    });

    it("should return undefined for unknown email ID", () => {
      const link = service.extractVerificationLink("unknown-id");
      expect(link).toBeUndefined();
    });
  });

  describe("extractOtpCode", () => {
    it("should find a code with 'code is XXXXXX' pattern", () => {
      service.addTestEmail({
        id: "otp-1",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "Your code",
        body: "Your verification code is 482916",
        received_at: new Date().toISOString(),
      });

      const code = service.extractOtpCode("otp-1");
      expect(code).toBe("482916");
    });

    it("should find a code with 'OTP: XXXX' pattern", () => {
      service.addTestEmail({
        id: "otp-2",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "OTP",
        body: "Your OTP: 7890",
        received_at: new Date().toISOString(),
      });

      const code = service.extractOtpCode("otp-2");
      expect(code).toBe("7890");
    });

    it("should extract code from HTML email body", () => {
      service.addTestEmail({
        id: "otp-3",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "Verification",
        body: "",
        html: "<p>Your code is <strong>553201</strong></p>",
        received_at: new Date().toISOString(),
      });

      const code = service.extractOtpCode("otp-3");
      expect(code).toBe("553201");
    });

    it("should return undefined when no code found", () => {
      service.addTestEmail({
        id: "no-otp",
        to: "bot@agentpass.dev",
        from: "noreply@service.com",
        subject: "Newsletter",
        body: "No codes here, just text.",
        received_at: new Date().toISOString(),
      });

      const code = service.extractOtpCode("no-otp");
      expect(code).toBeUndefined();
    });

    it("should return undefined for unknown email ID", () => {
      const code = service.extractOtpCode("unknown-id");
      expect(code).toBeUndefined();
    });
  });

  describe("waitForEmail", () => {
    it("should resolve immediately if email already exists", async () => {
      service.addTestEmail({
        id: "existing",
        to: "bot@agentpass.dev",
        from: "noreply@example.com",
        subject: "Already here",
        body: "This email already arrived",
        received_at: new Date().toISOString(),
      });

      const email = await service.waitForEmail("bot@agentpass.dev");
      expect(email.id).toBe("existing");
    });

    it("should resolve when email arrives within timeout", async () => {
      const addr = "wait-test@agentpass.dev";

      // Add email after a short delay
      setTimeout(() => {
        service.addTestEmail({
          id: "delayed",
          to: addr,
          from: "noreply@example.com",
          subject: "Delayed delivery",
          body: "Arrived!",
          received_at: new Date().toISOString(),
        });
      }, 100);

      const email = await service.waitForEmail(addr, undefined, 5000);
      expect(email.id).toBe("delayed");
    });

    it("should reject on timeout if no email arrives", async () => {
      await expect(
        service.waitForEmail("empty@agentpass.dev", undefined, 300),
      ).rejects.toThrow("Timed out");
    });
  });
});
