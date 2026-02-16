/**
 * Passport verification route.
 *
 * POST /verify — verify an agent's passport signature using Ed25519
 *                challenge-response authentication.
 */

import { Hono } from "hono";
import { z } from "zod";
import { verifyChallenge } from "@agentpass/core";
import type { Sql } from "../db/schema.js";
import { zValidator, getValidatedBody } from "../middleware/validation.js";
import { rateLimiters } from "../middleware/rate-limiter.js";
import {
  calculateTrustScore,
  getTrustLevel,
  type TrustFactors,
} from "../services/trust-score.js";

// --- Zod schema for verification request ---

const VerifySchema = z.object({
  passport_id: z.string().min(1, "Passport ID is required"),
  challenge: z.string().min(1, "Challenge is required"),
  signature: z.string().min(1, "Signature is required"),
});

type VerifyBody = z.infer<typeof VerifySchema>;

// --- Row type ---

interface PassportVerifyRow {
  id: string;
  public_key: string;
  trust_score: number;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

/**
 * Create the verify router bound to the given database instance.
 */
export function createVerifyRouter(db: Sql): Hono {
  const router = new Hono();

  // POST /verify — verify passport signature
  router.post("/", rateLimiters.verifyPassport, zValidator(VerifySchema), async (c) => {
    const body = getValidatedBody<VerifyBody>(c);

    const rows = await db<PassportVerifyRow[]>`
      SELECT id, public_key, trust_score, status, metadata, created_at
      FROM passports WHERE id = ${body.passport_id}
    `;
    const row = rows[0];

    if (!row) {
      return c.json(
        { error: "Passport not found", code: "NOT_FOUND" },
        404,
      );
    }

    if (row.status === "revoked") {
      return c.json(
        {
          valid: false,
          passport_id: row.id,
          trust_score: row.trust_score,
          trust_level: getTrustLevel(row.trust_score),
          status: row.status,
          error: "Passport has been revoked",
          code: "PASSPORT_REVOKED",
        },
        403,
      );
    }

    let valid: boolean;
    try {
      valid = verifyChallenge(body.challenge, body.signature, row.public_key);
    } catch {
      valid = false;
    }

    // Write audit log entry for this verification attempt
    const auditId = crypto.randomUUID();
    await db`
      INSERT INTO audit_log (id, passport_id, action, service, method, result, details)
      VALUES (
        ${auditId},
        ${row.id},
        'verify',
        'agentpass',
        'challenge-response',
        ${valid ? "success" : "failure"},
        ${JSON.stringify({ challenge: body.challenge })}::jsonb
      )
    `;

    let newScore = row.trust_score;
    if (valid) {
      // Count successful auths from audit_log (including the one we just inserted)
      const countRows = await db<{ count: number }[]>`
        SELECT COUNT(*) as count FROM audit_log
        WHERE passport_id = ${row.id} AND action = 'verify' AND result = 'success'
      `;
      const successfulAuths = Number(countRows[0]?.count ?? 0);

      // Build trust factors and recalculate
      const metadata = row.metadata ?? {};
      const ageDays = Math.floor(
        (Date.now() - row.created_at.getTime()) / (1000 * 60 * 60 * 24),
      );

      const factors: TrustFactors = {
        owner_verified: metadata.owner_verified === true,
        payment_method: metadata.payment_method === true,
        age_days: ageDays,
        successful_auths: successfulAuths,
        abuse_reports: typeof metadata.abuse_reports === "number" ? metadata.abuse_reports : 0,
      };

      newScore = calculateTrustScore(factors);

      await db`
        UPDATE passports SET trust_score = ${newScore}, updated_at = NOW() WHERE id = ${row.id}
      `;
    }

    return c.json({
      valid,
      passport_id: row.id,
      trust_score: newScore,
      trust_level: getTrustLevel(newScore),
      status: row.status,
    });
  });

  return router;
}
