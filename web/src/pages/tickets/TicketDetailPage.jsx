import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { toastError, toastSuccess } from "../../toast";

export function TicketDetailPage({ token, user }) {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [agents, setAgents] = useState([]);
  const [assignedAgentId, setAssignedAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const load = async () => {
    try {
      setError("");
      const data = await apiRequest(`/api/tickets/${ticketId}`, { token });
      setTicket(data);
      const raw = data.assigned_agent_id;
      setAssignedAgentId(raw !== undefined && raw !== null ? String(raw) : "");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to load ticket.");
    }
  };

  useEffect(() => {
    load();
  }, [ticketId, token]);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "agent") return;
    apiRequest("/api/users/agents", { token })
      .then((rows) => setAgents(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setError(err.message);
        toastError(err.message || "Failed to load agents.");
      });
  }, [token, user]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    try {
      await apiRequest(`/api/tickets/${ticketId}/messages`, {
        token,
        method: "POST",
        body: JSON.stringify({ body: message, isInternal }),
      });
      setMessage("");
      setIsInternal(false);
      await load();
      toastSuccess("Message sent successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to send message.");
    }
  };

  const updateAssignment = async (event) => {
    event.preventDefault();
    setBusyAction(true);
    try {
      await apiRequest(`/api/tickets/${ticketId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ assignedAgentId: assignedAgentId || null }),
      });
      await load();
      toastSuccess("Assignment updated successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to update assignment.");
    } finally {
      setBusyAction(false);
    }
  };

  const quickUpdate = async (payload, successText) => {
    setBusyAction(true);
    try {
      await apiRequest(`/api/tickets/${ticketId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await load();
      toastSuccess(successText);
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to update ticket.");
    } finally {
      setBusyAction(false);
    }
  };

  if (!ticket) return <p>Loading...</p>;

  const requesterName =
    ticket.requester_name
    || ticket.requester_name_from_user
    || ticket.requester_name_from_contact
    || "N/A";
  const requesterEmail =
    ticket.requester_email
    || ticket.requester_email_from_user
    || ticket.requester_email_from_contact
    || "N/A";
  const requesterPhone =
    ticket.requester_phone
    || ticket.requester_phone_from_contact
    || "N/A";
  const requesterCompany =
    ticket.requester_company_name
    || ticket.requester_company_from_contact
    || "N/A";
  const getSlaCountdown = () => {
    if (ticket.status === "Resolved" || ticket.status === "Closed") {
      return { text: "Resolved", tone: "ok" };
    }
    const dueRaw = ticket.resolution_due_at || ticket.first_response_due_at;
    if (!dueRaw) return { text: "No SLA", tone: "muted" };
    const diffMinutes = Math.floor((new Date(dueRaw).getTime() - Date.now()) / 60000);
    const abs = Math.abs(diffMinutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    const human = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    if (diffMinutes < 0) return { text: `Overdue ${human}`, tone: "danger" };
    if (diffMinutes <= 60) return { text: `Due in ${human}`, tone: "warn" };
    return { text: `Due in ${human}`, tone: "ok" };
  };
  const sla = getSlaCountdown();
  const isImageAttachment = (url) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(url || ""));

  return (
    <div>
      <h1>Ticket #{ticket.id}: {ticket.subject}</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <p><strong>Status:</strong> {ticket.status}</p>
        <p><strong>Priority:</strong> {ticket.priority}</p>
        <p><strong>Channel:</strong> {ticket.channel}</p>
        <p><strong>Assigned Agent:</strong> {ticket.assigned_agent_id || "Unassigned"}</p>
        <p><strong>Requester Name:</strong> {requesterName}</p>
        <p><strong>Requester Email:</strong> {requesterEmail}</p>
        <p><strong>Requester Phone:</strong> {requesterPhone}</p>
        <p><strong>Requester Company:</strong> {requesterCompany}</p>
        <p><strong>SLA:</strong> <span className={`sla-badge sla-${sla.tone}`}>{sla.text}</span></p>
        <p><strong>Description:</strong> {ticket.description || "N/A"}</p>
      </div>

      {user?.role === "admin" || user?.role === "agent" ? (
        <form className="card" onSubmit={updateAssignment}>
          <h3>Assign to Agent</h3>
          <div className="grid-2">
            <select value={assignedAgentId} onChange={(e) => setAssignedAgentId(e.target.value)}>
              <option value="">Unassigned</option>
              {/* Include current user if not already in agents list (e.g. admin) */}
              {user?.id != null && !agents.some((a) => String(a.id) === String(user.id)) ? (
                <option value={String(user.id)}>{user.name || user.email} (you)</option>
              ) : null}
              {agents.map((agent) => (
                <option key={agent.id} value={String(agent.id)}>
                  {agent.name} ({agent.email}){String(agent.id) === String(user?.id) ? " (you)" : ""}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busyAction}>Save Assignment</button>
          </div>
          <div className="top-actions" style={{ marginTop: "10px" }}>
            <button
              type="button"
              disabled={busyAction || user?.id == null}
              onClick={async () => {
                const currentId = user?.id != null ? user.id : null;
                if (currentId == null) return;
                setAssignedAgentId(String(currentId));
                await quickUpdate({ assignedAgentId: currentId }, "Assigned to you.");
              }}
            >
              Assign to me
            </button>
            <button type="button" disabled={busyAction} onClick={() => quickUpdate({ status: "In Progress" }, "Moved to In Progress.")}>
              In Progress
            </button>
            <button type="button" disabled={busyAction} onClick={() => quickUpdate({ status: "Resolved" }, "Marked as Resolved.")}>
              Resolve
            </button>
          </div>
        </form>
      ) : null}

      <div className="card">
        <h3>Timeline</h3>
        {ticket.messages?.map((item) => (
          <div key={item.id} className="timeline-item">
            <small>{new Date(item.created_at).toLocaleString()} - {item.author_name || item.source}</small>
            <p>{item.body || "(attachment only)"}</p>
            {item.attachment_url ? (
              <div style={{ marginTop: "6px" }}>
                <a href={item.attachment_url} target="_blank" rel="noreferrer">
                  View attachment
                </a>
                {isImageAttachment(item.attachment_url) ? (
                  <div style={{ marginTop: "8px" }}>
                    <img
                      src={item.attachment_url}
                      alt="Attachment"
                      style={{ maxWidth: "320px", width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {item.is_internal ? <em>Internal note</em> : null}
          </div>
        ))}
      </div>

      <form className="card" onSubmit={sendMessage}>
        <h3>Add Reply / Note</h3>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        {user?.role !== "requester" ? (
          <label className="inline-check">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
            Internal Note
          </label>
        ) : null}
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
