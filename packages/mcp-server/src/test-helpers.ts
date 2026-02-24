/**
 * Test helpers and utilities for integration tests.
 */

import { CredentialVault, generateKeyPair } from "@agentpass/core";
import { IdentityService } from "./services/identity-service.js";
import { randomBytes } from "node:crypto";
import type { ApiClient } from "./services/api-client.js";

/**
 * Create a mock ApiClient that simulates passport registration locally.
 */
export function createMockApiClient(): ApiClient {
  return {
    registerPassport(params: { public_key: string; name: string; description: string }) {
      const passportId = `ap_${randomBytes(6).toString("hex")}`;
      const email = `${params.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}@agent-mail.xyz`;
      return Promise.resolve({
        passport_id: passportId,
        email,
        created_at: new Date().toISOString(),
      });
    },
  } as unknown as ApiClient;
}

/**
 * Create and initialize an IdentityService with an in-memory vault
 * and a mock API client.
 * Returns both the service and vault for cleanup.
 */
export async function createTestIdentityService(): Promise<{
  identityService: IdentityService;
  vault: CredentialVault;
}> {
  const { privateKey } = generateKeyPair();
  const vault = new CredentialVault(":memory:", privateKey);
  await vault.init();

  const identityService = new IdentityService();
  await identityService.init(vault, createMockApiClient());

  return { identityService, vault };
}
