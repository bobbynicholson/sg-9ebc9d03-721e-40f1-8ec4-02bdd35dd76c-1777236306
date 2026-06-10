/**
 * File-based logger for local dev flow tracing.
 *
 * Each server process gets its own run directory:
 *   logs/run-1-2026-06-09_10-30-00/
 *   logs/run-2-2026-06-09_11-45-00/
 *
 * Files inside each run:
 *   all.log       — every log line from every area
 *   errors.log    — WARN + ERROR only (quick triage)
 *   auth.log      — login, session, magic-link flows
 *   owner.log     — owner/admin portal actions
 *   sales.log     — quotes, leads, order conversion
 *   kitchen.log   — prep tasks, allergens, recipe scaling
 *   shopper.log   — shopping lists, receipts, suppliers
 *   driver.log    — deliveries, GPS, equipment return
 *   cleaning.log  — cleaning handover, damage, stock
 *   client.log    — client portal, magic-link tokens, payments
 *   payment.log   — PayFast, Stripe, webhooks
 *   cron.log      — background jobs
 *   email.log     — outbound email sends
 *   accounting.log— Xero / QuickBooks / Sage syncs
 *   api.log       — general API calls not in above areas
 *   _run-info.json— run metadata (start time, env)
 *
 * patchConsole() mirrors ALL existing console.log/warn/error calls
 * throughout the codebase to all.log automatically — no per-file changes needed.
 *
 * For structured per-area logs use logger.info(area, message, ctx).
 */

import fs from "fs";
import path from "path";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export type LogArea =
  | "auth"
  | "owner"
  | "sales"
  | "kitchen"
  | "shopper"
  | "driver"
  | "cleaning"
  | "client"
  | "payment"
  | "cron"
  | "email"
  | "accounting"
  | "api"
  | "errors";

// ── Run directory management ──────────────────────────────────────────────────

let _runDir: string | null = null;

export function getRunDir(): string | null {
  return _runDir;
}

export function initLogger(): void {
  if (typeof window !== "undefined") return; // server-side only
  if (_runDir) return; // already initialised

  try {
    const logsRoot = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsRoot)) fs.mkdirSync(logsRoot, { recursive: true });

    // Run number = count of existing run dirs + 1
    const existingRuns = fs.readdirSync(logsRoot).filter((f) => /^run-\d+/.test(f));
    const runNumber = existingRuns.length + 1;

    const now = new Date();
    const ts = now.toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
    _runDir = path.join(logsRoot, `run-${runNumber}-${ts}`);

    fs.mkdirSync(_runDir, { recursive: true });

    const banner = [
      "═".repeat(72),
      `  RUN #${runNumber}  —  ${now.toISOString()}`,
      `  NODE_ENV: ${process.env.NODE_ENV ?? "unknown"}`,
      `  APP_URL:  ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}`,
      "═".repeat(72),
      "",
    ].join("\n");

    // Seed all.log and errors.log with the banner
    fs.writeFileSync(path.join(_runDir, "all.log"), banner, "utf8");
    fs.writeFileSync(path.join(_runDir, "errors.log"), banner, "utf8");

    fs.writeFileSync(
      path.join(_runDir, "_run-info.json"),
      JSON.stringify(
        {
          runNumber,
          startedAt: now.toISOString(),
          nodeEnv: process.env.NODE_ENV,
          appUrl: process.env.NEXT_PUBLIC_APP_URL,
        },
        null,
        2
      ),
      "utf8"
    );

    // Confirm logger is alive in the terminal
    process.stdout.write(
      `\n[logger] Run #${runNumber} — logs → ${path.relative(process.cwd(), _runDir)}\n\n`
    );
  } catch {
    // Never let logger setup crash the app
  }
}

// ── Core write ────────────────────────────────────────────────────────────────

function _write(file: string, line: string): void {
  if (!_runDir) initLogger();
  if (!_runDir) return;
  try {
    fs.appendFileSync(path.join(_runDir, file), line + "\n", "utf8");
  } catch {
    /* silent — never crash the app */
  }
}

// ── Public log function ───────────────────────────────────────────────────────

export function log(
  area: LogArea,
  level: LogLevel,
  message: string,
  ctx?: Record<string, unknown>
): void {
  if (typeof window !== "undefined") return;

  const ts = new Date().toISOString();
  const ctxStr =
    ctx && Object.keys(ctx).length > 0
      ? "  " +
        (() => {
          try {
            return JSON.stringify(ctx);
          } catch {
            return "[non-serialisable]";
          }
        })()
      : "";

  const line = `[${ts}] [${level.padEnd(5)}] [${area.padEnd(10)}] ${message}${ctxStr}`;

  _write("all.log", line);
  _write(`${area}.log`, line);

  if (level === "ERROR" || level === "WARN") {
    _write("errors.log", line);
  }
}

// ── Convenience logger object ─────────────────────────────────────────────────

export const logger = {
  info: (area: LogArea, msg: string, ctx?: Record<string, unknown>) =>
    log(area, "INFO", msg, ctx),
  warn: (area: LogArea, msg: string, ctx?: Record<string, unknown>) =>
    log(area, "WARN", msg, ctx),
  error: (area: LogArea, msg: string, ctx?: Record<string, unknown>) =>
    log(area, "ERROR", msg, ctx),
  debug: (area: LogArea, msg: string, ctx?: Record<string, unknown>) =>
    log(area, "DEBUG", msg, ctx),
};

// ── Console patching ──────────────────────────────────────────────────────────
// Mirrors ALL existing console.log/warn/error calls in the codebase to
// all.log automatically — no per-file changes needed.

let _consolePatchApplied = false;

function _fmt(...args: unknown[]): string {
  return args
    .map((a) => {
      if (a === null) return "null";
      if (a === undefined) return "undefined";
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return "[circular]";
        }
      }
      return String(a);
    })
    .join(" ");
}

// Infer log area from the call stack so console output is routed to the
// right persona file as well as all.log.
function _inferArea(): LogArea {
  try {
    const stack = new Error().stack ?? "";
    // Strip logger frames themselves
    const frames = stack.split("\n").slice(4).join("\n");
    if (/\/api\/cron\//.test(frames)) return "cron";
    if (/\/api\/auth\/|authService|supabase\/auth/.test(frames)) return "auth";
    if (/\/api\/admin\/platform/.test(frames)) return "owner";
    if (/\/api\/admin\//.test(frames)) return "owner";
    if (/\/api\/quotes\/|\/api\/leads\/|quoteService|leadService/.test(frames)) return "sales";
    if (/\/api\/orders\/|orderService|orderWorkflow/.test(frames)) return "sales";
    if (/kitchen|\/team-portal\/kitchen/.test(frames)) return "kitchen";
    if (/shopping|shopper/.test(frames)) return "shopper";
    if (/driver|driverService/.test(frames)) return "driver";
    if (/cleaning/.test(frames)) return "cleaning";
    if (/\/api\/client-tokens\/|clientAccess|magic.link/.test(frames)) return "client";
    if (/\/api\/webhooks\/|payfast|stripe|paymentService|payment/.test(frames)) return "payment";
    if (/\/api\/accounting\/|xero|quickbooks|sage/.test(frames)) return "accounting";
    if (/emailService|sendEmail|\/api\/emails\//.test(frames)) return "email";
    return "api";
  } catch {
    return "api";
  }
}

export function patchConsole(): void {
  if (typeof window !== "undefined") return;
  if (_consolePatchApplied) return;
  _consolePatchApplied = true;

  const origLog = console.log.bind(console);
  const origInfo = (console.info ?? console.log).bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(...args);
    log(_inferArea(), "INFO", _fmt(...args));
  };

  console.info = (...args: unknown[]) => {
    origInfo(...args);
    log(_inferArea(), "INFO", _fmt(...args));
  };

  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    log(_inferArea(), "WARN", _fmt(...args));
  };

  console.error = (...args: unknown[]) => {
    origError(...args);
    log(_inferArea(), "ERROR", _fmt(...args));
  };
}
