import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api";
import { toastError, toastSuccess } from "../../toast";

const statuses = ["New", "In Progress", "Waiting User", "Resolved", "Closed"];
const priorities = ["Low", "Medium", "High", "Critical"];
const categories = ["general", "software", "hardware", "network", "access", "other"];
const channels = ["Portal", "Email", "WhatsApp"];

export function TicketListPage({ token, user, t }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [busyTicketId, setBusyTicketId] = useState("");
  const [agents, setAgents] = useState([]);
  const [searchTicketId, setSearchTicketId] = useState("");
  const [form, setForm] = useState({
    subject: "",
    description: "",
    priority: "Medium",
    channel: "Portal",
    category: "software",
    requesterPhone: "",
    requesterCompanyName: "",
  });
  const [kbSuggestions, setKbSuggestions] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFields, setCustomFields] = useState({});

  const listFilters = useMemo(() => {
    const qs = new URLSearchParams(location.search || "");
    const status = String(qs.get("status") || "").trim();
    const priority = String(qs.get("priority") || "").trim();
    const category = String(qs.get("category") || "").trim();
    const agent = String(qs.get("agent") || "").trim();
    const channel = String(qs.get("channel") || "").trim();
    const id = String(qs.get("id") || "").trim();
    const daysRaw = String(qs.get("days") || "").trim();
    const daysParsed = Number(daysRaw);
    const days = Number.isFinite(daysParsed) && daysParsed > 0 ? String(Math.floor(daysParsed)) : "";
    const breached = qs.get("breached") === "1" || qs.get("breached") === "true";
    return { status, priority, category, agent, channel, id, days, breached };
  }, [location.search]);

  const load = async () => {
    try {
      setError("");
      const qs = new URLSearchParams();
      if (listFilters.status) qs.set("status", listFilters.status);
      if (listFilters.priority) qs.set("priority", listFilters.priority);
      if (listFilters.category) qs.set("category", listFilters.category);
      if (listFilters.agent) qs.set("agent", listFilters.agent);
      if (listFilters.channel) qs.set("channel", listFilters.channel);
      if (listFilters.id) qs.set("id", listFilters.id);
      if (listFilters.breached) qs.set("breached", "1");
      if (listFilters.days) qs.set("days", listFilters.days);
      const url = qs.toString() ? `/api/tickets?${qs.toString()}` : "/api/tickets";
      const rows = await apiRequest(url, { token });
      setTickets(rows);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [token, listFilters.status, listFilters.priority, listFilters.category, listFilters.agent, listFilters.channel, listFilters.id, listFilters.breached, listFilters.days]);

  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [token, listFilters.status, listFilters.priority, listFilters.category, listFilters.agent, listFilters.channel, listFilters.id, listFilters.breached, listFilters.days]);

  useEffect(() => {
    setSearchTicketId(listFilters.id || "");
  }, [listFilters.id]);

  useEffect(() => {
    const search = (form.subject || "").trim();
    const category = (form.category || "").trim();
    if (!search && !category) {
      setKbSuggestions([]);
      return;
    }
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (category) qs.set("category", category);
    apiRequest(`/api/help-center/articles?${qs.toString()}`, { token })
      .then((rows) => setKbSuggestions((rows || []).slice(0, 5)))
      .catch(() => setKbSuggestions([]));
  }, [token, form.subject, form.category]);

  useEffect(() => {
    apiRequest(`/api/custom-fields/definitions?category=${encodeURIComponent(form.category || "")}`, { token })
      .then((rows) => setCustomFieldDefs(rows || []))
      .catch(() => setCustomFieldDefs([]));
  }, [token, form.category]);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "agent") return;
    apiRequest("/api/users/agents", { token })
      .then((rows) => setAgents(Array.isArray(rows) ? rows : []))
      .catch(() => setAgents([]));
  }, [token, user?.role]);

  const applyFilters = (updates) => {
    const qs = new URLSearchParams(location.search || "");
    Object.entries(updates).forEach(([k, v]) => {
      if (v != null && v !== "") qs.set(k, String(v));
      else qs.delete(k);
    });
    navigate(`/tickets?${qs.toString()}`, { replace: true });
  };

  const handleSearch = () => {
    applyFilters({ id: searchTicketId.trim() || null });
  };

  const submitTicket = async (event) => {
    event.preventDefault();
    try {
      const created = await apiRequest("/api/tickets", {
        token,
        method: "POST",
        body: JSON.stringify(form),
      });
      if (created?.id && Object.keys(customFields).length > 0) {
        await apiRequest(`/api/tickets/${created.id}/custom-fields`, {
          token,
          method: "PUT",
          body: JSON.stringify(customFields),
        });
      }
      setForm({
        subject: "",
        description: "",
        priority: "Medium",
        channel: "Portal",
        category: "software",
        requesterPhone: "",
        requesterCompanyName: "",
      });
      setCustomFields({});
      await load();
      toastSuccess("Ticket created successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to create ticket.");
    }
  };

  const updateStatus = async (ticketId, status) => {
    setBusyTicketId(String(ticketId));
    try {
      await apiRequest(`/api/tickets/${ticketId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
      toastSuccess("Ticket updated successfully.");
    } catch (err) {
      setError(err.message);
      toastError(err.message || "Failed to update ticket.");
    } finally {
      setBusyTicketId("");
    }
  };

  const updateTicketQuick = async (ticketId, payload, successText) => {
    setBusyTicketId(String(ticketId));
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
      setBusyTicketId("");
    }
  };

  const getRequesterName = (ticket) =>
    ticket.requester_name
    || ticket.requester_name_from_user
    || ticket.requester_name_from_contact
    || "-";

  const getRequesterContact = (ticket) => {
    const email = ticket.requester_email || ticket.requester_email_from_user || ticket.requester_email_from_contact || "";
    const phone = ticket.requester_phone || ticket.requester_phone_from_contact || "";
    return [email, phone].filter(Boolean).join(" | ") || "-";
  };

  const getCompanyName = (ticket) =>
    ticket.requester_company_name || ticket.requester_company_from_contact || "-";

  const formatDuration = (minutes) => {
    const abs = Math.abs(minutes);
    const days = Math.floor(abs / 1440);
    const hours = Math.floor((abs % 1440) / 60);
    const mins = abs % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getSlaCountdown = (ticket) => {
    if (ticket.status === "Resolved" || ticket.status === "Closed") {
      return { text: "Resolved", tone: "ok" };
    }
    const dueRaw = ticket.resolution_due_at || ticket.first_response_due_at;
    if (!dueRaw) return { text: "No SLA", tone: "muted" };
    const diffMinutes = Math.floor((new Date(dueRaw).getTime() - Date.now()) / 60000);
    if (diffMinutes < 0) return { text: `Overdue ${formatDuration(diffMinutes)}`, tone: "danger" };
    if (diffMinutes <= 60) return { text: `Due in ${formatDuration(diffMinutes)}`, tone: "warn" };
    return { text: `Due in ${formatDuration(diffMinutes)}`, tone: "ok" };
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t.tickets}</h1>
        <p>Create new requests and manage queue status from one screen.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}

      {(listFilters.status || listFilters.priority || listFilters.category || listFilters.agent || listFilters.channel || listFilters.id || listFilters.breached || listFilters.days) ? (
        <div className="card">
          <div className="tickets-header">
            <h3>Active Filters</h3>
            <button type="button" onClick={() => navigate("/tickets")}>Clear</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {[
              listFilters.breached ? "SLA breached" : null,
              listFilters.status ? `Status: ${listFilters.status}` : null,
              listFilters.priority ? `Priority: ${listFilters.priority}` : null,
              listFilters.category ? `Category: ${listFilters.category}` : null,
              listFilters.agent ? `Agent: ${agents.find((a) => String(a.id) === listFilters.agent)?.name || listFilters.agent}` : null,
              listFilters.channel ? `Type: ${listFilters.channel}` : null,
              listFilters.id ? `Ticket #${listFilters.id}` : null,
              listFilters.days ? `Last ${listFilters.days} days` : null,
            ].filter(Boolean).join(" • ")}
          </p>
        </div>
      ) : null}

      <form className="card stack" onSubmit={submitTicket}>
        <div className="tickets-header">
          <h3>Create Ticket</h3>
        </div>
        <div className="grid-2">
          <label>
            Subject
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {priorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        {kbSuggestions.length > 0 && (
          <div className="kb-suggestions">
            <strong>Suggested articles</strong>
            <ul className="list">
              {kbSuggestions.map((a) => (
                <li key={a.id}>
                  <Link to="/help-center" state={{ openSlug: a.slug }}>
                    {a.title} ({a.category})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {customFieldDefs.length > 0 && (
          <div className="custom-fields-inline">
            {customFieldDefs.map((def) => (
              <label key={def.id}>
                {def.label}
                <input
                  type={def.field_type === "number" ? "number" : "text"}
                  value={customFields[def.key] ?? ""}
                  onChange={(e) => setCustomFields((p) => ({ ...p, [def.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}
        {user?.role === "requester" ? (
          <div className="grid-2">
            <label>
              Phone Number
              <input
                value={form.requesterPhone}
                onChange={(e) => setForm({ ...form, requesterPhone: e.target.value })}
                required
              />
            </label>
            <label>
              Company Name (optional)
              <input
                value={form.requesterCompanyName}
                onChange={(e) => setForm({ ...form, requesterCompanyName: e.target.value })}
              />
            </label>
          </div>
        ) : null}
        <button type="submit">Create</button>
      </form>

      <div className="card">
        <div className="tickets-header">
          <h3>Ticket Queue</h3>
          <span className="muted">{tickets.length} tickets</span>
        </div>
        <div className="stack" style={{ marginBottom: "16px", gap: "12px" }}>
          <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            <label>
              Status
              <select
                value={listFilters.status}
                onChange={(e) => applyFilters({ status: e.target.value || null })}
              >
                <option value="">All</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={listFilters.priority}
                onChange={(e) => applyFilters({ priority: e.target.value || null })}
              >
                <option value="">All</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={listFilters.category}
                onChange={(e) => applyFilters({ category: e.target.value || null })}
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </label>
            {(user?.role === "admin" || user?.role === "agent") && (
              <label>
                Agent
                <select
                  value={listFilters.agent}
                  onChange={(e) => applyFilters({ agent: e.target.value || null })}
                >
                  <option value="">All</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name || a.email}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Ticket type
              <select
                value={listFilters.channel}
                onChange={(e) => applyFilters({ channel: e.target.value || null })}
              >
                <option value="">All</option>
                {channels.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ margin: 0, flex: "1 1 120px", minWidth: "120px" }}>
              <span style={{ display: "block", marginBottom: "4px" }}>Ticket #</span>
              <input
                type="text"
                placeholder="e.g. 22"
                value={searchTicketId}
                onChange={(e) => setSearchTicketId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </label>
            <button type="button" onClick={handleSearch}>
              Search
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Requester</th>
                <th>Contact</th>
                <th>Company Name</th>
                <th>Agent</th>
                <th>SLA</th>
                <th>Updated</th>
                <th className="action-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.id}</td>
                  <td><Link to={`/tickets/${ticket.id}`}>{ticket.subject}</Link></td>
                  <td>{ticket.status}</td>
                  <td>{ticket.priority}</td>
                  <td>{getRequesterName(ticket)}</td>
                  <td>{getRequesterContact(ticket)}</td>
                  <td>{getCompanyName(ticket)}</td>
                  <td>{ticket.assigned_agent_name || "Unassigned"}</td>
                  <td>
                    {(() => {
                      const sla = getSlaCountdown(ticket);
                      return <span className={`sla-badge sla-${sla.tone}`}>{sla.text}</span>;
                    })()}
                  </td>
                  <td>{new Date(ticket.updated_at).toLocaleString()}</td>
                  <td className="action-cell">
                    {user?.role === "requester" ? (
                      "-"
                    ) : (
                      <div className="stack">
                        <div className="top-actions action-buttons-compact">
                          <button
                            type="button"
                            disabled={busyTicketId === String(ticket.id)}
                            onClick={() =>
                              updateTicketQuick(
                                ticket.id,
                                { assignedAgentId: user?.id || null },
                                "Assigned to you."
                              )}
                          >
                            Assign to me
                          </button>
                          <button
                            type="button"
                            disabled={busyTicketId === String(ticket.id)}
                            onClick={() => updateTicketQuick(ticket.id, { status: "In Progress" }, "Moved to In Progress.")}
                          >
                            In Progress
                          </button>
                          <button
                            type="button"
                            disabled={busyTicketId === String(ticket.id)}
                            onClick={() => updateTicketQuick(ticket.id, { status: "Resolved" }, "Marked as Resolved.")}
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            disabled={busyTicketId === String(ticket.id)}
                            onClick={() => navigate(`/tickets/${ticket.id}`)}
                          >
                            Edit
                          </button>
                        </div>
                        <select
                          value={ticket.status}
                          disabled={busyTicketId === String(ticket.id)}
                          onChange={(e) => updateStatus(ticket.id, e.target.value)}
                        >
                          {statuses.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
