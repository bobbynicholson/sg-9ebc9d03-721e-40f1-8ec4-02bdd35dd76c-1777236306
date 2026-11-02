/** @jest-environment node */
jest.mock("fs", () => ({
  existsSync: jest.fn(() => true), mkdirSync: jest.fn(), readdirSync: jest.fn(() => []),
  writeFileSync: jest.fn(), appendFileSync: jest.fn(),
}));

import fs from "fs";
import { initLogger, log, logger, patchConsole } from "@/lib/logger";

it("writes redacted logs into the shared directory and mirrors warnings to the runtime", () => {
  const oldUrl = process.env.NEXT_PUBLIC_APP_URL;
  const stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.env.NEXT_PUBLIC_APP_URL = "https://user:connection-marker@example.test/?token=initial-token-marker";
  try {
    initLogger();
    log("payment", "WARN", "POST /api/public/quotes/file-token-marker/accept", { credentials: { secretKey: "file-secret-marker" }, status: 403 });
    logger.error("auth", "token: error-token-marker");
    const writes = JSON.stringify([(fs.writeFileSync as jest.Mock).mock.calls, (fs.appendFileSync as jest.Mock).mock.calls]);
    for (const marker of ["connection-marker", "initial-token-marker", "file-token-marker", "file-secret-marker", "error-token-marker"]) expect(writes).not.toContain(marker);
    expect(writes).toContain("payment.log");
    expect(writes).toContain("all.log");
    expect(writes).toContain("errors.log");
    expect(writes).toContain("403");
    expect(JSON.stringify(stdout.mock.calls)).toContain("403");
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("error-token-marker");
    const filePaths = (fs.appendFileSync as jest.Mock).mock.calls.map(([file]) => String(file));
    expect(filePaths.some((file) => /[\\/]logs[\\/]all\.log$/.test(file))).toBe(true);
    expect(filePaths.some((file) => /[\\/]run-\d+-/.test(file))).toBe(false);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = oldUrl;
    stdout.mockRestore();
    stderr.mockRestore();
  }
});

it("redacts the real console/file pipeline with one mirror per call", () => {
  const original = globalThis.console;
  const terminal = jest.fn();
  const stderr = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  globalThis.console = { ...original, error: terminal };
  (fs.appendFileSync as jest.Mock).mockClear();
  try {
    patchConsole();
    patchConsole();
    console.error("token: %s", "pipeline-secret-marker");
    expect(terminal).toHaveBeenCalledTimes(1);
    const writes = (fs.appendFileSync as jest.Mock).mock.calls;
    expect(writes.filter(([path]) => String(path).endsWith("all.log"))).toHaveLength(1);
    expect(JSON.stringify([terminal.mock.calls, writes])).not.toContain("pipeline-secret-marker");
    expect(stderr).not.toHaveBeenCalled();
  } finally { globalThis.console = original; stderr.mockRestore(); }
});
