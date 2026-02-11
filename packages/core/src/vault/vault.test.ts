import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import Database from "better-sqlite3";
import { CredentialVault } from "./vault.js";

/**
 * Generate a fake base64url-encoded Ed25519 private key (48 random bytes).
 * Real PKCS8-encoded Ed25519 keys are longer, but HKDF accepts arbitrary
 * length input material so random bytes are fine for testing key derivation.
 */
function randomPrivateKey(): string {
  return randomBytes(48).toString("base64url");
}

/** Create a unique temporary database path. */
function tmpDbPath(): string {
  const name = `agentpass-vault-test-${Date.now()}-${randomBytes(4).toString("hex")}.db`;
  return path.join(os.tmpdir(), name);
}

describe("CredentialVault", () => {
  let vault: CredentialVault;
  let dbPath: string;
  let privateKey: string;

  beforeEach(async () => {
    dbPath = tmpDbPath();
    privateKey = randomPrivateKey();
    vault = new CredentialVault(dbPath, privateKey);
    await vault.init();
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

  it("should store and retrieve a credential", async () => {
    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password: "sup3r-s3cret",
      email: "bot@example.com",
    });

    const cred = await vault.get("github.com");

    expect(cred).not.toBeNull();
    expect(cred!.service).toBe("github.com");
    expect(cred!.username).toBe("agent-bot");
    expect(cred!.password).toBe("sup3r-s3cret");
    expect(cred!.email).toBe("bot@example.com");
    expect(cred!.registered_at).toBeDefined();
    // registered_at should be a valid ISO date
    expect(new Date(cred!.registered_at).toISOString()).toBe(
      cred!.registered_at,
    );
  });

  it("should list credentials without exposing passwords", async () => {
    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password: "secret-1",
      email: "bot@gh.com",
    });

    await vault.store({
      service: "npmjs.com",
      username: "npm-bot",
      password: "secret-2",
      email: "bot@npm.com",
    });

    const list = await vault.list();

    expect(list).toHaveLength(2);

    // Entries are ordered by service name
    expect(list[0]!.service).toBe("github.com");
    expect(list[1]!.service).toBe("npmjs.com");

    // Each entry has the expected fields
    for (const entry of list) {
      expect(entry).toHaveProperty("service");
      expect(entry).toHaveProperty("username");
      expect(entry).toHaveProperty("email");
      expect(entry).toHaveProperty("registered_at");
    }

    // Password and cookies must NOT appear in the listing
    for (const entry of list) {
      expect(entry).not.toHaveProperty("password");
      expect(entry).not.toHaveProperty("cookies");
    }
  });

  it("should delete a credential", async () => {
    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password: "secret",
      email: "bot@gh.com",
    });

    expect(await vault.has("github.com")).toBe(true);

    const deleted = await vault.delete("github.com");
    expect(deleted).toBe(true);

    expect(await vault.has("github.com")).toBe(false);
    expect(await vault.get("github.com")).toBeNull();
  });

  it("should return false when deleting a non-existent credential", async () => {
    const deleted = await vault.delete("no-such-service.com");
    expect(deleted).toBe(false);
  });

  it("should report has() correctly", async () => {
    expect(await vault.has("github.com")).toBe(false);

    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password: "secret",
      email: "bot@gh.com",
    });

    expect(await vault.has("github.com")).toBe(true);
    expect(await vault.has("other.com")).toBe(false);
  });

  it("should return null for a non-existent service", async () => {
    const cred = await vault.get("does-not-exist.com");
    expect(cred).toBeNull();
  });

  it("should update a credential when storing the same service twice", async () => {
    await vault.store({
      service: "github.com",
      username: "old-user",
      password: "old-pass",
      email: "old@gh.com",
    });

    await vault.store({
      service: "github.com",
      username: "new-user",
      password: "new-pass",
      email: "new@gh.com",
    });

    const cred = await vault.get("github.com");

    expect(cred).not.toBeNull();
    expect(cred!.username).toBe("new-user");
    expect(cred!.password).toBe("new-pass");
    expect(cred!.email).toBe("new@gh.com");

    // Only one row for this service
    const list = await vault.list();
    expect(list).toHaveLength(1);
  });

  it("should store optional cookies field", async () => {
    const cookies = JSON.stringify([
      { name: "session", value: "abc123", domain: ".github.com" },
    ]);

    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password: "secret",
      email: "bot@gh.com",
      cookies,
    });

    const cred = await vault.get("github.com");

    expect(cred).not.toBeNull();
    expect(cred!.cookies).toBe(cookies);
  });

  it("should store data encrypted in the database (raw data is not plaintext)", async () => {
    const password = "my-super-secret-password-12345";

    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password,
      email: "bot@gh.com",
    });

    // Read the raw encrypted_data directly from SQLite
    const rawDb = vault._db!;
    const row = rawDb
      .prepare("SELECT encrypted_data FROM credentials WHERE service = ?")
      .get("github.com") as { encrypted_data: string };

    expect(row).toBeDefined();

    // The raw value must NOT contain the plaintext password
    expect(row.encrypted_data).not.toContain(password);
    expect(row.encrypted_data).not.toContain("agent-bot");
    expect(row.encrypted_data).not.toContain("bot@gh.com");

    // It should look like a base64url string (the encrypted blob)
    expect(row.encrypted_data).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("should not allow decryption with a different private key", async () => {
    const password = "cross-key-test-secret";

    await vault.store({
      service: "github.com",
      username: "agent-bot",
      password,
      email: "bot@gh.com",
    });

    vault.close();

    // Open the same database with a different private key
    const otherKey = randomPrivateKey();
    const otherVault = new CredentialVault(dbPath, otherKey);
    await otherVault.init();

    try {
      // Attempting to decrypt data encrypted with a different key should throw
      await expect(otherVault.get("github.com")).rejects.toThrow();
    } finally {
      otherVault.close();
    }
  });

  it("should throw if methods are called before init()", async () => {
    const uninitVault = new CredentialVault(tmpDbPath(), randomPrivateKey());

    await expect(
      uninitVault.store({
        service: "test.com",
        username: "u",
        password: "p",
        email: "e@e.com",
      }),
    ).rejects.toThrow(/not initialized/i);

    await expect(uninitVault.get("test.com")).rejects.toThrow(
      /not initialized/i,
    );

    await expect(uninitVault.list()).rejects.toThrow(/not initialized/i);

    await expect(uninitVault.delete("test.com")).rejects.toThrow(
      /not initialized/i,
    );

    await expect(uninitVault.has("test.com")).rejects.toThrow(
      /not initialized/i,
    );
  });

  it("should handle an empty vault for list()", async () => {
    const list = await vault.list();
    expect(list).toEqual([]);
  });

  it("should close cleanly and reject subsequent operations", async () => {
    vault.close();

    await expect(vault.get("test.com")).rejects.toThrow(/not initialized/i);
  });
});
