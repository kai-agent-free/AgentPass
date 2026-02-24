import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import StatusBadge from "../components/StatusBadge.js";
import TrustScoreCard from "../components/TrustScoreCard.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import { apiClient } from "../api/client.js";
import { useApi } from "../hooks/useApi.js";

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const { data: passport, loading: passportLoading, error: passportError } = useApi(
    () => apiClient.getPassport(id!),
    [id]
  );

  const { data: auditData, loading: auditLoading, error: auditError } = useApi(
    () => apiClient.getAuditLog(id!, { limit: 20 }),
    [id]
  );

  const auditLog = auditData?.entries || [];

  const handleRevoke = async () => {
    if (!id) return;

    setRevoking(true);
    setRevokeError(null);

    try {
      await apiClient.revokePassport(id);
      navigate("/agents");
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke passport");
      setShowRevokeDialog(false);
    } finally {
      setRevoking(false);
    }
  };

  if (passportLoading || auditLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
          <p className="text-sm text-gray-500">Loading agent details...</p>
        </div>
      </div>
    );
  }

  if (passportError || !passport) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          {passportError ? (
            <>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mx-auto">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Failed to load agent
              </h2>
              <p className="mt-1 text-sm text-gray-500">{passportError}</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">
                Agent not found
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                The agent you are looking for does not exist.
              </p>
            </>
          )}
          <Link
            to="/agents"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/agents" className="hover:text-indigo-600">
          Agents
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{passport.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100 text-xl font-bold text-indigo-700">
            {passport.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {passport.name}
              </h1>
              <StatusBadge status={passport.status} />
            </div>
            <p className="mt-0.5 font-mono text-sm text-gray-400">
              {passport.id}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowRevokeDialog(true)}
          disabled={revoking || passport.status === "revoked"}
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revoking ? "Revoking..." : "Revoke Passport"}
        </button>
      </div>

      {/* Revoke Error */}
      {revokeError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-4 w-4 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-900">
                Failed to revoke passport
              </h3>
              <p className="mt-0.5 text-sm text-red-700">{revokeError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Info Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Passport Info
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Passport ID
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">
                  {passport.id.slice(0, 20)}...
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Public Key
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">
                  {passport.public_key.slice(0, 24)}...
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(passport.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </dt>
                <dd className="mt-1">
                  <StatusBadge status={passport.status} />
                </dd>
              </div>
            </dl>
          </div>

          {/* Audit Log */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Audit Log
              </h2>
            </div>
            {auditError && (
              <div className="px-6 py-4">
                <p className="text-sm text-red-600">Failed to load audit log: {auditError}</p>
              </div>
            )}
            {!auditError && auditLog.length === 0 && (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-gray-500">No activity yet</p>
              </div>
            )}
            {!auditError && auditLog.length > 0 && (
              <div className="divide-y divide-gray-100">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-6 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          entry.result === "success"
                            ? "bg-emerald-500"
                            : entry.result === "failure"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm text-gray-900">
                          <span className="font-mono text-xs font-medium uppercase text-gray-500">
                            {entry.action}
                          </span>
                          {entry.service && ` on ${entry.service}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(entry.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Trust Score */}
          <TrustScoreCard passportId={passport.id} fallbackScore={passport.trust_score} />
        </div>
      </div>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRevokeDialog}
        title="Revoke Passport?"
        message="Are you sure you want to revoke this passport? This action is irreversible and the agent will lose access to all services."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleRevoke}
        onCancel={() => setShowRevokeDialog(false)}
      />
    </div>
  );
}
