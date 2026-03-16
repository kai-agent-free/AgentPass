/**
 * Encrypted credential vault backed by SQLite and AES-256-GCM.
 *
 * Each credential record is stored as a single encrypted blob keyed by
 * service name. The encryption key is derived from the agent's Ed25519
 * private key using HKDF, so only the holder of the private key can
 * read or write vault contents.
 */

import Database from "better-sqlite3";
import type { StoredCredential, AgentPassport } from "../types/index.js";
import { encrypt, decrypt, deriveVaultKey, generateVaultSalt } from "../crypto/index.js";

/** Metadata returned by `list()` — never includes passwords or cookies. */
export interface CredentialListEntry {
  service: string;
  username: string;
  email: string;
  registered_at: string;
}

/** Stored agent identity including passport and private key. */
export interface StoredIdentity {
  passport: AgentPassport;
  privateKey: string;
  status: "active" | "revoked";
}

/** Identity summary returned by `listIdentities()` — never includes private keys. */
export interface IdentityListEntry {
  passport_id: string;
  name: string;
  status: "active" | "revoked";
  created_at: string;
}

/**
 * An encrypted credential vault that persists to a local SQLite database.
 *
 * Usage:
 * ```ts
 * const vault = new CredentialVault("/path/to/vault.db", agentPrivateKey);
 * await vault.init();
 * await vault.store({ service: "github.com", username: "bot", password: "s3cret", email: "bot@example.com" });
 * const cred = await vault.get("github.com");
 * vault.close();
 * ```
 */
export class CredentialVault {
  private readonly dbPath: string;
  private readonly privateKey: string;
  private db: Database.Database | null = null;
  private vaultKey: Buffer | null = null;

  constructor(dbPath: string, privateKey: string) {
    this.dbPath = dbPath;
    this.privateKey = privateKey;
  }

  /**
   * Initialize the vault: derive the encryption key and ensure the
   * SQLite schema exists.
   *
   * Must be called before any other method.
   */
  async init(): Promise<void> {
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        service TEXT PRIMARY KEY,
        encrypted_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identities (
        passport_id TEXT PRIMARY KEY,
        encrypted_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Vault metadata table for storing per-vault salt
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Get or generate salt
    const saltRow = this.db.prepare(
      "SELECT value FROM vault_metadata WHERE key = 'hkdf_salt'"
    ).get() as { value: string } | undefined;

    let salt: string | undefined;
    if (saltRow) {
      salt = saltRow.value;
    } else {
      // Check if vault has existing data (legacy vault with static salt)
      const hasData = this.db.prepare(
        "SELECT 1 FROM credentials LIMIT 1"
      ).get();
      const hasIdentities = this.db.prepare(
        "SELECT 1 FROM identities LIMIT 1"
      ).get();

      if (hasData || hasIdentities) {
        // Legacy vault — use no salt (falls back to static salt) for compatibility
        salt = undefined;
      } else {
        // New vault — generate random salt
        salt = generateVaultSalt();
        this.db.prepare(
          "INSERT INTO vault_metadata (key, value) VALUES ('hkdf_salt', ?)"
        ).run(salt);
      }
    }

    this.vaultKey = await deriveVaultKey(this.privateKey, salt);
  }

  /**
   * Store (or update) a credential in the vault.
   *
   * The `registered_at` timestamp is set automatically to the current
   * UTC ISO-8601 time.
   */
  async store(
    credential: Omit<StoredCredential, "registered_at">,
  ): Promise<void> {
    this.ensureInitialized();

    const now = new Date().toISOString();

    const full: StoredCredential = {
      ...credential,
      registered_at: now,
    };

    const encryptedData = encrypt(JSON.stringify(full), this.vaultKey!);

    const stmt = this.db!.prepare(`
      INSERT INTO credentials (service, encrypted_data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(service) DO UPDATE SET
        encrypted_data = excluded.encrypted_data,
        updated_at = excluded.updated_at
    `);

    stmt.run(credential.service, encryptedData, now, now);
  }

  /**
   * Retrieve and decrypt a credential for the given service.
   *
   * Returns `null` if no credential exists for that service.
   */
  async get(service: string): Promise<StoredCredential | null> {
    this.ensureInitialized();

    const row = this.db!.prepare(
      "SELECT encrypted_data FROM credentials WHERE service = ?",
    ).get(service) as { encrypted_data: string } | undefined;

    if (!row) {
      return null;
    }

    const json = decrypt(row.encrypted_data, this.vaultKey!);
    return JSON.parse(json) as StoredCredential;
  }

  /**
   * List all stored credentials without exposing sensitive fields.
   *
   * Returns service, username, email, and registered_at only.
   * Passwords and cookies are never included in the listing.
   */
  async list(): Promise<CredentialListEntry[]> {
    this.ensureInitialized();

    const rows = this.db!.prepare(
      "SELECT encrypted_data FROM credentials ORDER BY service",
    ).all() as { encrypted_data: string }[];

    return rows.map((row) => {
      const cred = JSON.parse(
        decrypt(row.encrypted_data, this.vaultKey!),
      ) as StoredCredential;

      return {
        service: cred.service,
        username: cred.username,
        email: cred.email,
        registered_at: cred.registered_at,
      };
    });
  }

  /**
   * Delete the credential for a given service.
   *
   * Returns `true` if a credential was deleted, `false` if none existed.
   */
  async delete(service: string): Promise<boolean> {
    this.ensureInitialized();

    const result = this.db!.prepare(
      "DELETE FROM credentials WHERE service = ?",
    ).run(service);

    return result.changes > 0;
  }

  /**
   * Check whether the vault contains a credential for the given service.
   */
  async has(service: string): Promise<boolean> {
    this.ensureInitialized();

    const row = this.db!.prepare(
      "SELECT 1 FROM credentials WHERE service = ?",
    ).get(service);

    return row !== undefined;
  }

  /**
   * Store (or update) an agent identity in the vault.
   *
   * The identity includes the passport, private key, and status. All data
   * is encrypted at rest.
   */
  async storeIdentity(identity: StoredIdentity): Promise<void> {
    this.ensureInitialized();

    const now = new Date().toISOString();

    const encryptedData = encrypt(JSON.stringify(identity), this.vaultKey!);

    const stmt = this.db!.prepare(`
      INSERT INTO identities (passport_id, encrypted_data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(passport_id) DO UPDATE SET
        encrypted_data = excluded.encrypted_data,
        updated_at = excluded.updated_at
    `);

    stmt.run(identity.passport.passport_id, encryptedData, now, now);
  }

  /**
   * Retrieve and decrypt an agent identity by passport ID.
   *
   * Returns `null` if no identity exists with that passport ID.
   */
  async getIdentity(passportId: string): Promise<StoredIdentity | null> {
    this.ensureInitialized();

    const row = this.db!.prepare(
      "SELECT encrypted_data FROM identities WHERE passport_id = ?",
    ).get(passportId) as { encrypted_data: string } | undefined;

    if (!row) {
      return null;
    }

    const json = decrypt(row.encrypted_data, this.vaultKey!);
    return JSON.parse(json) as StoredIdentity;
  }

  /**
   * List all stored identities without exposing private keys.
   *
   * Returns passport_id, name, status, and created_at only.
   * Private keys are never included in the listing.
   */
  async listIdentities(): Promise<IdentityListEntry[]> {
    this.ensureInitialized();

    const rows = this.db!.prepare(
      "SELECT encrypted_data FROM identities ORDER BY passport_id",
    ).all() as { encrypted_data: string }[];

    return rows.map((row) => {
      const identity = JSON.parse(
        decrypt(row.encrypted_data, this.vaultKey!),
      ) as StoredIdentity;

      return {
        passport_id: identity.passport.passport_id,
        name: identity.passport.identity.name,
        status: identity.status,
        created_at: identity.passport.identity.created_at,
      };
    });
  }

  /**
   * Delete an identity by passport ID.
   *
   * Returns `true` if an identity was deleted, `false` if none existed.
   */
  async deleteIdentity(passportId: string): Promise<boolean> {
    this.ensureInitialized();

    const result = this.db!.prepare(
      "DELETE FROM identities WHERE passport_id = ?",
    ).run(passportId);

    return result.changes > 0;
  }

  /**
   * Check whether the vault contains an identity with the given passport ID.
   */
  async hasIdentity(passportId: string): Promise<boolean> {
    this.ensureInitialized();

    const row = this.db!.prepare(
      "SELECT 1 FROM identities WHERE passport_id = ?",
    ).get(passportId);

    return row !== undefined;
  }

  /**
   * Close the underlying SQLite database connection.
   *
   * The vault instance must not be used after calling `close()`.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.vaultKey = null;
  }

  /**
   * Return the raw SQLite database handle for testing/introspection.
   *
   * This is intentionally NOT part of the public API surface — it
   * exists only so tests can verify that data is actually encrypted
   * at rest.
   *
   * @internal
   */
  get _db(): Database.Database | null {
    return this.db;
  }

  /** Throw if `init()` has not been called. */
  private ensureInitialized(): void {
    if (!this.db || !this.vaultKey) {
      throw new Error(
        "CredentialVault is not initialized. Call init() first.",
      );
    }
  }
}
