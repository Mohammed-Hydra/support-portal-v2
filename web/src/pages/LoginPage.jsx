import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { Logo } from "../components/Logo";

export function LoginPage({ onLogin, t }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionError = sessionStorage.getItem("v2SessionError");
    if (sessionError) {
      setError(sessionError);
      sessionStorage.removeItem("v2SessionError");
    }
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <Logo className="login-brand-image" alt="HYDRA-TECH IT SUPPORT PLATFORM" />
          <h2>{t.login}</h2>
          <p className="muted">Sign in to continue to the support portal.</p>
        </div>
        <label htmlFor="login-email">
          {t.email}
          <input id="login-email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" />
        </label>
        <label htmlFor="login-password">
          {t.password}
          <input id="login-password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" />
        </label>
        <p className="muted" style={{ marginTop: "-8px" }}>
          <Link to="/forgot-password">{t.forgotPassword ?? "Forgot password?"}</Link>
        </p>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">{t.signIn}</button>
      </form>
    </div>
  );
}
