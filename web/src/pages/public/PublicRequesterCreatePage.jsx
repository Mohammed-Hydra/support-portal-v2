import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Collapsible } from "../../components/Collapsible";
import { toastError, toastSuccess } from "../../toast";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read selected file."));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageToDataUrl(file, { maxDim = 1280, maxBytes = 2_000_000 } = {}) {
  const img = await loadImageFromFile(file);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("Invalid image.");
  }

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
      const next = await canvasToBlob(canvas, "image/jpeg", quality);
      if (next && next.size <= maxBytes) {
        blob = next;
        break;
      }
      quality -= 0.08;
    }

    if (blob) break;
    // If still too large, scale down and retry.
    scale *= 0.85;
    attempt += 1;
  }

  if (!blob) {
    throw new Error("Image is too large. Please use a smaller photo.");
  }

  return await blobToDataUrl(blob);
}

export function PublicRequesterCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    requesterCompanyName: "",
    subject: "",
    description: "",
    priority: "Medium",
    category: "general",
    categoryOther: "",
  });
  const [attachment, setAttachment] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [kbArticles, setKbArticles] = useState([]);
  const [kbSearch, setKbSearch] = useState("");
  const [estimatedResponse, setEstimatedResponse] = useState(null);

  const DRAFT_KEY = "requesterCreateDraftV2";

  useEffect(() => {
    const emailFromQuery = searchParams.get("email");
    if (emailFromQuery) {
      setForm((prev) => ({ ...prev, requesterEmail: emailFromQuery }));
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setForm((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const payload = { ...form };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }, [form]);

  const attachmentPreviewUrl = useMemo(() => {
    if (!attachment) return "";
    try {
      return URL.createObjectURL(attachment);
    } catch (e) {
      return "";
    }
  }, [attachment]);

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

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setResult("");
    setSaving(true);
    try {
      let attachmentDataUrl = "";
      if (attachment) {
        if (!String(attachment.type || "").startsWith("image/")) {
          throw new Error("Only image attachments are supported.");
        }
        attachmentDataUrl = await compressImageToDataUrl(attachment);
      }

      const data = await apiRequest("/api/public/requester/tickets", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          category: form.category === "other" ? (form.categoryOther || "other") : form.category,
          attachmentDataUrl: attachmentDataUrl || undefined,
          attachmentName: attachment ? (attachment.name || "attachment.jpg") : undefined,
        }),
      });
      const message = `Ticket #${data.id} created successfully.${data.magicLinkSent ? " We sent you an access link by email." : ""}`;
      setResult(message);
      toastSuccess(message);
      setForm({
        requesterName: "",
        requesterEmail: "",
        requesterPhone: "",
        requesterCompanyName: "",
        subject: "",
        description: "",
        priority: "Medium",
        category: "general",
        categoryOther: "",
      });
      setAttachment(null);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (e) {
        // ignore
      }
      const email = String(form.requesterEmail || "").trim();
      if (email) {
        navigate(`/public/requester/track?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      const message = err.message || "Failed to create ticket.";
      setError(message);
      toastError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <Collapsible title="Search FAQ / Knowledge Base" defaultOpen={false}>
        <p className="muted" style={{ marginTop: 0 }}>Find answers before creating a ticket.</p>
        <input
          type="text"
          placeholder="Search articles..."
          value={kbSearch}
          onChange={(e) => setKbSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        {kbArticles.length > 0 ? (
          <ul className="list" style={{ margin: 0, paddingLeft: 20 }}>
            {kbArticles.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong>
                {a.category && <span className="muted"> ({a.category})</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No articles found. Try a different search or category.</p>
        )}
      </Collapsible>
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <Logo className="login-brand-image" alt="HYDRA-TECH.PRO IT SUPPORT PLATFORM" />
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
          {estimatedResponse && (
            <small className="muted" style={{ display: "block", marginTop: 4 }}>
              Est. response time: {estimatedResponse.text}
            </small>
          )}
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="general">General</option>
            <option value="software">Software</option>
            <option value="hardware">Hardware</option>
            <option value="network">Network</option>
            <option value="access">Access / Accounts</option>
            <option value="other">Other</option>
          </select>
        </label>
        {form.category === "other" && (
          <label>
            Other category
            <input
              value={form.categoryOther}
              onChange={(e) => setForm({ ...form, categoryOther: e.target.value })}
              placeholder="e.g. Printer, VPN, Email..."
              required
            />
          </label>
        )}
        <label>
          Description
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </label>
        <label>
          Attachment
          <input
            type="file"
            onChange={(e) => setAttachment(e.target.files?.[0] || null)}
          />
          <small className="muted">Images only. Large images are automatically compressed.</small>
        </label>
        {attachmentPreviewUrl ? (
          <div className="requester-attachment-preview">
            <p className="muted" style={{ margin: 0 }}>
              Selected: <strong>{attachment?.name}</strong> ({Math.round((attachment?.size || 0) / 1024)} KB)
            </p>
            {String(attachment?.type || "").startsWith("image/") ? (
              <img src={attachmentPreviewUrl} alt="Attachment preview" />
            ) : null}
          </div>
        ) : null}
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
