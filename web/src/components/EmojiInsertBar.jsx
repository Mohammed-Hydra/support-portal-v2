import { useState, useRef, useEffect } from "react";

const COMMON_EMOJIS = [
  "😊", "👍", "👎", "❤️", "✅", "❌", "🔥", "😀", "😅", "😂", "😢", "😡", "🙏", "👏",
  "💡", "⚠️", "📌", "🎉", "✨", "🙂", "😎", "😴", "🤔", "😤", "🥳", "😭", "🤗", "👍🏻",
  "👋", "💪", "🙌", "🤝", "📧", "📞", "🔔", "⭐", "💯", "🚀",
];

export function EmojiInsertBar({ onInsert, label = "Add emoji" }) {
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
    onInsert(emoji);
    setOpen(false);
  };

  return (
    <div className="emoji-insert-wrap" ref={popoverRef}>
      <button
        type="button"
        className="emoji-trigger-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        title={label}
      >
        <span className="emoji-trigger-icon" aria-hidden>😊</span>
        <span className="emoji-trigger-label">{label}</span>
      </button>
      {open && (
        <div className="emoji-popover" role="menu">
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
