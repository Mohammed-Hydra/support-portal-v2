import { Component } from "react";

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
      return (
        <div style={{ padding: 24, maxWidth: 560, margin: "40px auto", fontFamily: "sans-serif" }}>
          <h2>Something went wrong</h2>
          <p>This page failed to load. Try refreshing, or go back to the dashboard.</p>
          <a href="/" style={{ color: "var(--btn, #0ea5e9)" }}>Go to Dashboard</a>
        </div>
      );
    }
    return this.props.children;
  }
}
