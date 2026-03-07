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
    <div className="reply-field-with-emoji" ref={popoverRef}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="reply-field-textarea"
      />
      <div className="reply-field-toolbar">
        {actions ? <div className="reply-field-toolbar-actions">{actions}</div> : null}
        <button
          type="button"
          className="reply-field-emoji-btn"
          onClick={() => setOpen((o) => !o)}
          aria-label="Add emoji"
          aria-expanded={open}
          aria-haspopup="true"
          title="Add emoji"
        >
          <span className="reply-field-emoji-icon">😊</span>
          <span className="reply-field-emoji-label">Emoji</span>
        </button>
        {submitButton ? <div className="reply-field-toolbar-actions">{submitButton}</div> : null}
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
