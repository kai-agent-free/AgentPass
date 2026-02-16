/**
 * AgentPass E2E Demo Scenario.
 *
 * A self-contained demo that showcases the full AgentPass flow:
 * 1. Create an agent identity
 * 2. Credential management (store, list, get)
 * 3. Authentication flow (fallback_login, fallback_register)
 * 4. Session / auth status check
 * 5. Email service
 *
 * Uses actual service classes — no mocks.
 */

import { IdentityService } from "../services/identity-service.js";
import { CredentialService } from "../services/credential-service.js";
import { AuthService } from "../services/auth-service.js";
import { EmailServiceAdapter } from "../services/email-service-adapter.js";
import { CredentialVault, generateKeyPair } from "@agentpass/core";

export interface DemoStepResult {
  step: number;
  name: string;
  description: string;
  result: unknown;
}

export interface DemoResult {
  success: boolean;
  steps: DemoStepResult[];
  passport_id: string;
}

/**
 * Run the full AgentPass demo scenario.
 *
 * Each step logs a clear description and result, then returns
 * a structured summary of all steps.
 */
export async function runDemo(): Promise<DemoResult> {
  // Initialize vault with in-memory database for demo
  const { privateKey } = generateKeyPair();
  const vault = new CredentialVault(":memory:", privateKey);
  await vault.init();

  const identityService = new IdentityService();
  await identityService.init(vault);

  const credentialService = new CredentialService();
  const authService = new AuthService(identityService, credentialService);
  const emailService = new EmailServiceAdapter();

  const steps: DemoStepResult[] = [];
  let passportId = "";

  // ── Step 1: Create an agent identity ──────────────────────────────
  const step1Name = "create_identity";
  const step1Desc =
    'Create a new agent identity ("demo-agent") with an Ed25519 key pair';
  const { passport, publicKey } = await identityService.createIdentity({
    name: "demo-agent",
    description: "Demo agent for showcase",
  });
  passportId = passport.passport_id;

  const step1Result = {
    passport_id: passport.passport_id,
    name: passport.identity.name,
    public_key: publicKey,
    created_at: passport.identity.created_at,
  };
  steps.push({ step: 1, name: step1Name, description: step1Desc, result: step1Result });
  console.log(`\n[Step 1] ${step1Desc}`);
  console.log(`  -> passport_id: ${passport.passport_id}`);
  console.log(`  -> public_key:  ${publicKey.slice(0, 32)}...`);

  // ── Step 2: Store a credential ────────────────────────────────────
  const step2Name = "store_credential";
  const step2Desc = "Store a GitHub credential in the agent's vault";
  const storedCred = await credentialService.storeCredential({
    passport_id: passportId,
    service: "github.com",
    username: "demo-agent",
    password: "secret123",
    email: "demo@agent-mail.xyz",
  });
  steps.push({ step: 2, name: step2Name, description: step2Desc, result: storedCred });
  console.log(`\n[Step 2] ${step2Desc}`);
  console.log(`  -> service: ${storedCred.service}, username: ${storedCred.username}`);

  // ── Step 3: List credentials (no password exposed) ────────────────
  const step3Name = "list_credentials";
  const step3Desc = "List stored credentials (passwords hidden)";
  const credList = await credentialService.listCredentials(passportId);
  steps.push({ step: 3, name: step3Name, description: step3Desc, result: credList });
  console.log(`\n[Step 3] ${step3Desc}`);
  console.log(`  -> ${credList.length} credential(s): ${credList.map((c) => c.service).join(", ")}`);

  // ── Step 4: Get full credential ───────────────────────────────────
  const step4Name = "get_credential";
  const step4Desc = "Retrieve full credential for github.com";
  const fullCred = await credentialService.getCredential(passportId, "github.com");
  steps.push({ step: 4, name: step4Name, description: step4Desc, result: fullCred });
  console.log(`\n[Step 4] ${step4Desc}`);
  console.log(`  -> username: ${fullCred?.username}, email: ${fullCred?.email}`);

  // ── Step 5: Authenticate (has credentials -> fallback_login) ──────
  const step5Name = "authenticate_with_credentials";
  const step5Desc = "Authenticate on github.com (has credentials -> fallback_login)";
  const authGithub = await authService.authenticate({
    passport_id: passportId,
    service_url: "https://github.com",
  });
  steps.push({ step: 5, name: step5Name, description: step5Desc, result: authGithub });
  console.log(`\n[Step 5] ${step5Desc}`);
  console.log(`  -> method: ${authGithub.method}, success: ${authGithub.success}`);

  // ── Step 6: Authenticate (no credentials -> fallback_register) ────
  const step6Name = "authenticate_without_credentials";
  const step6Desc = "Authenticate on gitlab.com (no credentials -> fallback_register)";
  const authGitlab = await authService.authenticate({
    passport_id: passportId,
    service_url: "https://gitlab.com",
  });
  steps.push({ step: 6, name: step6Name, description: step6Desc, result: authGitlab });
  console.log(`\n[Step 6] ${step6Desc}`);
  console.log(`  -> method: ${authGitlab.method}, success: ${authGitlab.success}`);

  // ── Step 7: Check auth status ─────────────────────────────────────
  const step7Name = "check_auth_status";
  const step7Desc = "Check auth status for github.com (should have credentials)";
  const status = await authService.checkAuthStatus(passportId, "https://github.com");
  steps.push({ step: 7, name: step7Name, description: step7Desc, result: status });
  console.log(`\n[Step 7] ${step7Desc}`);
  console.log(`  -> has_credentials: ${status.has_credentials}`);

  // ── Step 8: Email service ─────────────────────────────────────────
  const step8Name = "get_email_address";
  const step8Desc = "Get the agent's dedicated email address";
  const emailAddress = emailService.getEmailAddress("demo-agent");
  steps.push({ step: 8, name: step8Name, description: step8Desc, result: { address: emailAddress } });
  console.log(`\n[Step 8] ${step8Desc}`);
  console.log(`  -> address: ${emailAddress}`);

  console.log("\n--- Demo complete! ---\n");

  return {
    success: true,
    steps,
    passport_id: passportId,
  };
}
