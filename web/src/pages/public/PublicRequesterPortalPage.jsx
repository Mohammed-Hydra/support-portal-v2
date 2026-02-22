import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api";

const STORAGE_KEY = "requesterPortalToken";

export function PublicRequesterPortalPage() {
  const [searchParams] = useSearchParams();
  const [requesterToken, setRequesterToken] = useState(localStorage.getItem(STORAGE_KEY) || "");
  const [requester, setRequester] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messageBody, setMessageBody] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const authHeaders = useMemo(
    () => (requesterToken ? { Authorization: `Bearer ${requesterToken}` } : {}),
    [requesterToken]
  );

  const refreshTickets = async () => {
    if (!requesterToken) return;
    const rows = await apiRequest("/api/public/requester/tickets", {
      headers: authHeaders,
    });
    setTickets(Array.isArray(rows) ? rows : []);
    if (!selectedTicketId && rows[0]) {
      setSelectedTicketId(String(rows[0].id));
    }
  };

  const refreshTicketDetails = async (ticketId) => {
    if (!requesterToken || !ticketId) return;
    const data = await apiRequest(`/api/public/requester/tickets/${ticketId}`, {
      headers: authHeaders,
    });
    setSelectedTicket(data);
  };

  useEffect(() => {
    const tokenFromQuery = String(searchParams.get("token") || "").trim();
    if (!tokenFromQuery) return;
    apiRequest(`/api/public/requester/magic-link/verify?token=${encodeURIComponent(tokenFromQuery)}`)
      .then((data) => {
        setRequesterToken(data.token);
        setRequester(data.requester || null);
        localStorage.setItem(STORAGE_KEY, data.token);
        setInfo("Access granted. Your requester session is active.");
      })
      .catch((err) => setError(err.message || "Invalid or expired access link."));
  }, [searchParams]);

  useEffect(() => {
    if (!requesterToken) return;
    refreshTickets().catch((err) => setError(err.message || "Failed to load tickets."));
  }, [requesterToken]);

  useEffect(() => {
    if (!selectedTicketId) return;
    refreshTicketDetails(selectedTicketId).catch((err) => setError(err.message || "Failed to load ticket details."));
  }, [selectedTicketId]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!messageBody.trim() || !selectedTicketId) return;
    try {
      await apiRequest(`/api/public/requester/tickets/${selectedTicketId}/messages`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ body: messageBody }),
      });
      setMessageBody("");
      setInfo("Reply sent.");
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err) {
      setError(err.message || "Failed to send reply.");
    }
  };

  const reopenTicket = async () => {
    if (!selectedTicketId) return;
    try {
      await apiRequest(`/api/public/requester/tickets/${selectedTicketId}/reopen`, {
        method: "POST",
        headers: authHeaders,
      });
      setInfo("Ticket reopened.");
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err) {
      setError(err.message || "Failed to reopen ticket.");
    }
  };

  const logoutSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRequesterToken("");
    setRequester(null);
    setTickets([]);
    setSelectedTicket(null);
    setSelectedTicketId("");
    setInfo("Requester session ended.");
  };

  const statusText = (status) => {
    const map = {
      New: "New - received by support",
      "In Progress": "In Progress - team is working",
      "Waiting User": "Waiting for your reply",
      Resolved: "Resolved - please confirm",
      Closed: "Closed",
    };
    return map[status] || status;
  };

  const messageAuthor = (item) => {
    if (item.source === "requester_portal") return "You";
    if (item.source === "automation") return "System";
    if (item.author_name) return `Support - ${item.author_name}`;
    if (item.source === "admin" || item.source === "agent") return "Support Team";
    return item.source || "Message";
  };

  if (!requesterToken) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card stack">
          <div className="page-header">
            <h2>Requester Access</h2>
            <p className="muted">Use your email magic link to access your ticket portal.</p>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <Link to="/public/requester/track">Request access link</Link>
          <Link to="/public/requester">Create new ticket</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="container">
        <div className="page-header">
          <h1>Requester Ticket Portal</h1>
          <p className="muted">
            {requester?.name ? `${requester.name} - ` : ""}
            View and reply to your tickets without password login.
          </p>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="success">{info}</p> : null}
        <div className="top-actions" style={{ marginBottom: "12px" }}>
          <button type="button" onClick={() => refreshTickets().catch((err) => setError(err.message))}>
            Refresh
          </button>
          <button type="button" onClick={logoutSession}>End Session</button>
        </div>

        <div className="grid-2">
          <div className="card">
            <h3>Your Tickets</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(String(ticket.id))}
                      style={{ cursor: "pointer", opacity: String(ticket.id) === selectedTicketId ? 1 : 0.8 }}
                    >
                      <td>{ticket.id}</td>
                      <td>{ticket.subject}</td>
                      <td>{statusText(ticket.status)}</td>
                      <td>{ticket.priority}</td>
                    </tr>
                  ))}
                  {!tickets.length ? (
                    <tr>
                      <td colSpan={4} className="muted">No tickets found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            {!selectedTicket ? (
              <p>Select a ticket to view details.</p>
            ) : (
              <>
                <h3>Ticket #{selectedTicket.id}</h3>
                <p><strong>Subject:</strong> {selectedTicket.subject}</p>
                <p><strong>Status:</strong> {statusText(selectedTicket.status)}</p>
                <p><strong>Priority:</strong> {selectedTicket.priority}</p>
                {(selectedTicket.status === "Resolved" || selectedTicket.status === "Closed") ? (
                  <button type="button" onClick={reopenTicket}>Reopen Ticket</button>
                ) : null}
                <hr />
                <h4>Conversation</h4>
                {(selectedTicket.messages || []).map((item) => (
                  <div key={item.id} className="timeline-item">
                    <small>{new Date(item.created_at).toLocaleString()} - {messageAuthor(item)}</small>
                    <p>{item.body || "(attachment only)"}</p>
                  </div>
                ))}
                <form className="stack" onSubmit={sendMessage}>
                  <textarea
                    rows={3}
                    placeholder="Type your reply"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                  />
                  <button type="submit">Send Reply</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
