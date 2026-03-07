import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { apiRequest } from "./api";
import { dictionary } from "./i18n";
import { Layout } from "./components/Layout";
import { ToastHost } from "./components/ToastHost";
import { ErrorBoundary } from "./components/ErrorBoundary";

function retryLazy(importFn, retries = 3, delay = 1000) {
  return () =>
    importFn().catch((err) => {
      if (retries <= 0) throw err;
      return new Promise((resolve) => {
        setTimeout(() => resolve(retryLazy(importFn, retries - 1, delay)()), delay);
      });
    });
}

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const AgentDashboardPage = lazy(() => import("./pages/AgentDashboardPage").then((m) => ({ default: m.AgentDashboardPage })));
const TicketListPage = lazy(() => import("./pages/tickets/TicketListPage").then((m) => ({ default: m.TicketListPage })));
const TicketDetailPage = lazy(() => import("./pages/tickets/TicketDetailPage").then((m) => ({ default: m.TicketDetailPage })));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const UserAdminPage = lazy(() => import("./pages/admin/UserAdminPage").then((m) => ({ default: m.UserAdminPage })));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const ContactsPage = lazy(() => import("./pages/ContactsPage").then((m) => ({ default: m.ContactsPage })));
const HelpCenterPage = lazy(() => import("./pages/HelpCenterPage").then((m) => ({ default: m.HelpCenterPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const PublicRequesterCreatePage = lazy(retryLazy(() => import("./pages/public/PublicRequesterCreatePage").then((m) => ({ default: m.PublicRequesterCreatePage }))));
const PublicRequesterTrackPage = lazy(retryLazy(() => import("./pages/public/PublicRequesterTrackPage").then((m) => ({ default: m.PublicRequesterTrackPage }))));
const PublicRequesterPortalPage = lazy(retryLazy(() => import("./pages/public/PublicRequesterPortalPage").then((m) => ({ default: m.PublicRequesterPortalPage }))));

function Protected({ token, children }) {
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState(localStorage.getItem("v2Token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("v2User") || "null"));
  const [language, setLanguage] = useState(localStorage.getItem("v2Lang") || "en");
  const [theme, setTheme] = useState(localStorage.getItem("portal.theme") || "light");
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);

  const t = useMemo(() => dictionary[language] || dictionary.en, [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.body.dir = language === "ar" ? "rtl" : "ltr";
    localStorage.setItem("v2Lang", language);
  }, [language]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "");
    localStorage.setItem("portal.theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/api/auth/me", { token })
      .then((me) => {
        setUser(me);
        localStorage.setItem("v2User", JSON.stringify(me));
      })
      .catch((err) => {
        if ((err.code === "ACCOUNT_DISABLED" || err.code === "ACCOUNT_DELETED") && err.message) {
          sessionStorage.setItem("v2SessionError", err.message);
        }
        setToken("");
        setUser(null);
        localStorage.removeItem("v2Token");
        localStorage.removeItem("v2User");
      });
  }, [token]);

  const onLogin = (payload) => {
    setToken(payload.token);
    setUser(payload.user);
    localStorage.setItem("v2Token", payload.token);
    localStorage.setItem("v2User", JSON.stringify(payload.user));
    navigate("/");
  };

  const onLogout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("v2Token");
    localStorage.removeItem("v2User");
    navigate("/login");
  };

  const PageFallback = () => <div className="page-loading" aria-hidden="true">Loading…</div>;

  return (
    <ErrorBoundary key={`${location.pathname}-${errorBoundaryKey}`} onRetry={() => setErrorBoundaryKey((k) => k + 1)}>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={onLogin} t={t} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage t={t} />} />
        <Route path="/reset-password" element={<ResetPasswordPage t={t} />} />
        <Route path="/public/requester" element={<PublicRequesterCreatePage />} />
        <Route path="/public/requester/track" element={<PublicRequesterTrackPage />} />
        <Route path="/public/requester/portal" element={<PublicRequesterPortalPage />} />
        <Route
          path="/*"
          element={
            <Protected token={token}>
              <Layout user={user} t={t} token={token} language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} onLogout={onLogout}>
                <Routes>
                  <Route path="/" element={<DashboardPage token={token} user={user} t={t} />} />
                  <Route path="/agent-dashboard" element={<AgentDashboardPage token={token} user={user} t={t} />} />
                  <Route path="/tickets" element={<TicketListPage token={token} user={user} t={t} />} />
                  <Route path="/tickets/:ticketId" element={<TicketDetailPage token={token} user={user} t={t} />} />
                  <Route path="/reports" element={<ReportsPage token={token} t={t} />} />
                  <Route path="/contacts" element={<ContactsPage token={token} t={t} />} />
                  <Route path="/help-center" element={<HelpCenterPage token={token} user={user} t={t} />} />
                  <Route path="/admin/users" element={<UserAdminPage token={token} user={user} t={t} />} />
                  <Route path="/admin/audit" element={<AuditLogPage token={token} t={t} />} />
                  <Route path="/settings" element={<SettingsPage token={token} user={user} t={t} />} />
                </Routes>
              </Layout>
            </Protected>
          }
        />
      </Routes>
      </Suspense>
      <ToastHost />
    </ErrorBoundary>
  );
}

export default App;
