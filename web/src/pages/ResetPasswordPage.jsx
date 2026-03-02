import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api";
import { Logo } from "../components/Logo";

export function ResetPasswordPage({ t }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t.passwordMismatch ?? "Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError(t.passwordMinLength ?? "Password must be at least 6 characters.");
      return;
    }
    if (!token) {
      setError(t.invalidResetLink ?? "Invalid reset link. Please request a new one from the login page.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess(t.resetPasswordSuccess ?? "Password updated. You can now sign in.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card stack">
          <div className="page-header">
            <Logo className="login-brand-image" alt="HYDRA-TECH IT SUPPORT PLATFORM" />
            <h2>{t.resetPassword ?? "Set new password"}</h2>
            <p className="error">{t.invalidResetLink ?? "Invalid or missing reset link. Please use the link from your email or request a new one."}</p>
          </div>
          <Link to="/forgot-password">{t.requestNewLink ?? "Request new reset link"}</Link>
          <Link to="/login">{t.backToLogin ?? "Back to login"}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <Logo className="login-brand-image" alt="HYDRA-TECH IT SUPPORT PLATFORM" />
          <h2>{t.resetPassword ?? "Set new password"}</h2>
          <p className="muted">{t.resetPasswordHint ?? "Enter your new password below."}</p>
        </div>
        <label>
          {t.newPassword ?? "New password"}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <label>
          {t.confirmPassword ?? "Confirm password"}
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? (t.updating ?? "Updating...") : (t.updatePassword ?? "Update password")}
        </button>
        <p className="muted">
          <Link to="/login">{t.backToLogin ?? "Back to login"}</Link>
        </p>
      </form>
    </div>
  );
}
