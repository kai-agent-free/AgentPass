/**
 * SQLite database schema and initialization for AgentPass API Server.
 *
 * Uses @libsql/client for Turso-compatible, pure-JS SQLite access.
 * Supports both local file-based SQLite and Turso (libsql) in production.
 */

import { createClient, type Client } from "@libsql/client";

const OWNERS_TABLE = `
CREATE TABLE IF NOT EXISTS owners (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
)`;

const OWNERS_EMAIL_INDEX = `
CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(email)
`;

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

const EMAIL_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS email_notifications (
  email_id     TEXT PRIMARY KEY,
  recipient    TEXT NOT NULL,
  sender       TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  received_at  TEXT NOT NULL,
  notified_at  TEXT NOT NULL,
  retrieved_at TEXT
)`;

const EMAIL_NOTIFICATIONS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient
  ON email_notifications(recipient, received_at DESC)
`;

const SMS_NOTIFICATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS sms_notifications (
  sms_id       TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  sender       TEXT NOT NULL,
  body         TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  notified_at  TEXT NOT NULL,
  retrieved_at TEXT
)`;

const SMS_NOTIFICATIONS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_sms_notifications_phone
  ON sms_notifications(phone_number, received_at DESC)
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
  await db.execute(OWNERS_TABLE);
  await db.execute(OWNERS_EMAIL_INDEX);
  await db.execute(PASSPORTS_TABLE);
  await db.execute(AUDIT_LOG_TABLE);
  await db.execute(AUDIT_LOG_INDEX);
  await db.execute(EMAIL_NOTIFICATIONS_TABLE);
  await db.execute(EMAIL_NOTIFICATIONS_INDEX);
  await db.execute(SMS_NOTIFICATIONS_TABLE);
  await db.execute(SMS_NOTIFICATIONS_INDEX);

  return db;
}
