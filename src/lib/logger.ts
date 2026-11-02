/**
 * File-based logger for local dev flow tracing.
 *
 * All local server processes write to one predictable directory:
 *   logs/all.log       - every server log line, across all feature areas
 *   logs/errors.log    - WARN + ERROR only
 *
 * Area files (auth.log, driver.log, payment.log, etc.) sit beside all.log
 * for filtered investigation. Set APP_LOG_DIR to choose another local path.
 *
 * patchConsole() mirrors server-side console calls in this Node process
 * into all.log automatically. Browser and Edge runtime logs stay in their
 * runtime consoles. In production serverless deployments, the filesystem is
 * ephemeral; the same redacted warnings/errors also go to the runtime log.
 *
 * For structured per-area logs use logger.info(area, message, ctx).
 */

import fs from "fs";
import path from "path";
import { redactLogText, redactLogValue } from "@/lib/logRedaction";
import { installConsoleRedaction } from "@/lib/consoleRedaction";

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
  | "imports"
  | "api"
  | "errors";

// ── Run directory management ──────────────────────────────────────────────────

let _logsDir: string | null = null;

/** @deprecated Kept for existing callers; this now returns the shared logs directory. */
export function getRunDir(): string | null {
  return _logsDir;
}

export function initLogger(): void {
  if (typeof window !== "undefined") return; // server-side only
  if (_logsDir) return; // already initialised

  try {
    const configuredLogDir = process.env.APP_LOG_DIR?.trim();
    const logsDir = configuredLogDir
      ? path.resolve(process.cwd(), configuredLogDir)
      : path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    _logsDir = logsDir;

    const now = new Date();
    const banner = [
      "─".repeat(72),
      `  SERVER START  -  pid=${process.pid}  ${now.toISOString()}`,
      `  NODE_ENV: ${process.env.NODE_ENV ?? "unknown"}`,
      `  APP_URL:  ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}`,
      "─".repeat(72),
      "",
    ].join("\n");
    const safeBanner = redactLogText(banner);

    // Append instead of replacing so a restart doesn't erase the stream.
    fs.appendFileSync(path.join(_logsDir, "all.log"), `${safeBanner}\n`, "utf8");

    // Show the exact file to follow in the local terminal.
    process.stdout.write(
      `\n[logger] all server logs → ${path.join(path.relative(process.cwd(), _logsDir), "all.log")}\n\n`
    );
  } catch {
    // Never let logger setup crash the app
  }
}

// ── Core write ────────────────────────────────────────────────────────────────

function _write(file: string, line: string): void {
  if (!_logsDir) initLogger();
  if (!_logsDir) return;
  try {
    fs.appendFileSync(path.join(_logsDir, file), redactLogText(line) + "\n", "utf8");
  } catch {
    /* silent - never crash the app */
  }
}

// ── Public log function ───────────────────────────────────────────────────────

export function log(
  area: LogArea,
  level: LogLevel,
  message: string,
  ctx?: Record<string, unknown>,
  options: { runtime?: boolean } = {}
): void {
  if (typeof window !== "undefined") return;

  const ts = new Date().toISOString();
  const ctxStr =
    ctx && Object.keys(ctx).length > 0
      ? "  " +
        (() => {
          try {
            return JSON.stringify(redactLogValue(ctx));
          } catch {
            return "[non-serialisable]";
          }
        })()
      : "";

  const line = `[${ts}] [${level.padEnd(5)}] [${area.padEnd(10)}] ${redactLogText(message)}${ctxStr}`;

  _write("all.log", line);
  _write(`${area}.log`, line);

  if (level === "ERROR" || level === "WARN") {
    _write("errors.log", line);

    // Local files are useful during development, but serverless runtimes
    // do not provide durable access to them. Mirror only warnings/errors
    // to the platform's native log stream so operators can inspect API
    // failures and throttling without adding a paid monitoring service.
    // Console-patched messages already reached the native stream, so the
    // patchConsole mirror passes runtime: false to avoid duplicates.
    if (options.runtime !== false) {
      try {
        const stream = level === "ERROR" ? process.stderr : process.stdout;
        stream.write(`${line}\n`);
      } catch {
        // Logging must never break a request.
      }
    }
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
// Mirrors server-side console calls in this Node process to all.log
// automatically - no per-file changes needed.

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
  installConsoleRedaction((level, message) =>
    log(_inferArea(), level, message, undefined, { runtime: false })
  );
}
