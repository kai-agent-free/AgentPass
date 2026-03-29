/**
 * DID Reputation Provider System
 *
 * Generic interface for integrating external DID-based reputation
 * (CoinPay, Ceramic, SpruceID, etc.) into AgentPass trust scores.
 */

/** Raw reputation data from a provider */
export interface ReputationData {
  did: string;
  provider: string;
  /** Dimension name → score (0–100) */
  dimensions: Record<string, number>;
  /** Weighted composite score (0–100) */
  compositeScore: number;
  transactionCount?: number;
  accountAgeDays?: number;
  fetchedAt: string;
}

/** Signal submitted TO a reputation provider about a DID */
export interface ReputationSignal {
  type:
    | "auth_success"
    | "credential_verified"
    | "email_verified"
    | "abuse_report"
    | "gig_completed"
    | "escrow_settled";
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** DID link stored on a passport */
export interface DIDLink {
  did: string;
  provider: string;
  linkedAt: string;
  /** Cached reputation (refreshed periodically) */
  reputation?: ReputationData;
}

/** Abstract reputation provider */
export interface ReputationProvider {
  readonly name: string;

  /** Fetch reputation for a DID */
  fetchReputation(did: string): Promise<ReputationData>;

  /** Submit a signal about a DID (optional — not all providers accept signals) */
  submitSignal?(did: string, signal: ReputationSignal): Promise<void>;

  /** Verify that the caller controls the DID (proof = signed challenge) */
  verifyOwnership(did: string, proof: string): Promise<boolean>;
}
