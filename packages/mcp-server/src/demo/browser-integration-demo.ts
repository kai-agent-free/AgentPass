/**
 * Browser Integration Demo
 *
 * Demonstrates how to wire the PlaywrightBrowserAdapter into FallbackAuthService
 * for end-to-end fallback authentication with real browser automation.
 *
 * This is NOT meant to be run in automated tests (requires a real browser).
 * Use this for manual testing and verification of the browser integration.
 */

import { FallbackAuthService } from "../services/fallback-auth-service.js";
import { IdentityService } from "../services/identity-service.js";
import { CredentialService } from "../services/credential-service.js";
import { SessionService } from "../services/session-service.js";
import { WebhookService } from "../services/webhook-service.js";
import { EmailServiceAdapter } from "../services/email-service-adapter.js";
import { PlaywrightBrowserAdapter } from "../adapters/playwright-browser-adapter.js";
import { CredentialVault, generateKeyPair } from "@agentpass/core";

/**
 * Example: Create a FallbackAuthService with real browser automation.
 *
 * Usage:
 * ```ts
 * const service = createFallbackAuthServiceWithBrowser();
 * const result = await service.authenticateOnService(passportId, "https://github.com");
 * await service.close(); // Clean up browser resources
 * ```
 */
export async function createFallbackAuthServiceWithBrowser(options?: {
  headless?: boolean;
  proxy?: string;
}): Promise<FallbackAuthService & { close: () => Promise<void> }> {
  // Initialize vault with in-memory database
  const { privateKey } = generateKeyPair();
  const vault = new CredentialVault(":memory:", privateKey);
  await vault.init();

  const identityService = new IdentityService();
  await identityService.init(vault);

  const credentialService = new CredentialService();
  const sessionService = new SessionService();
  const webhookService = new WebhookService();
  const emailAdapter = new EmailServiceAdapter();

  // Create the Playwright browser adapter
  const browserAdapter = new PlaywrightBrowserAdapter({
    headless: options?.headless ?? true,
    proxy: options?.proxy,
  });

  // Wire it into FallbackAuthService
  const service = new FallbackAuthService(
    identityService,
    credentialService,
    sessionService,
    webhookService,
    emailAdapter,
    browserAdapter,
  );

  // Return the service with a cleanup method
  return Object.assign(service, {
    close: async () => {
      await browserAdapter.close();
      vault.close();
    },
  });
}

/**
 * Example demo scenario: register a new agent on a service.
 *
 * NOTE: This is a manual test — run only when you have a test service set up.
 * DO NOT run this against real production services without permission.
 */
export async function runBrowserIntegrationDemo(): Promise<void> {
  console.log("[Browser Integration Demo] Starting...\n");

  // Step 1: Create services
  const service = await createFallbackAuthServiceWithBrowser({ headless: false });

  // Initialize vault and identity service for creating test identity
  const { privateKey } = generateKeyPair();
  const vault = new CredentialVault(":memory:", privateKey);
  await vault.init();

  const identityService = new IdentityService();
  await identityService.init(vault);

  // Step 2: Create a test identity
  const { passport } = await identityService.createIdentity({
    name: "demo-browser-agent",
    description: "Test agent for browser integration",
  });

  console.log(`Created identity: ${passport.passport_id}\n`);

  // Step 3: Attempt authentication on a test service
  // NOTE: Replace this URL with a test service you control
  const testServiceUrl = "https://example.com";

  console.log(`Authenticating on ${testServiceUrl}...\n`);

  try {
    const result = await service.authenticateOnService(
      passport.passport_id,
      testServiceUrl,
    );

    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    console.error("Demo failed:", error);
  } finally {
    // Step 4: Clean up browser resources and vault
    await service.close();
    vault.close();
    console.log("\n[Browser Integration Demo] Complete.");
  }
}

// Uncomment to run the demo manually:
// runBrowserIntegrationDemo().catch(console.error);
