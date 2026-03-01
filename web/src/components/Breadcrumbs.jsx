import { Link, useLocation } from "react-router-dom";

const pathLabels = {
  "": "Dashboard",
  "agent-dashboard": "Agent Dashboard",
  tickets: "Tickets",
  reports: "Reports",
  contacts: "Contacts",
  "help-center": "Help Center",
  settings: "Settings",
  admin: "Admin",
  users: "Users",
  audit: "Audit Log",
};

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  const crumbs = [];
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    path += `/${segments[i]}`;
    const seg = segments[i];
    const isNumeric = /^\d+$/.test(seg);
    const label = pathLabels[seg] ?? (isNumeric ? `#${seg}` : seg);
    const isLast = i === segments.length - 1;
    crumbs.push(
      isLast ? (
        <span key={path} className="breadcrumb-current">
          {label}
        </span>
      ) : (
        <Link key={path} to={path} className="breadcrumb-link">
          {label}
        </Link>
      )
    );
    if (i < segments.length - 1) {
      crumbs.push(
        <span key={`sep-${path}`} className="breadcrumb-sep" aria-hidden="true">
          /
        </span>
      );
    }
  }

  if (crumbs.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {crumbs}
    </nav>
  );
}
