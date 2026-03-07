import { Component } from "react";
import { Link } from "react-router-dom";

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const errMsg = err?.message || String(err || "");
      return (
        <div style={{ padding: 24, maxWidth: 560, margin: "40px auto", fontFamily: "sans-serif" }}>
          <h2>Something went wrong</h2>
          <p>This page failed to load. Try refreshing, or go back to the dashboard.</p>
          {errMsg && !errMsg.includes("\n") && (
            <p style={{ fontSize: 12, opacity: 0.8, marginTop: 8, wordBreak: "break-word" }}>{errMsg.length > 120 ? `${errMsg.slice(0, 120)}…` : errMsg}</p>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            {this.props.onRetry && (
              <button type="button" onClick={() => this.props.onRetry()} style={{ padding: "8px 16px", cursor: "pointer" }}>
                Try again
              </button>
            )}
            <Link to="/" style={{ color: "var(--btn, #0ea5e9)", alignSelf: "center" }}>Go to Dashboard</Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
