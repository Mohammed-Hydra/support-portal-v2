import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { toastError, toastSuccess } from "../../toast";
import { useTicketMessagesRealtime } from "../../hooks/useTicketMessagesRealtime";
import { ReplyFieldWithEmoji } from "../../components/ReplyFieldWithEmoji";

const STORAGE_KEY = "requesterPortalToken";
const SEEN_KEY = "requesterPortalLastSeenV2";

export function PublicRequesterPortalPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [requesterToken, setRequesterToken] = useState(localStorage.getItem(STORAGE_KEY) || "");
  const [requester, setRequester] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messageBody, setMessageBody] = useState("");
  const [messageAttachment, setMessageAttachment] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [filters, setFilters] = useState({ q: "", status: "", days: "30", sort: "updated_desc" });
  const [emailPrefs, setEmailPrefs] = useState({ notify_on_message: true, notify_on_status_change: true, notify_on_assignment: true });
  const [showEmailPrefs, setShowEmailPrefs] = useState(false);
  const [lastSeenByTicket, setLastSeenByTicket] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  });

  const authHeaders = useMemo(
    () => (requesterToken ? { Authorization: `Bearer ${requesterToken}` } : {}),
    [requesterToken]
  );

  const attachmentPreviewUrl = useMemo(() => {
    if (!messageAttachment) return "";
    try {
      return URL.createObjectURL(messageAttachment);
    } catch (e) {
      return "";
    }
  }, [messageAttachment]);

  useEffect(() => {
    if (!attachmentPreviewUrl) return undefined;
    return () => {
      try {
        URL.revokeObjectURL(attachmentPreviewUrl);
      } catch (e) {
        // ignore
      }
    };
  }, [attachmentPreviewUrl]);

  const refreshTickets = async (silent = false) => {
    if (!requesterToken) return;
    if (!silent) setLoadingTickets(true);
    const rows = await apiRequest("/api/public/requester/tickets", { headers: authHeaders });
    setTickets(Array.isArray(rows) ? rows : []);
    if (!selectedTicketId && rows[0]) {
      setSelectedTicketId(String(rows[0].id));
    }
    if (!silent) setLoadingTickets(false);
  };

  const refreshTicketDetails = async (ticketId, silent = false) => {
    if (!requesterToken || !ticketId) return;
    if (!silent) setLoadingTicket(true);
    const data = await apiRequest(`/api/public/requester/tickets/${ticketId}`, {
      headers: authHeaders,
    });
    setSelectedTicket(data);
    if (!silent) setLoadingTicket(false);
  };

  useEffect(() => {
    const tokenFromQuery = String(searchParams.get("token") || "").trim();
    if (!tokenFromQuery) return;
    apiRequest(`/api/public/requester/magic-link/verify?token=${encodeURIComponent(tokenFromQuery)}`)
      .then((data) => {
        setRequesterToken(data.token);
        setRequester(data.requester || null);
        localStorage.setItem(STORAGE_KEY, data.token);
        const message = "Access granted. Your requester session is active.";
        setInfo(message);
        toastSuccess(message);
        navigate("/public/requester/portal", { replace: true });
      })
      .catch((err) => {
        const message = err.message || "Invalid or expired access link.";
        setError(message);
        toastError(message);
      });
  }, [searchParams]);

  useEffect(() => {
    if (!requesterToken) return;
    refreshTickets().catch((err) => setError(err.message || "Failed to load tickets."));
  }, [requesterToken]);

  useEffect(() => {
    if (!selectedTicketId) return;
    refreshTicketDetails(selectedTicketId).catch((err) => setError(err.message || "Failed to load ticket details."));
  }, [selectedTicketId]);

  useTicketMessagesRealtime(selectedTicketId, (newMsg) => {
    setSelectedTicket((prev) => {
      if (!prev || prev.id !== Number(newMsg.ticket_id)) return prev;
      const messages = Array.isArray(prev?.messages) ? prev.messages : [];
      if (messages.some((m) => m.id === newMsg.id)) return prev;
      return { ...prev, messages: [...messages, { ...newMsg, author_name: newMsg.source === "requester_portal" ? "You" : "Support Team" }] };
    });
  }, { isRequester: true });

  useEffect(() => {
    if (!requesterToken) return;
    const interval = setInterval(() => {
      refreshTickets(true).catch(() => {});
      if (selectedTicketId) {
        refreshTicketDetails(selectedTicketId, true).catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedTicketId, requesterToken]);

  useEffect(() => {
    if (!requesterToken) return;
    apiRequest("/api/public/requester/email-preferences", { headers: authHeaders })
      .then((p) => setEmailPrefs(p || { notify_on_message: true, notify_on_status_change: true, notify_on_assignment: true }))
      .catch(() => {});
  }, [requesterToken]);

  const saveEmailPrefs = async () => {
    try {
      await apiRequest("/api/public/requester/email-preferences", {
        headers: authHeaders,
        method: "PATCH",
        body: JSON.stringify(emailPrefs),
      });
      toastSuccess("Email preferences saved.");
    } catch (err) {
      toastError(err.message || "Failed to save preferences.");
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(lastSeenByTicket || {}));
    } catch (e) {
      // ignore
    }
  }, [lastSeenByTicket]);

  useEffect(() => {
    if (!selectedTicketId) return;
    setLastSeenByTicket((prev) => ({ ...prev, [String(selectedTicketId)]: new Date().toISOString() }));
  }, [selectedTicketId]);

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read selected file."));
      reader.readAsDataURL(blob);
    });
  }

  async function compressImageToDataUrl(file, { maxDim = 1280, maxBytes = 2_000_000 } = {}) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const loaded = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Failed to load image."));
    });
    img.src = url;
    await loaded.finally(() => URL.revokeObjectURL(url));

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("Invalid image.");

    let scale = Math.min(1, maxDim / Math.max(width, height));
    let attempt = 0;
    let blob = null;
    while (attempt < 10) {
      const w = Math.max(1, Math.floor(width * scale));
      const h = Math.max(1, Math.floor(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.82;
      for (let qTry = 0; qTry < 6; qTry += 1) {
        // eslint-disable-next-line no-await-in-loop
        const next = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
        if (next && next.size <= maxBytes) {
          blob = next;
          break;
        }
        quality -= 0.08;
      }
      if (blob) break;
      scale *= 0.85;
      attempt += 1;
    }
    if (!blob) throw new Error("Image is too large. Please use a smaller photo.");
    return await blobToDataUrl(blob);
  }

  const sendMessage = async (event) => {
    event.preventDefault();
    if ((!messageBody.trim() && !messageAttachment) || !selectedTicketId) return;
    try {
      let attachmentDataUrl = "";
      let attachmentName = "";
      if (messageAttachment) {
        if (!String(messageAttachment.type || "").startsWith("image/")) {
          throw new Error("Only image attachments are supported.");
        }
        attachmentDataUrl = await compressImageToDataUrl(messageAttachment);
        attachmentName = messageAttachment.name || "attachment.jpg";
      }
      await apiRequest(`/api/public/requester/tickets/${selectedTicketId}/messages`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          body: messageBody,
          attachmentDataUrl: attachmentDataUrl || undefined,
          attachmentName: attachmentName || undefined,
        }),
      });
      setMessageBody("");
      setMessageAttachment(null);
      setInfo("Reply sent.");
      toastSuccess("Reply sent.");
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err) {
      const message = err.message || "Failed to send reply.";
      setError(message);
      toastError(message);
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
      toastSuccess("Ticket reopened.");
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err) {
      const message = err.message || "Failed to reopen ticket.";
      setError(message);
      toastError(message);
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
    toastSuccess("Requester session ended.");
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

  const messageIcon = (item) => {
    if (item.source === "requester_portal") return "👤";
    if (item.source === "automation") return "🤖";
    return "🎧";
  };

  if (!requesterToken) {
    return (
      <div className="auth-wrap requester-portal-wrap">
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <ThemeToggle />
        </div>
        <div className="card auth-card stack">
          <div className="page-header">
            <Logo className="login-brand-image" alt="HYDRA-TECH.PRO IT SUPPORT PLATFORM" />
            <h2>Requester Access</h2>
            <p className="muted">Enter your email to access your ticket portal.</p>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <Link to="/public/requester/track">Track tickets by email</Link>
          <Link to="/public/requester">Create new ticket</Link>
        </div>
      </div>
    );
  }

  const filteredTickets = useMemo(() => {
    const days = Number(filters.days || "0");
    const hasDays = Number.isFinite(days) && days > 0;
    const limit = hasDays ? (Date.now() - days * 24 * 60 * 60 * 1000) : 0;
    const q = String(filters.q || "").trim().toLowerCase();
    const status = String(filters.status || "").trim();
    let rows = [...tickets];
    if (hasDays) {
      rows = rows.filter((t) => {
        const ts = Date.parse(t.updated_at || t.created_at || "");
        return Number.isFinite(ts) && ts >= limit;
      });
    }
    if (status) rows = rows.filter((t) => t.status === status);
    if (q) {
      rows = rows.filter((t) =>
        String(t.subject || "").toLowerCase().includes(q) || String(t.id).includes(q)
      );
    }
    rows.sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.created_at || "") || 0;
      const tb = Date.parse(b.updated_at || b.created_at || "") || 0;
      if (filters.sort === "updated_asc") return ta - tb;
      return tb - ta;
    });
    return rows;
  }, [tickets, filters.days, filters.q, filters.sort, filters.status]);

  const statusSteps = ["New", "In Progress", "Waiting User", "Resolved", "Closed"];
  const selectedStepIndex = Math.max(0, statusSteps.indexOf(String(selectedTicket?.status || "")));

  const expectedFirstResponse = useMemo(() => {
    if (!selectedTicket?.first_response_due_at) return "";
    if (selectedTicket?.first_response_at) return "";
    try {
      const dt = new Date(selectedTicket.first_response_due_at);
      return Number.isFinite(dt.getTime()) ? dt.toLocaleString() : "";
    } catch (e) {
      return "";
    }
  }, [selectedTicket]);

  const ticketUnread = (ticket) => {
    const lastSeen = Date.parse(lastSeenByTicket?.[String(ticket.id)] || "");
    const updated = Date.parse(ticket.updated_at || ticket.created_at || "");
    if (!Number.isFinite(updated)) return false;
    if (!Number.isFinite(lastSeen)) return true;
    return updated > lastSeen;
  };

  return (
    <div className="content">
      <div className="container">
        <div className="page-header">
          <Logo className="login-brand-image" alt="HYDRA-TECH.PRO IT SUPPORT PLATFORM" />
          <h1>Requester Ticket Portal</h1>
          <p className="muted">
            {requester?.name ? `${requester.name} - ` : ""}
            View and reply to your tickets without password login.
          </p>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="success">{info}</p> : null}
        <div className="top-actions" style={{ marginBottom: "12px" }}>
          <ThemeToggle />
          <button type="button" className="btn-compact" onClick={() => refreshTickets().catch((err) => setError(err.message))}>
            Refresh
          </button>
          <button type="button" className="btn-compact" onClick={() => setShowEmailPrefs((v) => !v)}>
            {showEmailPrefs ? "Hide" : "Email"} preferences
          </button>
          <button type="button" className="btn-compact" onClick={logoutSession}>End Session</button>
        </div>
        {showEmailPrefs && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Email notification preferences</h3>
            <p className="muted">Choose which events trigger email notifications.</p>
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="inline-check" htmlFor="pref-notify-message">
                <input
                  id="pref-notify-message"
                  name="notify_on_message"
                  type="checkbox"
                  checked={emailPrefs.notify_on_message}
                  onChange={(e) => setEmailPrefs((p) => ({ ...p, notify_on_message: e.target.checked }))}
                />
                New messages / replies
              </label>
              <label className="inline-check" htmlFor="pref-notify-status">
                <input
                  id="pref-notify-status"
                  name="notify_on_status_change"
                  type="checkbox"
                  checked={emailPrefs.notify_on_status_change}
                  onChange={(e) => setEmailPrefs((p) => ({ ...p, notify_on_status_change: e.target.checked }))}
                />
                Status changes
              </label>
              <label className="inline-check" htmlFor="pref-notify-assignment">
                <input
                  id="pref-notify-assignment"
                  name="notify_on_assignment"
                  type="checkbox"
                  checked={emailPrefs.notify_on_assignment}
                  onChange={(e) => setEmailPrefs((p) => ({ ...p, notify_on_assignment: e.target.checked }))}
                />
                Ticket assignment
              </label>
            </div>
            <button type="button" className="btn-compact" onClick={saveEmailPrefs} style={{ marginTop: 8 }}>Save preferences</button>
          </div>
        )}

        <div className="grid-2">
          <div className="card">
            <h3>Your Tickets</h3>
            <div className="grid-2" style={{ marginBottom: 10 }}>
              <input
                id="portal-search"
                name="q"
                placeholder="Search by ticket # or subject"
                value={filters.q}
                onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
              />
              <select id="portal-filter-status" name="status" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                <option value="">All statuses</option>
                {statusSteps.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid-2" style={{ marginBottom: 10 }}>
              <select id="portal-filter-days" name="days" value={filters.days} onChange={(e) => setFilters((p) => ({ ...p, days: e.target.value }))}>
                <option value="0">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
              <select id="portal-filter-sort" name="sort" value={filters.sort} onChange={(e) => setFilters((p) => ({ ...p, sort: e.target.value }))}>
                <option value="updated_desc">Newest updated</option>
                <option value="updated_asc">Oldest updated</option>
              </select>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(String(ticket.id))}
                      style={{ cursor: "pointer", opacity: String(ticket.id) === selectedTicketId ? 1 : 0.8 }}
                    >
                      <td>{ticket.id}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{ticket.subject}</span>
                          {ticketUnread(ticket) ? <span className="unread-badge">New</span> : null}
                        </div>
                      </td>
                      <td>{statusText(ticket.status)}</td>
                      <td>{ticket.priority}</td>
                      <td>{ticket.assigned_agent_name || "—"}</td>
                    </tr>
                  ))}
                  {loadingTickets ? (
                    <tr>
                      <td colSpan={5} className="muted">Loading...</td>
                    </tr>
                  ) : null}
                  {!filteredTickets.length && !loadingTickets ? (
                    <tr>
                      <td colSpan={5} className="muted">No tickets found.</td>
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
                <p><strong>Agent:</strong> {selectedTicket.assigned_agent_name || "Unassigned"}</p>
                {expectedFirstResponse ? (
                  <p className="muted" style={{ marginTop: -6 }}>
                    Expected first response by <strong>{expectedFirstResponse}</strong>
                  </p>
                ) : null}
                <div className="requester-status-steps" style={{ marginTop: 10 }}>
                  {statusSteps.map((step, idx) => (
                    <div
                      key={step}
                      className={`requester-step${idx < selectedStepIndex ? " done" : idx === selectedStepIndex ? " active" : ""}`}
                    >
                      <span className="dot" />
                      <span className="label">{step}</span>
                    </div>
                  ))}
                </div>
                {selectedTicket.status === "Waiting User" ? (
                  <div className="requester-banner warn">
                    <strong>Action required:</strong> please reply with more details so we can continue.
                  </div>
                ) : null}
                {(selectedTicket.status === "Resolved" || selectedTicket.status === "Closed") ? (
                  <button type="button" onClick={reopenTicket}>Reopen Ticket</button>
                ) : null}
                <hr />
                <h4>Conversation <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(updates automatically)</span></h4>
                {loadingTicket ? <p className="muted">Loading conversation...</p> : null}
                {(Array.isArray(selectedTicket?.messages) ? selectedTicket.messages : [])
                .filter((item) => item && typeof item === "object")
                .map((item, idx) => (
                  <div key={item?.id ?? `msg-${idx}`} className="timeline-item timeline-item-with-icon">
                    <small><span className="msg-icon" aria-hidden>{messageIcon(item)}</span> {new Date(item.created_at).toLocaleString()} – {messageAuthor(item)}</small>
                    <p style={{ whiteSpace: "pre-wrap" }}>{item.body || (item.attachment_url ? "(attachment)" : "")}</p>
                    {item.attachment_url ? (
                      <div className="requester-attachment attachment-block">
                        {String(item.attachment_url).startsWith("data:image/") ? (
                          <a href={item.attachment_url} target="_blank" rel="noreferrer">
                            <img src={item.attachment_url} alt="Attachment" />
                          </a>
                        ) : (
                          <a href={item.attachment_url} target="_blank" rel="noreferrer" className="attachment-link">View attachment</a>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
                <form className="stack" onSubmit={sendMessage}>
                  <ReplyFieldWithEmoji
                    id="portal-reply-body"
                    name="messageBody"
                    rows={3}
                    value={messageBody}
                    onChange={setMessageBody}
                    placeholder="Type your reply"
                  />
                  <label className="muted" style={{ marginTop: -4 }} htmlFor="portal-reply-attachment">
                    Attach image (optional)
                    <input
                      id="portal-reply-attachment"
                      name="attachment"
                      type="file"
                      onChange={(e) => setMessageAttachment(e.target.files?.[0] || null)}
                    />
                  </label>
                  {attachmentPreviewUrl ? (
                    <div className="requester-attachment-preview">
                      <p className="muted" style={{ margin: 0 }}>
                        Selected: <strong>{messageAttachment?.name}</strong> ({Math.round((messageAttachment?.size || 0) / 1024)} KB)
                      </p>
                      <img src={attachmentPreviewUrl} alt="Attachment preview" />
                    </div>
                  ) : null}
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
