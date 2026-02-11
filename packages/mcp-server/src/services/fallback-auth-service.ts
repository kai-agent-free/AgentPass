/**
 * Fallback authentication orchestration service.
 *
 * Wires together identity, credential, session, webhook, email, and browser
 * operations to execute the complete fallback auth flow:
 *
 *   1. Check identity exists
 *   2. Reuse an existing valid session (fast path)
 *   3. Login with stored credentials
 *   4. Register a new account when no credentials are available
 *
 * Browser interactions are abstracted behind the {@link BrowserOperations}
 * interface so the service is fully testable without a real browser.
 */

import type { IdentityService } from "./identity-service.js";
import type { CredentialService } from "./credential-service.js";
import type { SessionService } from "./session-service.js";
import type { WebhookService } from "./webhook-service.js";
import type { EmailServiceAdapter } from "./email-service-adapter.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result returned by {@link BrowserOperations.login}. */
export interface LoginResult {
  success: boolean;
  captcha_detected?: boolean;
  captcha_type?: string;
  error?: string;
  session_token?: string;
  cookies?: string;
}

/** Result returned by {@link BrowserOperations.register}. */
export interface RegistrationResult {
  success: boolean;
  credentials?: {
    username: string;
    password: string;
    email: string;
  };
  captcha_detected?: boolean;
  captcha_type?: string;
  error?: string;
  /** Whether email verification is required to complete registration. */
  needs_email_verification?: boolean;
}

/**
 * Abstraction over real browser automation so the orchestration service can be
 * tested without launching Playwright.
 */
export interface BrowserOperations {
  login(
    url: string,
    credentials: { username: string; password: string },
  ): Promise<LoginResult>;

  register(
    url: string,
    options: { email: string; password: string; name?: string },
  ): Promise<RegistrationResult>;
}

/** Final outcome of an authentication attempt. */
export interface AuthFlowResult {
  success: boolean;
  method: "session_reuse" | "fallback_login" | "fallback_register";
  service: string;
  passport_id: string;
  session?: { token?: string; cookies?: string };
  needs_human?: boolean;
  captcha_type?: string;
  error?: string;
  retries_used: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const GENERATED_PASSWORD_LENGTH = 24;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname;
  } catch {
    return url;
  }
}

function generatePassword(length: number = GENERATED_PASSWORD_LENGTH): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FallbackAuthService {
  constructor(
    private readonly identityService: IdentityService,
    private readonly credentialService: CredentialService,
    private readonly sessionService: SessionService,
    private readonly webhookService: WebhookService,
    private readonly emailServiceAdapter: EmailServiceAdapter,
    private readonly browserOps: BrowserOperations,
  ) {}

  // -----------------------------------------------------------------------
  // Main entry point
  // -----------------------------------------------------------------------

  /**
   * Orchestrate end-to-end fallback authentication for an agent on a service.
   *
   * Flow:
   * 1. Verify identity exists
   * 2. If a valid session already exists, return immediately (session_reuse)
   * 3. If credentials exist, attempt login (fallback_login)
   * 4. If no credentials, attempt registration (fallback_register)
   */
  async authenticateOnService(
    passportId: string,
    serviceUrl: string,
  ): Promise<AuthFlowResult> {
    const service = extractDomain(serviceUrl);

    // Step 1 -- verify identity
    const passport = this.identityService.getIdentity(passportId);
    if (!passport) {
      return {
        success: false,
        method: "fallback_login",
        service,
        passport_id: passportId,
        error: `Identity not found: ${passportId}`,
        retries_used: 0,
      };
    }

    const agentInfo = {
      passport_id: passportId,
      name: passport.identity.name,
    };

    // Step 2 -- check for an active session
    if (this.sessionService.hasValidSession(passportId, service)) {
      const session = this.sessionService.getSession(passportId, service)!;
      return {
        success: true,
        method: "session_reuse",
        service,
        passport_id: passportId,
        session: { token: session.token, cookies: session.cookies },
        retries_used: 0,
      };
    }

    // Step 3 -- try login if credentials exist
    const credential = this.credentialService.getCredential(
      passportId,
      service,
    );
    if (credential) {
      return this.attemptLogin(passportId, service, credential, agentInfo);
    }

    // Step 4 -- no credentials, attempt registration
    const email = this.emailServiceAdapter.getEmailAddress(
      passport.identity.name,
    );
    return this.attemptRegistration(passportId, service, email, agentInfo);
  }

  // -----------------------------------------------------------------------
  // Login flow
  // -----------------------------------------------------------------------

  /**
   * Attempt to log in to a service using stored credentials.
   * Retries up to {@link MAX_RETRIES} times on transient failures.
   */
  async attemptLogin(
    passportId: string,
    service: string,
    credential: { username: string; password: string },
    agentInfo: { passport_id: string; name: string },
  ): Promise<AuthFlowResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const loginUrl = `https://${service}/login`;
      const result = await this.browserOps.login(loginUrl, {
        username: credential.username,
        password: credential.password,
      });

      if (result.success) {
        // Create a session
        const session = this.sessionService.createSession({
          passport_id: passportId,
          service,
          token: result.session_token,
          cookies: result.cookies,
          ttl_ms: 3_600_000, // 1 hour default
        });

        // Emit success webhook
        await this.webhookService.emit(
          this.webhookService.createEvent(
            "agent.logged_in",
            agentInfo,
            { service, method: "fallback_login", retries: attempt },
          ),
        );

        return {
          success: true,
          method: "fallback_login",
          service,
          passport_id: passportId,
          session: { token: session.token, cookies: session.cookies },
          retries_used: attempt,
        };
      }

      // CAPTCHA detected -- no point retrying
      if (result.captcha_detected) {
        await this.webhookService.emit(
          this.webhookService.createEvent(
            "agent.captcha_needed",
            agentInfo,
            {
              service,
              captcha_type: result.captcha_type ?? "unknown",
              phase: "login",
            },
          ),
        );

        return {
          success: false,
          method: "fallback_login",
          service,
          passport_id: passportId,
          needs_human: true,
          captcha_type: result.captcha_type,
          error: result.error ?? "CAPTCHA detected during login",
          retries_used: attempt,
        };
      }

      lastError = result.error;
    }

    // All retries exhausted
    await this.webhookService.emit(
      this.webhookService.createEvent(
        "agent.login_failed",
        agentInfo,
        { service, error: lastError, retries: MAX_RETRIES },
      ),
    );

    return {
      success: false,
      method: "fallback_login",
      service,
      passport_id: passportId,
      error: lastError ?? "Login failed after max retries",
      retries_used: MAX_RETRIES,
    };
  }

  // -----------------------------------------------------------------------
  // Registration flow
  // -----------------------------------------------------------------------

  /**
   * Attempt to register on a service.
   * Handles email verification and CAPTCHA detection.
   * Retries up to {@link MAX_RETRIES} times on transient failures.
   */
  async attemptRegistration(
    passportId: string,
    service: string,
    email: string,
    agentInfo: { passport_id: string; name: string },
  ): Promise<AuthFlowResult> {
    let lastError: string | undefined;
    const password = generatePassword();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const registerUrl = `https://${service}/signup`;
      const result = await this.browserOps.register(registerUrl, {
        email,
        password,
        name: agentInfo.name,
      });

      if (result.captcha_detected) {
        await this.webhookService.emit(
          this.webhookService.createEvent(
            "agent.captcha_needed",
            agentInfo,
            {
              service,
              captcha_type: result.captcha_type ?? "unknown",
              phase: "registration",
            },
          ),
        );

        return {
          success: false,
          method: "fallback_register",
          service,
          passport_id: passportId,
          needs_human: true,
          captcha_type: result.captcha_type,
          error: result.error ?? "CAPTCHA detected during registration",
          retries_used: attempt,
        };
      }

      if (result.success) {
        // Handle email verification if needed
        if (result.needs_email_verification) {
          try {
            const incoming = await this.emailServiceAdapter.waitForEmail(
              email,
              { from: service },
              30_000,
            );
            const link = this.emailServiceAdapter.extractVerificationLink(
              incoming.id,
            );
            if (link) {
              // Visit the verification link via browser
              await this.browserOps.login(link, {
                username: "",
                password: "",
              });
            }
          } catch {
            // Email verification timed out -- still count as success
            // since the account was created. Verification can happen later.
          }
        }

        const credentials = result.credentials ?? {
          username: email,
          password,
          email,
        };

        // Store credentials in the vault
        this.credentialService.storeCredential({
          passport_id: passportId,
          service,
          username: credentials.username,
          password: credentials.password,
          email: credentials.email,
        });

        // Create a session
        const session = this.sessionService.createSession({
          passport_id: passportId,
          service,
          ttl_ms: 3_600_000,
        });

        // Emit registration success webhook
        await this.webhookService.emit(
          this.webhookService.createEvent(
            "agent.registered",
            agentInfo,
            { service, method: "fallback_register", retries: attempt },
          ),
        );

        // Emit credential stored webhook
        await this.webhookService.emit(
          this.webhookService.createEvent(
            "agent.credential_stored",
            agentInfo,
            { service },
          ),
        );

        return {
          success: true,
          method: "fallback_register",
          service,
          passport_id: passportId,
          session: { token: session.token, cookies: session.cookies },
          retries_used: attempt,
        };
      }

      lastError = result.error;
    }

    // All retries exhausted
    await this.webhookService.emit(
      this.webhookService.createEvent(
        "agent.error",
        agentInfo,
        { service, error: lastError, phase: "registration", retries: MAX_RETRIES },
      ),
    );

    return {
      success: false,
      method: "fallback_register",
      service,
      passport_id: passportId,
      error: lastError ?? "Registration failed after max retries",
      retries_used: MAX_RETRIES,
    };
  }
}
