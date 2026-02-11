import StatusBadge from "../components/StatusBadge.js";

const stats = [
  { label: "Total Agents", value: "12", change: "+2 this week" },
  { label: "Active Sessions", value: "4", change: "3 idle" },
  { label: "Pending Approvals", value: "3", change: "2 urgent" },
  { label: "Avg Trust Score", value: "82", change: "+5 this month" },
];

const recentActivity = [
  {
    id: "1",
    agent: "web-scraper-01",
    action: "Registered on GitHub",
    result: "success" as const,
    timestamp: "2 min ago",
  },
  {
    id: "2",
    agent: "email-assistant",
    action: "Solved CAPTCHA on LinkedIn",
    result: "success" as const,
    timestamp: "15 min ago",
  },
  {
    id: "3",
    agent: "data-collector",
    action: "Login attempt on Notion",
    result: "pending" as const,
    timestamp: "32 min ago",
  },
  {
    id: "4",
    agent: "web-scraper-01",
    action: "Email verification completed",
    result: "success" as const,
    timestamp: "1 hour ago",
  },
  {
    id: "5",
    agent: "research-bot",
    action: "Registration on Twitter failed",
    result: "error" as const,
    timestamp: "2 hours ago",
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your agent fleet
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-gray-400">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Activity
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {recentActivity.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-6 py-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                  {entry.agent.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {entry.action}
                  </p>
                  <p className="text-xs text-gray-500">{entry.agent}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge
                  status={
                    entry.result === "success"
                      ? "active"
                      : entry.result === "pending"
                        ? "pending"
                        : "error"
                  }
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {entry.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
