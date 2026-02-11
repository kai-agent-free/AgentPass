interface TrustScoreBarProps {
  score: number;
  showLabel?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function getScoreLevel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

export default function TrustScoreBar({
  score,
  showLabel = true,
}: TrustScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getScoreColor(clamped)}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-700 tabular-nums">
        {clamped}
      </span>
      {showLabel && (
        <span className="text-xs text-gray-500">{getScoreLevel(clamped)}</span>
      )}
    </div>
  );
}
