export interface StockShortfallResult {
  count: number | null;
  error: unknown;
  status?: number;
}

export function stockShortfallFailureReference(result: StockShortfallResult): string | null {
  if (!result.error) return null;
  const code = (result.error as { code?: unknown })?.code;
  const safeCode = typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : null;
  const status = Number.isInteger(result.status) && result.status > 0 ? `HTTP ${result.status}` : null;
  return [safeCode, status].filter(Boolean).join(" / ") || (result.status === 0 ? "NETWORK" : "UNKNOWN");
}

function shouldRetry(result: StockShortfallResult): boolean {
  if (!result.error) return false;
  const error = result.error as { code?: string; message?: string };
  const code = error?.code || "";
  if (code === "42501" || code === "42P01" || result.status === 401 || result.status === 403) return false;
  return code === "SHORTFALL_COUNT_MISSING"
    || code === "57014"
    || code.startsWith("08")
    || ["PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(code)
    || result.status === 0
    || result.status === 405
    || result.status === 408
    || result.status === 429
    || (result.status != null && result.status >= 500);
}

export async function loadStockShortfallCount(
  query: (head: boolean) => PromiseLike<StockShortfallResult>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<StockShortfallResult> {
  const delays = [0, 400, 1000];
  let result: StockShortfallResult = { count: null, error: null };

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await wait(delays[attempt]);
    try {
      result = await query(attempt === 0);
      if (!result.error && result.count == null) {
        result = { ...result, error: { code: "SHORTFALL_COUNT_MISSING", message: "Stock shortfall count was not returned." } };
      }
    } catch (error) {
      result = { count: null, error, status: 0 };
    }
    if (!shouldRetry(result)) break;
  }

  return result;
}
