export const CURRENCY_CONFIG = {
  ZAR: { symbol: "R", name: "South African Rand", rate: 1 },
  USD: { symbol: "$", name: "US Dollar", rate: 0.054 },
  EUR: { symbol: "€", name: "Euro", rate: 0.049 },
  GBP: { symbol: "£", name: "British Pound", rate: 0.042 },
  AUD: { symbol: "A$", name: "Australian Dollar", rate: 0.082 }
};

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