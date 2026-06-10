/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Initialises the file-based logger so every subsequent console.log/
 * warn/error call across the whole codebase (API routes, services,
 * middleware) gets mirrored to logs/run-N-TIMESTAMP/.
 *
 * Only activates on the Node.js runtime (not the Edge runtime used by
 * middleware.ts — Edge cannot write to the filesystem).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initLogger, patchConsole } = await import("./src/lib/logger");
  initLogger();
  patchConsole();
}
