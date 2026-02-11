/**
 * Authentication orchestration service.
 *
 * Coordinates the authenticate() flow:
 * 1. Check credential vault for existing credentials
 * 2. If found → attempt login (fallback_login)
 * 3. If not found → trigger registration (fallback_register)
 * 4. Future: detect native auth via /.well-known/agentpass.json
 */

import type { IdentityService } from "./identity-service.js";
import type { CredentialService } from "./credential-service.js";

export interface AuthResult {
  success: boolean;
  method: "native" | "fallback_login" | "fallback_register";
  service: string;
  passport_id: string;
  session_token?: string;
  error?: string;
  requires_action?: string;
}

export class AuthService {
  constructor(
    private readonly identityService: IdentityService,
    private readonly credentialService: CredentialService,
  ) {}

  /**
   * Authenticate an agent on a target service.
   *
   * Flow:
   * 1. Verify the identity exists and is active
   * 2. Check if credentials already exist for this service
   * 3. If credentials exist → return fallback_login result
   * 4. If no credentials → return fallback_register result (needs browser automation)
   *
   * Browser automation and native auth will be integrated in future tasks.
   */
  async authenticate(input: {
    passport_id: string;
    service_url: string;
  }): Promise<AuthResult> {
    const serviceDomain = this.extractDomain(input.service_url);

    // Step 1: Verify identity exists
    const passport = this.identityService.getIdentity(input.passport_id);
    if (!passport) {
      return {
        success: false,
        method: "fallback_login",
        service: serviceDomain,
        passport_id: input.passport_id,
        error: `Identity not found: ${input.passport_id}`,
      };
    }

    // Step 2: Check for existing credentials
    const credential = this.credentialService.getCredential(
      input.passport_id,
      serviceDomain,
    );

    if (credential) {
      // Step 3: Credentials found — would attempt login via browser
      return {
        success: true,
        method: "fallback_login",
        service: serviceDomain,
        passport_id: input.passport_id,
        requires_action: "browser_login",
      };
    }

    // Step 4: No credentials — would trigger registration via browser
    return {
      success: false,
      method: "fallback_register",
      service: serviceDomain,
      passport_id: input.passport_id,
      requires_action: "browser_registration",
      error:
        "No credentials found. Registration required via browser automation.",
    };
  }

  /**
   * Check the authentication status for a service without triggering any action.
   */
  checkAuthStatus(
    passportId: string,
    serviceUrl: string,
  ): {
    has_credentials: boolean;
    service: string;
  } {
    const serviceDomain = this.extractDomain(serviceUrl);
    const credential = this.credentialService.getCredential(
      passportId,
      serviceDomain,
    );

    return {
      has_credentials: credential !== null,
      service: serviceDomain,
    };
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(
        url.startsWith("http") ? url : `https://${url}`,
      );
      return parsed.hostname;
    } catch {
      return url;
    }
  }
}
