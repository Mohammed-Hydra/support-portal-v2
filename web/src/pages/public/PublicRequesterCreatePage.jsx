import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api";

export function PublicRequesterCreatePage() {
  const [form, setForm] = useState({
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    requesterCompanyName: "",
    subject: "",
    description: "",
    priority: "Medium",
  });
  const [attachment, setAttachment] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setResult("");
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value || ""));
      if (attachment) fd.append("attachment", attachment);
      const data = await apiRequest("/api/public/requester/tickets", {
        method: "POST",
        body: fd,
      });
      setResult(`Ticket #${data.id} created successfully.`);
      setForm({
        requesterName: "",
        requesterEmail: "",
        requesterPhone: "",
        requesterCompanyName: "",
        subject: "",
        description: "",
        priority: "Medium",
      });
      setAttachment(null);
    } catch (err) {
      setError(err.message || "Failed to create ticket.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <h2>Requester Portal</h2>
          <p className="muted">Create a support ticket without login credentials.</p>
        </div>
        <div className="grid-2">
          <label>
            Name
            <input
              value={form.requesterName}
              onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.requesterEmail}
              onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="grid-2">
          <label>
            Phone
            <input
              value={form.requesterPhone}
              onChange={(e) => setForm({ ...form, requesterPhone: e.target.value })}
            />
          </label>
          <label>
            Company
            <input
              value={form.requesterCompanyName}
              onChange={(e) => setForm({ ...form, requesterCompanyName: e.target.value })}
            />
          </label>
        </div>
        <label>
          Subject
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            required
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </label>
        <div className="grid-2">
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </label>
          <label>
            Attachment
            <input
              type="file"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {result ? <p className="success">{result}</p> : null}
        <button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Ticket"}</button>
        <p className="muted">
          Already raised a ticket? <Link to="/public/requester/track">Track tickets by email</Link>
        </p>
      </form>
    </div>
  );
}
