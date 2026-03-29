import { describe, it, expect } from "vitest";
import { ReputationAggregator } from "./aggregator.js";
import type { ReputationProvider, ReputationData } from "./types.js";

const mockProvider: ReputationProvider = {
  name: "mock",
  async fetchReputation(did: string): Promise<ReputationData> {
    return {
      did,
      provider: "mock",
      dimensions: { economic: 80, behavioral: 90 },
      compositeScore: 85,
      fetchedAt: "2026-03-15T00:00:00Z",
    };
  },
  async verifyOwnership(): Promise<boolean> {
    return true;
  },
};

const failingProvider: ReputationProvider = {
  name: "failing",
  async fetchReputation(): Promise<ReputationData> {
    throw new Error("network error");
  },
  async verifyOwnership(): Promise<boolean> {
    return false;
  },
};

describe("ReputationAggregator", () => {
  it("should register and fetch from providers", async () => {
    const agg = new ReputationAggregator();
    agg.register(mockProvider);

    const results = await agg.fetchAll("did:key:z6Mktest");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("did:reputation:mock");
    expect(results[0].score).toBe(85);
    expect(results[0].attester_id).toBe("did:key:z6Mktest");
  });

  it("should handle provider failures gracefully", async () => {
    const agg = new ReputationAggregator();
    agg.register(mockProvider);
    agg.register(failingProvider);

    const results = await agg.fetchAll("did:key:z6Mktest");
    // Should still return the successful one
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("did:reputation:mock");
  });

  it("should return empty array with no providers", async () => {
    const agg = new ReputationAggregator();
    const results = await agg.fetchAll("did:key:z6Mktest");
    expect(results).toHaveLength(0);
  });
});
