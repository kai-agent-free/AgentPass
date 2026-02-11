/**
 * AgentPass Service SDK (@agentpass/sdk)
 *
 * Provides utilities for third-party services to integrate AgentPass
 * native authentication:
 *
 * - `AgentPassClient` — HTTP client for the AgentPass API server.
 * - `createVerificationMiddleware` — generic middleware that verifies
 *   incoming agent requests via X-AgentPass-* headers.
 * - `generateWellKnownConfig` — generates the /.well-known/agentpass.json
 *   discovery payload.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentPassClientOptions {
  apiUrl: string;
}

export interface VerifyResult {
  valid: boolean;
  passport_id: string;
  trust_score: number;
  status: string;
}

export interface PassportInfo {
  id: string;
  public_key: string;
  name: string;
  description: string;
  owner_email: string;
  trust_score: number;
  status: string;
  created_at: string;
}

export interface AbuseReportResult {
  success: boolean;
  message?: string;
}

export interface VerificationMiddlewareOptions {
  apiUrl: string;
}

export interface AgentContext {
  passport_id: string;
  valid: boolean;
  trust_score: number;
  status: string;
}

export interface WellKnownOptions {
  authEndpoint: string;
  capabilities?: string[];
}

export interface WellKnownConfig {
  agentpass: boolean;
  auth_endpoint: string;
  capabilities: string[];
}

/** Minimal fetch signature for dependency injection in tests. */
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// AgentPassClient
// ---------------------------------------------------------------------------

/**
 * HTTP client for the AgentPass API server.
 *
 * Provides methods to verify passports, retrieve passport metadata,
 * and report abuse — all the operations a service needs when integrating
 * AgentPass server-side.
 */
export class AgentPassClient {
  private readonly apiUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(options: AgentPassClientOptions, fetchFn?: FetchFn) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn ?? fetch;
  }

  /**
   * Verify a passport's challenge-response signature via the API server.
   */
  async verifyPassport(
    passportId: string,
    challenge: string,
    signature: string,
  ): Promise<VerifyResult> {
    const response = await this.fetchFn(`${this.apiUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passport_id: passportId,
        challenge,
        signature,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        (errorBody as { error?: string }).error ??
          `Verification request failed: ${response.status}`,
      );
    }

    return (await response.json()) as VerifyResult;
  }

  /**
   * Retrieve public passport information by ID.
   */
  async getPassport(passportId: string): Promise<PassportInfo> {
    const response = await this.fetchFn(
      `${this.apiUrl}/passports/${encodeURIComponent(passportId)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        (errorBody as { error?: string }).error ??
          `Passport lookup failed: ${response.status}`,
      );
    }

    return (await response.json()) as PassportInfo;
  }

  /**
   * Report abuse for a passport.
   */
  async reportAbuse(
    passportId: string,
    reason: string,
  ): Promise<AbuseReportResult> {
    const response = await this.fetchFn(
      `${this.apiUrl}/passports/${encodeURIComponent(passportId)}/report-abuse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        (errorBody as { error?: string }).error ??
          `Abuse report failed: ${response.status}`,
      );
    }

    return (await response.json()) as AbuseReportResult;
  }
}

// ---------------------------------------------------------------------------
// Verification Middleware
// ---------------------------------------------------------------------------

/**
 * Generic middleware function type.
 *
 * Returns an `AgentContext` when verification succeeds, or `null` when
 * credentials are missing/invalid.  The caller (framework adapter) decides
 * how to translate the result into a 401 response.
 */
export type VerifyRequestFn = (headers: {
  get(name: string): string | null | undefined;
}) => Promise<AgentContext | null>;

/**
 * Create a generic verification function that:
 *
 * 1. Reads `X-AgentPass-ID` and `X-AgentPass-Signature` headers.
 * 2. Verifies the signature via the AgentPass API server.
 * 3. Returns agent context on success or `null` on failure.
 *
 * The returned function is framework-agnostic — wrap it in your
 * framework's middleware adapter (Express, Hono, Fastify, etc.).
 */
export function createVerificationMiddleware(
  options: VerificationMiddlewareOptions,
  fetchFn?: FetchFn,
): VerifyRequestFn {
  const client = new AgentPassClient({ apiUrl: options.apiUrl }, fetchFn);

  return async (headers) => {
    const passportId = headers.get("X-AgentPass-ID");
    const signature = headers.get("X-AgentPass-Signature");

    if (!passportId || !signature) {
      return null;
    }

    // The signature header is expected to contain the signed challenge.
    // In a full implementation the service would issue a challenge first;
    // here we pass the passport_id as the implicit challenge for simplicity.
    try {
      const result = await client.verifyPassport(
        passportId,
        passportId,
        signature,
      );

      if (!result.valid) {
        return null;
      }

      return {
        passport_id: result.passport_id,
        valid: result.valid,
        trust_score: result.trust_score,
        status: result.status,
      };
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// Well-Known Config Generator
// ---------------------------------------------------------------------------

/**
 * Generate the `/.well-known/agentpass.json` discovery payload.
 */
export function generateWellKnownConfig(options: WellKnownOptions): WellKnownConfig {
  return {
    agentpass: true,
    auth_endpoint: options.authEndpoint,
    capabilities: options.capabilities ?? ["ed25519-verification"],
  };
}
