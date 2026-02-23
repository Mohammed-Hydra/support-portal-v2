import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import logoSrc from "../assets/hydra-tech-logo.svg";

export function ForgotPasswordPage({ t }) {
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
      await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSuccess(t.forgotPasswordSuccess ?? "If an account exists with this email, you will receive a password reset link.");
    } catch (err) {
      setError(err.message || "Failed to send reset link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <img src={logoSrc} alt="HYDRA-TECH IT SUPPORT PLATFORM" className="login-brand-image" />
          <h2>{t.forgotPassword ?? "Reset password"}</h2>
          <p className="muted">{t.forgotPasswordHint ?? "Enter your email to receive a reset link."}</p>
        </div>
        <label>
          {t.email}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button type="submit" disabled={sending}>
          {sending ? (t.sending ?? "Sending...") : (t.sendResetLink ?? "Send reset link")}
        </button>
        <p className="muted">
          <Link to="/login">{t.backToLogin ?? "Back to login"}</Link>
        </p>
      </form>
    </div>
  );
}
