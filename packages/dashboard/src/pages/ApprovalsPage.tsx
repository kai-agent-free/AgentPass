import { useState } from "react";

type ApprovalStatus = "pending" | "approved" | "denied";

interface ApprovalRequest {
  id: string;
  agent: string;
  action: string;
  service: string;
  details: string;
  timestamp: string;
  status: ApprovalStatus;
}

const initialApprovals: ApprovalRequest[] = [
  {
    id: "apr-001",
    agent: "web-scraper-01",
    action: "register",
    service: "GitHub",
    details: "Create new account for web scraping automation",
    timestamp: "2025-02-10 14:32:01",
    status: "pending",
  },
  {
    id: "apr-002",
    agent: "data-collector",
    action: "access_api",
    service: "Notion",
    details: "Request API token with read/write permissions",
    timestamp: "2025-02-10 13:15:42",
    status: "pending",
  },
  {
    id: "apr-003",
    agent: "email-assistant",
    action: "send_bulk_email",
    service: "SendGrid",
    details: "Send 500 onboarding emails to waitlist",
    timestamp: "2025-02-10 12:45:00",
    status: "pending",
  },
  {
    id: "apr-004",
    agent: "research-bot",
    action: "register",
    service: "Twitter",
    details: "Create account for research data collection",
    timestamp: "2025-02-10 11:20:33",
    status: "approved",
  },
  {
    id: "apr-005",
    agent: "web-scraper-01",
    action: "delete_data",
    service: "AWS S3",
    details: "Delete old crawl data from staging bucket",
    timestamp: "2025-02-10 10:05:18",
    status: "denied",
  },
];

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

export default function ApprovalsPage() {
  const [approvals, setApprovals] =
    useState<ApprovalRequest[]>(initialApprovals);

  const handleApprove = (id: string) => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "approved" as const } : a)),
    );
  };

  const handleDeny = (id: string) => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "denied" as const } : a)),
    );
  };

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

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

      {/* Approvals List */}
      <div className="space-y-4">
        {approvals.map((approval) => (
          <div
            key={approval.id}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                    {approval.agent.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {approval.agent}
                    </p>
                    <p className="text-xs text-gray-500">
                      {approval.service} &middot;{" "}
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                        {approval.action}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  {approval.details}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  {approval.timestamp}
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
                {approval.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(approval.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(approval.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
