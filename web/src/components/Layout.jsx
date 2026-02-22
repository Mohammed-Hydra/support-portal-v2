import { Link, useLocation } from "react-router-dom";

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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src="/hydra-tech-logo.svg" alt="HYDRA-TECH IT SUPPORT PLATFORM" className="brand-image" />
        <h2>{t.appName}</h2>
        <p className="hint">HYDRA-TECH support workspace</p>
        <nav>
          {menu
            .filter((item) => !item.roles || item.roles.includes(user?.role))
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={location.pathname === item.to ? "active-link" : ""}
              >
                {t[item.key]}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
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
