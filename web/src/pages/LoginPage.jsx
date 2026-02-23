import { useEffect, useState } from "react";
import { apiRequest } from "../api";
import logoSrc from "../assets/hydra-tech-logo.svg";

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
          <img src={logoSrc} alt="HYDRA-TECH IT SUPPORT PLATFORM" className="login-brand-image" />
          <h2>{t.login}</h2>
          <p className="muted">Sign in to continue to the support portal.</p>
        </div>
        <label>
          {t.email}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          {t.password}
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">{t.signIn}</button>
      </form>
    </div>
  );
}
