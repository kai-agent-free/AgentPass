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
 * Generate a deterministic agent email address from the agent name.
 * Sanitizes to lowercase alphanumeric + hyphens.
 */
function generateAgentEmail(agentName: string): string {
  const sanitized = agentName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${sanitized || "agent"}@agent-mail.xyz`;
}

/**
 * Create a new AgentPassport from input parameters and a generated key pair.
 * Automatically assigns email capability based on agent name.
 */
export function createPassport(
  input: CreatePassportInput,
  publicKey: string,
  passportId?: string,
): AgentPassport {
  const now = new Date().toISOString();
  passportId = passportId || generatePassportId();
  const ownerId = crypto.randomUUID();
  const agentEmail = generateAgentEmail(input.name);

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
    capabilities: input.capabilities ?? {
      email: {
        address: agentEmail,
        can_send: false,
        can_receive: true,
      },
    },
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
