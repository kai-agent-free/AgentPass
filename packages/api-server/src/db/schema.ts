/**
 * PostgreSQL database schema and initialization for AgentPass API Server.
 *
 * Uses `postgres` package (porsager/postgres) for connection pooling and
 * query execution via safe tagged template literals.
 */

import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

/**
 * Initialize the PostgreSQL database with schema tables.
 *
 * @param connectionString - PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/db)
 * @returns A configured postgres instance with connection pooling.
 */
export async function initDatabase(connectionString?: string): Promise<Sql> {
  const sql = postgres(
    connectionString || process.env.DATABASE_URL || "postgresql://localhost:5432/agentpass",
    {
      max: 10, // connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
    },
  );

  // Create owners table
  await sql`
    CREATE TABLE IF NOT EXISTS owners (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL DEFAULT '',
      verified      BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(email)`;

  // Create passports table
  await sql`
    CREATE TABLE IF NOT EXISTS passports (
      id          TEXT PRIMARY KEY,
      public_key  TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      trust_score INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'active',
      metadata    JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Create audit_log table
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY,
      passport_id TEXT NOT NULL REFERENCES passports(id),
      action      TEXT NOT NULL,
      service     TEXT NOT NULL DEFAULT '',
      method      TEXT NOT NULL DEFAULT '',
      result      TEXT NOT NULL DEFAULT 'success',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      details     JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_log_passport_id
      ON audit_log(passport_id, created_at DESC)
  `;

  // Create email_notifications table
  await sql`
    CREATE TABLE IF NOT EXISTS email_notifications (
      email_id     TEXT PRIMARY KEY,
      recipient    TEXT NOT NULL,
      sender       TEXT NOT NULL,
      subject      TEXT NOT NULL DEFAULT '',
      received_at  TIMESTAMPTZ NOT NULL,
      notified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      retrieved_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient
      ON email_notifications(recipient, received_at DESC)
  `;

  // Create sms_notifications table
  await sql`
    CREATE TABLE IF NOT EXISTS sms_notifications (
      sms_id       TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      sender       TEXT NOT NULL,
      body         TEXT NOT NULL,
      received_at  TIMESTAMPTZ NOT NULL,
      notified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      retrieved_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sms_notifications_phone
      ON sms_notifications(phone_number, received_at DESC)
  `;

  // Create api_keys table
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      name        TEXT NOT NULL DEFAULT '',
      key_prefix  TEXT NOT NULL,
      key_hash    TEXT NOT NULL,
      last_used   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at  TIMESTAMPTZ
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_owner_id ON api_keys(owner_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix)`;

  // Create approvals table
  await sql`
    CREATE TABLE IF NOT EXISTS approvals (
      id           TEXT PRIMARY KEY,
      passport_id  TEXT NOT NULL REFERENCES passports(id),
      action       TEXT NOT NULL,
      service      TEXT NOT NULL DEFAULT '',
      details      TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'pending',
      responded_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_approvals_passport_id ON approvals(passport_id)`;

  // Create escalations table (CAPTCHA escalation flow)
  await sql`
    CREATE TABLE IF NOT EXISTS escalations (
      id           TEXT PRIMARY KEY,
      passport_id  TEXT NOT NULL REFERENCES passports(id),
      captcha_type TEXT NOT NULL DEFAULT 'unknown',
      service      TEXT NOT NULL DEFAULT '',
      screenshot   TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at  TIMESTAMPTZ
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_escalations_passport_id ON escalations(passport_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status)`;

  return sql;
}
