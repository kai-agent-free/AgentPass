import { useApi } from "../hooks/useApi.js";
import { apiClient, type TrustFactors } from "../api/client.js";
import TrustScoreBar from "./TrustScoreBar.js";

interface TrustScoreCardProps {
  passportId: string;
  /** Fallback score from passport data (shown while loading details). */
  fallbackScore: number;
}

interface FactorDisplayInfo {
  label: string;
  value: string;
  points: number;
  maxPoints: number;
  tip?: string;
}

function getFactorDetails(factors: TrustFactors): FactorDisplayInfo[] {
  const items: FactorDisplayInfo[] = [];

  // Owner verified: 30pts
  items.push({
    label: "Owner Verified",
    value: factors.owner_verified ? "Yes" : "No",
    points: factors.owner_verified ? 30 : 0,
    maxPoints: 30,
    tip: factors.owner_verified ? undefined : "Verify your identity to earn 30 points",
  });

  // Payment method: 20pts
  items.push({
    label: "Payment Method",
    value: factors.payment_method ? "Added" : "Not added",
    points: factors.payment_method ? 20 : 0,
    maxPoints: 20,
    tip: factors.payment_method ? undefined : "Add a payment method to earn 20 points",
  });

  // Age: up to 20pts (10 at 30d, +10 at 90d)
  const agePoints = (factors.age_days >= 30 ? 10 : 0) + (factors.age_days >= 90 ? 10 : 0);
  items.push({
    label: "Account Age",
    value: `${factors.age_days} day${factors.age_days !== 1 ? "s" : ""}`,
    points: agePoints,
    maxPoints: 20,
    tip: agePoints < 20
      ? factors.age_days < 30
        ? "Account must be at least 30 days old for age bonus"
        : "Full age bonus unlocks at 90 days"
      : undefined,
  });

  // Activity: up to 20pts (floor(auths/10), capped at 20)
  const activityPoints = Math.min(20, Math.floor(factors.successful_auths / 10));
  items.push({
    label: "Activity",
    value: `${factors.successful_auths} auth${factors.successful_auths !== 1 ? "s" : ""}`,
    points: activityPoints,
    maxPoints: 20,
    tip: activityPoints < 20
      ? `Use your passport more — need ${(activityPoints + 1) * 10} auths for next point`
      : undefined,
  });

  // Abuse reports: penalty
  if (factors.abuse_reports > 0) {
    items.push({
      label: "Abuse Reports",
      value: `${factors.abuse_reports} report${factors.abuse_reports !== 1 ? "s" : ""}`,
      points: -(factors.abuse_reports * 50),
      maxPoints: 0,
    });
  }

  return items;
}

function getLevelColor(level: string): string {
  switch (level) {
    case "trusted": return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "verified": return "text-blue-600 bg-blue-50 border-blue-200";
    case "basic": return "text-amber-600 bg-amber-50 border-amber-200";
    default: return "text-red-600 bg-red-50 border-red-200";
  }
}

export default function TrustScoreCard({ passportId, fallbackScore }: TrustScoreCardProps) {
  const { data, loading, error } = useApi(
    () => apiClient.getTrustScore(passportId),
    [passportId],
  );

  const score = data?.trust_score ?? fallbackScore;
  const level = data?.trust_level ?? (score >= 80 ? "trusted" : score >= 50 ? "verified" : score >= 20 ? "basic" : "unverified");

  const factorDetails = data?.factors ? getFactorDetails(data.factors) : null;
  const tips = factorDetails?.filter((f) => f.tip) ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Trust Score</h2>

      {/* Score display */}
      <div className="mb-3 text-center">
        <span className="text-4xl font-bold text-gray-900">{score}</span>
        <span className="text-lg text-gray-400">/90</span>
      </div>

      <TrustScoreBar score={score} />

      {/* Level badge */}
      <div className="mt-3 flex justify-center">
        <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold capitalize ${getLevelColor(level)}`}>
          {level}
        </span>
      </div>

      {/* Factor breakdown */}
      {loading && (
        <div className="mt-5 text-center text-xs text-gray-400">Loading details…</div>
      )}
      {error && (
        <div className="mt-5 text-center text-xs text-red-500">Could not load breakdown</div>
      )}
      {factorDetails && (
        <div className="mt-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Breakdown</h3>
          {factorDetails.map((f) => (
            <div key={f.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{f.label}</span>
                <span className="text-xs text-gray-400">{f.value}</span>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${f.points < 0 ? "text-red-600" : f.points > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                {f.points > 0 ? "+" : ""}{f.points}{f.maxPoints > 0 ? `/${f.maxPoints}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tips */}
      {tips.length > 0 && (
        <div className="mt-5 rounded-lg bg-indigo-50 p-3">
          <h3 className="mb-1.5 text-xs font-semibold text-indigo-800">💡 Improve your score</h3>
          <ul className="space-y-1">
            {tips.map((t) => (
              <li key={t.label} className="text-xs text-indigo-700">• {t.tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
