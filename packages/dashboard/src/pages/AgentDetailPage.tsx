import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import StatusBadge from "../components/StatusBadge.js";
import TrustScoreBar from "../components/TrustScoreBar.js";
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

const agentsData: Record<
  string,
  {
    id: string;
    name: string;
    passportId: string;
    publicKey: string;
    status: "active" | "revoked" | "pending";
    trustScore: number;
    createdAt: string;
    credentials: { service: string; username: string; createdAt: string }[];
    auditLog: {
      id: string;
      action: string;
      service: string;
      result: string;
      timestamp: string;
    }[];
  }
> = {
  "agent-001": {
    id: "agent-001",
    name: "web-scraper-01",
    passportId: "ap_7f3a2b1c-d4e5-6f7a-8b9c-0d1e2f3a4b5c",
    publicKey:
      "ed25519:7f3a2b1cd4e56f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a",
    status: "active",
    trustScore: 92,
    createdAt: "2025-01-15T10:30:00Z",
    credentials: [
      {
        service: "GitHub",
        username: "agent-scraper-01",
        createdAt: "2025-01-16",
      },
      {
        service: "LinkedIn",
        username: "scraper.agent",
        createdAt: "2025-01-17",
      },
      {
        service: "Notion",
        username: "ws01@agent-mail.xyz",
        createdAt: "2025-01-18",
      },
      {
        service: "Slack",
        username: "ws01-bot",
        createdAt: "2025-01-20",
      },
      {
        service: "HuggingFace",
        username: "agent-ws01",
        createdAt: "2025-01-22",
      },
    ],
    auditLog: [
      {
        id: "log-1",
        action: "register",
        service: "GitHub",
        result: "success",
        timestamp: "2 min ago",
      },
      {
        id: "log-2",
        action: "solve_captcha",
        service: "LinkedIn",
        result: "success",
        timestamp: "15 min ago",
      },
      {
        id: "log-3",
        action: "verify_email",
        service: "GitHub",
        result: "success",
        timestamp: "1 hour ago",
      },
      {
        id: "log-4",
        action: "login",
        service: "Notion",
        result: "success",
        timestamp: "3 hours ago",
      },
      {
        id: "log-5",
        action: "register",
        service: "Slack",
        result: "failed",
        timestamp: "5 hours ago",
      },
    ],
  },
  "agent-002": {
    id: "agent-002",
    name: "email-assistant",
    passportId: "ap_9d4e6f8a-b2c3-4d5e-6f7a-8b9c0d1e2f3a",
    publicKey:
      "ed25519:9d4e6f8ab2c34d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e",
    status: "active",
    trustScore: 78,
    createdAt: "2025-01-20T14:00:00Z",
    credentials: [
      {
        service: "Gmail",
        username: "agent.email@agent-mail.xyz",
        createdAt: "2025-01-21",
      },
      {
        service: "Outlook",
        username: "ea-bot@agent-mail.xyz",
        createdAt: "2025-01-22",
      },
      {
        service: "SendGrid",
        username: "email-assistant",
        createdAt: "2025-01-23",
      },
    ],
    auditLog: [
      {
        id: "log-1",
        action: "send_email",
        service: "Gmail",
        result: "success",
        timestamp: "15 min ago",
      },
      {
        id: "log-2",
        action: "login",
        service: "Outlook",
        result: "success",
        timestamp: "1 hour ago",
      },
    ],
  },
  "agent-003": {
    id: "agent-003",
    name: "research-bot",
    passportId: "ap_2c8b5d3e-f1a2-3b4c-5d6e-7f8a9b0c1d2e",
    publicKey:
      "ed25519:2c8b5d3ef1a23b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c",
    status: "pending",
    trustScore: 45,
    createdAt: "2025-02-01T09:15:00Z",
    credentials: [
      {
        service: "Twitter",
        username: "research_bot_01",
        createdAt: "2025-02-01",
      },
    ],
    auditLog: [
      {
        id: "log-1",
        action: "register",
        service: "Twitter",
        result: "failed",
        timestamp: "2 hours ago",
      },
    ],
  },
};

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

  // Fallback to mock data if API not available (temporary during development)
  const agent = passport || (id ? agentsData[id] : undefined);
  const auditLog = auditData?.entries || (id && agentsData[id] ? agentsData[id].auditLog : []);

  const handleRevoke = async () => {
    if (!id) return;

    setRevoking(true);
    setRevokeError(null);

    try {
      await apiClient.revokePassport(id);
      // Success - redirect to agents list
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

  if (passportError || !agent) {
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
        <span className="text-gray-900">{agent.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-100 text-xl font-bold text-indigo-700">
            {agent.name ? agent.name.charAt(0).toUpperCase() : (agent as any).id?.charAt(0).toUpperCase() || "A"}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {agent.name || (agent as any).id || "Unknown Agent"}
              </h1>
              <StatusBadge status={agent.status} />
            </div>
            <p className="mt-0.5 font-mono text-sm text-gray-400">
              {"passportId" in agent ? agent.passportId : agent.id}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowRevokeDialog(true)}
          disabled={revoking || agent.status === "revoked"}
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
                  {"passportId" in agent ? agent.passportId.slice(0, 20) : agent.id.slice(0, 20)}...
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Public Key
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">
                  {"publicKey" in agent ? agent.publicKey.slice(0, 24) : agent.public_key.slice(0, 24)}...
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date("createdAt" in agent ? agent.createdAt : agent.created_at).toLocaleDateString("en-US", {
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
                  <StatusBadge status={agent.status} />
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
                {auditLog.map((entry) => {
                  const result = "result" in entry ? entry.result : "success";
                  const timestamp = "timestamp" in entry ? entry.timestamp : formatTimeAgo(entry.created_at);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between px-6 py-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            result === "success"
                              ? "bg-emerald-500"
                              : result === "failure"
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
                        {timestamp}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Trust Score */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Trust Score
            </h2>
            <div className="mb-3 text-center">
              <span className="text-4xl font-bold text-gray-900">
                {"trustScore" in agent ? agent.trustScore : agent.trust_score}
              </span>
              <span className="text-lg text-gray-400">/100</span>
            </div>
            <TrustScoreBar score={"trustScore" in agent ? agent.trustScore : agent.trust_score} />
          </div>

          {/* Credentials */}
          {"credentials" in agent && agent.credentials.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Credentials
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {agent.credentials.map((cred) => (
                  <div key={cred.service} className="px-6 py-3.5">
                    <p className="text-sm font-medium text-gray-900">
                      {cred.service}
                    </p>
                    <p className="text-xs text-gray-500">{cred.username}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
