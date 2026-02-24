/**
 * Integration test: Fallback Registration Flow
 *
 * Tests the full fallback registration flow for an agent.
 * Note: Full end-to-end browser testing is marked as skip because it
 * requires browser automation setup and real services.
 *
 * This test verifies:
 * 1. Identity creation
 * 2. Email address generation
 * 3. Credential storage
 * 4. Registration strategy validation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CredentialVault, generateKeyPair } from "@agentpass/core";
import { IdentityService } from "../services/identity-service.js";
import { EmailServiceAdapter } from "../services/email-service-adapter.js";
import { createMockApiClient } from "../test-helpers.js";

describe("Integration: Fallback Registration Flow", () => {
  let identityService: IdentityService;
  let emailService: EmailServiceAdapter;
  let vault: CredentialVault;
  const testDbPath = ":memory:";

  beforeEach(async () => {
    const { privateKey } = generateKeyPair();
    vault = new CredentialVault(testDbPath, privateKey);
    await vault.init();

    identityService = new IdentityService();
    await identityService.init(vault, createMockApiClient());
    emailService = new EmailServiceAdapter();
  });

  afterEach(async () => {
    if (vault) {
      vault.close();
    }
  });

  it("should prepare agent for fallback registration", async () => {
    // Step 1: Create agent identity
    const { passport } = await identityService.createIdentity({
      name: "github-bot",
      description: "Automated GitHub registration test",
      owner_email: "owner@example.com",
    });

    // Step 2: Get dedicated email address
    const email = emailService.getEmailAddress(passport.identity.name);

    // Step 3: Generate a secure password
    const password = "SuperSecret123!";

    // Verify we have all required registration data
    expect(passport.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
    expect(email).toBe("github-bot@agent-mail.xyz");
    expect(password).toBeTruthy();

    // Step 4: Store credentials in vault
    await vault.store({
      service: "github.com",
      username: passport.identity.name,
      password,
      email,
    });

    // Verify credentials stored
    const storedCred = await vault.get("github.com");
    expect(storedCred).toBeDefined();
    expect(storedCred!.service).toBe("github.com");
    expect(storedCred!.username).toBe("github-bot");
    expect(storedCred!.password).toBe(password);
    expect(storedCred!.email).toBe(email);
  });

  it("should handle multiple service registrations", async () => {
    // Create single agent
    const { passport } = await identityService.createIdentity({
      name: "multi-service-bot",
      owner_email: "owner@example.com",
    });

    const email = emailService.getEmailAddress(passport.identity.name);

    // Register on multiple services
    const services = [
      { name: "github.com", password: "GitHub123!" },
      { name: "npmjs.com", password: "Npm456!" },
      { name: "docker.com", password: "Docker789!" },
    ];

    for (const service of services) {
      await vault.store({
        service: service.name,
        username: passport.identity.name,
        password: service.password,
        email,
      });
    }

    // Verify all credentials stored
    const credentials = await vault.list();
    expect(credentials).toHaveLength(3);

    // Verify credential isolation (passwords not exposed in list)
    for (const cred of credentials) {
      expect(cred).not.toHaveProperty("password");
      expect(cred.username).toBe("multi-service-bot");
      expect(cred.email).toBe("multi-service-bot@agent-mail.xyz");
    }
  });

  it("should retrieve registration credentials", async () => {
    const { passport } = await identityService.createIdentity({
      name: "credential-test",
      owner_email: "owner@example.com",
    });

    const email = emailService.getEmailAddress(passport.identity.name);
    const password = "TestPass123!";

    await vault.store({
      service: "test-service.com",
      username: passport.identity.name,
      password,
      email,
    });

    // Later, retrieve credentials for authentication
    const cred = await vault.get("test-service.com");

    expect(cred).toBeDefined();
    expect(cred!.username).toBe("credential-test");
    expect(cred!.password).toBe(password);
    expect(cred!.email).toBe("credential-test@agent-mail.xyz");
  });

  it("should validate registration data format", async () => {
    const { passport } = await identityService.createIdentity({
      name: "validation-test",
      owner_email: "owner@example.com",
    });

    const email = emailService.getEmailAddress(passport.identity.name);

    // Email should be valid format
    expect(email).toMatch(/^[a-z0-9-]+@agent-mail\.xyz$/);

    // Passport ID should be valid format
    expect(passport.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);

    // Public key should be present
    expect(passport.identity.public_key).toBeTruthy();

    // Trust level should start at unverified
    expect(passport.trust.level).toBe("unverified");
  });

  it("should support email-based verification flow", async () => {
    const { passport } = await identityService.createIdentity({
      name: "email-verify-bot",
      owner_email: "owner@example.com",
    });

    const email = emailService.getEmailAddress(passport.identity.name);

    // Store credentials
    await vault.store({
      service: "example.com",
      username: passport.identity.name,
      password: "ExamplePass123!",
      email,
    });

    // Simulate receiving a verification email
    const testEmail = emailService.addTestEmail({
      id: "test-email-1",
      from: "noreply@example.com",
      to: email,
      subject: "Verify your email",
      body: "Click here to verify: https://example.com/verify?token=abc123",
      html: "<a href=\"https://example.com/verify?token=abc123\">Verify</a>",
      received_at: new Date().toISOString(),
    });

    expect(testEmail.to).toBe(email);

    // Read the email
    const receivedEmail = emailService.readEmail(testEmail.id);
    expect(receivedEmail).toBeDefined();
    expect(receivedEmail!.from).toBe("noreply@example.com");

    // Extract verification link
    const link = emailService.extractVerificationLink(testEmail.id);
    expect(link).toBe("https://example.com/verify?token=abc123");
  });

  it.skip("should complete full browser registration on GitHub (requires browser)", async () => {
    // This test requires:
    // 1. Playwright browser installed
    // 2. Network access to GitHub
    // 3. Ability to solve CAPTCHAs
    //
    // Run manually with: pnpm test --run integration
    //
    // Example flow:
    // 1. Create identity
    // 2. Get email address
    // 3. Launch browser
    // 4. Navigate to GitHub signup
    // 5. Fill form with agent credentials
    // 6. Handle email verification
    // 7. Complete registration
    // 8. Store credentials in vault
  });
});
