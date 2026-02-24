import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api";
import logoSrc from "../../assets/hydra-tech-logo.svg";
import { toastError, toastSuccess } from "../../toast";

export function PublicRequesterTrackPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSending(true);
    try {
      await apiRequest("/api/public/requester/magic-link/send", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const message = "If your email has tickets, a secure access link was sent.";
      setSuccess(message);
      toastSuccess(message);
    } catch (err) {
      const message = err.message || "Failed to send magic link.";
      setError(message);
      toastError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <img src={logoSrc} alt="HYDRA-TECH.PRO IT SUPPORT PLATFORM" className="login-brand-image" />
          <h2>Track Your Tickets</h2>
          <p className="muted">Enter your email to receive a secure one-time access link.</p>
        </div>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button type="submit" disabled={sending}>{sending ? "Sending..." : "Send Access Link"}</button>
        <p className="muted">
          Need to create a new ticket? <Link to="/public/requester">Go to create form</Link>
        </p>
      </form>
    </div>
  );
}
