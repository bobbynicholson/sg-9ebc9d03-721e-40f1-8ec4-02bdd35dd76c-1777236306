import { formatLogArguments } from "@/lib/logRedaction";

type Mirror = (level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string) => void;
const PATCH = Symbol.for("catering.console-redaction.v1");
type PatchState = { mirror?: Mirror };

/** Sanitize BEFORE the native console and optional file mirror receive data. */
export function installConsoleRedaction(mirror?: Mirror): void {
  const target = console as Console & { [PATCH]?: PatchState };
  if (target[PATCH]) {
    if (mirror) target[PATCH].mirror = mirror;
    return;
  }
  const state: PatchState = { mirror };
  Object.defineProperty(target, PATCH, { value: state, configurable: true });
  const methods = {
    log: "INFO", info: "INFO", warn: "WARN", error: "ERROR", debug: "DEBUG",
    trace: "DEBUG", dir: "INFO", dirxml: "INFO", table: "INFO",
    group: "INFO", groupCollapsed: "INFO", assert: "ERROR",
  } as const;
  for (const [method, level] of Object.entries(methods)) {
    const original = (console[method as keyof typeof methods] as (...args: unknown[]) => void)?.bind(console);
    if (!original) continue;
    Object.defineProperty(console, method, { configurable: true, writable: true, value: (...args: unknown[]) => {
      if (method === "assert" && args.shift()) return;
      let message: string;
      try { message = formatLogArguments(args); } catch { message = "[Unserialisable log]"; }
      if (method === "assert") original(false, message);
      else original(message);
      try { state.mirror?.(level, message); } catch { /* logging cannot break a caller */ }
    } });
  }
  // These methods emit their own counter/duration output. Keep their label
  // identity stable across start/end calls and sanitize timeLog's extra data.
  for (const method of ["count", "countReset", "time", "timeEnd", "timeLog", "timeStamp"] as const) {
    const original = console[method]?.bind(console);
    if (!original) continue;
    Object.defineProperty(console, method, { configurable: true, writable: true, value: (label?: unknown, ...args: unknown[]) => {
      const safeLabel = label === undefined ? "default" : formatLogArguments([label]);
      if (args.length) original(safeLabel, formatLogArguments(args));
      else original(safeLabel);
    } });
  }
}
