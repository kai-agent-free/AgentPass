/**
 * Trust score routes.
 *
 * GET  /passports/:id/trust        - Get current trust details
 * POST /passports/:id/report-abuse - Report abuse and recalculate trust score
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Client } from "@libsql/client";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import {
  calculateTrustScore,
  getTrustLevel,
  type TrustFactors,
} from "../services/trust-score.js";

// --- Zod schema for abuse report ---

const ReportAbuseSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(512, "Reason must be 512 characters or fewer"),
});

type ReportAbuseBody = z.infer<typeof ReportAbuseSchema>;

// --- Row types ---

interface PassportRow {
  id: string;
  trust_score: number;
  status: string;
  metadata: string | null;
  created_at: string;
}

interface AuditCountRow {
  count: number;
}

/**
 * Parse the metadata JSON column, returning a typed object with
 * known trust-related fields.
 */
function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Build TrustFactors from a passport row and its audit history.
 */
function buildTrustFactors(
  metadata: Record<string, unknown>,
  createdAt: string,
  successfulAuths: number,
): TrustFactors {
  const ageDays = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    owner_verified: metadata.owner_verified === true,
    payment_method: metadata.payment_method === true,
    age_days: ageDays,
    successful_auths: successfulAuths,
    abuse_reports: typeof metadata.abuse_reports === "number" ? metadata.abuse_reports : 0,
  };
}

/**
 * Create the trust router bound to the given database instance.
 */
export function createTrustRouter(db: Client): Hono {
  const router = new Hono();

  /**
   * Count successful verifications for a passport based on audit log entries.
   */
  async function getSuccessfulAuths(passportId: string): Promise<number> {
    const result = await db.execute({
      sql: "SELECT COUNT(*) as count FROM audit_log WHERE passport_id = ? AND action = 'verify' AND result = 'success'",
      args: [passportId],
    });
    const row = result.rows[0] as unknown as AuditCountRow | undefined;
    return row?.count ?? 0;
  }

  // GET /passports/:id/trust — return current trust details
  router.get("/:id/trust", async (c) => {
    const passportId = c.req.param("id");

    const result = await db.execute({
      sql: "SELECT id, trust_score, status, metadata, created_at FROM passports WHERE id = ?",
      args: [passportId],
    });
    const row = result.rows[0] as unknown as PassportRow | undefined;

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    const metadata = parseMetadata(row.metadata);
    const successfulAuths = await getSuccessfulAuths(passportId);
    const factors = buildTrustFactors(metadata, row.created_at, successfulAuths);
    const score = calculateTrustScore(factors);
    const level = getTrustLevel(score);

    return c.json({
      passport_id: row.id,
      trust_score: score,
      trust_level: level,
      factors,
    });
  });

  // POST /passports/:id/report-abuse — increment abuse count and recalculate
  router.post("/:id/report-abuse", zValidator(ReportAbuseSchema), async (c) => {
    const passportId = c.req.param("id");

    const result = await db.execute({
      sql: "SELECT id, trust_score, status, metadata, created_at FROM passports WHERE id = ?",
      args: [passportId],
    });
    const row = result.rows[0] as unknown as PassportRow | undefined;

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    const body = getValidatedBody<ReportAbuseBody>(c);
    const metadata = parseMetadata(row.metadata);

    // Increment abuse_reports counter
    const currentReports = typeof metadata.abuse_reports === "number" ? metadata.abuse_reports : 0;
    const newReports = currentReports + 1;
    metadata.abuse_reports = newReports;

    // Store the latest abuse reason for audit purposes
    if (!Array.isArray(metadata.abuse_reasons)) {
      metadata.abuse_reasons = [];
    }
    (metadata.abuse_reasons as string[]).push(body.reason);

    // Recalculate trust score
    const successfulAuths = await getSuccessfulAuths(passportId);
    const factors = buildTrustFactors(metadata, row.created_at, successfulAuths);
    const newScore = calculateTrustScore(factors);

    // Persist changes
    const now = new Date().toISOString();
    await db.execute({
      sql: "UPDATE passports SET trust_score = ?, metadata = ?, updated_at = ? WHERE id = ?",
      args: [newScore, JSON.stringify(metadata), now, passportId],
    });

    return c.json({
      passport_id: row.id,
      trust_score: newScore,
      trust_level: getTrustLevel(newScore),
      abuse_reports: newReports,
    });
  });

  return router;
}
