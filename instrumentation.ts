/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Redacts console output in Node and Edge runtimes. In Node, it also
 * initialises the shared file logger so server-side console calls are
 * mirrored into logs/all.log. Edge middleware and browser logs stay in
 * their runtime consoles because they cannot write to the local file.
 */
export async function register() {
  const { installConsoleRedaction } = await import("./src/lib/consoleRedaction");
  installConsoleRedaction();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initLogger, patchConsole } = await import("./src/lib/logger");
  initLogger();
  patchConsole();
}
