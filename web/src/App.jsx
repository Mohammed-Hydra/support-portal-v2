import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { apiRequest } from "./api";
import { dictionary } from "./i18n";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentDashboardPage } from "./pages/AgentDashboardPage";
import { TicketListPage } from "./pages/tickets/TicketListPage";
import { TicketDetailPage } from "./pages/tickets/TicketDetailPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { UserAdminPage } from "./pages/admin/UserAdminPage";
import { AuditLogPage } from "./pages/admin/AuditLogPage";
import { ContactsPage } from "./pages/ContactsPage";
import { HelpCenterPage } from "./pages/HelpCenterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ToastHost } from "./components/ToastHost";
import { PublicRequesterCreatePage } from "./pages/public/PublicRequesterCreatePage";
import { PublicRequesterTrackPage } from "./pages/public/PublicRequesterTrackPage";
import { PublicRequesterPortalPage } from "./pages/public/PublicRequesterPortalPage";

function Protected({ token, children }) {
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState(localStorage.getItem("v2Token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("v2User") || "null"));
  const [language, setLanguage] = useState(localStorage.getItem("v2Lang") || "en");
  const [theme, setTheme] = useState(localStorage.getItem("portal.theme") || "light");

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

  return (
    <>
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
      <ToastHost />
    </>
  );
}

export default App;
