import React from "react";
import { captureException } from "@/lib/observability";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * App-level error boundary. Without this, any render-time throw in a page or
 * component unmounts the whole React tree and the user sees a blank screen.
 * The ChunkLoadError reload handler in _app.tsx only covers stale-bundle
 * errors, not general render crashes - this catches the rest and shows a
 * graceful, branded fallback with a recover path. Styles are inline so the
 * fallback still renders even if the stylesheet/theme failed to load.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    try {
      captureException(error, { tags: { boundary: "app" }, extra: { componentStack: info?.componentStack } });
    } catch {
      /* never let the reporter throw inside the boundary */
    }
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary] render crash:", error);
  }

  private reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#faf9f7",
          color: "#1c1917",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Something went wrong</h1>
          <p style={{ fontSize: "14px", color: "#57534e", marginBottom: "20px", lineHeight: 1.5 }}>
            This page hit an unexpected error. Your data is safe - try again, or head back to the dashboard.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button
              onClick={this.reset}
              style={{
                padding: "9px 16px",
                borderRadius: "8px",
                border: "1px solid #d6d3d1",
                background: "#fff",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => {
                if (typeof window !== "undefined") window.location.href = "/";
              }}
              style={{
                padding: "9px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#1c1917",
                color: "#fff",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
