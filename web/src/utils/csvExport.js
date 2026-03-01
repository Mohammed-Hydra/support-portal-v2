function escapeCsvValue(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTicketsToCsv(tickets, columns = null) {
  const defaultColumns = [
    { key: "id", label: "ID" },
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "category", label: "Category" },
    { key: "channel", label: "Channel" },
    { key: "requester_name", label: "Requester" },
    { key: "requester_email", label: "Requester Email" },
    { key: "requester_phone", label: "Requester Phone" },
    { key: "requester_company_name", label: "Company" },
    { key: "assigned_agent_name", label: "Assigned Agent" },
    { key: "created_at", label: "Created" },
    { key: "updated_at", label: "Updated" },
  ];
  const cols = columns || defaultColumns;
  const header = cols.map((c) => escapeCsvValue(c.label)).join(",");
  const rows = tickets.map((t) =>
    cols.map((c) => {
      const val = t[c.key] ?? t[`requester_name_from_user`] ?? t[`requester_name_from_contact`];
      if (c.key === "requester_name" && !val) {
        return escapeCsvValue(t.requester_name_from_user || t.requester_name_from_contact || "");
      }
      if (c.key === "requester_email" && !val) {
        return escapeCsvValue(t.requester_email_from_user || t.requester_email_from_contact || "");
      }
      if (c.key === "requester_phone" && !val) {
        return escapeCsvValue(t.requester_phone_from_contact || "");
      }
      if (c.key === "requester_company_name" && !val) {
        return escapeCsvValue(t.requester_company_from_contact || "");
      }
      return escapeCsvValue(val);
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
