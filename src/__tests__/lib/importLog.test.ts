/**
 * @jest-environment node
 */
jest.mock("@/lib/logger", () => ({ log: jest.fn() }));

import { log } from "@/lib/logger";
import { importLog, formatImportLine, errText } from "@/lib/importLog";

const logMock = log as jest.MockedFunction<typeof log>;

describe("formatImportLine", () => {
  it("tags the line with the job id and step", () => {
    expect(formatImportLine("job-1", "commit.quotes", "Quote saved", { row: 12, quote_number: "Q-1001" }))
      .toBe('[import job=job-1 step=commit.quotes] Quote saved  {"row":12,"quote_number":"Q-1001"}');
  });

  it("uses a dash before the job exists and drops an empty context", () => {
    expect(formatImportLine(null, "upload.file", "File received")).toBe("[import job=- step=upload.file] File received");
    expect(formatImportLine(undefined, "upload.file", "File received", {})).toBe("[import job=- step=upload.file] File received");
  });

  it("survives a context that cannot be turned into JSON", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(formatImportLine("j", "s", "m", loop)).toBe('[import job=j step=s] m  {"self":"[Circular]"}');
  });
});

describe("importLog", () => {
  let out: jest.SpyInstance;
  let err: jest.SpyInstance;
  beforeEach(() => {
    logMock.mockReset();
    out = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    err = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
  });

  it("writes INFO to the imports log file and stdout", () => {
    importLog.info("job-1", "preview.row", "Row ok", { row: 3 });
    expect(logMock).toHaveBeenCalledWith("imports", "INFO", '[import job=job-1 step=preview.row] Row ok  {"row":3}');
    expect(out).toHaveBeenCalledTimes(1);
    expect(String(out.mock.calls[0][0])).toContain("[INFO] [import job=job-1 step=preview.row] Row ok");
    expect(err).not.toHaveBeenCalled();
  });

  it("sends WARN and ERROR to stderr", () => {
    importLog.warn("job-1", "commit.quotes", "Placeholder email used");
    importLog.error("job-1", "commit.quotes", "Quote not saved", { error: "boom" });
    expect(logMock).toHaveBeenNthCalledWith(1, "imports", "WARN", expect.any(String));
    expect(logMock).toHaveBeenNthCalledWith(2, "imports", "ERROR", expect.stringContaining('"error":"boom"'));
    expect(err).toHaveBeenCalledTimes(2);
    expect(out).not.toHaveBeenCalled();
  });

  it("never throws when the file logger fails", () => {
    logMock.mockImplementation(() => { throw new Error("disk full"); });
    expect(() => importLog.error("job-1", "commit.crash", "Save handler crashed")).not.toThrow();
  });

  it("redacts direct stdout/stderr and file diagnostics", () => {
    importLog.error("job-1", "commit.crash", "Failed /tenant/q/import-token-marker", { credentials: { secretKey: "import-secret-marker" } });
    for (const output of [err.mock.calls, logMock.mock.calls]) {
      expect(JSON.stringify(output)).not.toContain("import-secret-marker");
      expect(JSON.stringify(output)).not.toContain("import-token-marker");
      expect(JSON.stringify(output)).toContain("[REDACTED]");
    }
  });
});

describe("errText", () => {
  it("reads the message from errors, strings and error-like objects", () => {
    expect(errText(new Error("bad row"))).toBe("bad row");
    expect(errText("plain")).toBe("plain");
    expect(errText({ message: "duplicate key" })).toBe("duplicate key");
    expect(errText(null)).toBe("unknown error");
  });

  it("caps very long messages", () => {
    expect(errText("x".repeat(1000))).toHaveLength(300);
  });
});
