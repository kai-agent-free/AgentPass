/**
 * Integration test for identity persistence.
 *
 * Verifies that identities are stored in SQLite and persist across
 * service restarts.
 */

import { describe, it, expect, afterEach } from "vitest";
import { IdentityService } from "../services/identity-service.js";
import { CredentialVault, generateKeyPair } from "@agentpass/core";
import { createMockApiClient } from "../test-helpers.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

function tmpDbPath(): string {
  const name = `agentpass-persistence-test-${Date.now()}-${randomBytes(4).toString("hex")}.db`;
  return path.join(os.tmpdir(), name);
}

describe("Identity Persistence", () => {
  let dbPath: string;
  let masterKey: string;

  afterEach(() => {
    // Clean up temp files
    if (dbPath) {
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
    }
  });

  it("should persist identities across service restarts", async () => {
    dbPath = tmpDbPath();
    masterKey = generateKeyPair().privateKey;

    // ── Phase 1: Create identities ──────────────────────────────
    const vault1 = new CredentialVault(dbPath, masterKey);
    await vault1.init();

    const service1 = new IdentityService();
    await service1.init(vault1, createMockApiClient());

    const { passport: passport1 } = await service1.createIdentity({
      name: "persistent-agent-1",
      description: "First agent",
      owner_email: "owner1@test.com",
    });

    const { passport: passport2 } = await service1.createIdentity({
      name: "persistent-agent-2",
      description: "Second agent",
      owner_email: "owner2@test.com",
    });

    const identities1 = await service1.listIdentities();
    expect(identities1).toHaveLength(2);

    // Close the vault (simulating service shutdown)
    vault1.close();

    // ── Phase 2: Restart service and verify persistence ────────
    const vault2 = new CredentialVault(dbPath, masterKey);
    await vault2.init();

    const service2 = new IdentityService();
    await service2.init(vault2, createMockApiClient());

    // List identities - should still have both
    const identities2 = await service2.listIdentities();
    expect(identities2).toHaveLength(2);

    const names = identities2.map((i) => i.name);
    expect(names).toContain("persistent-agent-1");
    expect(names).toContain("persistent-agent-2");

    // Get full identity details
    const retrieved1 = await service2.getIdentity(passport1.passport_id);
    expect(retrieved1).not.toBeNull();
    expect(retrieved1!.identity.name).toBe("persistent-agent-1");
    expect(retrieved1!.identity.description).toBe("First agent");
    expect(retrieved1!.owner.email).toBe("persistent-agent-1@agent-mail.xyz");

    const retrieved2 = await service2.getIdentity(passport2.passport_id);
    expect(retrieved2).not.toBeNull();
    expect(retrieved2!.identity.name).toBe("persistent-agent-2");

    vault2.close();
  });

  it("should handle revoked identities correctly after restart", async () => {
    dbPath = tmpDbPath();
    masterKey = generateKeyPair().privateKey;

    // ── Phase 1: Create and revoke an identity ─────────────────
    const vault1 = new CredentialVault(dbPath, masterKey);
    await vault1.init();

    const service1 = new IdentityService();
    await service1.init(vault1, createMockApiClient());

    const { passport } = await service1.createIdentity({
      name: "revokable-agent",
      description: "Will be revoked",
      owner_email: "owner@test.com",
    });

    const revoked = await service1.revokeIdentity(passport.passport_id);
    expect(revoked).toBe(true);

    vault1.close();

    // ── Phase 2: Restart and verify revoked status persists ────
    const vault2 = new CredentialVault(dbPath, masterKey);
    await vault2.init();

    const service2 = new IdentityService();
    await service2.init(vault2, createMockApiClient());

    const identities = await service2.listIdentities();
    expect(identities).toHaveLength(1);
    expect(identities[0]!.status).toBe("revoked");

    vault2.close();
  });

  it("should handle identity deletion correctly", async () => {
    dbPath = tmpDbPath();
    masterKey = generateKeyPair().privateKey;

    // ── Phase 1: Create and delete an identity ─────────────────
    const vault1 = new CredentialVault(dbPath, masterKey);
    await vault1.init();

    const service1 = new IdentityService();
    await service1.init(vault1, createMockApiClient());

    const { passport: passport1 } = await service1.createIdentity({
      name: "agent-to-delete",
      owner_email: "owner1@test.com",
    });

    const { passport: passport2 } = await service1.createIdentity({
      name: "agent-to-keep",
      owner_email: "owner2@test.com",
    });

    const deleted = await service1.deleteIdentity(passport1.passport_id);
    expect(deleted).toBe(true);

    vault1.close();

    // ── Phase 2: Restart and verify deletion persists ──────────
    const vault2 = new CredentialVault(dbPath, masterKey);
    await vault2.init();

    const service2 = new IdentityService();
    await service2.init(vault2, createMockApiClient());

    const identities = await service2.listIdentities();
    expect(identities).toHaveLength(1);
    expect(identities[0]!.name).toBe("agent-to-keep");

    const deleted1 = await service2.getIdentity(passport1.passport_id);
    expect(deleted1).toBeNull();

    const kept = await service2.getIdentity(passport2.passport_id);
    expect(kept).not.toBeNull();

    vault2.close();
  });

  it("should not decrypt with a different master key", async () => {
    dbPath = tmpDbPath();
    masterKey = generateKeyPair().privateKey;

    // ── Phase 1: Create identity with first key ────────────────
    const vault1 = new CredentialVault(dbPath, masterKey);
    await vault1.init();

    const service1 = new IdentityService();
    await service1.init(vault1, createMockApiClient());

    await service1.createIdentity({
      name: "encrypted-agent",
      owner_email: "owner@test.com",
    });

    vault1.close();

    // ── Phase 2: Try to read with different key ────────────────
    const otherKey = generateKeyPair().privateKey;
    const vault2 = new CredentialVault(dbPath, otherKey);
    await vault2.init();

    const service2 = new IdentityService();
    await service2.init(vault2, createMockApiClient());

    // Should throw when trying to decrypt
    await expect(service2.listIdentities()).rejects.toThrow();

    vault2.close();
  });
});
