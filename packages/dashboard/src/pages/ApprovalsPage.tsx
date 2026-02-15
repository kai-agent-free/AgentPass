import { useState, useEffect, useCallback } from "react";
import { apiClient, type Approval } from "../api/client.js";

type ApprovalStatus = "pending" | "approved" | "denied";

const statusStyles: Record<ApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  denied: "bg-red-100 text-red-800",
};

const statusDotStyles: Record<ApprovalStatus, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  denied: "bg-red-500",
};

const statusLabels: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());

  const fetchApprovals = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.listApprovals();
      setApprovals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
      console.error("Failed to fetch approvals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Auto-refresh pending approvals every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchApprovals();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleRespond = async (id: string, approved: boolean) => {
    setRespondingIds((prev) => new Set(prev).add(id));

    try {
      const result = await apiClient.respondToApproval(id, approved);
      // Update local state immediately for responsiveness
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: result.status as ApprovalStatus, responded_at: new Date().toISOString() }
            : a,
        ),
      );
    } catch (err) {
      console.error("Failed to respond to approval:", err);
      setError(err instanceof Error ? err.message : "Failed to respond to approval");
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const historyApprovals = approvals.filter((a) => a.status !== "pending");
  const pendingCount = pendingApprovals.length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pendingCount} pending approval{pendingCount !== 1 ? "s" : ""}{" "}
          requiring your review
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="text-center">
            <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
            <p className="text-sm text-gray-500">Loading approvals...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-900">Failed to load approvals</h3>
              <p className="mt-0.5 text-sm text-red-700">{error}</p>
            </div>
            <button
              onClick={() => { setLoading(true); fetchApprovals(); }}
              className="ml-auto rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && approvals.length === 0 && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mx-auto">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900">No approvals yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Approval requests from your agents will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {!loading && pendingApprovals.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Pending</h2>
          <div className="space-y-4">
            {pendingApprovals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                        {approval.passport_id.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 font-mono">
                          {approval.passport_id}
                        </p>
                        <p className="text-xs text-gray-500">
                          {approval.service || "Unknown service"} &middot;{" "}
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                            {approval.action}
                          </span>
                        </p>
                      </div>
                    </div>
                    {approval.details && (
                      <p className="mt-3 text-sm text-gray-600">
                        {approval.details}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      {formatTimestamp(approval.created_at)}
                    </p>
                  </div>

                  <div className="ml-6 flex flex-col items-end gap-3">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[approval.status]}`}
                    >
                      <span
                        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusDotStyles[approval.status]}`}
                      />
                      {statusLabels[approval.status]}
                    </span>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespond(approval.id, true)}
                        disabled={respondingIds.has(approval.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {respondingIds.has(approval.id) ? "..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleRespond(approval.id, false)}
                        disabled={respondingIds.has(approval.id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {respondingIds.has(approval.id) ? "..." : "Deny"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {!loading && historyApprovals.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">History</h2>
          <div className="space-y-4">
            {historyApprovals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                        {approval.passport_id.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 font-mono">
                          {approval.passport_id}
                        </p>
                        <p className="text-xs text-gray-500">
                          {approval.service || "Unknown service"} &middot;{" "}
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                            {approval.action}
                          </span>
                        </p>
                      </div>
                    </div>
                    {approval.details && (
                      <p className="mt-3 text-sm text-gray-600">
                        {approval.details}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      {formatTimestamp(approval.created_at)}
                      {approval.responded_at && (
                        <span className="ml-2">
                          &middot; Responded {formatTimestamp(approval.responded_at)}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="ml-6 flex flex-col items-end">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[approval.status]}`}
                    >
                      <span
                        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${statusDotStyles[approval.status]}`}
                      />
                      {statusLabels[approval.status]}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
