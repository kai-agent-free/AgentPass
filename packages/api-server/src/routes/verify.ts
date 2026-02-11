/**
 * Passport verification route.
 *
 * POST /verify — verify an agent's passport signature using Ed25519
 *                challenge-response authentication.
 */

import { Hono } from "hono";
import { z } from "zod";
import { verifyChallenge } from "@agentpass/core";
import type { Client } from "@libsql/client";
import { zValidator, getValidatedBody } from "../middleware/validation.js";

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
}

/**
 * Create the verify router bound to the given database instance.
 */
export function createVerifyRouter(db: Client): Hono {
  const router = new Hono();

  // POST /verify — verify passport signature
  router.post("/", zValidator(VerifySchema), async (c) => {
    const body = getValidatedBody<VerifyBody>(c);

    const result = await db.execute({
      sql: "SELECT id, public_key, trust_score, status FROM passports WHERE id = ?",
      args: [body.passport_id],
    });
    const row = result.rows[0] as unknown as PassportVerifyRow | undefined;

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

    // Increment successful auths trust score on valid verification
    if (valid) {
      await db.execute({
        sql: "UPDATE passports SET trust_score = trust_score + 1, updated_at = ? WHERE id = ?",
        args: [new Date().toISOString(), row.id],
      });
    }

    return c.json({
      valid,
      passport_id: row.id,
      trust_score: valid ? row.trust_score + 1 : row.trust_score,
      status: row.status,
    });
  });

  return router;
}
