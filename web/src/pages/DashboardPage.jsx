import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

export function DashboardPage({ token, user, t }) {
  const [tickets, setTickets] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");
  const [activeStatus, setActiveStatus] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        setError("");
        setLoading(true);
        const ticketsRows = await apiRequest("/api/tickets", { token });
        if (!mounted) return;
        setTickets(Array.isArray(ticketsRows) ? ticketsRows : []);

        if (user?.role === "admin") {
          const overview = await apiRequest("/api/reports/overview", { token });
          if (!mounted) return;
          setReport(overview);
        } else {
          setReport(null);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      mounted = false;
    };
  }, [token, user]);

  const filteredByPeriod = useMemo(() => {
    if (period === "all") return tickets;
    const days = Number(period);
    const limit = Date.now() - days * 24 * 60 * 60 * 1000;
    return tickets.filter((ticket) => {
      const time = Date.parse(ticket.created_at || ticket.updated_at || "");
      return Number.isFinite(time) && time >= limit;
    });
  }, [period, tickets]);

  const statusCounts = useMemo(() => {
    const counts = {
      New: 0,
      "In Progress": 0,
      "Waiting User": 0,
      Resolved: 0,
      Closed: 0,
    };
    filteredByPeriod.forEach((ticket) => {
      if (Object.prototype.hasOwnProperty.call(counts, ticket.status)) {
        counts[ticket.status] += 1;
      }
    });
    return counts;
  }, [filteredByPeriod]);

  const openTickets = useMemo(
    () => filteredByPeriod.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length,
    [filteredByPeriod]
  );

  const closedTickets = useMemo(
    () => filteredByPeriod.filter((ticket) => ["Resolved", "Closed"].includes(ticket.status)).length,
    [filteredByPeriod]
  );

  const visibleTickets = useMemo(() => {
    if (!activeStatus) return filteredByPeriod;
    return filteredByPeriod.filter((ticket) => ticket.status === activeStatus);
  }, [activeStatus, filteredByPeriod]);

  return (
    <div>
      <div className="page-header">
        <h1>{t.dashboard}</h1>
        <p>Interactive overview of volume, status, and recent activity.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <div className="card">
          <p>Loading...</p>
        </div>
      ) : (
        <>
          <div className="card dashboard-toolbar">
            <div className="dashboard-filters">
              <button type="button" onClick={() => setPeriod("all")} className={period === "all" ? "active-pill" : ""}>
                All
              </button>
              <button type="button" onClick={() => setPeriod("7")} className={period === "7" ? "active-pill" : ""}>
                7 days
              </button>
              <button type="button" onClick={() => setPeriod("30")} className={period === "30" ? "active-pill" : ""}>
                30 days
              </button>
            </div>
          </div>

          <div className="grid-4">
            <div className="card kpi"><strong>{filteredByPeriod.length}</strong><span>Total</span></div>
            <div className="card kpi"><strong>{openTickets}</strong><span>Open</span></div>
            <div className="card kpi"><strong>{closedTickets}</strong><span>Closed</span></div>
            <div className="card kpi">
              <strong>{user?.role === "admin" ? report?.avgResolutionHours ?? 0 : "-"}</strong>
              <span>{user?.role === "admin" ? "Avg Resolve (h)" : "My View"}</span>
            </div>
          </div>

          <div className="card">
            <h3>Tickets by Status</h3>
            <div className="grid-4">
              {Object.entries(statusCounts).map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  className={`card kpi status-card-btn${activeStatus === status ? " status-card-active" : ""}`}
                  onClick={() => setActiveStatus((current) => (current === status ? "" : status))}
                >
                  <strong>{count}</strong>
                  <span>{status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="tickets-header">
              <h3>{activeStatus ? `${activeStatus} Tickets` : "Recent Tickets"}</h3>
              {activeStatus ? (
                <button type="button" onClick={() => setActiveStatus("")}>
                  Clear Filter
                </button>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.slice(0, 10).map((ticket) => (
                    <tr key={ticket.id}>
                      <td>{ticket.id}</td>
                      <td><Link to={`/tickets/${ticket.id}`}>{ticket.subject}</Link></td>
                      <td>{ticket.status}</td>
                      <td>{ticket.priority}</td>
                      <td>{new Date(ticket.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleTickets.length ? <p className="muted">No tickets in this filter.</p> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
