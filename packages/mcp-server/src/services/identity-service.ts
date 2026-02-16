/**
 * Identity management service.
 *
 * Manages agent identity creation, storage, and retrieval.
 * Uses encrypted SQLite vault for persistent storage.
 */

import {
  generateKeyPair,
  createPassport,
  CredentialVault,
  type KeyPair,
  type AgentPassport,
  type StoredIdentity,
  type IdentityListEntry,
} from "@agentpass/core";
import type { ApiClient } from "./api-client.js";

export interface IdentitySummary {
  passport_id: string;
  name: string;
  status: "active" | "revoked";
  created_at: string;
}

export interface CreateIdentityResult {
  passport: AgentPassport;
  publicKey: string;
  apiRegistered: boolean;
  email?: string;
}

export class IdentityService {
  private vault: CredentialVault | null = null;
  private apiClient: ApiClient | undefined;

  /**
   * Initialize the service with a vault instance and optional API client.
   *
   * Must be called before any other method. If apiClient is provided,
   * identities will be registered on the API server during creation.
   */
  async init(vault: CredentialVault, apiClient?: ApiClient): Promise<void> {
    this.vault = vault;
    this.apiClient = apiClient;
  }

  /**
   * Create a new agent identity.
   *
   * Generates an Ed25519 key pair, registers the passport on the AgentPass
   * API server, and stores everything in the encrypted vault. The private
   * key never leaves the local store.
   *
   * Requires a configured API client (AGENTPASS_API_KEY). The owner email
   * is resolved server-side from the API key — no need to pass it explicitly.
   */
  async createIdentity(input: {
    name: string;
    description?: string;
  }): Promise<CreateIdentityResult> {
    this.ensureInitialized();

    if (!this.apiClient) {
      throw new Error(
        "AGENTPASS_API_KEY is not configured. Cannot create passports without API registration.",
      );
    }

    const keyPair: KeyPair = generateKeyPair();

    // Register on API server — owner_email is resolved from API key
    const apiResult = await this.apiClient.registerPassport({
      public_key: keyPair.publicKey,
      name: input.name,
      description: input.description ?? "",
    });

    const passport = createPassport(
      {
        name: input.name,
        description: input.description ?? "",
        owner_email: apiResult.email,
      },
      keyPair.publicKey,
      apiResult.passport_id,
    );

    const storedIdentity: StoredIdentity = {
      passport,
      privateKey: keyPair.privateKey,
      status: "active",
    };

    await this.vault!.storeIdentity(storedIdentity);

    return {
      passport,
      publicKey: keyPair.publicKey,
      apiRegistered: true,
      email: apiResult.email,
    };
  }

  /**
   * List all stored identities (summary only, no secrets).
   */
  async listIdentities(): Promise<IdentitySummary[]> {
    this.ensureInitialized();

    const entries: IdentityListEntry[] = await this.vault!.listIdentities();
    return entries;
  }

  /**
   * Retrieve a single identity by passport_id.
   *
   * Returns the full passport (public info only) or null if not found.
   */
  async getIdentity(passportId: string): Promise<AgentPassport | null> {
    this.ensureInitialized();

    const stored = await this.vault!.getIdentity(passportId);
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
  async deleteIdentity(passportId: string): Promise<boolean> {
    this.ensureInitialized();

    return await this.vault!.deleteIdentity(passportId);
  }

  /**
   * Revoke an identity (mark as revoked, keep in store for audit).
   */
  async revokeIdentity(passportId: string): Promise<boolean> {
    this.ensureInitialized();

    const stored = await this.vault!.getIdentity(passportId);
    if (!stored) {
      return false;
    }

    stored.status = "revoked";
    await this.vault!.storeIdentity(stored);
    return true;
  }

  /**
   * Get the private key for a given passport ID.
   *
   * This is used internally for signing operations.
   * The private key should never be exposed outside the service layer.
   */
  async getPrivateKey(passportId: string): Promise<string | null> {
    this.ensureInitialized();

    const stored = await this.vault!.getIdentity(passportId);
    if (!stored) {
      return null;
    }
    return stored.privateKey;
  }

  /** Throw if `init()` has not been called. */
  private ensureInitialized(): void {
    if (!this.vault) {
      throw new Error("IdentityService is not initialized. Call init() first.");
    }
  }
}
