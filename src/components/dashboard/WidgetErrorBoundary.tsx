/**
 * WidgetErrorBoundary - Wave 42 hotfix, extended in I.22 (2026-05-27).
 *
 * Wraps a single dashboard widget so that a client-side throw in one
 * widget can no longer blank the entire admin dashboard with a
 * generic "Application error: a client-side exception" page.
 *
 * Reports a compact inline error card in place of the broken widget
 * and logs to console so the dev can see which widget exploded.
 *
 * I.22 extension: widgets can also report async fetch failures via
 * `useReportWidgetError()` so a swallowed `.catch()` no longer self-
 * hides the widget silently (the previous "load failed -> empty array
 * -> if length === 0 return null" pattern was the documented "bad
 * (silent on widget failure)" state in docs/personas/admin.md).
 *
 * Why this exists: Wave 41 + 42 added several new data sources and
 * a single bad query (e.g. PostgREST FK schema cache lag, RLS
 * regression) was enough to wipe out /admin/dashboard for every
 * tenant. Defence-in-depth: keep the rest of the dashboard alive
 * even when one widget mis-renders, and surface the failure visibly
 * instead of hiding the widget entirely.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ReporterContextValue {
  /** Widgets call this from their `.catch()` to flip the boundary
   *  into the error fallback. Pass null to clear (e.g. on retry). */
  reportError: (message: string | null) => void;
  /** Bumped by the boundary's Retry button. Widgets watch this in
   *  useEffect deps to re-run their fetch. */
  retryNonce: number;
}

const ReporterContext = createContext<ReporterContextValue | null>(null);

/**
 * Async error reporter for widgets nested inside WidgetErrorBoundary.
 *
 * Usage inside a widget that fetches data on mount:
 *
 *   const { reportError, retryNonce } = useReportWidgetError();
 *   useEffect(() => {
 *     (async () => {
 *       try {
 *         const { data, error } = await supabase.from(...).select(...);
 *         if (error) throw error;
 *         setRows(data || []);
 *         reportError(null); // clear any stale error on a successful refetch
 *       } catch (e: any) {
 *         reportError(e?.message || "Load failed");
 *       }
 *     })();
 *   }, [companyId, retryNonce]);
 *
 * No-op when used outside a boundary (e.g. in tests / Storybook).
 */
export function useReportWidgetError(): ReporterContextValue {
  const ctx = useContext(ReporterContext);
  // Stable no-op when there's no boundary (Storybook, isolated tests).
  return ctx ?? { reportError: () => {}, retryNonce: 0 };
}

interface Props {
  /** Name surfaced in the fallback + console log. */
  label?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

class WidgetErrorBoundaryInner extends React.Component<Props & { setAsyncError: (m: string | null) => void; retryNonce: number; asyncError: string | null }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Render error" };
  }

  componentDidCatch(error: Error, info: any) {
    // Surface to the JS console for the dev. Don't swallow the
    // stack - the next thing the engineer needs is the trace.
    // eslint-disable-next-line no-console
    console.error(
      `[WidgetErrorBoundary] ${this.props.label || "widget"} crashed:`,
      error,
      info?.componentStack,
    );
  }

  componentDidUpdate(prev: any) {
    // Reset render-error state on retry so we re-mount cleanly.
    if (prev.retryNonce !== this.props.retryNonce && this.state.hasError) {
      this.setState({ hasError: false, message: null });
    }
  }

  render() {
    const renderError = this.state.hasError ? this.state.message : null;
    const message = renderError ?? this.props.asyncError;
    if (message) {
      return (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {this.props.label || "A widget"} couldn't load.
            {message ? ` (${message})` : null}
          </span>
          <button
            type="button"
            onClick={() => {
              this.props.setAsyncError(null);
              this.setState({ hasError: false, message: null });
              // Bump nonce by mutating via reporter context; the
              // outer functional wrapper owns the retryNonce state.
              (this.props as any).bumpRetryNonce?.();
            }}
            className="ml-auto inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetErrorBoundary({ label, children }: Props) {
  const [asyncError, setAsyncError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const reportError = useCallback((message: string | null) => {
    setAsyncError(message);
  }, []);

  const bumpRetryNonce = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  const value = useMemo<ReporterContextValue>(
    () => ({ reportError, retryNonce }),
    [reportError, retryNonce],
  );

  // Also log async errors to the console so devs see them in the
  // same place render errors land.
  useEffect(() => {
    if (asyncError) {
      // eslint-disable-next-line no-console
      console.error(`[WidgetErrorBoundary] ${label || "widget"} async error:`, asyncError);
    }
  }, [asyncError, label]);

  return (
    <ReporterContext.Provider value={value}>
      <WidgetErrorBoundaryInner
        label={label}
        setAsyncError={setAsyncError}
        retryNonce={retryNonce}
        asyncError={asyncError}
        // Bump prop via cast since class component types are tighter.
        {...({ bumpRetryNonce } as any)}
      >
        {children}
      </WidgetErrorBoundaryInner>
    </ReporterContext.Provider>
  );
}
