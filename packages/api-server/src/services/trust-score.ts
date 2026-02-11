/**
 * Trust score calculation service.
 *
 * Pure functions for computing an agent passport's trust score
 * based on verification factors, account age, activity, and abuse reports.
 */

/**
 * Factors used to calculate a passport's trust score.
 */
export interface TrustFactors {
  owner_verified: boolean;
  payment_method: boolean;
  age_days: number;
  successful_auths: number;
  abuse_reports: number;
}

/**
 * Trust level labels mapped to score ranges.
 *
 *   0-19  -> "unverified"
 *  20-49  -> "basic"
 *  50-79  -> "verified"
 *  80-100 -> "trusted"
 */
export type TrustLevel = "unverified" | "basic" | "verified" | "trusted";

/**
 * Calculate a trust score from the given factors.
 *
 * Scoring algorithm:
 * - Base: owner_verified (+30), payment_method (+20)
 * - Age:  30+ days (+10), 90+ days (+10 more)
 * - Activity: +1 per 10 successful auths, max +20
 * - Penalties: -50 per abuse report
 *
 * Result is clamped to [0, 100].
 */
export function calculateTrustScore(factors: TrustFactors): number {
  let score = 0;

  // Base factors
  if (factors.owner_verified) {
    score += 30;
  }
  if (factors.payment_method) {
    score += 20;
  }

  // Age bonuses
  if (factors.age_days >= 30) {
    score += 10;
  }
  if (factors.age_days >= 90) {
    score += 10;
  }

  // Activity bonus: +1 per 10 successful auths, capped at 20
  const activityBonus = Math.min(Math.floor(factors.successful_auths / 10), 20);
  score += activityBonus;

  // Abuse penalties: -50 per report
  score -= factors.abuse_reports * 50;

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, score));
}

/**
 * Map a numeric trust score to a human-readable trust level.
 */
export function getTrustLevel(score: number): TrustLevel {
  if (score >= 80) {
    return "trusted";
  }
  if (score >= 50) {
    return "verified";
  }
  if (score >= 20) {
    return "basic";
  }
  return "unverified";
}
