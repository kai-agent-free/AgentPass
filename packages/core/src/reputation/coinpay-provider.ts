/**
 * CoinPay DID Reputation Provider
 *
 * Integrates with CoinPay Portal's 7-dimension trust vector system
 * using the official @profullstack/coinpay SDK.
 */

import type {
  ReputationProvider,
  ReputationData,
  ReputationSignal,
} from "./types.js";

/** CoinPay 7-dimension weights for composite score */
const DIMENSION_WEIGHTS: Record<string, number> = {
  E: 0.25,  // Economic
  P: 0.15,  // Productivity
  B: 0.2,   // Behavioral
  D: 0.2,   // Dispute
  R: 0.05,  // Recency
  A: 0.05,  // Activity
  C: 0.1,   // Cross-platform
};

export interface CoinPayProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  /** Timeout in ms (default 10000) */
  timeout?: number;
}

/**
 * CoinPay reputation provider.
 *
 * When the `@profullstack/coinpay` SDK is available at runtime, it
 * delegates to the real API.  Otherwise it falls back to direct HTTP
 * calls so the core package doesn't need a hard dependency on the SDK.
 */
export class CoinPayReputationProvider implements ReputationProvider {
  readonly name = "coinpay";
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: CoinPayProviderConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "https://coinpayportal.com/api").replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10_000;
  }

  async fetchReputation(did: string): Promise<ReputationData> {
    const url = `${this.baseUrl}/reputation/agent/${encodeURIComponent(did)}/reputation`;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      if (res.status === 404) {
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

    const body = await res.json() as Record<string, any>;

    // Map trust vector {E,P,B,D,R,A,C} to dimensions
    const trustVector = body.trust_vector ?? {};
    const dimensions: Record<string, number> = {};
    for (const [k, v] of Object.entries(trustVector)) {
      if (typeof v === "number") dimensions[k] = v;
    }

    const compositeScore = this.computeComposite(dimensions);

    return {
      did,
      provider: this.name,
      dimensions,
      compositeScore,
      transactionCount: body.reputation?.windows?.all_time?.task_count,
      accountAgeDays: undefined,
      fetchedAt: new Date().toISOString(),
    };
  }

  async submitSignal(did: string, signal: ReputationSignal): Promise<void> {
    const url = `${this.baseUrl}/reputation/receipt`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agent_did: did,
        action_category: this.mapSignalToCategory(signal.type),
        outcome: "accepted",
        ...signal.metadata,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      throw new Error(
        `CoinPay signal submit failed: ${res.status} ${res.statusText}`,
      );
    }
  }

  async verifyOwnership(_did: string, proof: string): Promise<boolean> {
    // Delegate to CoinPay verify endpoint
    const url = `${this.baseUrl}/reputation/verify`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ credential_id: proof }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) return false;

    const body = (await res.json()) as { valid?: boolean };
    return body.valid === true;
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

  /** Map AgentPass signal types to CoinPay action categories */
  private mapSignalToCategory(type: ReputationSignal["type"]): string {
    const map: Record<string, string> = {
      auth_success: "identity.verification",
      credential_verified: "identity.verification",
      email_verified: "identity.verification",
      abuse_report: "compliance.incident",
      gig_completed: "productivity.completion",
      escrow_settled: "economic.transaction",
    };
    return map[type] ?? "productivity.task";
  }
}
