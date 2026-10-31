/** @jest-environment node */
import { installConsoleRedaction } from "@/lib/consoleRedaction";

const nativeConsole = globalThis.console;
let terminal: Record<string, jest.Mock>;
beforeEach(() => {
  terminal = Object.fromEntries(["log", "info", "warn", "error", "debug", "trace", "dir", "dirxml", "table", "group", "groupCollapsed", "assert", "count", "countReset", "time", "timeEnd", "timeLog", "timeStamp"].map(name => [name, jest.fn()]));
  globalThis.console = { ...terminal } as unknown as Console;
});
afterEach(() => { globalThis.console = nativeConsole; });

it.each(["log", "info", "warn", "error", "debug", "trace", "dir", "dirxml", "table", "group", "groupCollapsed"])("redacts console.%s before terminal and file output", method => {
  const mirror = jest.fn();
  installConsoleRedaction(mirror);
  (console[method as "log"])("request", { credentials: { secretKey: "console-secret-marker" }, count: 2 });
  expect(terminal[method]).toHaveBeenCalledTimes(1);
  expect(mirror).toHaveBeenCalledTimes(1);
  for (const output of [terminal[method].mock.calls, mirror.mock.calls]) {
    expect(JSON.stringify(output)).not.toContain("console-secret-marker");
    expect(JSON.stringify(output)).toContain("[REDACTED]");
    expect(JSON.stringify(output)).toContain("count");
  }
});

it("is idempotent when Node attaches a mirror after Edge/browser initialization", () => {
  installConsoleRedaction();
  const mirror = jest.fn();
  installConsoleRedaction(mirror);
  installConsoleRedaction(mirror);
  console.error("token: %s", "printf-secret-marker");
  expect(terminal.error).toHaveBeenCalledTimes(1);
  expect(mirror).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(terminal.error.mock.calls)).not.toContain("printf-secret-marker");
});

it("preserves assertion conditions and does not throw if the file sink fails", () => {
  installConsoleRedaction(() => { throw new Error("disk full"); });
  console.assert(true, { password: "true-marker" });
  expect(terminal.assert).not.toHaveBeenCalled();
  expect(() => console.assert(false, { password: "false-marker" })).not.toThrow();
  expect(terminal.assert).toHaveBeenCalledWith(false, expect.stringContaining("[REDACTED]"));
  expect(JSON.stringify(terminal.assert.mock.calls)).not.toContain("false-marker");
});

it("sanitizes timer/counter labels and timeLog context without changing label identity", () => {
  installConsoleRedaction();
  console.time("/tenant/q/timer-marker");
  console.timeLog("/tenant/q/timer-marker", { secretKey: "timing-secret-marker" });
  console.timeEnd("/tenant/q/timer-marker");
  console.count("token: counter-secret-marker");
  console.countReset("token: counter-secret-marker");
  const output = JSON.stringify([terminal.time.mock.calls, terminal.timeLog.mock.calls, terminal.timeEnd.mock.calls, terminal.count.mock.calls, terminal.countReset.mock.calls]);
  expect(output).not.toMatch(/timer-marker|timing-secret-marker|counter-secret-marker/);
  expect(terminal.time.mock.calls[0][0]).toBe(terminal.timeEnd.mock.calls[0][0]);
  expect(terminal.count.mock.calls[0][0]).toBe(terminal.countReset.mock.calls[0][0]);
});
