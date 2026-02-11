/**
 * Native authentication service.
 *
 * Handles the AgentPass native authentication flow:
 * 1. Discover /.well-known/agentpass.json on the target service
 * 2. Request a challenge from the auth endpoint
 * 3. Sign the challenge with the agent's Ed25519 private key
 * 4. Submit the signed challenge to obtain a session token
 *
 * This is the preferred path when a service integrates the AgentPass SDK.
 */

import { signChallenge } from "@agentpass/core";

export interface NativeSupportResult {
  supported: boolean;
  auth_endpoint?: string;
  capabilities?: string[];
}

export interface NativeAuthResult {
  success: boolean;
  session_token?: string;
  trust_score?: number;
  error?: string;
}

export interface WellKnownConfig {
  agentpass: boolean;
  auth_endpoint: string;
  capabilities?: string[];
  version?: string;
}

/** A minimal fetch function signature for dependency injection. */
export type FetchFn = typeof globalThis.fetch;

export class NativeAuthService {
  private readonly fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  /**
   * Check whether a service supports AgentPass native authentication
   * by fetching its /.well-known/agentpass.json endpoint.
   */
  async checkNativeSupport(serviceUrl: string): Promise<NativeSupportResult> {
    const baseUrl = this.normalizeUrl(serviceUrl);
    const wellKnownUrl = `${baseUrl}/.well-known/agentpass.json`;

    try {
      const response = await this.fetchFn(wellKnownUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { supported: false };
      }

      const config = (await response.json()) as WellKnownConfig;

      if (!config.agentpass || !config.auth_endpoint) {
        return { supported: false };
      }

      return {
        supported: true,
        auth_endpoint: config.auth_endpoint,
        capabilities: config.capabilities,
      };
    } catch {
      return { supported: false };
    }
  }

  /**
   * Perform native authentication against a service that supports AgentPass.
   *
   * Flow:
   * 1. Discover the auth endpoint via /.well-known/agentpass.json
   * 2. Request a challenge from the auth endpoint
   * 3. Sign the challenge with the agent's private key
   * 4. Submit the signed response to obtain a session token
   */
  async authenticateNative(
    passportId: string,
    serviceUrl: string,
    privateKey: string,
  ): Promise<NativeAuthResult> {
    // Step 1: Discover native support
    const support = await this.checkNativeSupport(serviceUrl);

    if (!support.supported || !support.auth_endpoint) {
      return {
        success: false,
        error: "Service does not support AgentPass native authentication",
      };
    }

    const authEndpoint = this.resolveEndpoint(serviceUrl, support.auth_endpoint);

    try {
      // Step 2: Request a challenge
      const challengeResponse = await this.fetchFn(
        `${authEndpoint}/challenge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passport_id: passportId }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!challengeResponse.ok) {
        return {
          success: false,
          error: `Challenge request failed: ${challengeResponse.status}`,
        };
      }

      const { challenge } = (await challengeResponse.json()) as {
        challenge: string;
      };

      // Step 3: Sign the challenge
      const signature = signChallenge(challenge, privateKey);

      // Step 4: Submit signed response
      const verifyResponse = await this.fetchFn(`${authEndpoint}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passport_id: passportId,
          challenge,
          signature,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!verifyResponse.ok) {
        return {
          success: false,
          error: `Verification failed: ${verifyResponse.status}`,
        };
      }

      const result = (await verifyResponse.json()) as {
        session_token?: string;
        trust_score?: number;
      };

      return {
        success: true,
        session_token: result.session_token,
        trust_score: result.trust_score,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Native authentication failed: ${message}`,
      };
    }
  }

  /**
   * Normalize a URL to have a protocol and no trailing slash.
   */
  private normalizeUrl(url: string): string {
    const withProtocol = url.startsWith("http") ? url : `https://${url}`;
    return withProtocol.replace(/\/+$/, "");
  }

  /**
   * Resolve a potentially relative auth endpoint against the service URL.
   */
  private resolveEndpoint(serviceUrl: string, authEndpoint: string): string {
    if (authEndpoint.startsWith("http")) {
      return authEndpoint.replace(/\/+$/, "");
    }

    const baseUrl = this.normalizeUrl(serviceUrl);
    const path = authEndpoint.startsWith("/")
      ? authEndpoint
      : `/${authEndpoint}`;
    return `${baseUrl}${path}`.replace(/\/+$/, "");
  }
}
