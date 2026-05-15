/**
 * WidgetErrorBoundary -- Wave 42 hotfix.
 *
 * Wraps a single dashboard widget so that a client-side throw in one
 * widget can no longer blank the entire admin dashboard with a
 * generic "Application error: a client-side exception" page.
 *
 * Reports a compact inline error card in place of the broken widget
 * and logs to console so the dev can see which widget exploded.
 *
 * Why this exists: Wave 41 + 42 added several new data sources and
 * a single bad query (e.g. PostgREST FK schema cache lag, RLS
 * regression) was enough to wipe out /admin/dashboard for every
 * tenant. Defence-in-depth: keep the rest of the dashboard alive
 * even when one widget mis-renders.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  /** Name surfaced in the fallback + console log. */
  label?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export class WidgetErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Render error" };
  }

  componentDidCatch(error: Error, info: any) {
    // Surface to the JS console for the dev. Don't swallow the
    // stack -- the next thing the engineer needs is the trace.
    // eslint-disable-next-line no-console
    console.error(
      `[WidgetErrorBoundary] ${this.props.label || "widget"} crashed:`,
      error,
      info?.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 inline-flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {this.props.label || "A widget"} couldn't load.
            {this.state.message ? ` (${this.state.message})` : null}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
