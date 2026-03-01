import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

export function NotificationBell({ token }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchUnreadCount = async () => {
    if (!token) return;
    try {
      const { count } = await apiRequest("/api/notifications/unread-count", { token });
      setUnreadCount(count ?? 0);
    } catch {
      // ignore
    }
  };

  const fetchNotifications = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const rows = await apiRequest("/api/notifications?limit=20", { token });
      setNotifications(rows || []);
      const unread = (rows || []).filter((n) => !n.read_at).length;
      setUnreadCount(unread);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (open && token) fetchNotifications();
  }, [open, token]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { token, method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest("/api/notifications/read-all", { token, method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const typeLabel = (type) => {
    const map = {
      new_message: "New message",
      assignment: "Assigned",
      status_change: "Status change",
    };
    return map[type] || type;
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 60000;
    if (diff < 1) return "Just now";
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="notification-bell-wrap" ref={ref}>
      <button
        type="button"
        className="icon-btn notification-bell-btn"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="text-btn" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notification-dropdown-list">
            {loading ? (
              <p className="muted">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="muted">No notifications</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  to={n.ticket_id ? `/tickets/${n.ticket_id}` : "/tickets"}
                  className={`notification-item${n.read_at ? "" : " unread"}`}
                  onClick={() => {
                    if (!n.read_at) markAsRead(n.id);
                    setOpen(false);
                  }}
                >
                  <div className="notification-item-type">{typeLabel(n.type)}</div>
                  <div className="notification-item-title">{n.title}</div>
                  {n.body && <div className="notification-item-body">{n.body}</div>}
                  <div className="notification-item-time">{formatTime(n.created_at)}</div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
