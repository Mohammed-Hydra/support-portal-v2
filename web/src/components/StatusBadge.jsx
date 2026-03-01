export function StatusBadge({ status }) {
  const tone = {
    New: "new",
    "In Progress": "progress",
    "Waiting User": "waiting",
    Resolved: "resolved",
    Closed: "closed",
  }[status] || "default";
  return <span className={`status-badge status-${tone}`}>{status}</span>;
}

export function PriorityBadge({ priority }) {
  const tone = {
    Critical: "critical",
    High: "high",
    Medium: "medium",
    Low: "low",
  }[priority] || "default";
  return <span className={`priority-badge priority-${tone}`}>{priority}</span>;
}
