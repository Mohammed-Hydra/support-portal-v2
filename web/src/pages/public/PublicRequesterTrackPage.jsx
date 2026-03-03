import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { toastError, toastSuccess } from "../../toast";

export function PublicRequesterTrackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromQuery = String(searchParams.get("email") || "").trim();
    if (fromQuery) setEmail(fromQuery);
  }, [searchParams]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiRequest("/api/public/requester/access", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (data.token) {
        const portalUrl = `${window.location.origin}/public/requester/portal?token=${encodeURIComponent(data.token)}`;
        window.location.href = portalUrl;
        return;
      }
      setError("Unexpected response.");
    } catch (err) {
      const message = err.message || "Failed to get access.";
      if (err.message?.includes("No tickets found") || err.data?.hasTickets === false) {
        toastError(message);
        navigate(`/public/requester?email=${encodeURIComponent(email)}&msg=no_tickets`, { replace: true });
      } else {
        setError(message);
        toastError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap requester-portal-wrap">
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="page-header">
          <Logo className="login-brand-image" alt="HYDRA-TECH.PRO IT SUPPORT PLATFORM" />
          <h2>Track Your Tickets</h2>
          <p className="muted">Enter your email to view your tickets.</p>
        </div>
        <label htmlFor="track-email">
          Email
          <input id="track-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={loading}>{loading ? "Loading..." : "View My Tickets"}</button>
        <p className="muted">
          Wrong email? Just enter the correct one above.
        </p>
        <p className="muted">
          Need to create a new ticket? <Link to="/public/requester">Go to create form</Link>
        </p>
      </form>
    </div>
  );
}
