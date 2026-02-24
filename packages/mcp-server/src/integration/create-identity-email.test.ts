/**
 * Integration test: Create agent identity → Get email address
 *
 * Tests the full flow of creating an agent identity and retrieving its
 * dedicated email address. This verifies that the identity and email
 * services work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlink } from "node:fs/promises";
import { CredentialVault, generateKeyPair } from "@agentpass/core";
import { IdentityService } from "../services/identity-service.js";
import { EmailServiceAdapter } from "../services/email-service-adapter.js";
import { createMockApiClient } from "../test-helpers.js";

describe("Integration: Create Identity → Get Email", () => {
  let identityService: IdentityService;
  let emailService: EmailServiceAdapter;
  let vault: CredentialVault;
  const testDbPath = ":memory:"; // Use in-memory database for tests

  beforeEach(async () => {
    // Generate a test key pair for vault encryption
    const { privateKey } = generateKeyPair();
    vault = new CredentialVault(testDbPath, privateKey);
    await vault.init();

    // Initialize services
    identityService = new IdentityService();
    await identityService.init(vault, createMockApiClient());
    emailService = new EmailServiceAdapter();
  });

  afterEach(async () => {
    if (vault) {
      vault.close();
    }
  });

  it("should create identity and get email address", async () => {
    // Step 1: Create agent identity
    const { passport } = await identityService.createIdentity({
      name: "research-bot",
      description: "AI research assistant",
      owner_email: "owner@example.com",
    });

    // Verify identity was created successfully
    expect(passport.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
    expect(passport.identity.name).toBe("research-bot");
    expect(passport.identity.public_key).toBeTruthy();
    expect(passport.trust.level).toBe("unverified");

    // Step 2: Get email address for the agent
    const emailAddress = emailService.getEmailAddress(passport.identity.name);

    // Verify email address format
    expect(emailAddress).toBe("research-bot@agent-mail.xyz");
    expect(emailAddress).toMatch(/^[a-z0-9-]+@agent-mail\.xyz$/);
  });

  it("should create identity with complex name and get sanitized email", async () => {
    // Create identity with name requiring sanitization
    const { passport } = await identityService.createIdentity({
      name: "My_Agent-2024",
      description: "Test agent with complex name",
      owner_email: "owner@example.com",
    });

    expect(passport.identity.name).toBe("My_Agent-2024");

    // Get email address (should be sanitized)
    const emailAddress = emailService.getEmailAddress(passport.identity.name);

    // Email should be lowercase and use hyphens
    expect(emailAddress).toBe("my-agent-2024@agent-mail.xyz");
  });

  it("should create multiple identities with unique emails", async () => {
    // Create first agent
    const { passport: passport1 } = await identityService.createIdentity({
      name: "agent-one",
      owner_email: "owner@example.com",
    });

    // Create second agent
    const { passport: passport2 } = await identityService.createIdentity({
      name: "agent-two",
      owner_email: "owner@example.com",
    });

    // Verify both identities are unique
    expect(passport1.passport_id).not.toBe(passport2.passport_id);

    // Get email addresses
    const email1 = emailService.getEmailAddress(passport1.identity.name);
    const email2 = emailService.getEmailAddress(passport2.identity.name);

    // Verify emails are unique
    expect(email1).toBe("agent-one@agent-mail.xyz");
    expect(email2).toBe("agent-two@agent-mail.xyz");
    expect(email1).not.toBe(email2);
  });

  it("should retrieve identity after creation and verify email consistency", async () => {
    // Create identity
    const { passport: createdPassport } = await identityService.createIdentity({
      name: "persistent-agent",
      owner_email: "owner@example.com",
    });

    // Retrieve identity
    const retrievedPassport = await identityService.getIdentity(
      createdPassport.passport_id,
    );

    expect(retrievedPassport).toBeDefined();
    expect(retrievedPassport!.identity.name).toBe("persistent-agent");

    // Get email address twice to verify consistency
    const email1 = emailService.getEmailAddress(
      createdPassport.identity.name,
    );
    const email2 = emailService.getEmailAddress(
      retrievedPassport!.identity.name,
    );

    // Email should be the same both times
    expect(email1).toBe(email2);
    expect(email1).toBe("persistent-agent@agent-mail.xyz");
  });

  it("should list multiple identities and verify all have valid emails", async () => {
    // Create multiple identities
    const agents = ["agent-alpha", "agent-beta", "agent-gamma"];

    for (const name of agents) {
      await identityService.createIdentity({
        name,
        owner_email: "owner@example.com",
      });
    }

    // List all identities
    const identities = await identityService.listIdentities();
    expect(identities).toHaveLength(3);

    // Verify each has a valid email address
    for (const identity of identities) {
      const email = emailService.getEmailAddress(identity.name);
      expect(email).toMatch(/^[a-z0-9-]+@agent-mail\.xyz$/);
      expect(email).toContain(identity.name.toLowerCase());
    }
  });

  it("should handle identity with special characters in name", async () => {
    // Create identity with underscores and hyphens
    const { passport } = await identityService.createIdentity({
      name: "test_agent-v1",
      owner_email: "owner@example.com",
    });

    // Get email address
    const email = emailService.getEmailAddress(passport.identity.name);

    // Should sanitize underscores to hyphens
    expect(email).toBe("test-agent-v1@agent-mail.xyz");
  });

  it("should fail to generate email for empty name", () => {
    // Email service should reject invalid agent names
    expect(() => emailService.getEmailAddress("!!!")).toThrow(
      "Agent name must contain at least one alphanumeric character",
    );
  });
});
