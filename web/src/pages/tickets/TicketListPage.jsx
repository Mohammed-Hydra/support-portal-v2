import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api";
import { toastError, toastSuccess } from "../../toast";
import { exportTicketsToCsv } from "../../utils/csvExport";
import { StatusBadge, PriorityBadge } from "../../components/StatusBadge";
import { Collapsible } from "../../components/Collapsible";

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
  const [searchText, setSearchText] = useState("");
  const [estimatedResponse, setEstimatedResponse] = useState(null);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    priority: "Medium",
    channel: "Portal",
    category: "general",
    categoryOther: "",
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    requesterCompanyName: "",
  });
  const [attachment, setAttachment] = useState(null);
  const [kbSuggestions, setKbSuggestions] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customFields, setCustomFields] = useState({});
  const [ticketTemplates, setTicketTemplates] = useState([]);
  const [sortBy, setSortBy] = useState("updated");
  const [sortDir, setSortDir] = useState("desc");
  const [mergeSelected, setMergeSelected] = useState(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeMainId, setMergeMainId] = useState(null);
  const [merging, setMerging] = useState(false);
  const [selectAllActive, setSelectAllActive] = useState(false);

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
    const search = String(qs.get("search") || "").trim();
    return { status, priority, category, agent, channel, id, days, breached, search };
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
      if (listFilters.search) qs.set("search", listFilters.search);
      const url = qs.toString() ? `/api/tickets?${qs.toString()}` : "/api/tickets";
      const rows = await apiRequest(url, { token });
      setTickets(rows);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [token, listFilters.status, listFilters.priority, listFilters.category, listFilters.agent, listFilters.channel, listFilters.id, listFilters.breached, listFilters.days, listFilters.search]);

  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [token, listFilters.status, listFilters.priority, listFilters.category, listFilters.agent, listFilters.channel, listFilters.id, listFilters.breached, listFilters.days, listFilters.search]);

  useEffect(() => {
    setSearchTicketId(listFilters.id || "");
    setSearchText(listFilters.search || "");
  }, [listFilters.id, listFilters.search]);

  useEffect(() => {
    if (!token || (user?.role !== "admin" && user?.role !== "agent" && user?.role !== "requester")) return;
    const qs = new URLSearchParams();
    qs.set("priority", form.priority || "Medium");
    if (form.category && form.category !== "other") qs.set("category", form.category);
    apiRequest(`/api/settings/estimated-response?${qs.toString()}`, { token })
      .then((r) => setEstimatedResponse(r))
      .catch(() => setEstimatedResponse(null));
  }, [token, user?.role, form.priority, form.category]);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "agent") return;
    apiRequest("/api/ticket-templates", { token })
      .then((rows) => setTicketTemplates(Array.isArray(rows) ? rows : []))
      .catch(() => setTicketTemplates([]));
  }, [token, user]);

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
    applyFilters({ id: searchTicketId.trim() || null, search: searchText.trim() || null });
  };

  const submitTicket = async (event) => {
    event.preventDefault();
    try {
      const category = form.category === "other" ? (form.categoryOther || "other") : form.category;
      const payload = {
        subject: form.subject,
        description: form.description,
        priority: form.priority,
        channel: form.channel,
        category,
        requesterPhone: form.requesterPhone,
        requesterCompanyName: form.requesterCompanyName,
      };
      if (user?.role === "admin" || user?.role === "agent") {
        payload.requesterName = form.requesterName;
        payload.requesterEmail = form.requesterEmail;
      }
      let body;
      if (attachment) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v != null && v !== "") fd.append(k, String(v));
        });
        fd.append("attachment", attachment);
        body = fd;
      } else {
        body = JSON.stringify(payload);
      }
      const created = await apiRequest("/api/tickets", {
        token,
        method: "POST",
        body,
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
        category: "general",
        categoryOther: "",
        requesterName: "",
        requesterEmail: "",
        requesterPhone: "",
        requesterCompanyName: "",
      });
      setAttachment(null);
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

  const statusOrder = { New: 1, "In Progress": 2, "Waiting User": 3, Resolved: 4, Closed: 5 };
  const priorityOrder = { Critical: 1, High: 2, Medium: 3, Low: 4 };

  const sortedTickets = useMemo(() => {
    const list = [...tickets];
    const dir = sortDir === "asc" ? 1 : -1;
    const slaVal = (t) => {
      if (t.status === "Resolved" || t.status === "Closed") return Number.MAX_SAFE_INTEGER;
      const due = t.resolution_due_at || t.first_response_due_at;
      return due ? new Date(due).getTime() : Number.MAX_SAFE_INTEGER - 1;
    };
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "status") {
        cmp = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      } else if (sortBy === "priority") {
        cmp = (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
      } else if (sortBy === "sla") {
        cmp = slaVal(a) - slaVal(b);
      } else {
        cmp = new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
      }
      return dir * cmp;
    });
    return list;
  }, [tickets, sortBy, sortDir]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir(col === "updated" ? "desc" : "asc");
    }
  };

  const SortHeader = ({ col, label }) => (
    <th
      className={`sortable ${sortBy === col ? "active" : ""}`}
      onClick={() => toggleSort(col)}
      scope="col"
    >
      {label}
      <span className="sort-icon" aria-hidden="true">
        {sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
      </span>
    </th>
  );

  return (
    <div>
      <div className="page-header">
        <h1>{t.tickets}</h1>
        <p>Create new requests and manage queue status from one screen.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}

      {(listFilters.status || listFilters.priority || listFilters.category || listFilters.agent || listFilters.channel || listFilters.id || listFilters.breached || listFilters.days || listFilters.search) ? (
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
              listFilters.search ? `Search: "${listFilters.search}"` : null,
            ].filter(Boolean).join(" • ")}
          </p>
        </div>
      ) : null}

      <Collapsible title="Create Ticket" defaultOpen={false}>
      <form className="card stack" onSubmit={submitTicket}>
        {ticketTemplates.length > 0 && (user?.role === "admin" || user?.role === "agent") && (
          <label htmlFor="ticket-template">
            Use template
            <select
              id="ticket-template"
              name="template"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  const tpl = ticketTemplates.find((t) => String(t.id) === v);
                  if (tpl) {
                    setForm((prev) => ({
                      ...prev,
                      subject: tpl.subject,
                      description: tpl.description || "",
                      category: tpl.category || "general",
                      priority: tpl.priority || "Medium",
                    }));
                    const cf = tpl.custom_fields_json;
                    setCustomFields(typeof cf === "string" ? (() => { try { return JSON.parse(cf || "{}"); } catch { return {}; } })() : (cf || {}));
                  }
                  e.target.value = "";
                }
              }}
            >
              <option value="">Select template (optional)</option>
              {ticketTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        {(user?.role === "admin" || user?.role === "agent") && (
          <>
            <div className="grid-2">
              <label htmlFor="ticket-requester-name">
                Requester Name
                <input
                  id="ticket-requester-name"
                  name="requesterName"
                  value={form.requesterName}
                  onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                  placeholder="Full name"
                />
              </label>
              <label htmlFor="ticket-requester-email">
                Requester Email
                <input
                  id="ticket-requester-email"
                  name="requesterEmail"
                  type="email"
                  value={form.requesterEmail}
                  onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
                  placeholder="email@example.com"
                  autoComplete="email"
                />
              </label>
            </div>
            <div className="grid-2">
              <label htmlFor="ticket-requester-phone">
                Requester Phone
                <input
                  id="ticket-requester-phone"
                  name="requesterPhone"
                  value={form.requesterPhone}
                  onChange={(e) => setForm({ ...form, requesterPhone: e.target.value })}
                  placeholder="Phone number"
                />
              </label>
              <label htmlFor="ticket-requester-company">
                Company
                <input
                  id="ticket-requester-company"
                  name="requesterCompanyName"
                  value={form.requesterCompanyName}
                  onChange={(e) => setForm({ ...form, requesterCompanyName: e.target.value })}
                  placeholder="Company name"
                />
              </label>
            </div>
          </>
        )}
        <div className="grid-2">
          <label htmlFor="ticket-subject">
            Subject
            <input
              id="ticket-subject"
              name="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </label>
        <label htmlFor="ticket-priority">
          Priority
          <select id="ticket-priority" name="priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {priorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
          {estimatedResponse && (
            <small className="muted" style={{ display: "block", marginTop: 4 }}>
              Est. response time: {estimatedResponse.text}
            </small>
          )}
        </label>
        </div>
        <div className="grid-2">
          <label htmlFor="ticket-category">
            Category
            <select id="ticket-category" name="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="general">General</option>
              <option value="software">Software</option>
              <option value="hardware">Hardware</option>
              <option value="network">Network</option>
              <option value="access">Access / Accounts</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label htmlFor="ticket-channel">
            Channel
            <select id="ticket-channel" name="channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {form.category === "other" && (
          <label htmlFor="ticket-category-other">
            Other category
            <input
              id="ticket-category-other"
              name="categoryOther"
              value={form.categoryOther}
              onChange={(e) => setForm({ ...form, categoryOther: e.target.value })}
              placeholder="e.g. Printer, VPN, Email..."
            />
          </label>
        )}
        <label htmlFor="ticket-description">
          Description
          <textarea
            id="ticket-description"
            name="description"
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        {(user?.role === "admin" || user?.role === "agent") && (
          <label htmlFor="ticket-attachment">
            Attachment
            <input
              id="ticket-attachment"
              name="attachment"
              type="file"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
            {attachment && (
              <small className="muted">
                Selected: {attachment.name} ({Math.round((attachment.size || 0) / 1024)} KB)
              </small>
            )}
          </label>
        )}
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
              <label key={def.id} htmlFor={`custom-${def.key}`}>
                {def.label}
                <input
                  id={`custom-${def.key}`}
                  name={def.key}
                  type={def.field_type === "number" ? "number" : "text"}
                  value={customFields[def.key] ?? ""}
                  onChange={(e) => setCustomFields((p) => ({ ...p, [def.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}
        {user?.role === "requester" && (
          <div className="grid-2">
            <label htmlFor="ticket-requester-phone-req">
              Phone Number
              <input
                id="ticket-requester-phone-req"
                name="requesterPhone"
                value={form.requesterPhone}
                onChange={(e) => setForm({ ...form, requesterPhone: e.target.value })}
                required
              />
            </label>
            <label htmlFor="ticket-requester-company-req">
              Company Name (optional)
              <input
                id="ticket-requester-company-req"
                name="requesterCompanyName"
                value={form.requesterCompanyName}
                onChange={(e) => setForm({ ...form, requesterCompanyName: e.target.value })}
              />
            </label>
          </div>
        )}
        <button type="submit">Create</button>
      </form>
      </Collapsible>

      <div className="card">
        <div className="tickets-header">
          <h3>Ticket Queue</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="muted">{tickets.length} tickets</span>
            <button
              type="button"
              onClick={() => {
                exportTicketsToCsv(tickets);
                toastSuccess("CSV exported.");
              }}
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="stack" style={{ marginBottom: "16px", gap: "12px" }}>
          <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            <label htmlFor="filter-status">
              Status
              <select
                id="filter-status"
                name="status"
                value={listFilters.status}
                onChange={(e) => applyFilters({ status: e.target.value || null })}
              >
                <option value="">All</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label htmlFor="filter-priority">
              Priority
              <select
                id="filter-priority"
                name="priority"
                value={listFilters.priority}
                onChange={(e) => applyFilters({ priority: e.target.value || null })}
              >
                <option value="">All</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label htmlFor="filter-category">
              Category
              <select
                id="filter-category"
                name="category"
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
              <label htmlFor="filter-agent">
                Agent
                <select
                  id="filter-agent"
                  name="agent"
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
            <label htmlFor="filter-channel">
              Ticket type
              <select
                id="filter-channel"
                name="channel"
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
            <label style={{ margin: 0, flex: "1 1 140px", minWidth: "140px" }} htmlFor="search-text">
              <span style={{ display: "block", marginBottom: "4px" }}>Search text</span>
              <input
                id="search-text"
                name="search"
                type="text"
                placeholder="Subject or description..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </label>
            <label style={{ margin: 0, flex: "1 1 100px", minWidth: "100px" }} htmlFor="search-ticket-id">
              <span style={{ display: "block", marginBottom: "4px" }}>Ticket #</span>
              <input
                id="search-ticket-id"
                name="ticketId"
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
            {(user?.role === "admin" || user?.role === "agent") && (
              <button
                type="button"
                disabled={mergeSelected.size < 2}
                onClick={() => {
                  if (mergeSelected.size >= 2) {
                    setMergeMainId([...mergeSelected][0]);
                    setShowMergeModal(true);
                  }
                }}
              >
                Merge
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table className={`table tickets-table${user?.role === "admin" || user?.role === "agent" ? " tickets-table-with-checkbox" : ""}`}>
            <thead>
              <tr>
                {(user?.role === "admin" || user?.role === "agent") ? (
                  <th style={{ width: 40, minWidth: 40 }}>
                    <label className="merge-select-all" style={{ margin: 0, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selectAllActive}
                        onChange={async (e) => {
                          if (e.target.checked) {
                            setSelectAllActive(true);
                            try {
                              const rows = await apiRequest("/api/tickets", { token });
                              const all = Array.isArray(rows) ? rows : [];
                              const mergeable = all.filter((t) => !t.merged_into_ticket_id);
                              const ids = new Set(mergeable.map((t) => t.id));
                              setMergeSelected(ids);
                              if (ids.size) setMergeMainId([...ids][0]);
                            } catch {
                              setSelectAllActive(false);
                            }
                          } else {
                            setSelectAllActive(false);
                            setMergeSelected(new Set());
                            setMergeMainId(null);
                          }
                        }}
                      />
                    </label>
                  </th>
                ) : null}
                <th>ID</th>
                <th>Subject</th>
                <SortHeader col="status" label="Status" />
                <SortHeader col="priority" label="Priority" />
                <th>Requester</th>
                <th>Contact</th>
                <th>Company Name</th>
                <th>Agent</th>
                <SortHeader col="sla" label="SLA" />
                <SortHeader col="updated" label="Updated" />
                <th className="action-cell">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => (
                <tr key={ticket.id}>
                  {(user?.role === "admin" || user?.role === "agent") ? (
                    <td style={{ width: 40, minWidth: 40 }}>
                      {!ticket.merged_into_ticket_id ? (
                        <label style={{ margin: 0, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={mergeSelected.has(ticket.id)}
                            onChange={(e) => {
                              const next = new Set(mergeSelected);
                              if (e.target.checked) {
                                next.add(ticket.id);
                                if (!mergeMainId) setMergeMainId(ticket.id);
                              } else {
                                next.delete(ticket.id);
                                setSelectAllActive(false);
                                if (mergeMainId === ticket.id) setMergeMainId(next.size ? [...next][0] : null);
                              }
                              setMergeSelected(next);
                            }}
                          />
                        </label>
                      ) : null}
                    </td>
                  ) : null}
                  <td>{ticket.id}</td>
                  <td title={ticket.subject}><Link to={`/tickets/${ticket.id}`} className="ticket-subject-link">{ticket.subject}</Link></td>
                  <td><StatusBadge status={ticket.status} /></td>
                  <td><PriorityBadge priority={ticket.priority} /></td>
                  <td title={getRequesterName(ticket)}>{getRequesterName(ticket)}</td>
                  <td title={getRequesterContact(ticket)}>{getRequesterContact(ticket)}</td>
                  <td title={getCompanyName(ticket)}>{getCompanyName(ticket)}</td>
                  <td>{ticket.assigned_agent_name || "Unassigned"}</td>
                  <td>
                    {(() => {
                      const sla = getSlaCountdown(ticket);
                      return <span className={`sla-badge sla-${sla.tone}`} title={sla.text}>{sla.text}</span>;
                    })()}
                  </td>
                  <td title={new Date(ticket.updated_at).toLocaleString()}>{new Date(ticket.updated_at).toLocaleString()}</td>
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
                          id={`status-${ticket.id}`}
                          name="status"
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

      {showMergeModal && (user?.role === "admin" || user?.role === "agent") && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => !merging && setShowMergeModal(false)}>
          <div className="modal merge-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <strong>Merge tickets</strong>
              <button type="button" className="icon-close" onClick={() => !merging && setShowMergeModal(false)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p className="muted">Choose which ticket will be the main one. All messages from the others will move to it.</p>
              <div className="merge-ticket-list">
                {[...mergeSelected]
                  .map((id) => sortedTickets.find((t) => t.id === id))
                  .filter(Boolean)
                  .map((t) => {
                    const id = t.id;
                    const isMain = mergeMainId === id;
                    const requesterName = t.requester_name || t.requester_name_from_user || t.requester_name_from_contact || "-";
                    return (
                      <div key={id} className={`merge-ticket-row selected${isMain ? " main" : ""}`}>
                        <span className="merge-ticket-id">#{id}</span>
                        <span className="merge-ticket-subject">{t.subject || "(no subject)"}</span>
                        <span className="merge-ticket-meta">
                          <StatusBadge status={t.status} /> · {requesterName}
                        </span>
                        <button
                          type="button"
                          className="text-btn merge-set-main"
                          onClick={() => setMergeMainId(id)}
                        >
                          {isMain ? "Main ticket" : "Set as main"}
                        </button>
                      </div>
                    );
                  })}
              </div>
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
                    setMergeSelected(new Set());
                    setMergeMainId(null);
                    setSelectAllActive(false);
                    load();
                    navigate(`/tickets/${targetId}`);
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
