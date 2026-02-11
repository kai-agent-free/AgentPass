type Status = "active" | "revoked" | "pending" | "error";

interface StatusBadgeProps {
  status: Status;
}

const statusStyles: Record<Status, string> = {
  active: "bg-emerald-100 text-emerald-800",
  revoked: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

const statusLabels: Record<Status, string> = {
  active: "Active",
  revoked: "Revoked",
  pending: "Pending",
  error: "Error",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : status === "revoked"
              ? "bg-red-500"
              : status === "pending"
                ? "bg-amber-500"
                : "bg-red-500"
        }`}
      />
      {statusLabels[status]}
    </span>
  );
}
