import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.js";
import TrustScoreBar from "../components/TrustScoreBar.js";

const agents = [
  {
    id: "agent-001",
    name: "web-scraper-01",
    status: "active" as const,
    trustScore: 92,
    servicesCount: 5,
    lastActive: "2 min ago",
    passportId: "ap_7f3a2b1c",
  },
  {
    id: "agent-002",
    name: "email-assistant",
    status: "active" as const,
    trustScore: 78,
    servicesCount: 3,
    lastActive: "15 min ago",
    passportId: "ap_9d4e6f8a",
  },
  {
    id: "agent-003",
    name: "research-bot",
    status: "pending" as const,
    trustScore: 45,
    servicesCount: 1,
    lastActive: "2 hours ago",
    passportId: "ap_2c8b5d3e",
  },
];

export default function AgentsPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your AI agent fleet
          </p>
        </div>
        <button className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700">
          + New Agent
        </button>
      </div>

      {/* Agents Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Agent
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Trust Score
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Services
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Last Active
              </th>
              <th className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {agents.map((agent) => (
              <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <Link
                        to={`/agents/${agent.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600"
                      >
                        {agent.name}
                      </Link>
                      <p className="text-xs text-gray-400">
                        {agent.passportId}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={agent.status} />
                </td>
                <td className="w-48 px-6 py-4">
                  <TrustScoreBar score={agent.trustScore} showLabel={false} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {agent.servicesCount} services
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {agent.lastActive}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    to={`/agents/${agent.id}`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
