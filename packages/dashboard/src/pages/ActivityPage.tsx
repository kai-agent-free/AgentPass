import StatusBadge from "../components/StatusBadge.js";

const activityLog = [
  {
    id: "act-001",
    timestamp: "2025-02-10 14:32:01",
    agent: "web-scraper-01",
    action: "register",
    service: "GitHub",
    result: "success" as const,
    duration: "3.2s",
  },
  {
    id: "act-002",
    timestamp: "2025-02-10 14:17:45",
    agent: "email-assistant",
    action: "solve_captcha",
    service: "LinkedIn",
    result: "success" as const,
    duration: "12.8s",
  },
  {
    id: "act-003",
    timestamp: "2025-02-10 14:02:12",
    agent: "data-collector",
    action: "login",
    service: "Notion",
    result: "pending" as const,
    duration: "—",
  },
  {
    id: "act-004",
    timestamp: "2025-02-10 13:45:33",
    agent: "web-scraper-01",
    action: "verify_email",
    service: "GitHub",
    result: "success" as const,
    duration: "45.1s",
  },
  {
    id: "act-005",
    timestamp: "2025-02-10 12:30:10",
    agent: "research-bot",
    action: "register",
    service: "Twitter",
    result: "error" as const,
    duration: "8.4s",
  },
  {
    id: "act-006",
    timestamp: "2025-02-10 12:15:22",
    agent: "email-assistant",
    action: "send_email",
    service: "Gmail",
    result: "success" as const,
    duration: "1.1s",
  },
  {
    id: "act-007",
    timestamp: "2025-02-10 11:50:08",
    agent: "web-scraper-01",
    action: "login",
    service: "Slack",
    result: "success" as const,
    duration: "2.3s",
  },
  {
    id: "act-008",
    timestamp: "2025-02-10 11:30:55",
    agent: "data-collector",
    action: "register",
    service: "HuggingFace",
    result: "success" as const,
    duration: "5.7s",
  },
  {
    id: "act-009",
    timestamp: "2025-02-10 10:22:18",
    agent: "research-bot",
    action: "solve_captcha",
    service: "Twitter",
    result: "error" as const,
    duration: "30.0s",
  },
  {
    id: "act-010",
    timestamp: "2025-02-10 09:15:42",
    agent: "email-assistant",
    action: "login",
    service: "Outlook",
    result: "success" as const,
    duration: "1.8s",
  },
];

function resultToStatus(result: "success" | "pending" | "error") {
  if (result === "success") return "active" as const;
  if (result === "pending") return "pending" as const;
  return "error" as const;
}

export default function ActivityPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          Full audit log of all agent actions
        </p>
      </div>

      {/* Activity Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Timestamp
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Agent
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Action
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Service
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Result
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activityLog.map((entry) => (
              <tr
                key={entry.id}
                className="transition-colors hover:bg-gray-50"
              >
                <td className="px-6 py-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                  {entry.timestamp}
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-gray-900">
                    {entry.agent}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs font-medium text-gray-700">
                    {entry.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {entry.service}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={resultToStatus(entry.result)} />
                </td>
                <td className="px-6 py-4 text-sm tabular-nums text-gray-500">
                  {entry.duration}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
