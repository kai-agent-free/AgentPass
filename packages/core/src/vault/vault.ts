/**
 * Encrypted credential vault backed by SQLite and AES-256-GCM.
 *
 * Each credential record is stored as a single encrypted blob keyed by
 * service name. The encryption key is derived from the agent's Ed25519
 * private key using HKDF, so only the holder of the private key can
 * read or write vault contents.
 */

import Database from "better-sqlite3";
import type { StoredCredential } from "../types/index.js";
import { encrypt, decrypt, deriveVaultKey } from "../crypto/index.js";

/** Metadata returned by `list()` — never includes passwords or cookies. */
export interface CredentialListEntry {
  service: string;
  username: string;
  email: string;
  registered_at: string;
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
    this.vaultKey = await deriveVaultKey(this.privateKey);

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
