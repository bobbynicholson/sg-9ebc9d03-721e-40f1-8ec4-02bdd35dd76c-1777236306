/** @jest-environment node */
import { formatLogArguments, REDACTED, redactLogException, redactLogText, redactLogUrl, redactLogValue } from "@/lib/logRedaction";

describe("shared log redaction", () => {
  it("snapshots nested objects and arrays without changing the original", () => {
    const input = { provider: "stripe", credentials: { secretKey: "credential-marker", merchantId: "merchant-marker" },
      rows: [{ password: "password-marker", access_token: "access-marker", count: 2 }], headers: { Authorization: "Bearer auth-marker", Cookie: "session=cookie-marker" } };
    const safe = redactLogValue(input);
    const output = JSON.stringify(safe);
    for (const marker of ["credential-marker", "merchant-marker", "password-marker", "access-marker", "auth-marker", "cookie-marker"]) expect(output).not.toContain(marker);
    expect(safe).toMatchObject({ provider: "stripe", credentials: REDACTED, rows: [{ count: 2 }] });
    expect(input.credentials.secretKey).toBe("credential-marker");
    expect(input.rows[0].password).toBe("password-marker");
  });

  it.each(["secretKey", "secret_key", "CLIENT-SECRET", "webhookSigningSecret", "provisionToken", "apiKey", "x-api-key", "private_key", "passphrase", "refreshToken", "token_hash", "otp", "merchantKey", "encryption_key", "smtpPass"])("redacts the %s alias", key => {
    expect(redactLogValue({ [key]: "alias-marker" })).toEqual({ [key]: REDACTED });
  });

  it.each([
    "/api/public/quotes/path-marker/get?format=pdf",
    "/api/public/invoices/path-marker/pdf",
    "/api/public/embed/path-marker/config",
    "/api/outsource/accept/path-marker",
    "/tenant/q/path-marker",
    "/tenant/u/path-marker",
    "/tenant/p/accept/path-marker",
    "/tenant/pay/i/path-marker/success",
    "/tenant/c/order/path-marker",
  ])("redacts bearer tokens in %s", url => {
    expect(redactLogUrl(url)).not.toContain("path-marker");
    expect(redactLogUrl(url)).toContain(REDACTED);
  });

  it("redacts encoded query keys, repeated tokens, fragments and connection credentials", () => {
    const safe = redactLogUrl("https://user:connection-marker@example.test/auth?access%5Ftoken=query-marker&token=second-marker&page=2#refresh_token=fragment-marker");
    for (const marker of ["connection-marker", "query-marker", "second-marker", "fragment-marker"]) expect(safe).not.toContain(marker);
    expect(safe).toContain("page=2");
  });

  it.each([
    'request failed: token="quoted marker, with spaces"',
    'nested message: password=plain-marker',
    'Authorization: Bearer bearer-marker',
    'Proxy-Authorization: Basic dXNlcjpwYXNz',
    'Cookie: session=cookie-marker; other=second-marker',
    'Set-Cookie: session=cookie-marker; HttpOnly',
    'provider rejected sk_test_providerMarker123',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signatureMarker',
    '-----BEGIN PRIVATE KEY-----\nprivate-marker\n-----END PRIVATE KEY-----',
  ])("removes secret values in text: %s", message => {
    const safe = redactLogText(message);
    expect(safe).toContain(REDACTED);
    expect(safe).not.toMatch(/plain-marker|quoted marker|bearer-marker|dXNlcjpwYXNz|cookie-marker|second-marker|providerMarker123|signatureMarker|private-marker/);
    expect(redactLogText(safe)).toBe(safe);
    expect(safe).not.toContain("[REDACTED]]");
  });

  it("redacts serialized credential containers and preserves useful metadata", () => {
    expect(JSON.parse(redactLogText(JSON.stringify({ count: 3, credentials: { merchantId: "merchant-marker" }, secretKey: "secret-marker" }))))
      .toEqual({ count: 3, credentials: REDACTED, secretKey: REDACTED });
    expect(redactLogText("GET /api/orders/order-1 returned 403 after 25ms")).toBe("GET /api/orders/order-1 returned 403 after 25ms");
    const embedded = redactLogText('payload: {"credentials":{"merchantId":"embedded-id-marker","customField":"embedded-custom-marker"},"count":2} extra {"password":"second-object-marker"}');
    expect(embedded).not.toMatch(/embedded-id-marker|embedded-custom-marker|second-object-marker/);
    expect(embedded).toContain('"count":2');
    expect(redactLogText('payload: {\n"credentials": {"merchantId":"multiline-id-marker","customField":"multiline-custom-marker"}\n}'))
      .not.toMatch(/multiline-id-marker|multiline-custom-marker/);
  });

  it("supports Error causes, circular references and non-JSON types", () => {
    const error = new Error("fetch https://example.test/callback?code=oauth-marker");
    Object.assign(error, { cause: { credentials: { secretKey: "cause-marker" } } });
    const loop: Record<string, unknown> = { error, id: "order-1", count: BigInt(7), map: new Map([["token", "map-marker"]]), bytes: Buffer.from("binary-marker") };
    loop.self = loop;
    const output = JSON.stringify(redactLogValue(loop));
    expect(output).toContain("[Circular]");
    expect(output).toContain("order-1");
    for (const marker of ["oauth-marker", "cause-marker", "map-marker", "binary-marker"]) expect(output).not.toContain(marker);
    const copy = redactLogException(error) as Error;
    expect(copy).toBeInstanceOf(Error);
    expect(copy.stack).not.toContain("oauth-marker");
    expect(copy.stack).toContain("logRedaction.test");
    expect((redactLogException(new TypeError("bad request")) as Error).name).toBe("TypeError");
    expect(error.message).toContain("oauth-marker");
  });

  it("does not execute getters or custom serialization hooks", () => {
    const getter = jest.fn(() => "getter-marker");
    const toJSON = jest.fn(() => ({ exposed: "serializer-marker" }));
    const input = { toJSON, id: "safe-id" };
    Object.defineProperty(input, "danger", { enumerable: true, get: getter });
    expect(redactLogValue(input)).toEqual({ id: "safe-id", danger: "[Accessor]" });
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("formats split labels, printf placeholders and JSON before masking", () => {
    expect(formatLogArguments(["token:", "split-marker"])).not.toContain("split-marker");
    expect(formatLogArguments(["token: %s", "format-marker"])).not.toContain("format-marker");
    expect(formatLogArguments(["request %s %j", "POST", { secretKey: "json-marker", count: 3 }])).toContain('"count":3');
    expect(formatLogArguments(["request", { secretKey: "json-marker" }])).not.toContain("json-marker");
  });
});
