import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IdentityService } from "../services/identity-service.js";
import { CredentialVault, generateKeyPair } from "@agentpass/core";
import { createMockApiClient } from "../test-helpers.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

function tmpDbPath(): string {
  const name = `agentpass-identity-test-${Date.now()}-${randomBytes(4).toString("hex")}.db`;
  return path.join(os.tmpdir(), name);
}

describe("IdentityService", () => {
  let service: IdentityService;
  let vault: CredentialVault;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = tmpDbPath();
    const privateKey = generateKeyPair().privateKey;
    vault = new CredentialVault(dbPath, privateKey);
    await vault.init();

    service = new IdentityService();
    await service.init(vault, createMockApiClient());
  });

  afterEach(() => {
    vault.close();
    // Clean up temp files
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // Ignore if already removed
    }
    try {
      fs.unlinkSync(dbPath + "-wal");
    } catch {
      // WAL file may or may not exist
    }
    try {
      fs.unlinkSync(dbPath + "-shm");
    } catch {
      // SHM file may or may not exist
    }
  });

  describe("createIdentity", () => {
    it("should create a valid identity with a passport_id", async () => {
      const result = await service.createIdentity({
        name: "test-agent",
        description: "A test agent",
        owner_email: "owner@example.com",
      });

      expect(result.passport).toBeDefined();
      expect(result.passport.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
      expect(result.passport.identity.name).toBe("test-agent");
      expect(result.passport.identity.description).toBe("A test agent");
      expect(result.passport.owner.email).toBe("test-agent@agent-mail.xyz");
      expect(result.passport.identity.public_key).toBeTruthy();
      expect(result.publicKey).toBeTruthy();
      expect(result.publicKey).toBe(result.passport.identity.public_key);
    });

    it("should default description to empty string when omitted", async () => {
      const result = await service.createIdentity({
        name: "minimal-agent",
        owner_email: "owner@example.com",
      });

      expect(result.passport.identity.description).toBe("");
    });

    it("should generate unique passport IDs", async () => {
      const r1 = await service.createIdentity({
        name: "agent-1",
        owner_email: "a@example.com",
      });
      const r2 = await service.createIdentity({
        name: "agent-2",
        owner_email: "b@example.com",
      });

      expect(r1.passport.passport_id).not.toBe(r2.passport.passport_id);
    });

    it("should set trust level to unverified for new identities", async () => {
      const result = await service.createIdentity({
        name: "new-agent",
        owner_email: "owner@example.com",
      });

      expect(result.passport.trust.level).toBe("unverified");
      expect(result.passport.trust.score).toBe(0);
    });
  });

  describe("listIdentities", () => {
    it("should return empty array when no identities exist", async () => {
      const identities = await service.listIdentities();
      expect(identities).toEqual([]);
    });

    it("should return all created identities", async () => {
      await service.createIdentity({
        name: "agent-a",
        owner_email: "a@example.com",
      });
      await service.createIdentity({
        name: "agent-b",
        owner_email: "b@example.com",
      });

      const identities = await service.listIdentities();
      expect(identities).toHaveLength(2);

      const names = identities.map((i) => i.name);
      expect(names).toContain("agent-a");
      expect(names).toContain("agent-b");
    });

    it("should include status and created_at in summaries", async () => {
      await service.createIdentity({
        name: "agent-x",
        owner_email: "x@example.com",
      });

      const identities = await service.listIdentities();
      const [summary] = identities;
      expect(summary.status).toBe("active");
      expect(summary.created_at).toBeTruthy();
      expect(summary.passport_id).toMatch(/^ap_[a-z0-9]{12}$/);
    });
  });

  describe("getIdentity", () => {
    it("should return passport for an existing identity", async () => {
      const { passport } = await service.createIdentity({
        name: "lookup-agent",
        owner_email: "owner@example.com",
      });

      const found = await service.getIdentity(passport.passport_id);
      expect(found).toBeDefined();
      expect(found!.passport_id).toBe(passport.passport_id);
      expect(found!.identity.name).toBe("lookup-agent");
    });

    it("should return null for a non-existent passport_id", async () => {
      const found = await service.getIdentity("ap_000000000000");
      expect(found).toBeNull();
    });

    it("should not expose private key in returned passport", async () => {
      const { passport } = await service.createIdentity({
        name: "secure-agent",
        owner_email: "owner@example.com",
      });

      const found = await service.getIdentity(passport.passport_id);
      // The passport object should not contain a privateKey field
      expect(found).not.toHaveProperty("privateKey");
    });
  });

  describe("deleteIdentity", () => {
    it("should remove an existing identity", async () => {
      const { passport } = await service.createIdentity({
        name: "temp-agent",
        owner_email: "owner@example.com",
      });

      const deleted = await service.deleteIdentity(passport.passport_id);
      expect(deleted).toBe(true);

      const found = await service.getIdentity(passport.passport_id);
      expect(found).toBeNull();
    });

    it("should return false for non-existent identity", async () => {
      const deleted = await service.deleteIdentity("ap_000000000000");
      expect(deleted).toBe(false);
    });
  });

  describe("revokeIdentity", () => {
    it("should mark identity as revoked", async () => {
      const { passport } = await service.createIdentity({
        name: "revoke-me",
        owner_email: "owner@example.com",
      });

      const revoked = await service.revokeIdentity(passport.passport_id);
      expect(revoked).toBe(true);

      const identities = await service.listIdentities();
      const found = identities.find(
        (i) => i.passport_id === passport.passport_id,
      );
      expect(found?.status).toBe("revoked");
    });

    it("should return false for non-existent identity", async () => {
      const revoked = await service.revokeIdentity("ap_000000000000");
      expect(revoked).toBe(false);
    });
  });
});
