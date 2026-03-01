import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoSrc from "../assets/hydra-tech-logo.svg";

const menu = [
  { to: "/", key: "dashboard" },
  { to: "/agent-dashboard", key: "agentDashboard", roles: ["agent"] },
  { to: "/tickets", key: "tickets" },
  { to: "/reports", key: "reports", roles: ["admin"] },
  { to: "/contacts", key: "contacts", roles: ["admin"] },
  { to: "/help-center", key: "helpCenter" },
  { to: "/admin/users", key: "userAdmin", roles: ["admin"] },
  { to: "/settings", key: "settings" },
];

export function Layout({ user, t, language, setLanguage, onLogout, children }) {
  const location = useLocation();
  const [copiedLink, setCopiedLink] = useState(null);
  const [menuOpen, setMenuOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) return false;
      const raw = window.localStorage.getItem("portal.menuOpen");
      if (raw === null) return true;
      return raw === "true";
    } catch (e) {
      return true;
    }
  });
  const portalUrl = typeof window !== "undefined" ? window.location.origin : "";
  const requesterUrl = portalUrl ? `${portalUrl}/public/requester` : "";

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      window.localStorage.setItem("portal.menuOpen", String(menuOpen));
    } catch (e) {
      // ignore
    }
    return undefined;
  }, [menuOpen]);

  const copyLink = (url, which) => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(which);
      setTimeout(() => setCopiedLink(null), 1500);
    });
  };

  return (
    <div className={`app-shell${menuOpen ? " menu-open" : ""}`}>
      <div
        className="sidebar-overlay"
        role="button"
        tabIndex={menuOpen ? 0 : -1}
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter" || e.key === " ") setMenuOpen(false);
        }}
      />
      <aside className="sidebar" id="app-sidebar" aria-hidden={menuOpen ? "false" : "true"}>
        <img src={logoSrc} alt="HYDRA-TECH IT SUPPORT PLATFORM" className="brand-image" />
        <h2>{t.appName}</h2>
        <p className="hint">HYDRA-TECH.PRO support workspace</p>
        {(user?.role === "admin" || user?.role === "agent") && portalUrl && (
          <div className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
            <p style={{ margin: "0 0 4px 0" }}>
              {t.portalLink ?? "Portal"}:{" "}
              <button
                type="button"
                onClick={() => copyLink(portalUrl, "portal")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--btn)",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: "inherit",
                }}
              >
                {copiedLink === "portal" ? (t.copyLinkDone ?? "Copied!") : (t.copyPortalLink ?? "Copy link")}
              </button>
            </p>
            <p style={{ margin: 0 }}>
              {t.requesterLink ?? "Requester"}:{" "}
              <button
                type="button"
                onClick={() => copyLink(requesterUrl, "requester")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--btn)",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: "inherit",
                }}
              >
                {copiedLink === "requester" ? (t.copyLinkDone ?? "Copied!") : (t.copyPortalLink ?? "Copy link")}
              </button>
            </p>
          </div>
        )}
        <nav>
          {menu
            .filter((item) => !item.roles || item.roles.includes(user?.role))
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={location.pathname === item.to ? "active-link" : ""}
                onClick={() => window.innerWidth <= 768 && setMenuOpen(false)}
              >
                {t[item.key]}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="icon-btn menu-toggle"
              aria-label={menuOpen ? "Hide menu" : "Show menu"}
              aria-controls="app-sidebar"
              aria-expanded={menuOpen ? "true" : "false"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <strong>{user?.name}</strong> <span className="muted">({user?.role})</span>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-btn"
              title="Refresh"
              aria-label="Refresh"
              onClick={() => window.location.reload()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button type="button" onClick={() => setLanguage(language === "en" ? "ar" : "en")}>
              {language === "en" ? "AR" : "EN"}
            </button>
            <button type="button" onClick={onLogout}>
              {t.logout}
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
