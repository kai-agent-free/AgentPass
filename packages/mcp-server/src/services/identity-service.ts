/**
 * Identity management service.
 *
 * Manages agent identity creation, storage, and retrieval.
 * Currently uses an in-memory Map; a persistent SQLite vault will replace this.
 */

import {
  generateKeyPair,
  createPassport,
  type KeyPair,
  type AgentPassport,
} from "@agentpass/core";

export interface IdentitySummary {
  passport_id: string;
  name: string;
  status: "active" | "revoked";
  created_at: string;
}

export interface StoredIdentity {
  passport: AgentPassport;
  privateKey: string;
  status: "active" | "revoked";
}

export class IdentityService {
  private identities = new Map<string, StoredIdentity>();

  /**
   * Create a new agent identity.
   *
   * Generates an Ed25519 key pair, builds a passport, and stores everything
   * in memory. The private key never leaves the local store.
   */
  createIdentity(input: {
    name: string;
    description?: string;
    owner_email: string;
  }): { passport: AgentPassport; publicKey: string } {
    const keyPair: KeyPair = generateKeyPair();
    const passport = createPassport(
      {
        name: input.name,
        description: input.description ?? "",
        owner_email: input.owner_email,
      },
      keyPair.publicKey,
    );

    this.identities.set(passport.passport_id, {
      passport,
      privateKey: keyPair.privateKey,
      status: "active",
    });

    return { passport, publicKey: keyPair.publicKey };
  }

  /**
   * List all stored identities (summary only, no secrets).
   */
  listIdentities(): IdentitySummary[] {
    const result: IdentitySummary[] = [];
    for (const stored of this.identities.values()) {
      result.push({
        passport_id: stored.passport.passport_id,
        name: stored.passport.identity.name,
        status: stored.status,
        created_at: stored.passport.identity.created_at,
      });
    }
    return result;
  }

  /**
   * Retrieve a single identity by passport_id.
   *
   * Returns the full passport (public info only) or null if not found.
   */
  getIdentity(passportId: string): AgentPassport | null {
    const stored = this.identities.get(passportId);
    if (!stored) {
      return null;
    }
    return stored.passport;
  }

  /**
   * Delete an identity by passport_id.
   *
   * Returns true if the identity existed and was removed, false otherwise.
   */
  deleteIdentity(passportId: string): boolean {
    return this.identities.delete(passportId);
  }

  /**
   * Revoke an identity (mark as revoked, keep in store for audit).
   */
  revokeIdentity(passportId: string): boolean {
    const stored = this.identities.get(passportId);
    if (!stored) {
      return false;
    }
    stored.status = "revoked";
    return true;
  }
}
