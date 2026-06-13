import { formatZAR, formatMoney } from "@/lib/formatters";

describe("formatZAR", () => {
  it("uses a dot decimal separator, 2 decimals, plain spaces", () => {
    expect(formatZAR(890)).toBe("R 890.00");
    expect(formatZAR(890.5)).toBe("R 890.50");
  });

  it("groups thousands with a space and never emits a stray comma", () => {
    const out = formatZAR(1234567.5);
    // the old replace-first-comma bug could leave commas / mangle digits
    expect(out).not.toContain(",");
    expect(out.endsWith(".50")).toBe(true);
    // exactly one decimal point
    expect((out.match(/\./g) || []).length).toBe(1);
    // digits survive intact (no separator mangled into the number)
    expect(out.replace(/\D/g, "")).toBe("123456750");
    // no exotic no-break spaces leaked through (ASCII space only)
    expect([...out].every((c) => c.charCodeAt(0) !== 0xa0 && c.charCodeAt(0) !== 0x202f)).toBe(true);
  });

  it("returns -- for null / non-finite", () => {
    expect(formatZAR(null)).toBe("--");
    expect(formatZAR(undefined)).toBe("--");
    expect(formatZAR("not-a-number")).toBe("--");
  });
});

describe("formatMoney", () => {
  it("prefixes the optional currency and keeps the number intact", () => {
    expect(formatMoney(1500, { currency: "R " }).replace(/\D/g, "")).toBe("150000");
    expect(formatMoney(1500, { currency: "R " }).startsWith("R ")).toBe(true);
  });
  it("returns -- for empty input", () => {
    expect(formatMoney(null)).toBe("--");
    expect(formatMoney("")).toBe("--");
  });
});
