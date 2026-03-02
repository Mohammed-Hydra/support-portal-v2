import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { ensureServiceWorkerRegistered } from "./utils/pushRegistration";

ensureServiceWorkerRegistered();

try {
  const saved = localStorage.getItem("portal.theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
} catch (e) { /* ignore */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
