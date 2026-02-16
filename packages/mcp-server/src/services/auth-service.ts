/**
 * Authentication orchestration service.
 *
 * Coordinates the authenticate() flow:
 * 1. Try native auth via /.well-known/agentpass.json (Ed25519 challenge-response)
 * 2. If not supported → check credential vault for fallback
 * 3. If credentials exist → fallback_login
 * 4. If no credentials → fallback_register
 */

import type { IdentityService } from "./identity-service.js";
import type { CredentialService } from "./credential-service.js";
import { NativeAuthService } from "./native-auth-service.js";

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
  private readonly nativeAuthService: NativeAuthService;

  constructor(
    private readonly identityService: IdentityService,
    private readonly credentialService: CredentialService,
    nativeAuthService?: NativeAuthService,
  ) {
    this.nativeAuthService = nativeAuthService ?? new NativeAuthService();
  }

  /**
   * Authenticate an agent on a target service.
   *
   * Flow:
   * 1. Verify the identity exists and is active
   * 2. Try native auth (/.well-known/agentpass.json → Ed25519 challenge-response)
   * 3. If native not supported → check credential vault for fallback
   * 4. If credentials exist → fallback_login
   * 5. If no credentials → fallback_register
   */
  async authenticate(input: {
    passport_id: string;
    service_url: string;
  }): Promise<AuthResult> {
    const serviceDomain = this.extractDomain(input.service_url);

    // Step 1: Verify identity exists
    const passport = await this.identityService.getIdentity(input.passport_id);
    if (!passport) {
      return {
        success: false,
        method: "fallback_login",
        service: serviceDomain,
        passport_id: input.passport_id,
        error: `Identity not found: ${input.passport_id}`,
      };
    }

    // Step 2: Try native auth first
    const nativeSupport = await this.nativeAuthService.checkNativeSupport(input.service_url);
    if (nativeSupport.supported) {
      const privateKey = await this.identityService.getPrivateKey(input.passport_id);
      if (privateKey) {
        const nativeResult = await this.nativeAuthService.authenticateNative(
          input.passport_id,
          input.service_url,
          privateKey,
        );
        if (nativeResult.success) {
          return {
            success: true,
            method: "native",
            service: serviceDomain,
            passport_id: input.passport_id,
            session_token: nativeResult.session_token,
          };
        }
        // Native auth failed — return error, don't fall through to fallback
        return {
          success: false,
          method: "native",
          service: serviceDomain,
          passport_id: input.passport_id,
          error: nativeResult.error,
        };
      }
    }

    // Step 3: Check for existing credentials (fallback)
    const credential = await this.credentialService.getCredential(
      input.passport_id,
      serviceDomain,
    );

    if (credential) {
      // Step 4: Credentials found — would attempt login via browser
      return {
        success: true,
        method: "fallback_login",
        service: serviceDomain,
        passport_id: input.passport_id,
        requires_action: "browser_login",
      };
    }

    // Step 5: No credentials — would trigger registration via browser
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
  async checkAuthStatus(
    passportId: string,
    serviceUrl: string,
  ): Promise<{
    has_credentials: boolean;
    service: string;
  }> {
    const serviceDomain = this.extractDomain(serviceUrl);
    const credential = await this.credentialService.getCredential(
      passportId,
      serviceDomain,
    );

    return {
      has_credentials: credential !== null,
      service: serviceDomain,
    };
  }

  /**
   * Logout an agent from a service by deleting its stored credentials.
   */
  async logout(
    passportId: string,
    service: string,
  ): Promise<{ success: boolean }> {
    const deleted = await this.credentialService.deleteCredential(
      passportId,
      service,
    );
    return { success: deleted };
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
