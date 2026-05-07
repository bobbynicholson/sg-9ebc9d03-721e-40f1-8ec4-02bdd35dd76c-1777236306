// Per-currency cents-per-ZAR rate. ZAR is the base (1.0); the other
// currencies' rates express how many of that currency you get per
// 1 ZAR.
//
// These are starter constants. Production should call
// `refreshExchangeRates(serviceClient)` from a server context before
// money math so the USD/ZAR rate (the only pair the cron currently
// populates in `exchange_rates`) reflects live FX. The other three
// pairs are still hardcoded fallbacks until Phase 2 extends the
// schema + cron to cover them. The live tenant (Spit Braai) is
// ZAR-only so the staleness of EUR/GBP/AUD has no operational
// impact today; flagged in the audit as P0-13 because the
// structural risk is real for any future non-ZAR tenant. [P0-13]
export const CURRENCY_CONFIG = {
  ZAR: { symbol: "R", name: "South African Rand", rate: 1 },
  USD: { symbol: "$", name: "US Dollar", rate: 0.054 },
  EUR: { symbol: "€", name: "Euro", rate: 0.049 },
  GBP: { symbol: "£", name: "British Pound", rate: 0.042 },
  AUD: { symbol: "A$", name: "Australian Dollar", rate: 0.082 }
};

/**
 * Pull the latest USD/ZAR rate from the `exchange_rates` table and
 * mutate CURRENCY_CONFIG.USD.rate in place. Other currencies stay on
 * their starter constants until Phase 2 extends the schema.
 *
 * Call this from a server context (API route, cron, edge function)
 * before any money math that crosses USD <-> ZAR. Cheap (single row
 * read); cache TTL not needed because the cron only updates once per
 * day and the scheduling is server-side. Safe to call repeatedly.
 *
 * Pass a service-role client to bypass RLS on exchange_rates.
 *
 * Returns the rate that was applied, or null if the table is empty
 * (in which case the starter constant stays in place).
 */
export async function refreshExchangeRates(
  serviceClient: { from: (t: string) => any }
): Promise<{ USD: number | null; EUR: number | null; GBP: number | null; AUD: number | null }> {
  const result = { USD: null as number | null, EUR: null as number | null, GBP: null as number | null, AUD: null as number | null };
  try {
    const { data, error } = await serviceClient
      .from("exchange_rates")
      .select("usd_to_zar_rate, eur_to_zar_rate, gbp_to_zar_rate, aud_to_zar_rate, date")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[refreshExchangeRates] read failed:", error.message);
      return result;
    }

    // Each *_to_zar_rate column expresses "ZAR per 1 unit of foreign
    // currency". CURRENCY_CONFIG.{currency}.rate expresses the inverse
    // ("foreign per 1 ZAR") to match the existing convertCurrency
    // arithmetic. Mutate in place; sync API stays unchanged.
    const apply = (
      key: "USD" | "EUR" | "GBP" | "AUD",
      value: any,
    ): void => {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return;
      const inverted = 1 / n;
      CURRENCY_CONFIG[key].rate = inverted;
      result[key] = inverted;
    };

    apply("USD", (data as any)?.usd_to_zar_rate);
    apply("EUR", (data as any)?.eur_to_zar_rate);
    apply("GBP", (data as any)?.gbp_to_zar_rate);
    apply("AUD", (data as any)?.aud_to_zar_rate);
    return result;
  } catch (e: any) {
    console.warn("[refreshExchangeRates] crashed:", e?.message);
    return result;
  }
}

export type CurrencyCode = keyof typeof CURRENCY_CONFIG;

export function convertCurrency(
  amount: number,
  fromCurrency: CurrencyCode = "ZAR",
  toCurrency: CurrencyCode = "ZAR"
): number {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = CURRENCY_CONFIG[fromCurrency].rate;
  const toRate = CURRENCY_CONFIG[toCurrency].rate;
  
  const amountInZAR = amount / fromRate;
  return amountInZAR * toRate;
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = "ZAR",
  decimals: number = 2
): string {
  const config = CURRENCY_CONFIG[currency];
  return `${config.symbol}${amount.toFixed(decimals)}`;
}

export function getUserCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "ZAR";
  
  const storedUser = localStorage.getItem("current_user");
  if (!storedUser) return "ZAR";
  
  try {
    const user = JSON.parse(storedUser);
    return user.preferredCurrency || user.currency || "ZAR";
  } catch {
    return "ZAR";
  }
}

export function convertAndFormat(
  amount: number,
  fromCurrency: CurrencyCode = "ZAR",
  toCurrency?: CurrencyCode
): string {
  const targetCurrency = toCurrency || getUserCurrency();
  const converted = convertCurrency(amount, fromCurrency, targetCurrency);
  return formatCurrency(converted, targetCurrency);
}