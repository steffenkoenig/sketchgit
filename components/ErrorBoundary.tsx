"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Wraps any subtree. On an unhandled render error it shows a friendly fallback
 * instead of a blank page, and logs the error to the console for debugging.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  private handleReset = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            gap: "16px",
            fontFamily: "system-ui, sans-serif",
            background: "#0a0a0f",
            color: "#e2e2ef",
          }}
        >
          <div style={{ fontSize: "48px" }}>⚠</div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Something went wrong</h2>
          <p style={{ margin: 0, color: "#888", fontSize: "14px", textAlign: "center", maxWidth: "360px" }}>
            An unexpected error occurred in SketchGit.
            Your work is saved — refreshing the page should restore it.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: "11px",
                color: "#ff5f7e",
                background: "#1a1a2e",
                padding: "8px 12px",
                borderRadius: "6px",
                maxWidth: "480px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: "8px 20px",
              background: "#7c6eff",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
