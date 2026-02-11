import crypto from "node:crypto";
import type { AgentPassport } from "../types/index.js";
import type { CreatePassportInput } from "./validation.js";

/**
 * Generate a unique passport ID in format: ap_xxxxxxxxxxxx (12 random hex chars)
 */
export function generatePassportId(): string {
  const randomBytes = crypto.randomBytes(6);
  const hex = randomBytes.toString("hex");
  return `ap_${hex}`;
}

/**
 * Create a new AgentPassport from input parameters and a generated key pair.
 */
export function createPassport(
  input: CreatePassportInput,
  publicKey: string,
): AgentPassport {
  const now = new Date().toISOString();
  const passportId = generatePassportId();
  const ownerId = crypto.randomUUID();

  return {
    passport_id: passportId,
    version: "1.0",
    identity: {
      name: input.name,
      description: input.description ?? "",
      public_key: publicKey,
      created_at: now,
    },
    owner: {
      id: ownerId,
      email: input.owner_email,
      verified: false,
    },
    capabilities: input.capabilities ?? {},
    trust: {
      score: 0,
      level: "unverified",
      factors: {
        owner_verified: false,
        email_verified: false,
        age_days: 0,
        successful_auths: 0,
        abuse_reports: 0,
      },
    },
    credentials_vault: {
      services_count: 0,
      encrypted: true,
      encryption: "AES-256-GCM",
    },
    permissions: input.permissions ?? {
      max_registrations_per_day: 10,
      allowed_domains: [],
      blocked_domains: [],
      requires_owner_approval: [],
      auto_approved: ["*"],
    },
    audit: {
      total_actions: 0,
      last_action: now,
      log_retention_days: 90,
    },
  };
}
