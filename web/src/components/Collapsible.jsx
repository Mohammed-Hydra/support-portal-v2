import { useState } from "react";

export function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible card">
      <button
        type="button"
        className="collapsible-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="collapsible-icon">{open ? "−" : "+"}</span>
        {title}
      </button>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
}
