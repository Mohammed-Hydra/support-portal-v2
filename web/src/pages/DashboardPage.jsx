import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { apiRequest } from "../api";
import { StatusBadge, PriorityBadge } from "../components/StatusBadge";

export function DashboardPage({ token, user, t }) {
  const [tickets, setTickets] = useState([]);
  const [report, setReport] = useState(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");
  const [activeStatus, setActiveStatus] = useState("");
  const [activePriority, setActivePriority] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadTickets() {
      try {
        setError("");
        setLoadingTickets(true);
        const ticketsRows = await apiRequest("/api/tickets", { token });
        if (!mounted) return;
        setTickets(Array.isArray(ticketsRows) ? ticketsRows : []);
      } catch (err) {
        if (!mounted) return;
        setError(err.message);
      } finally {
        if (mounted) setLoadingTickets(false);
      }
    }

    loadTickets();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    let mounted = true;
    if (user?.role !== "admin") {
      setReport(null);
      return () => {
        mounted = false;
      };
    }

    async function loadOverview() {
      try {
        setLoadingReport(true);
        const qs = period === "all" ? "" : `?days=${encodeURIComponent(period)}`;
        const overview = await apiRequest(`/api/reports/overview${qs}`, { token });
        if (!mounted) return;
        setReport(overview);
      } catch (err) {
        if (!mounted) return;
        setError(err.message);
      } finally {
        if (mounted) setLoadingReport(false);
      }
    }

    loadOverview();
    return () => {
      mounted = false;
    };
  }, [token, user, period]);

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

  const priorityCounts = useMemo(() => {
    const counts = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };
    filteredByPeriod.forEach((ticket) => {
      if (Object.prototype.hasOwnProperty.call(counts, ticket.priority)) {
        counts[ticket.priority] += 1;
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

  const myOpenTickets = useMemo(() => {
    if (!user?.id) return 0;
    return filteredByPeriod.filter((ticket) =>
      Number(ticket.assigned_agent_id) === Number(user.id)
      && !["Resolved", "Closed"].includes(ticket.status)
    ).length;
  }, [filteredByPeriod, user]);

  const visibleTickets = useMemo(() => {
    let rows = filteredByPeriod;
    if (activeStatus) rows = rows.filter((ticket) => ticket.status === activeStatus);
    if (activePriority) rows = rows.filter((ticket) => ticket.priority === activePriority);
    return rows;
  }, [activeStatus, activePriority, filteredByPeriod]);

  const statusChartData = useMemo(
    () => Object.entries(statusCounts).map(([name, count]) => ({ name, count })),
    [statusCounts]
  );

  const priorityChartData = useMemo(
    () => Object.entries(priorityCounts).map(([name, count]) => ({ name, count })),
    [priorityCounts]
  );

  const trendChartData = useMemo(() => {
    const byDay = {};
    filteredByPeriod.forEach((ticket) => {
      const ts = Date.parse(ticket.created_at || ticket.updated_at || "");
      if (!Number.isFinite(ts)) return;
      const key = new Date(ts).toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    });
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [filteredByPeriod]);

  const breachedLink = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("breached", "1");
    if (period !== "all") qs.set("days", period);
    return `/tickets?${qs.toString()}`;
  }, [period]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = user?.name?.split(" ")[0] || "there";
    if (hour < 12) return `Good morning, ${name}`;
    if (hour < 18) return `Good afternoon, ${name}`;
    return `Good evening, ${name}`;
  }, [user?.name]);

  const tip = useMemo(() => {
    const tips = [
      "Use the period filters to focus on recent activity.",
      "Click status or priority cards to filter the ticket list.",
      "Export tickets to CSV from the Tickets or Reports page.",
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>{t.dashboard}</h1>
        <p className="welcome-greeting">{greeting}</p>
        <p className="welcome-tip">💡 {tip}</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {loadingTickets ? (
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
              {user?.role === "admin" ? (
                <>
                  <strong>{loadingReport ? "..." : (report?.slaBreaches ?? 0)}</strong>
                  <span>
                    SLA Breaches{" "}
                    <Link to={breachedLink} style={{ marginLeft: 6, fontSize: 12 }}>
                      View
                    </Link>
                  </span>
                </>
              ) : user?.role === "agent" ? (
                <>
                  <strong>{myOpenTickets}</strong>
                  <span>My open</span>
                </>
              ) : (
                <>
                  <strong>-</strong>
                  <span>My View</span>
                </>
              )}
            </div>
          </div>

          {user?.role === "admin" ? (
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div className="card kpi">
                <strong>{loadingReport ? "..." : (report?.avgResolutionHours ?? 0)}</strong>
                <span>Avg Resolve (h)</span>
              </div>
              <div className="card kpi">
                <strong>{loadingReport ? "..." : (report?.avgFirstResponseHours ?? 0)}</strong>
                <span>Avg 1st Response (h)</span>
              </div>
            </div>
          ) : null}

          <div className="card">
            <h3>Tickets by Status</h3>
            <div className="dashboard-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
                  <Bar dataKey="count" fill="var(--btn)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid-4" style={{ marginTop: 12 }}>
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
            <h3>Tickets by Priority</h3>
            <div className="dashboard-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
                  <Bar dataKey="count" fill="var(--btn)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid-4" style={{ marginTop: 12 }}>
              {Object.entries(priorityCounts).map(([priority, count]) => (
                <button
                  key={priority}
                  type="button"
                  className={`card kpi status-card-btn${activePriority === priority ? " status-card-active" : ""}`}
                  onClick={() => setActivePriority((current) => (current === priority ? "" : priority))}
                >
                  <strong>{count}</strong>
                  <span>{priority}</span>
                </button>
              ))}
            </div>
          </div>

          {trendChartData.length > 0 && (
            <div className="card">
              <h3>Tickets Over Time</h3>
              <div className="dashboard-chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--muted)" />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
                    <Line type="monotone" dataKey="count" stroke="var(--btn)" strokeWidth={2} dot={{ fill: "var(--btn)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {user?.role === "admin" && Array.isArray(report?.workload) ? (
            <div className="card">
              <h3>Team Workload</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Open Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.workload.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{Number(item.open_items || 0)}</td>
                      </tr>
                    ))}
                    {!report.workload.length ? (
                      <tr>
                        <td colSpan={2} className="muted">No agents found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="tickets-header">
              <h3>
                {activeStatus || activePriority
                  ? `${[activeStatus, activePriority].filter(Boolean).join(" • ")} Tickets`
                  : "Recent Tickets"}
              </h3>
              {activeStatus || activePriority ? (
                <button type="button" onClick={() => { setActiveStatus(""); setActivePriority(""); }}>
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
                      <td><StatusBadge status={ticket.status} /></td>
                      <td><PriorityBadge priority={ticket.priority} /></td>
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
