import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api";
import { exportTicketsToCsv } from "../../utils/csvExport";
import { toastSuccess } from "../../toast";

export function ReportsPage({ token, t }) {
  const [report, setReport] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [ticketQuery, setTicketQuery] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest("/api/reports/overview", { token }),
      apiRequest("/api/tickets", { token }),
    ])
      .then(([overview, rows]) => {
        setReport(overview);
        setTickets(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const filteredTickets = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    return tickets.filter((item) => {
      const matchesAgent = !q
        || (q === "unassigned"
          ? !item.assigned_agent_name
          : String(item.assigned_agent_name || "").toLowerCase().includes(q));
      const matchesTicket = !ticketQuery.trim()
        || String(item.id).includes(ticketQuery.trim());
      return matchesAgent && matchesTicket;
    });
  }, [tickets, agentQuery, ticketQuery]);

  const agentOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        tickets
          .map((item) => String(item.assigned_agent_name || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["", "Unassigned", ...names];
  }, [tickets]);

  const filteredWorkload = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return report?.workload || [];
    return (report?.workload || []).filter((item) =>
      String(item.name || "").toLowerCase().includes(q)
    );
  }, [report, agentQuery]);

  return (
    <div>
      <div className="page-header">
        <h1>{t.reports}</h1>
        <p>Operational summary generated from current ticket activity.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!report ? (
        <div className="card">
          <p>Loading...</p>
        </div>
      ) : (
        <>
          <div className="grid-4">
            <div className="card kpi">
              <span className="muted">Total Tickets</span>
              <strong>{report.totalTickets || 0}</strong>
            </div>
            <div className="card kpi">
              <span className="muted">Open Tickets</span>
              <strong>{report.openTickets || 0}</strong>
            </div>
            <div className="card kpi">
              <span className="muted">Closed Tickets</span>
              <strong>{report.closedTickets || 0}</strong>
            </div>
            <div className="card kpi">
              <span className="muted">SLA Breaches</span>
              <strong>{report.slaBreaches || 0}</strong>
            </div>
          </div>

          <div className="card">
            <h3>Resolution Performance</h3>
            <p>
              Average resolution time: <strong>{report.avgResolutionHours || 0} hours</strong>
            </p>
            <p style={{ marginTop: 6 }}>
              Average first response time: <strong>{report.avgFirstResponseHours || 0} hours</strong>
            </p>
          </div>

          <div className="card">
            <h3>Workload</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Open Items</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkload.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{Number(item.open_items || 0)}</td>
                    </tr>
                  ))}
                  {!filteredWorkload.length ? (
                    <tr>
                      <td colSpan={2} className="muted">No agents found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="tickets-header">
              <h3>Search Tickets</h3>
              <button
                type="button"
                onClick={() => {
                  exportTicketsToCsv(filteredTickets);
                  toastSuccess("CSV exported.");
                }}
              >
                Export CSV
              </button>
            </div>
            <div className="grid-2">
              <select
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
              >
                {agentOptions.map((name) => (
                  <option key={name || "all"} value={name}>
                    {name || "All Agents"}
                  </option>
                ))}
              </select>
              <input
                placeholder="Search by ticket number"
                value={ticketQuery}
                onChange={(e) => setTicketQuery(e.target.value)}
              />
            </div>
            <div className="table-wrap" style={{ marginTop: "10px" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Subject</th>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.subject}</td>
                      <td>{item.assigned_agent_name || "Unassigned"}</td>
                      <td>{item.status}</td>
                      <td>{item.priority}</td>
                    </tr>
                  ))}
                  {!filteredTickets.length ? (
                    <tr>
                      <td colSpan={5} className="muted">No tickets match your search.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
