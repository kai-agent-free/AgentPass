import { describe, it, expect } from "vitest";
import {
  calculateTrustScore,
  getTrustLevel,
  type TrustFactors,
} from "./trust-score.js";

/**
 * Helper to build TrustFactors with sensible defaults, overriding as needed.
 */
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

describe("calculateTrustScore", () => {
  it("returns 0 for a brand-new passport with no factors", () => {
    expect(calculateTrustScore(factors())).toBe(0);
  });

  // --- Base factors ---

  it("adds 30 for owner_verified", () => {
    expect(calculateTrustScore(factors({ owner_verified: true }))).toBe(30);
  });

  it("adds 20 for payment_method", () => {
    expect(calculateTrustScore(factors({ payment_method: true }))).toBe(20);
  });

  it("adds 50 for both owner_verified and payment_method", () => {
    expect(
      calculateTrustScore(factors({ owner_verified: true, payment_method: true })),
    ).toBe(50);
  });

  // --- Age bonuses ---

  it("adds 0 for age < 30 days", () => {
    expect(calculateTrustScore(factors({ age_days: 29 }))).toBe(0);
  });

  it("adds 10 for age >= 30 days", () => {
    expect(calculateTrustScore(factors({ age_days: 30 }))).toBe(10);
  });

  it("adds 10 for age between 30 and 89 days (only first tier)", () => {
    expect(calculateTrustScore(factors({ age_days: 60 }))).toBe(10);
  });

  it("adds 20 for age >= 90 days (both tiers)", () => {
    expect(calculateTrustScore(factors({ age_days: 90 }))).toBe(20);
  });

  it("adds 20 for age well above 90 days", () => {
    expect(calculateTrustScore(factors({ age_days: 365 }))).toBe(20);
  });

  // --- Activity bonuses ---

  it("adds 0 for fewer than 10 successful auths", () => {
    expect(calculateTrustScore(factors({ successful_auths: 9 }))).toBe(0);
  });

  it("adds 1 for 10 successful auths", () => {
    expect(calculateTrustScore(factors({ successful_auths: 10 }))).toBe(1);
  });

  it("adds 5 for 50 successful auths", () => {
    expect(calculateTrustScore(factors({ successful_auths: 50 }))).toBe(5);
  });

  it("caps activity bonus at 20 for 200 successful auths", () => {
    expect(calculateTrustScore(factors({ successful_auths: 200 }))).toBe(20);
  });

  it("caps activity bonus at 20 even for very high auth counts", () => {
    expect(calculateTrustScore(factors({ successful_auths: 1000 }))).toBe(20);
  });

  // --- Abuse penalties ---

  it("subtracts 50 per abuse report", () => {
    expect(
      calculateTrustScore(factors({ owner_verified: true, abuse_reports: 1 })),
    ).toBe(0); // 30 - 50 = -20, clamped to 0
  });

  it("applies large penalty for multiple abuse reports", () => {
    expect(
      calculateTrustScore(
        factors({
          owner_verified: true,
          payment_method: true,
          age_days: 100,
          successful_auths: 200,
          abuse_reports: 2,
        }),
      ),
    ).toBe(0); // 30+20+20+20 = 90, minus 100 = -10, clamped to 0
  });

  // --- Clamping ---

  it("never returns below 0", () => {
    expect(calculateTrustScore(factors({ abuse_reports: 10 }))).toBe(0);
  });

  it("never returns above 100", () => {
    // Max possible: 30+20+20+20 = 90, which is below 100
    // Even with all maxes, score should be 90
    const maxFactors = factors({
      owner_verified: true,
      payment_method: true,
      age_days: 365,
      successful_auths: 1000,
      abuse_reports: 0,
    });
    const score = calculateTrustScore(maxFactors);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(90); // 30+20+20+20 = 90
  });

  // --- Combined scenarios ---

  it("calculates correct score for a typical verified agent", () => {
    const score = calculateTrustScore(
      factors({
        owner_verified: true,
        payment_method: false,
        age_days: 45,
        successful_auths: 50,
        abuse_reports: 0,
      }),
    );
    // 30 (verified) + 10 (age>=30) + 5 (50/10) = 45
    expect(score).toBe(45);
  });

  it("calculates correct score for an established agent with one abuse report", () => {
    const score = calculateTrustScore(
      factors({
        owner_verified: true,
        payment_method: true,
        age_days: 120,
        successful_auths: 100,
        abuse_reports: 1,
      }),
    );
    // 30 + 20 + 20 (age>=90) + 10 (100/10) - 50 = 30
    expect(score).toBe(30);
  });
});

describe("getTrustLevel", () => {
  it('returns "unverified" for score 0', () => {
    expect(getTrustLevel(0)).toBe("unverified");
  });

  it('returns "unverified" for score 19', () => {
    expect(getTrustLevel(19)).toBe("unverified");
  });

  it('returns "basic" for score 20', () => {
    expect(getTrustLevel(20)).toBe("basic");
  });

  it('returns "basic" for score 49', () => {
    expect(getTrustLevel(49)).toBe("basic");
  });

  it('returns "verified" for score 50', () => {
    expect(getTrustLevel(50)).toBe("verified");
  });

  it('returns "verified" for score 79', () => {
    expect(getTrustLevel(79)).toBe("verified");
  });

  it('returns "trusted" for score 80', () => {
    expect(getTrustLevel(80)).toBe("trusted");
  });

  it('returns "trusted" for score 100', () => {
    expect(getTrustLevel(100)).toBe("trusted");
  });
});
