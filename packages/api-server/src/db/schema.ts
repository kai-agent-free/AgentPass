/**
 * SQLite database schema and initialization for AgentPass API Server.
 *
 * Uses @libsql/client for Turso-compatible, pure-JS SQLite access.
 * Supports both local file-based SQLite and Turso (libsql) in production.
 */

import { createClient, type Client } from "@libsql/client";

const PASSPORTS_TABLE = `
CREATE TABLE IF NOT EXISTS passports (
  id          TEXT PRIMARY KEY,
  public_key  TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trust_score INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  metadata    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)`;

const AUDIT_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  action      TEXT NOT NULL,
  service     TEXT NOT NULL DEFAULT '',
  method      TEXT NOT NULL DEFAULT '',
  result      TEXT NOT NULL DEFAULT 'success',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  details     TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (passport_id) REFERENCES passports(id)
)`;

const AUDIT_LOG_INDEX = `
CREATE INDEX IF NOT EXISTS idx_audit_log_passport_id
  ON audit_log(passport_id, created_at DESC)
`;

/**
 * Initialize the libsql database with schema tables.
 *
 * @param dbPath - Path to the SQLite file, or ":memory:" for in-memory databases.
 * @returns A configured @libsql/client Client instance.
 */
export async function initDatabase(dbPath: string): Promise<Client> {
  const url = dbPath === ":memory:" ? ":memory:" : `file:${dbPath}`;
  const db = createClient({ url });

  // Enable WAL mode for better concurrent read performance
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA foreign_keys = ON");

  // Run migrations
  await db.execute(PASSPORTS_TABLE);
  await db.execute(AUDIT_LOG_TABLE);
  await db.execute(AUDIT_LOG_INDEX);

  return db;
}
