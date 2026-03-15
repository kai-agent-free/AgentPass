/**
 * Aggregates reputation from multiple providers into a single trust score.
 */

import type { ExternalAttestation } from "../types/passport.js";
import type { ReputationProvider, ReputationData } from "./types.js";

export class ReputationAggregator {
  private providers: Map<string, ReputationProvider> = new Map();

  register(provider: ReputationProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): ReputationProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Fetch reputation from all registered providers for a DID
   * and convert to AgentPass ExternalAttestation format.
   */
  async fetchAll(did: string): Promise<ExternalAttestation[]> {
    const results: ExternalAttestation[] = [];

    const fetches = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const data = await provider.fetchReputation(did);
          return this.toAttestation(data);
        } catch (err) {
          // Don't let one provider failure block others
          console.warn(`Reputation fetch failed for ${name}:`, err);
          return null;
        }
      },
    );

    const settled = await Promise.all(fetches);
    for (const att of settled) {
      if (att) results.push(att);
    }

    return results;
  }

  /** Convert provider ReputationData to AgentPass ExternalAttestation */
  private toAttestation(data: ReputationData): ExternalAttestation {
    return {
      source: `did:reputation:${data.provider}`,
      attester_id: data.did,
      score: data.compositeScore,
      attested_at: data.fetchedAt,
    };
  }
}
