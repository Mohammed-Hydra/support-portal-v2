import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api";
import logoSrc from "../../assets/hydra-tech-logo.svg";
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
          attachmentDataUrl: attachmentDataUrl || undefined,
          attachmentName: attachment ? (attachment.name || "attachment.jpg") : undefined,
        }),
      });
      const message = `Ticket #${data.id} created successfully.`;
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
      });
      setAttachment(null);
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
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <img src={logoSrc} alt="HYDRA-TECH.PRO IT SUPPORT PLATFORM" className="login-brand-image" />
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
