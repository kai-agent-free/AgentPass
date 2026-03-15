/**
 * CoinPay DID Reputation Provider
 *
 * Integrates with CoinPay Portal's 7-dimension trust vector system.
 * API endpoints are based on advertised features; actual endpoints
 * may need updating once CoinPay publishes DID API docs.
 */

import type {
  ReputationProvider,
  ReputationData,
  ReputationSignal,
} from "./types.js";

/** CoinPay 7-dimension weights for composite score */
const DIMENSION_WEIGHTS: Record<string, number> = {
  economic: 0.25,
  productivity: 0.15,
  behavioral: 0.2,
  dispute: 0.2,
  recency: 0.05,
  activity: 0.05,
  cross_platform: 0.1,
};

export interface CoinPayProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  /** Timeout in ms (default 10000) */
  timeout?: number;
}

export class CoinPayReputationProvider implements ReputationProvider {
  readonly name = "coinpay";
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: CoinPayProviderConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://coinpayportal.com";
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10_000;
  }

  async fetchReputation(did: string): Promise<ReputationData> {
    // Expected endpoint (not yet documented in CoinPay skill.md)
    const url = `${this.baseUrl}/api/did/${encodeURIComponent(did)}/reputation`;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      if (res.status === 404) {
        // DID not found — return empty reputation
        return {
          did,
          provider: this.name,
          dimensions: {},
          compositeScore: 0,
          fetchedAt: new Date().toISOString(),
        };
      }
      throw new Error(
        `CoinPay reputation fetch failed: ${res.status} ${res.statusText}`,
      );
    }

    const body = (await res.json()) as {
      data?: {
        dimensions?: Record<string, number>;
        transaction_count?: number;
        account_age_days?: number;
      };
    };

    const dimensions = body.data?.dimensions ?? {};
    const compositeScore = this.computeComposite(dimensions);

    return {
      did,
      provider: this.name,
      dimensions,
      compositeScore,
      transactionCount: body.data?.transaction_count,
      accountAgeDays: body.data?.account_age_days,
      fetchedAt: new Date().toISOString(),
    };
  }

  async submitSignal(did: string, signal: ReputationSignal): Promise<void> {
    const url = `${this.baseUrl}/api/did/${encodeURIComponent(did)}/signals`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(signal),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      throw new Error(
        `CoinPay signal submit failed: ${res.status} ${res.statusText}`,
      );
    }
  }

  async verifyOwnership(did: string, proof: string): Promise<boolean> {
    // For did:key, we can verify locally: the DID encodes the public key.
    // The proof should be a signature over a known challenge.
    // For now, delegate to CoinPay's verification endpoint.
    const url = `${this.baseUrl}/api/did/${encodeURIComponent(did)}/verify`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) return false;

    const body = (await res.json()) as { verified?: boolean };
    return body.verified === true;
  }

  /** Compute weighted composite from dimension scores */
  private computeComposite(dimensions: Record<string, number>): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
      const score = dimensions[dim];
      if (score !== undefined && score !== null) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }
}
