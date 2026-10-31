/** @jest-environment node */
const mockScope = { setLevel: jest.fn(), setTag: jest.fn(), setUser: jest.fn(), setExtras: jest.fn() };
const mockSentry = { withScope: jest.fn(callback => callback(mockScope)), captureException: jest.fn(), captureMessage: jest.fn(), setTag: jest.fn(), setUser: jest.fn() };
jest.mock("@sentry/nextjs", () => mockSentry, { virtual: true });

import { captureException, captureMessage, setGlobalTags } from "@/lib/observability";

let oldDsn: string | undefined;
let errorOutput: jest.SpyInstance;
let warningOutput: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  oldDsn = process.env.SENTRY_DSN;
  process.env.SENTRY_DSN = "https://synthetic@example.test/1";
  errorOutput = jest.spyOn(console, "error").mockImplementation(() => {});
  warningOutput = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  if (oldDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = oldDsn;
  errorOutput.mockRestore(); warningOutput.mockRestore();
});

it("sanitizes monitoring exceptions, stack, extras and tags while retaining tenant context", () => {
  const error = new Error("provider failed?token=exception-marker");
  const context = { tags: { companyId: "company-1", route: "/tenant/q/route-marker", accessToken: "tag-marker" }, extra: { credentials: { secretKey: "extra-marker" }, status: 502 } };
  captureException(error, context);
  expect(mockSentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  const copied = mockSentry.captureException.mock.calls[0][0];
  const outputs = JSON.stringify([errorOutput.mock.calls, mockScope.setTag.mock.calls, mockScope.setExtras.mock.calls, copied.message, copied.stack]);
  for (const marker of ["exception-marker", "route-marker", "tag-marker", "extra-marker"]) expect(outputs).not.toContain(marker);
  expect(outputs).toContain("company-1");
  expect(outputs).toContain("502");
  expect(error.message).toContain("exception-marker");
  expect(context.extra.credentials.secretKey).toBe("extra-marker");
});

it("sanitizes monitoring messages and globally bound tags", () => {
  captureMessage("secretKey=message-marker", { tags: { nested: { token: "nested-tag-marker", attempt: 2 } }, extra: { token: "message-extra-marker" } });
  setGlobalTags({ companyId: "company-1", token: "global-marker", route: "/tenant/pay/i/pay-marker" });
  expect(mockSentry.captureMessage).toHaveBeenCalled();
  const outputs = JSON.stringify([warningOutput.mock.calls, mockSentry.captureMessage.mock.calls, mockScope.setExtras.mock.calls, mockSentry.setTag.mock.calls]);
  expect(outputs).not.toMatch(/message-marker|message-extra-marker|global-marker|pay-marker|nested-tag-marker/);
});
