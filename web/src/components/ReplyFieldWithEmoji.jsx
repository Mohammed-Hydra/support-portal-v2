import { useState, useRef, useEffect } from "react";

const COMMON_EMOJIS = [
  "😊", "👍", "👎", "❤️", "✅", "❌", "🔥", "😀", "😅", "😂", "😢", "😡", "🙏", "👏",
  "💡", "⚠️", "📌", "🎉", "✨", "🙂", "😎", "😴", "🤔", "😤", "🥳", "😭", "🤗", "👍🏻",
  "👋", "💪", "🙌", "🤝", "📧", "📞", "🔔", "⭐", "💯", "🚀",
];

export function ReplyFieldWithEmoji({ value, onChange, placeholder, id, name, rows = 3, actions, submitButton }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (emoji) => {
    onChange((prev) => (prev || "") + emoji);
    setOpen(false);
  };

  return (
    <div className="reply-field-with-emoji" ref={popoverRef} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", overflow: "visible" }}>
      <textarea
        id={id}
        name={name}
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="reply-field-textarea"
        style={{ height: 72, minHeight: 72, maxHeight: 120, resize: "vertical" }}
      />
      <div className="reply-field-toolbar" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderTop: "1px solid var(--border)", overflow: "visible", justifyContent: "flex-start" }}>
        {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            className="reply-field-emoji-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label="Add emoji"
            aria-expanded={open}
            aria-haspopup="true"
            title="Add emoji"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", background: "var(--btn)", color: "#fff", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, cursor: "pointer" }}
          >
            <span>😊</span>
            <span>Emoji</span>
          </button>
          {submitButton || null}
        </div>
      </div>
      {open && (
        <div className="reply-field-emoji-popover" role="menu">
          <div className="emoji-popover-grid">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-popover-btn"
                onClick={() => handleSelect(emoji)}
                role="menuitem"
                aria-label={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
