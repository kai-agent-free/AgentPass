import { describe, it, expect } from "vitest";
import {
  calculateTrustScore,
  getTrustLevel,
  type TrustFactors,
} from "./trust-score.js";

function factors(overrides: Partial<TrustFactors> = {}): TrustFactors {
  return {
    owner_verified: false,
    payment_method: false,
    age_days: 0,
    successful_auths: 0,
    abuse_reports: 0,
    ...overrides,
  };
}

describe("calculateTrustScore with external attestations", () => {
  it("adds 0 when no external attestations", () => {
    expect(calculateTrustScore(factors())).toBe(0);
  });

  it("adds 0 when external_attestations is undefined", () => {
    expect(calculateTrustScore(factors({ external_attestations: undefined }))).toBe(0);
  });

  it("adds 0 when external_attestations is empty", () => {
    expect(calculateTrustScore(factors({ external_attestations: [] }))).toBe(0);
  });

  it("adds 0 when all attestation scores are <= 0.8", () => {
    expect(calculateTrustScore(factors({
      external_attestations: [
        { source: "isnad", attester_id: "agent_b", score: 0.5, attested_at: "2026-01-01T00:00:00Z" },
        { source: "isnad", attester_id: "agent_c", score: 0.8, attested_at: "2026-01-01T00:00:00Z" },
      ],
    }))).toBe(0);
  });

  it("adds bonus for a single high-score attestation (score > 0.8)", () => {
    const score = calculateTrustScore(factors({
      external_attestations: [
        { source: "isnad", attester_id: "agent_b", score: 0.9, attested_at: "2026-01-01T00:00:00Z" },
      ],
    }));
    // 1 attestation * 0.9 * 5 = 4.5, rounded = 5
    expect(score).toBe(5);
  });

  it("adds bonus for multiple high-score attestations, capped at 10", () => {
    const score = calculateTrustScore(factors({
      external_attestations: [
        { source: "isnad", attester_id: "agent_b", score: 0.95, attested_at: "2026-01-01T00:00:00Z" },
        { source: "isnad", attester_id: "agent_c", score: 0.9, attested_at: "2026-01-01T00:00:00Z" },
        { source: "isnad", attester_id: "agent_d", score: 0.85, attested_at: "2026-01-01T00:00:00Z" },
      ],
    }));
    // avg = 0.9, count = 3, bonus = min(round(0.9 * 3 * 5), 10) = min(14, 10) = 10
    expect(score).toBe(10);
  });

  it("caps attestation bonus at 10 even with many attestations", () => {
    const attestations = Array.from({ length: 10 }, (_, i) => ({
      source: "isnad",
      attester_id: `agent_${i}`,
      score: 0.95,
      attested_at: "2026-01-01T00:00:00Z",
    }));
    const score = calculateTrustScore(factors({ external_attestations: attestations }));
    expect(score).toBe(10);
  });

  it("boosts trust level when combined with other factors", () => {
    // Without attestations: 30 (owner) + 20 (payment) + 20 (age) + 20 (auths) = 90
    // With attestations: 90 + 10 = 100
    const score = calculateTrustScore(factors({
      owner_verified: true,
      payment_method: true,
      age_days: 365,
      successful_auths: 1000,
      external_attestations: [
        { source: "isnad", attester_id: "agent_b", score: 0.95, attested_at: "2026-01-01T00:00:00Z" },
        { source: "isnad", attester_id: "agent_c", score: 0.9, attested_at: "2026-01-01T00:00:00Z" },
        { source: "isnad", attester_id: "agent_d", score: 0.85, attested_at: "2026-01-01T00:00:00Z" },
      ],
    }));
    expect(score).toBe(100);
    expect(getTrustLevel(score)).toBe("trusted");
  });

  it("only considers attestations with score > 0.8", () => {
    const score = calculateTrustScore(factors({
      external_attestations: [
        { source: "isnad", attester_id: "agent_low", score: 0.3, attested_at: "2026-01-01T00:00:00Z" },
        { source: "isnad", attester_id: "agent_high", score: 0.9, attested_at: "2026-01-01T00:00:00Z" },
      ],
    }));
    // Only 1 high-score: round(0.9 * 1 * 5) = 5
    expect(score).toBe(5);
  });
});
