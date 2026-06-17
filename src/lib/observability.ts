/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Error monitoring + tenant-tagged events.
 *
 * Phase 6 follow-up: the audit found zero production error monitoring -
 * every `console.error` was visible only to whoever happened to have
 * DevTools open. Silent webhook failures, RLS regressions, and
 * background-job crashes lived in production until a tenant raised
 * a ticket.
 *
 * This module is the single chokepoint for "something went wrong, tell
 * the operators". It abstracts over Sentry (the eventual home) and
 * `console.error` (the fallback when SENTRY_DSN isn't set yet). Call
 * sites use the same API; the implementation routes appropriately.
 *
 * Why the abstraction instead of just installing @sentry/nextjs today?
 * Wiring Sentry properly needs:
 *   - a Sentry project + DSN
 *   - SENTRY_AUTH_TOKEN for source-map uploads
 *   - withSentryConfig() in next.config.js
 *   - decisions on retention / alert routing / per-tenant filters
 * Those are infra/product decisions, not code. The wrapper here lets
 * the codebase start tagging events with `company_id` / `user_id` /
 * `route` today so the day Sentry is wired up, every captureException
 * call has the right context already on it.
 *
 * Once SENTRY_DSN is set:
 *   1. `npm install @sentry/nextjs`
 *   2. Add `sentry.client.config.ts` + `sentry.server.config.ts` that
 *      init Sentry.
 *   3. Replace the dynamic require() in `_sendToSentry()` below with a
 *      direct import of `@sentry/nextjs`.
 *
 * Until then this module is a console-error fallback that records tags
 * the same way Sentry will once it's live.
 */

export interface ObservabilityTags {
  /** Tenant the event happened in. Set on every event when known. */
  companyId?: string | null;
  /** User who triggered the event. */
  userId?: string | null;
  /** Route / API path / cron name. */
  route?: string | null;
  /** Free-form additional tags. */
  [k: string]: any;
}

export interface CaptureContext {
  tags?: ObservabilityTags;
  /** Free-form extra context, not indexed. */
  extra?: Record<string, any>;
  /** Severity. Defaults to "error". */
  level?: "fatal" | "error" | "warning" | "info" | "debug";
}

let _sentryCache: any = null;
let _sentryProbed = false;

/**
 * Lazily resolve the Sentry SDK if available. We `require` rather than
 * `import` so the module load is conditional - the bundle doesn't pay
 * for Sentry when the dependency isn't installed.
 */
function _resolveSentry(): any | null {
  if (_sentryProbed) return _sentryCache;
  _sentryProbed = true;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN && !process.env.SENTRY_DSN) {
    return null;
  }
  try {
    // Resolve at RUNTIME via an indirect require so webpack doesn't try to
    // statically bundle '@sentry/nextjs' (it's an optional, uninstalled dep -
    // a direct require() string makes the build emit "Module not found" and
    // can cascade into page-data-collection failures). eval('require') is
    // opaque to webpack; this branch only runs when a Sentry DSN is set, in
    // a Node context where require exists.
    // eslint-disable-next-line no-eval
    const runtimeRequire: NodeRequire = eval("require");
    _sentryCache = runtimeRequire("@sentry/nextjs");
  } catch {
    _sentryCache = null;
  }
  return _sentryCache;
}

/**
 * Capture an exception with tenant context. Replaces strategic
 * `console.error(...)` calls across the codebase. Always logs to
 * console as well so local dev / Vercel function logs still surface
 * the error.
 */
export function captureException(err: unknown, ctx: CaptureContext = {}): void {
  // Always console.error - keeps Vercel / dev console visibility.
  const tagSummary = ctx.tags
    ? ` [${Object.entries(ctx.tags)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}]`
    : "";
  console.error(`[observability]${tagSummary}`, err);
  if (ctx.extra) console.error("[observability] extra:", ctx.extra);

  const sentry = _resolveSentry();
  if (sentry) {
    try {
      sentry.withScope((scope: any) => {
        if (ctx.level) scope.setLevel(ctx.level);
        if (ctx.tags) {
          for (const [k, v] of Object.entries(ctx.tags)) {
            if (v != null) scope.setTag(k, String(v));
          }
          if (ctx.tags.userId) scope.setUser({ id: String(ctx.tags.userId) });
        }
        if (ctx.extra) scope.setExtras(ctx.extra);
        sentry.captureException(err);
      });
    } catch (sentryErr) {
      // Never let observability crash the caller.
      console.warn("[observability] sentry capture failed:", sentryErr);
    }
  }
}

/**
 * Capture a non-exception event (e.g. a soft warning the operator
 * should see in aggregate). Same tag shape as captureException.
 */
export function captureMessage(message: string, ctx: CaptureContext = {}): void {
  const tagSummary = ctx.tags
    ? ` [${Object.entries(ctx.tags)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}]`
    : "";
  console.warn(`[observability]${tagSummary} ${message}`);

  const sentry = _resolveSentry();
  if (sentry) {
    try {
      sentry.withScope((scope: any) => {
        if (ctx.level) scope.setLevel(ctx.level);
        if (ctx.tags) {
          for (const [k, v] of Object.entries(ctx.tags)) {
            if (v != null) scope.setTag(k, String(v));
          }
          if (ctx.tags.userId) scope.setUser({ id: String(ctx.tags.userId) });
        }
        if (ctx.extra) scope.setExtras(ctx.extra);
        sentry.captureMessage(message);
      });
    } catch (sentryErr) {
      console.warn("[observability] sentry capture failed:", sentryErr);
    }
  }
}

/**
 * Bind a set of tags for the rest of the current scope (browser:
 * stays bound until the user navigates / signs out; server: stays
 * bound for the request). Typically called from AuthContext when a
 * user resolves, so every later captureException picks up the same
 * companyId / userId without the call site needing to thread it.
 *
 * No-op when Sentry isn't loaded - the per-call tags object still
 * works fine.
 */
export function setGlobalTags(tags: ObservabilityTags): void {
  const sentry = _resolveSentry();
  if (!sentry) return;
  try {
    if (tags.userId) sentry.setUser({ id: String(tags.userId) });
    for (const [k, v] of Object.entries(tags)) {
      if (k === "userId") continue;
      if (v != null) sentry.setTag(k, String(v));
    }
  } catch (sentryErr) {
    console.warn("[observability] sentry setGlobalTags failed:", sentryErr);
  }
}
