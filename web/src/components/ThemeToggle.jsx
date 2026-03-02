import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("portal.theme") || "light";
    } catch (e) {
      return "light";
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "");
      localStorage.setItem("portal.theme", theme);
    } catch (e) {
      // ignore
    }
  }, [theme]);

  const toggle = () => setTheme((v) => (v === "dark" ? "light" : "dark"));

  return (
    <button
      type="button"
      className="icon-btn"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle theme"
      onClick={toggle}
    >
      {theme === "dark" ? "☀" : "☽"}
    </button>
  );
}
