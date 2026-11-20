import { loadStockShortfallCount, stockShortfallFailureReference } from "@/lib/dashboard/stockShortfalls";

describe("loadStockShortfallCount", () => {
  const wait = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => wait.mockClear());

  it("accepts a successful zero count without retrying", async () => {
    const query = jest.fn().mockResolvedValue({ count: 0, error: null, status: 200 });
    await expect(loadStockShortfallCount(query, wait)).resolves.toMatchObject({ count: 0, error: null });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(true);
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries a transient HEAD failure with a GET count", async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ count: null, error: { code: "57014", message: "statement timeout" }, status: 500 })
      .mockResolvedValueOnce({ count: 25, error: null, status: 200 });
    await expect(loadStockShortfallCount(query, wait)).resolves.toMatchObject({ count: 25, error: null });
    expect(query.mock.calls).toEqual([[true], [false]]);
    expect(wait).toHaveBeenCalledWith(400);
  });

  it("retries a rejected request and preserves a final failure", async () => {
    const failure = new Error("Network unavailable");
    const query = jest.fn().mockRejectedValue(failure);
    await expect(loadStockShortfallCount(query, wait)).resolves.toMatchObject({ count: null, error: failure, status: 0 });
    expect(query.mock.calls).toEqual([[true], [false], [false]]);
    expect(wait.mock.calls).toEqual([[400], [1000]]);
  });

  it("does not retry or hide permission failures", async () => {
    const failure = { count: null, error: { code: "42501", message: "permission denied" }, status: 403 };
    const query = jest.fn().mockResolvedValue(failure);
    await expect(loadStockShortfallCount(query, wait)).resolves.toEqual(failure);
    expect(query).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not turn a missing count into a false zero", async () => {
    const query = jest.fn().mockResolvedValue({ count: null, error: null, status: 200 });
    const result = await loadStockShortfallCount(query, wait);
    expect(result.count).toBeNull();
    expect(result.error).toMatchObject({ code: "SHORTFALL_COUNT_MISSING" });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("shows a safe reference without exposing database error messages", () => {
    expect(stockShortfallFailureReference({ count: null, error: { code: "57014", message: "private details" }, status: 500 })).toBe("57014 / HTTP 500");
    expect(stockShortfallFailureReference({ count: null, error: { code: "private details" }, status: 403 })).toBe("HTTP 403");
    expect(stockShortfallFailureReference({ count: null, error: new Error("private details"), status: 0 })).toBe("NETWORK");
    expect(stockShortfallFailureReference({ count: null, error: new Error("private details") })).toBe("UNKNOWN");
    expect(stockShortfallFailureReference({ count: 0, error: null, status: 200 })).toBeNull();
  });
});
