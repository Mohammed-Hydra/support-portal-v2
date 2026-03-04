import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api";

export function AuditLogPage({ token, t }) {
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    action: "",
    ticketId: "",
    actorId: "",
    since: "",
    until: "",
  });

  const loadLogs = async () => {
    try {
      setError("");
      const qs = new URLSearchParams();
      if (filters.action) qs.set("action", filters.action);
      if (filters.ticketId) qs.set("ticketId", filters.ticketId);
      if (filters.actorId) qs.set("actorId", filters.actorId);
      if (filters.since) qs.set("since", filters.since);
      if (filters.until) qs.set("until", filters.until);
      const url = qs.toString() ? `/api/audit-logs?${qs.toString()}` : "/api/audit-logs";
      const rows = await apiRequest(url, { token });
      setLogs(rows || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [token, filters.action, filters.ticketId, filters.actorId, filters.since, filters.until]);

  useEffect(() => {
    apiRequest("/api/audit-logs/actions", { token })
      .then((a) => setActions(a || []))
      .catch(() => setActions([]));
    apiRequest("/api/users", { token })
      .then((u) => setUsers(u || []))
      .catch(() => setUsers([]));
  }, [token]);

  const formatDetails = (details) => {
    if (!details || typeof details !== "object") return "";
    const parts = Object.entries(details)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    return parts.join(", ");
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t.auditLog ?? "Audit Log"}</h1>
        <p>View who did what and when across the portal.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Filters</h3>
          <button type="button" onClick={loadLogs}>Refresh</button>
        </div>
        <div className="grid-2 audit-filters-compact" style={{ gap: 12 }}>
          <label htmlFor="audit-action">
            Action
            <select
              id="audit-action"
              name="action"
              value={filters.action}
              onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))}
            >
              <option value="">All</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label htmlFor="audit-ticket-id">
            Ticket ID
            <input
              id="audit-ticket-id"
              name="ticketId"
              type="number"
              placeholder="e.g. 123"
              value={filters.ticketId}
              onChange={(e) => setFilters((p) => ({ ...p, ticketId: e.target.value.trim() }))}
            />
          </label>
          <label htmlFor="audit-actor">
            Actor
            <select
              id="audit-actor"
              name="actorId"
              value={filters.actorId}
              onChange={(e) => setFilters((p) => ({ ...p, actorId: e.target.value }))}
            >
              <option value="">All</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </label>
          <label htmlFor="audit-since">
            Since
            <input
              id="audit-since"
              name="since"
              type="datetime-local"
              value={filters.since}
              onChange={(e) => setFilters((p) => ({ ...p, since: e.target.value }))}
            />
          </label>
          <label htmlFor="audit-until">
            Until
            <input
              id="audit-until"
              name="until"
              type="datetime-local"
              value={filters.until}
              onChange={(e) => setFilters((p) => ({ ...p, until: e.target.value }))}
            />
          </label>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table audit-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Ticket</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.actor_name || row.actor_email || (row.actor_user_id ? `User #${row.actor_user_id}` : "System")}</td>
                  <td><code>{row.action}</code></td>
                  <td>{row.ticket_id ? <Link to={`/tickets/${row.ticket_id}`}>#{row.ticket_id}</Link> : "-"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatDetails(row.details)}</td>
                </tr>
              ))}
              {!logs.length ? (
                <tr>
                  <td colSpan={5} className="muted">No audit entries match your filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
