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
  const [preview, setPreview] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editChannel, setEditChannel] = useState("");
  const [editRequesterName, setEditRequesterName] = useState("");
  const [editRequesterEmail, setEditRequesterEmail] = useState("");
  const [editRequesterPhone, setEditRequesterPhone] = useState("");
  const [editAssignedAgentId, setEditAssignedAgentId] = useState("");

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

  const openEditModal = () => {
    setEditSubject(ticket.subject || "");
    setEditDescription(ticket.description || "");
    setEditStatus(ticket.status || "New");
    setEditPriority(ticket.priority || "Medium");
    setEditCategory(ticket.category || "");
    setEditTags(Array.isArray(ticket.tags) ? ticket.tags.join(", ") : "");
    setEditChannel(ticket.channel || "Portal");
    const rn = ticket.requester_name || ticket.requester_name_from_user || ticket.requester_name_from_contact || "";
    const re = ticket.requester_email || ticket.requester_email_from_user || ticket.requester_email_from_contact || "";
    const rp = ticket.requester_phone || ticket.requester_phone_from_contact || "";
    setEditRequesterName(rn);
    setEditRequesterEmail(re);
    setEditRequesterPhone(rp);
    setEditAssignedAgentId(ticket.assigned_agent_id != null ? String(ticket.assigned_agent_id) : "");
    setShowEditModal(true);
  };

  const saveEditTicket = async (event) => {
    event.preventDefault();
    const subject = (editSubject || "").trim();
    if (!subject) {
      toastError("Subject is required.");
      return;
    }
    setBusyAction(true);
    try {
      await apiRequest(`/api/tickets/${ticketId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({
          subject,
          description: editDescription ?? "",
          status: editStatus,
          priority: editPriority,
          category: (editCategory || "").trim() || undefined,
          tags: editTags,
          channel: editChannel || "Portal",
          requesterName: editRequesterName || undefined,
          requesterEmail: editRequesterEmail || undefined,
          requesterPhone: editRequesterPhone || undefined,
          assignedAgentId: editAssignedAgentId || null,
        }),
      });
      await load();
      setShowEditModal(false);
      toastSuccess("Ticket updated successfully.");
    } catch (err) {
      const msg = err.status === 403 ? "Only agents and admins can edit ticket details." : (err.message || "Failed to update ticket.");
      setError(msg);
      toastError(msg);
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
  const isImageAttachment = (url) => {
    const raw = String(url || "");
    return raw.startsWith("data:image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(raw);
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h1 style={{ margin: 0 }}>Ticket #{ticket.id}: {ticket.subject}</h1>
        <button
          type="button"
          onClick={openEditModal}
          disabled={busyAction}
          data-testid="edit-ticket-information"
          style={{ width: "auto" }}
        >
          Edit ticket information
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <p><strong>Status:</strong> {ticket.status}</p>
        <p><strong>Priority:</strong> {ticket.priority}</p>
        <p><strong>Channel:</strong> {ticket.channel}</p>
        <p><strong>Assigned Agent:</strong> {ticket.assigned_agent_name || "Unassigned"}</p>
        <p><strong>Requester Name:</strong> {requesterName}</p>
        <p><strong>Requester Email:</strong> {requesterEmail}</p>
        <p><strong>Requester Phone:</strong> {requesterPhone}</p>
        <p><strong>Requester Company:</strong> {requesterCompany}</p>
        <p><strong>SLA:</strong> <span className={`sla-badge sla-${sla.tone}`}>{sla.text}</span></p>
        <p><strong>Description:</strong> {ticket.description || "N/A"}</p>
        <p style={{ marginTop: "16px", marginBottom: 0 }}>
          <button
            type="button"
            onClick={openEditModal}
            disabled={busyAction}
            data-testid="edit-ticket-information-2"
            style={{ width: "auto" }}
          >
            Edit ticket information
          </button>
        </p>
      </div>

      {(() => {
        const role = String(user?.role || "").toLowerCase();
        const canEdit = role === "admin" || role === "agent";
        return canEdit ? (
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
          <div className="top-actions action-buttons-compact" style={{ marginTop: "10px" }}>
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
            <button type="button" disabled={busyAction} onClick={openEditModal}>
              Edit
            </button>
          </div>
        </form>
      ) : null;
      })()}

      <div className="card">
        <h3>Timeline</h3>
        {ticket.messages?.map((item) => (
          <div key={item.id} className="timeline-item">
            <small>{new Date(item.created_at).toLocaleString()} - {item.author_name || item.source}</small>
            <p>{item.body || "(attachment only)"}</p>
            {item.attachment_url ? (
              <div style={{ marginTop: "6px" }}>
                {isImageAttachment(item.attachment_url) ? (
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setPreview({ url: item.attachment_url, title: "Attachment" })}
                  >
                    View attachment
                  </button>
                ) : (
                  <a href={item.attachment_url} target="_blank" rel="noreferrer">
                    View attachment
                  </a>
                )}
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

      {preview?.url ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreview(null);
          }}
          tabIndex={-1}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <strong>{preview.title || "Attachment"}</strong>
              <button type="button" className="icon-close" onClick={() => setPreview(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="modal-body">
              <img src={preview.url} alt={preview.title || "Attachment"} />
            </div>
            <div className="modal-footer">
              <a className="btn-secondary" href={preview.url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
              <button type="button" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-ticket-title"
          onClick={() => !busyAction && setShowEditModal(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busyAction) setShowEditModal(false);
          }}
          tabIndex={-1}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={saveEditTicket}>
              <div className="modal-header">
                <strong id="edit-ticket-title">Edit ticket information</strong>
                <button
                  type="button"
                  className="icon-close"
                  onClick={() => !busyAction && setShowEditModal(false)}
                  aria-label="Close"
                  disabled={busyAction}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <label>
                  Subject <span style={{ color: "var(--danger, #c00)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  required
                  placeholder="Ticket subject"
                />
                <label>Description</label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Ticket description"
                />
                <div className="grid-2">
                  <div>
                    <label>Status</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="New">New</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Waiting User">Waiting User</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label>Priority</label>
                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>
                <label>Channel</label>
                <select value={editChannel} onChange={(e) => setEditChannel(e.target.value)}>
                  <option value="Portal">Portal</option>
                  <option value="Email">Email</option>
                  <option value="WhatsApp">WhatsApp</option>
                </select>
                <label>Requester Name</label>
                <input
                  type="text"
                  value={editRequesterName}
                  onChange={(e) => setEditRequesterName(e.target.value)}
                  placeholder="Requester name"
                />
                <label>Requester Email</label>
                <input
                  type="email"
                  value={editRequesterEmail}
                  onChange={(e) => setEditRequesterEmail(e.target.value)}
                  placeholder="Requester email"
                />
                <label>Requester Phone</label>
                <input
                  type="text"
                  value={editRequesterPhone}
                  onChange={(e) => setEditRequesterPhone(e.target.value)}
                  placeholder="Requester phone"
                />
                <label>Assigned Agent</label>
                <select value={editAssignedAgentId} onChange={(e) => setEditAssignedAgentId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {user?.id != null && !agents.some((a) => String(a.id) === String(user.id)) ? (
                    <option value={String(user.id)}>{user.name || user.email} (you)</option>
                  ) : null}
                  {agents.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name} ({a.email})</option>
                  ))}
                </select>
                <label>Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="software">Software</option>
                  <option value="hardware">Hardware</option>
                  <option value="network">Network</option>
                  <option value="access">Access</option>
                  <option value="other">Other</option>
                </select>
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="e.g. billing, urgent"
                />
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => !busyAction && setShowEditModal(false)} disabled={busyAction}>
                  Cancel
                </button>
                <button type="submit" disabled={busyAction}>
                  {busyAction ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
