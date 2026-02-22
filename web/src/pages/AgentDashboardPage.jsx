import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

export function AgentDashboardPage({ token, user, t }) {
  const [overview, setOverview] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([apiRequest("/api/reports/overview", { token }), apiRequest("/api/tickets", { token })])
      .then(([overviewData, ticketsData]) => {
        if (!mounted) return;
        setOverview(overviewData);
        setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load agent dashboard");
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const myOpenTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          Number(ticket.assigned_agent_id) === Number(user?.id) &&
          !["Resolved", "Closed"].includes(ticket.status)
      ),
    [tickets, user]
  );

  const waitingUserCount = useMemo(
    () => myOpenTickets.filter((ticket) => ticket.status === "Waiting User").length,
    [myOpenTickets]
  );

  const inProgressCount = useMemo(
    () => myOpenTickets.filter((ticket) => ticket.status === "In Progress").length,
    [myOpenTickets]
  );

  const myWorkload = useMemo(() => {
    if (!overview || !Array.isArray(overview.workload)) return null;
    return overview.workload.find((item) => Number(item.id) === Number(user?.id)) || null;
  }, [overview, user]);

  return (
    <div>
      <div className="page-header">
        <h1>{t.agentDashboard || "Agent Dashboard"}</h1>
        <p>Personal queue, in-progress workload, and recent assigned tickets.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}

      {!overview ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="grid-4">
            <div className="card kpi">
              <strong>{myOpenTickets.length}</strong>
              <span>{t.myOpenTickets || "My Open Tickets"}</span>
            </div>
            <div className="card kpi">
              <strong>{inProgressCount}</strong>
              <span>{t.inProgress || "In Progress"}</span>
            </div>
            <div className="card kpi">
              <strong>{waitingUserCount}</strong>
              <span>{t.waitingUser || "Waiting User"}</span>
            </div>
            <div className="card kpi">
              <strong>{Number(myWorkload?.open_items || 0)}</strong>
              <span>{t.assignedLoad || "Assigned Load"}</span>
            </div>
          </div>

          <div className="card">
            <h3>{t.myRecentTickets || "My Recent Tickets"}</h3>
            {!myOpenTickets.length ? (
              <p>{t.noAssignedTickets || "No assigned open tickets."}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{t.tickets || "Tickets"}</th>
                    <th>{t.status || "Status"}</th>
                    <th>{t.priority || "Priority"}</th>
                  </tr>
                </thead>
                <tbody>
                  {myOpenTickets.slice(0, 10).map((ticket) => (
                    <tr key={ticket.id}>
                      <td>#{ticket.id}</td>
                      <td>
                        <Link to={`/tickets/${ticket.id}`}>{ticket.subject}</Link>
                      </td>
                      <td>{ticket.status}</td>
                      <td>{ticket.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
