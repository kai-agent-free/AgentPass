/**
 * Trust score routes.
 *
 * GET   /passports/:id/trust                - Get current trust details
 * PATCH /passports/:id/trust/verify-owner   - Set owner_verified flag
 * PATCH /passports/:id/trust/payment-method - Set payment_method flag
 * POST  /passports/:id/report-abuse         - Report abuse and recalculate trust score
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Sql } from "../db/schema.js";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { requireAuth, type OwnerPayload, type AuthVariables } from "../middleware/auth.js";
import {
  calculateTrustScore,
  getTrustLevel,
  type TrustFactors,
  type ExternalAttestationFactor,
} from "../services/trust-score.js";

// --- Zod schema for abuse report ---

const ReportAbuseSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(512, "Reason must be 512 characters or fewer"),
});

const AddAttestationSchema = z.object({
  source: z.string().min(1, "Source is required").max(128),
  attester_id: z.string().min(1, "Attester ID is required").max(256),
  score: z.number().min(0).max(1),
  attested_at: z.string().min(1, "Attested at is required"),
  signature: z.string().optional(),
});

type ReportAbuseBody = z.infer<typeof ReportAbuseSchema>;

// --- Row types ---

interface PassportRow {
  id: string;
  owner_email: string;
  trust_score: number;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}


/**
 * Parse the metadata JSONB column, returning a typed object with
 * known trust-related fields.
 */
function parseMetadata(raw: Record<string, unknown> | string | null): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

/**
 * Build TrustFactors from a passport row and its audit history.
 */
function buildTrustFactors(
  metadata: Record<string, unknown>,
  createdAt: Date,
  successfulAuths: number,
): TrustFactors {
  const ageDays = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    owner_verified: metadata.owner_verified === true,
    payment_method: metadata.payment_method === true,
    age_days: ageDays,
    successful_auths: successfulAuths,
    abuse_reports: typeof metadata.abuse_reports === "number" ? metadata.abuse_reports : 0,
    external_attestations: Array.isArray(metadata.external_attestations)
      ? (metadata.external_attestations as ExternalAttestationFactor[])
      : undefined,
  };
}

/**
 * Create the trust router bound to the given database instance.
 */
export function createTrustRouter(db: Sql): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  /**
   * Count successful verifications for a passport based on audit log entries.
   */
  async function getSuccessfulAuths(passportId: string): Promise<number> {
    const rows = await db<{ count: number }[]>`
      SELECT COUNT(*) as count FROM audit_log
      WHERE passport_id = ${passportId} AND action = 'verify' AND result = 'success'
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Fetch a passport row and verify ownership. Returns the row or a JSON error response.
   */
  async function fetchOwnedPassport(
    c: any,
    passportId: string,
    owner: OwnerPayload,
  ): Promise<PassportRow | Response> {
    const rows = await db<PassportRow[]>`
      SELECT id, owner_email, trust_score, status, metadata, created_at
      FROM passports WHERE id = ${passportId}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    if (row.owner_email !== owner.email) {
      return c.json(
        { error: "Access denied", code: "FORBIDDEN" },
        403,
      );
    }

    return row;
  }

  /**
   * Recalculate trust score, persist it, and return the new score + level.
   */
  async function recalculateAndPersist(
    passportId: string,
    metadata: Record<string, unknown>,
    createdAt: Date,
  ): Promise<{ score: number; level: string; factors: TrustFactors }> {
    const successfulAuths = await getSuccessfulAuths(passportId);
    const factors = buildTrustFactors(metadata, createdAt, successfulAuths);
    const score = calculateTrustScore(factors);

    const metadataJson = JSON.stringify(metadata);
    await db`
      UPDATE passports
      SET trust_score = ${score}, metadata = ${metadataJson}::jsonb, updated_at = NOW()
      WHERE id = ${passportId}
    `;

    return { score, level: getTrustLevel(score), factors };
  }

  // GET /passports/:id/trust — return current trust details
  router.get("/:id/trust", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const result = await fetchOwnedPassport(c, passportId, owner);
    if (result instanceof Response) return result;
    const row = result;

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

  // PATCH /passports/:id/trust/verify-owner — set owner_verified flag
  router.patch("/:id/trust/verify-owner", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const result = await fetchOwnedPassport(c, passportId, owner);
    if (result instanceof Response) return result;
    const row = result;

    const metadata = parseMetadata(row.metadata);
    metadata.owner_verified = true;

    const { score, level, factors } = await recalculateAndPersist(
      passportId,
      metadata,
      row.created_at,
    );

    return c.json({
      passport_id: row.id,
      trust_score: score,
      trust_level: level,
      factors,
    });
  });

  // PATCH /passports/:id/trust/payment-method — set payment_method flag
  router.patch("/:id/trust/payment-method", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const result = await fetchOwnedPassport(c, passportId, owner);
    if (result instanceof Response) return result;
    const row = result;

    const metadata = parseMetadata(row.metadata);
    metadata.payment_method = true;

    const { score, level, factors } = await recalculateAndPersist(
      passportId,
      metadata,
      row.created_at,
    );

    return c.json({
      passport_id: row.id,
      trust_score: score,
      trust_level: level,
      factors,
    });
  });

  // POST /passports/:id/report-abuse — increment abuse count and recalculate
  router.post("/:id/report-abuse", requireAuth(db), zValidator(ReportAbuseSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const result = await fetchOwnedPassport(c, passportId, owner);
    if (result instanceof Response) return result;
    const row = result;

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

    const { score, level } = await recalculateAndPersist(
      passportId,
      metadata,
      row.created_at,
    );

    return c.json({
      passport_id: row.id,
      trust_score: score,
      trust_level: level,
      abuse_reports: newReports,
    });
  });

  // POST /passports/:id/attestations — add external attestation
  router.post("/:id/attestations", requireAuth(db), zValidator(AddAttestationSchema), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const result = await fetchOwnedPassport(c, passportId, owner);
    if (result instanceof Response) return result;
    const row = result;

    const body = getValidatedBody<z.infer<typeof AddAttestationSchema>>(c);
    const metadata = parseMetadata(row.metadata);

    // Initialize attestations array if needed
    if (!Array.isArray(metadata.external_attestations)) {
      metadata.external_attestations = [];
    }

    const attestation: ExternalAttestationFactor = {
      source: body.source,
      attester_id: body.attester_id,
      score: body.score,
      attested_at: body.attested_at,
      ...(body.signature ? { signature: body.signature } : {}),
    };

    (metadata.external_attestations as ExternalAttestationFactor[]).push(attestation);

    const { score, level, factors } = await recalculateAndPersist(
      passportId,
      metadata,
      row.created_at,
    );

    return c.json({
      passport_id: row.id,
      trust_score: score,
      trust_level: level,
      attestation,
    }, 201);
  });

  // GET /passports/:id/attestations — list external attestations
  router.get("/:id/attestations", requireAuth(db), async (c) => {
    const owner = c.get("owner") as OwnerPayload;
    const passportId = c.req.param("id");

    const result = await fetchOwnedPassport(c, passportId, owner);
    if (result instanceof Response) return result;
    const row = result;

    const metadata = parseMetadata(row.metadata);
    const attestations = Array.isArray(metadata.external_attestations)
      ? metadata.external_attestations
      : [];

    return c.json({
      passport_id: row.id,
      attestations,
      count: attestations.length,
    });
  });

  return router;
}
