import { useParams, Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.js";
import TrustScoreBar from "../components/TrustScoreBar.js";

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
        username: "ws01@agentpass.dev",
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
        username: "agent.email@agentpass.dev",
        createdAt: "2025-01-21",
      },
      {
        service: "Outlook",
        username: "ea-bot@agentpass.dev",
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
  const agent = id ? agentsData[id] : undefined;

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Agent not found
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            The agent you are looking for does not exist.
          </p>
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
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {agent.name}
              </h1>
              <StatusBadge status={agent.status} />
            </div>
            <p className="mt-0.5 font-mono text-sm text-gray-400">
              {agent.passportId}
            </p>
          </div>
        </div>
        <button className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
          Revoke Passport
        </button>
      </div>

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
                  {agent.passportId.slice(0, 20)}...
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Public Key
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">
                  {agent.publicKey.slice(0, 24)}...
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(agent.createdAt).toLocaleDateString("en-US", {
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
            <div className="divide-y divide-gray-100">
              {agent.auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-6 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        entry.result === "success"
                          ? "bg-emerald-500"
                          : "bg-red-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm text-gray-900">
                        <span className="font-mono text-xs font-medium uppercase text-gray-500">
                          {entry.action}
                        </span>{" "}
                        on {entry.service}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {entry.timestamp}
                  </span>
                </div>
              ))}
            </div>
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
                {agent.trustScore}
              </span>
              <span className="text-lg text-gray-400">/100</span>
            </div>
            <TrustScoreBar score={agent.trustScore} />
          </div>

          {/* Credentials */}
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
        </div>
      </div>
    </div>
  );
}
