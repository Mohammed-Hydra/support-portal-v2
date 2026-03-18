import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiRequest, resolveAttachmentUrl } from "../../api";
import { toastError, toastSuccess } from "../../toast";
import { StatusBadge, PriorityBadge } from "../../components/StatusBadge";
import { ReplyFieldWithEmoji } from "../../components/ReplyFieldWithEmoji";
import { useTicketMessagesRealtime } from "../../hooks/useTicketMessagesRealtime";

export function TicketDetailPage({ token, user }) {
  const { ticketId } = useParams();
  const navigate = useNavigate();
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
  const [customFields, setCustomFields] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [cannedResponses, setCannedResponses] = useState([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTickets, setMergeTickets] = useState([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSelected, setMergeSelected] = useState(new Set());
  const [mergeMainId, setMergeMainId] = useState(null);
  const [merging, setMerging] = useState(false);

  useTicketMessagesRealtime(ticketId, (newMsg) => {
    setTicket((prev) => {
      if (!prev || !prev.messages) return prev;
      if (prev.messages.some((m) => m.id === newMsg.id)) return prev;
      return { ...prev, messages: [...prev.messages, { ...newMsg, author_name: newMsg.author_name || (newMsg.source === "requester_portal" ? "Requester" : "Support") }] };
    });
  });

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
    let intervalId = null;
    const INTERVAL_MS = 30000;

    function tick() {
      if (document.visibilityState === "visible") load();
    }

    function startInterval() {
      if (intervalId) return;
      intervalId = setInterval(tick, INTERVAL_MS);
    }

    function stopInterval() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") startInterval();
      else stopInterval();
    };

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ticketId, token]);

  useEffect(() => {
    if (!ticketId || !token) return;
    apiRequest(`/api/tickets/${ticketId}/custom-fields`, { token })
      .then((data) => setCustomFields(data || {}))
      .catch(() => setCustomFields({}));
    apiRequest(`/api/custom-fields/definitions?category=${encodeURIComponent(ticket?.category || "")}`, { token })
      .then((rows) => setCustomFieldDefs(rows || []))
      .catch(() => setCustomFieldDefs([]));
  }, [ticketId, token, ticket?.category]);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "agent") return;
    apiRequest("/api/users/agents", { token })
      .then((rows) => setAgents(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setError(err.message);
        toastError(err.message || "Failed to load agents.");
      });
  }, [token, user]);

  useEffect(() => {
    if (showMergeModal && token) {
      setMergeLoading(true);
      setMergeSelected(new Set());
      setMergeMainId(null);
      apiRequest("/api/tickets", { token })
        .then((rows) => {
          const list = (rows || []).filter((t) => !t.merged_into_ticket_id);
          setMergeTickets(list);
          const current = Number(ticketId);
          if (list.some((t) => t.id === current)) {
            setMergeSelected(new Set([current]));
            setMergeMainId(current);
          }
        })
        .catch(() => setMergeTickets([]))
        .finally(() => setMergeLoading(false));
    }
  }, [showMergeModal, token, ticketId]);

  useEffect(() => {
    if (!token || (user?.role !== "admin" && user?.role !== "agent")) return;
    const cat = ticket?.category?.trim() || "";
    const qs = cat ? `?category=${encodeURIComponent(cat)}` : "";
    apiRequest(`/api/canned-responses${qs}`, { token })
      .then((rows) => setCannedResponses(Array.isArray(rows) ? rows : []))
      .catch(() => setCannedResponses([]));
  }, [token, user, ticket?.category]);

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
      if (Object.keys(customFields).length > 0 || customFieldDefs.length > 0) {
        await apiRequest(`/api/tickets/${ticketId}/custom-fields`, {
          token,
          method: "PUT",
          body: JSON.stringify(customFields),
        });
      }
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
        <span className="muted" style={{ fontSize: "0.875rem" }}>Auto-refreshes every 30s</span>
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
        <p><strong>Status:</strong> <StatusBadge status={ticket.status} /></p>
        <p><strong>Priority:</strong> <PriorityBadge priority={ticket.priority} /></p>
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
            <select id="assign-agent" name="assignedAgentId" value={assignedAgentId} onChange={(e) => setAssignedAgentId(e.target.value)}>
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
            <button type="button" disabled={busyAction} onClick={() => setShowMergeModal(true)}>
              Merge tickets
            </button>
          </div>
        </form>
      ) : null;
      })()}

      <div className="card">
        <h3>Timeline</h3>
        {ticket.messages?.map((item) => {
          const isRequester = item.source === "requester_portal";
          const isInternal = Boolean(item.is_internal);
          const isAutomation = item.source === "automation";
          const icon = isInternal ? "📝" : isAutomation ? "🤖" : isRequester ? "👤" : "🎧";
          const label = item.author_name || item.source;
          return (
          <div key={item.id} className="timeline-item timeline-item-with-icon">
            <small><span className="msg-icon" aria-hidden>{icon}</span> {new Date(item.created_at).toLocaleString()} – {label}</small>
            <p>{item.body || "(attachment only)"}</p>
            {item.attachment_url ? (
              <div className="attachment-block" style={{ marginTop: "6px" }}>
                {isImageAttachment(item.attachment_url) ? (
                  <button
                    type="button"
                    className="text-btn attachment-link"
                    onClick={() => setPreview({ url: resolveAttachmentUrl(item.attachment_url), title: "Attachment" })}
                  >
                    View attachment
                  </button>
                ) : (
                  <a href={resolveAttachmentUrl(item.attachment_url)} target="_blank" rel="noreferrer" className="attachment-link">
                    View attachment
                  </a>
                )}
                {isImageAttachment(item.attachment_url) ? (
                  <div style={{ marginTop: "8px" }}>
                    <img
                      src={resolveAttachmentUrl(item.attachment_url)}
                      alt="Attachment"
                      style={{ maxWidth: "320px", width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {item.is_internal ? <em>Internal note</em> : null}
          </div>
          );
        })}
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

      {/* Floating Edit tab - vertical bar on right edge */}
      {(user?.role === "admin" || user?.role === "agent") && (
        <button
          type="button"
          className="edit-ticket-tab"
          onClick={openEditModal}
          aria-label="Edit ticket information"
          title="Edit ticket"
        >
          <span>Edit</span>
        </button>
      )}

      {showEditModal ? (
        <div
          className="edit-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-ticket-title"
          onClick={() => !busyAction && setShowEditModal(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busyAction) setShowEditModal(false);
          }}
          tabIndex={-1}
        >
          <div className="edit-drawer" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={saveEditTicket} className="edit-drawer-form">
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
                <label htmlFor="edit-subject">
                  Subject <span style={{ color: "var(--danger, #c00)" }}>*</span>
                </label>
                <input
                  id="edit-subject"
                  name="subject"
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  required
                  placeholder="Ticket subject"
                />
                <label htmlFor="edit-description">Description</label>
                <textarea
                  id="edit-description"
                  name="description"
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Ticket description"
                />
                <div className="grid-2">
                  <div>
                    <label htmlFor="edit-status">Status</label>
                    <select id="edit-status" name="status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                      <option value="New">New</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Waiting User">Waiting User</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-priority">Priority</label>
                    <select id="edit-priority" name="priority" value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>
                <label htmlFor="edit-channel">Channel</label>
                <select id="edit-channel" name="channel" value={editChannel} onChange={(e) => setEditChannel(e.target.value)}>
                  <option value="Portal">Portal</option>
                  <option value="Email">Email</option>
                  <option value="WhatsApp">WhatsApp</option>
                </select>
                <label htmlFor="edit-requester-name">Requester Name</label>
                <input
                  id="edit-requester-name"
                  name="requesterName"
                  type="text"
                  value={editRequesterName}
                  onChange={(e) => setEditRequesterName(e.target.value)}
                  placeholder="Requester name"
                />
                <label htmlFor="edit-requester-email">Requester Email</label>
                <input
                  id="edit-requester-email"
                  name="requesterEmail"
                  type="email"
                  value={editRequesterEmail}
                  onChange={(e) => setEditRequesterEmail(e.target.value)}
                  placeholder="Requester email"
                />
                <label htmlFor="edit-requester-phone">Requester Phone</label>
                <input
                  id="edit-requester-phone"
                  name="requesterPhone"
                  type="text"
                  value={editRequesterPhone}
                  onChange={(e) => setEditRequesterPhone(e.target.value)}
                  placeholder="Requester phone"
                />
                <label htmlFor="edit-assigned-agent">Assigned Agent</label>
                <select id="edit-assigned-agent" name="assignedAgentId" value={editAssignedAgentId} onChange={(e) => setEditAssignedAgentId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {user?.id != null && !agents.some((a) => String(a.id) === String(user.id)) ? (
                    <option value={String(user.id)}>{user.name || user.email} (you)</option>
                  ) : null}
                  {agents.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name} ({a.email})</option>
                  ))}
                </select>
                <label htmlFor="edit-category">Category</label>
                <select
                  id="edit-category"
                  name="category"
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
                <label htmlFor="edit-tags">Tags (comma-separated)</label>
                <input
                  id="edit-tags"
                  name="tags"
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="e.g. billing, urgent"
                />
                {customFieldDefs.length > 0 && (
                  <>
                    <label>Custom Fields</label>
                    <div className="grid-2">
                      {customFieldDefs.map((def) => (
                        <label key={def.id} htmlFor={`edit-custom-${def.key}`}>
                          {def.label}
                          <input
                            id={`edit-custom-${def.key}`}
                            name={def.key}
                            type={def.field_type === "number" ? "number" : "text"}
                            value={customFields[def.key] ?? ""}
                            onChange={(e) => setCustomFields((p) => ({ ...p, [def.key]: e.target.value }))}
                          />
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)", position: "sticky", bottom: 0, background: "rgba(255,255,255,0.98)" }}>
                  <button type="button" onClick={() => !busyAction && setShowEditModal(false)} disabled={busyAction}>
                    Cancel
                  </button>
                  <button type="submit" disabled={busyAction}>
                    {busyAction ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <form className="card" onSubmit={sendMessage} style={{ marginBottom: 0 }}>
        <h3>Add Reply / Note</h3>
        {cannedResponses.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Quick replies</label>
            <select
              id="quick-reply"
              name="quickReply"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  const item = cannedResponses.find((r) => String(r.id) === v);
                  if (item) setMessage((prev) => (prev ? `${prev}\n\n${item.body}` : item.body));
                  e.target.value = "";
                }
              }}
              style={{ maxWidth: 280 }}
            >
              <option value="">Insert quick reply...</option>
              {cannedResponses.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>
        )}
        <ReplyFieldWithEmoji
          id="reply-body"
          name="message"
          rows={3}
          value={message}
          onChange={setMessage}
          placeholder="Type your reply..."
          actions={
            user?.role !== "requester" ? (
              <label className="inline-check" htmlFor="reply-internal">
                <input id="reply-internal" name="isInternal" type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                Internal Note
              </label>
            ) : null
          }
          submitButton={<button type="submit" className="btn-compact">Send</button>}
        />
      </form>

      {showMergeModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => !merging && setShowMergeModal(false)}>
          <div className="modal merge-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <strong>Merge tickets</strong>
              <button type="button" className="icon-close" onClick={() => !merging && setShowMergeModal(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p className="muted">Select tickets to merge, then choose which ticket will be the main one. All messages from merged tickets will move to the main ticket.</p>
              {mergeLoading ? (
                <p className="muted">Loading tickets...</p>
              ) : mergeTickets.length === 0 ? (
                <p className="muted">No tickets available to merge.</p>
              ) : (
                <div className="merge-ticket-list">
                  {mergeTickets.map((t) => {
                    const id = t.id;
                    const selected = mergeSelected.has(id);
                    const isMain = mergeMainId === id;
                    const requesterName = t.requester_name || t.requester_name_from_user || t.requester_name_from_contact || "-";
                    return (
                      <div key={id} className={`merge-ticket-row${selected ? " selected" : ""}${isMain ? " main" : ""}`}>
                        <label className="merge-ticket-check">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const next = new Set(mergeSelected);
                              if (e.target.checked) {
                                next.add(id);
                                if (!mergeMainId) setMergeMainId(id);
                              } else {
                                next.delete(id);
                                if (mergeMainId === id) setMergeMainId(next.size ? [...next][0] : null);
                              }
                              setMergeSelected(next);
                            }}
                          />
                          <span className="merge-ticket-id">#{id}</span>
                        </label>
                        <span className="merge-ticket-subject">{t.subject || "(no subject)"}</span>
                        <span className="merge-ticket-meta">
                          <StatusBadge status={t.status} /> · {requesterName}
                        </span>
                        <button
                          type="button"
                          className="text-btn merge-set-main"
                          disabled={!selected}
                          onClick={() => {
                            if (selected) setMergeMainId(id);
                          }}
                        >
                          {isMain ? "Main ticket" : "Set as main"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => !merging && setShowMergeModal(false)}>Cancel</button>
              <button
                type="button"
                disabled={merging || !mergeMainId || mergeSelected.size < 2}
                onClick={async () => {
                  const targetId = mergeMainId;
                  const sourceIds = [...mergeSelected].filter((id) => id !== targetId);
                  if (!targetId || sourceIds.length === 0) return;
                  setMerging(true);
                  try {
                    await apiRequest("/api/tickets/merge", {
                      token,
                      method: "POST",
                      body: JSON.stringify({ targetTicketId: targetId, sourceTicketIds: sourceIds }),
                    });
                    toastSuccess("Tickets merged.");
                    setShowMergeModal(false);
                    navigate(`/tickets/${targetId}`);
                    load();
                  } catch (err) {
                    toastError(err.message || "Failed to merge.");
                  } finally {
                    setMerging(false);
                  }
                }}
              >
                {merging ? "Merging..." : "Merge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
