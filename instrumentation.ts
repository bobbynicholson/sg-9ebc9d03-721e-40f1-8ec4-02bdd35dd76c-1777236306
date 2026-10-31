/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Initialises the file-based logger so every subsequent console.log/
 * warn/error call across the whole codebase (API routes, services,
 * middleware) is redacted before output. Node logs are also mirrored to
 * logs/run-N-TIMESTAMP/.
 *
 * Console redaction also runs on Edge. Only Node writes to the filesystem.
 */
export async function register() {
  const { installConsoleRedaction } = await import("./src/lib/consoleRedaction");
  installConsoleRedaction();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initLogger, patchConsole } = await import("./src/lib/logger");
  initLogger();
  patchConsole();
}
