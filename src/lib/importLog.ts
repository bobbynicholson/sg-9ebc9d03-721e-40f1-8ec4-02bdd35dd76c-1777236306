/**
 * importLog - step-by-step trace for the spreadsheet import engine
 * (/api/imports/*).
 *
 * Every line carries the import job id and a step name, so one import
 * can be followed from upload to commit by searching for its id:
 *
 *   [import job=3f2a... step=commit.quotes] Quote saved  {"row":12,"quote_number":"Q-1001"}
 *
 * Where a line goes:
 *   - the terminal / Vercel function log (stdout, or stderr for WARN
 *     and ERROR)
 *   - logs/run-N/imports.log and all.log (plus errors.log for WARN and
 *     ERROR) through the file logger, when the filesystem is writable
 *
 * It writes to stdout directly rather than console.*: patchConsole()
 * mirrors console output into all.log, which would log every line
 * twice.
 *
 * Callers log row numbers, quote / order numbers, field names and
 * counts. Never pass client names, emails or phone numbers.
 */
import { log, type LogLevel } from "@/lib/logger";

export type ImportLogContext = Record<string, unknown>;

/** Build the single-line form shared by the terminal and the log files. */
export function formatImportLine(
  jobId: string | null | undefined,
  step: string,
  message: string,
  ctx?: ImportLogContext,
): string {
  let ctxStr = "";
  if (ctx && Object.keys(ctx).length > 0) {
    try {
      ctxStr = `  ${JSON.stringify(ctx)}`;
    } catch {
      ctxStr = "  [non-serialisable]";
    }
  }
  return `[import job=${jobId || "-"} step=${step}] ${message}${ctxStr}`;
}

function write(
  level: LogLevel,
  jobId: string | null | undefined,
  step: string,
  message: string,
  ctx?: ImportLogContext,
): void {
  if (typeof window !== "undefined") return; // server-side only
  const line = formatImportLine(jobId, step, message, ctx);
  try {
    log("imports", level, line);
    const out = level === "ERROR" || level === "WARN" ? process.stderr : process.stdout;
    out.write(`[${new Date().toISOString()}] [${level}] ${line}\n`);
  } catch {
    /* logging must never break an import */
  }
}

export const importLog = {
  info: (jobId: string | null | undefined, step: string, message: string, ctx?: ImportLogContext) =>
    write("INFO", jobId, step, message, ctx),
  warn: (jobId: string | null | undefined, step: string, message: string, ctx?: ImportLogContext) =>
    write("WARN", jobId, step, message, ctx),
  error: (jobId: string | null | undefined, step: string, message: string, ctx?: ImportLogContext) =>
    write("ERROR", jobId, step, message, ctx),
};

/** Error text for a log line: message only, capped so a stack or SQL dump can't flood the log. */
export function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : (e as { message?: unknown } | null)?.message;
  return String(msg ?? e ?? "unknown error").slice(0, 300);
}
