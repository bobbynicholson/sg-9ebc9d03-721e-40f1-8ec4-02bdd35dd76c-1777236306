import type { MarketRegion } from "./geoLocation";

export interface PricingTier {
  name: string;
  basePrice: number;
  features: string[];
  limits: {
    activeClients: number;
    ordersPerQuarter: number;
  };
}

/**
 * Base pricing in South African Rand (ZAR)
 * All other markets calculate from this base using the formula: (ZAR Price × 3) ÷ Exchange Rate
 */
const BASE_PRICING_ZAR: Record<string, PricingTier> = {
  starter: {
    name: "Starter",
    basePrice: 399,
    features: [
      "Complete Order Management",
      "Lead & Quote System",
      "Email Automation (Quotes & Follow-ups)",
      "Client Portal Access",
      "Driver Management & GPS Tracking",
      "Basic Inventory Tracking",
      "Basic Equipment Tracking",
      "Basic Analytics Dashboard",
      "Receipt Scanner (Up to 10 scans/month)",
      "Email Support",
    ],
    limits: {
      activeClients: 50,
      ordersPerQuarter: 150,
    },
  },
  pro: {
    name: "Pro",
    basePrice: 699,
    features: [
      "Everything in Starter",
      "Advanced Inventory with Expiry Alerts",
      "Multi-Region Support (Unlimited Regions)",
      "Equipment Shortage Management",
      "Advanced Analytics & Profit Tracking",
      "Waiter Service Management",
      "Unlimited Receipt Scanning",
      "After-Sales Email Automation",
      "Priority Email Support",
      "WhatsApp & Xero Integrations",
      "Custom Branding (Logo & Colors)",
    ],
    limits: {
      activeClients: 200,
      ordersPerQuarter: 600,
    },
  },
  enterprise: {
    name: "Enterprise",
    basePrice: 1299,
    features: [
      "Everything in Pro",
      "Unlimited Active Clients",
      "Unlimited Orders",
      "White-Label Branding",
      "Custom Integrations",
      "Dedicated Account Manager",
      "Priority Phone & Email Support",
      "Custom Training Sessions",
      "API Access",
      "Custom Reporting",
    ],
    limits: {
      activeClients: 999999,
      ordersPerQuarter: 999999,
    },
  },
};

/**
 * Exchange rates for currency conversion
 * Formula: (ZAR Price × 3) ÷ Exchange Rate = Foreign Currency Price
 */
const EXCHANGE_RATES = {
  ZAR_TO_USD: 18.5,
  ZAR_TO_GBP: 23.5,
  ZAR_TO_EUR: 20.0,
};

/**
 * Currency symbols and formatting
 */
const CURRENCY_CONFIG = {
  ZAR: { symbol: "R", decimals: 0, position: "before" },
  USD: { symbol: "$", decimals: 0, position: "before" },
  GBP: { symbol: "£", decimals: 0, position: "before" },
  EUR: { symbol: "€", decimals: 0, position: "before" },
};

/**
 * Get pricing for a specific market region
 * Uses formula: (ZAR Price × 3) ÷ Exchange Rate
 */
export function getRegionalPricing(region: MarketRegion): Record<string, PricingTier> {
  const regionalPricing: Record<string, PricingTier> = {};
  
  for (const [key, tier] of Object.entries(BASE_PRICING_ZAR)) {
    let regionalPrice = tier.basePrice;
    
    // Apply pricing formula for non-ZA regions
    if (region === "us") {
      regionalPrice = Math.round((tier.basePrice * 3) / EXCHANGE_RATES.ZAR_TO_USD);
    } else if (region === "uk") {
      regionalPrice = Math.round((tier.basePrice * 3) / EXCHANGE_RATES.ZAR_TO_GBP);
    }
    
    regionalPricing[key] = {
      ...tier,
      basePrice: regionalPrice,
    };
  }
  
  return regionalPricing;
}

/**
 * Format price with currency symbol
 */
export function formatPrice(
  amount: number,
  currency: "ZAR" | "USD" | "GBP" | "EUR"
): string {
  const config = CURRENCY_CONFIG[currency];
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString();
  
  if (config.position === "before") {
    return `${config.symbol}${formatted}`;
  }
  
  return `${formatted}${config.symbol}`;
}

/**
 * Convert ZAR price to other currencies using the formula: (ZAR Price × 3) ÷ Exchange Rate
 */
export function convertCurrency(
  amountZAR: number,
  toCurrency: "USD" | "GBP" | "EUR"
): number {
  const multipliedAmount = amountZAR * 3;
  
  const rates = {
    USD: EXCHANGE_RATES.ZAR_TO_USD,
    GBP: EXCHANGE_RATES.ZAR_TO_GBP,
    EUR: EXCHANGE_RATES.ZAR_TO_EUR,
  };
  
  return Math.round(multipliedAmount / rates[toCurrency]);
}

/**
 * Get all pricing tiers with regional and reference pricing
 */
export function getAllPricingOptions(region: MarketRegion) {
  const regionalPricing = getRegionalPricing(region);
  const currency = region === "us" ? "USD" : region === "uk" ? "GBP" : "ZAR";
  
  return Object.entries(regionalPricing).map(([key, tier]) => ({
    id: key,
    ...tier,
    displayPrice: formatPrice(tier.basePrice, currency),
    currency,
    region,
    // Add reference pricing for transparency
    referencePricing: {
      ZAR: formatPrice(BASE_PRICING_ZAR[key].basePrice, "ZAR"),
      USD: formatPrice(convertCurrency(BASE_PRICING_ZAR[key].basePrice, "USD"), "USD"),
      GBP: formatPrice(convertCurrency(BASE_PRICING_ZAR[key].basePrice, "GBP"), "GBP"),
      EUR: formatPrice(convertCurrency(BASE_PRICING_ZAR[key].basePrice, "EUR"), "EUR"),
    },
  }));
}

/**
 * Live pricing payload returned by /api/platform/pricing-plans.
 * Used by the public /pricing page to override the hard-coded
 * defaults so admin edits go live immediately.
 */
export interface LivePlan {
  slug: string;            // 'starter' | 'pro' | 'enterprise'
  name: string;
  zar_price: number;
  usd_price: number;
  gbp_price: number;
  eur_price: number;
  features?: string[];
  active_clients_limit?: number | null;
  orders_per_quarter_limit?: number | null;
  is_recommended?: boolean;
}

/**
 * Map a live plan's slug from the DB to the in-code keys used by
 * BASE_PRICING_ZAR. The DB seeded slug for the middle tier is "pro";
 * older code paths sometimes used "professional". Treat them the same.
 */
function matchSlug(slug: string): string | null {
  const s = (slug || "").toLowerCase();
  if (s === "starter") return "starter";
  if (s === "pro" || s === "professional") return "pro";
  if (s === "enterprise") return "enterprise";
  return null;
}

/**
 * Replace prices, features and limits in the in-code pricing options
 * with values from platform_pricing_plans when available. Falls back
 * silently to the in-code defaults if the API has no row for a slug.
 */
export function applyLivePlans(
  options: ReturnType<typeof getAllPricingOptions>,
  livePlans: LivePlan[] | null | undefined,
  region: MarketRegion,
): ReturnType<typeof getAllPricingOptions> {
  if (!livePlans || livePlans.length === 0) return options;

  const byKey = new Map<string, LivePlan>();
  for (const lp of livePlans) {
    const key = matchSlug(lp.slug);
    if (key) byKey.set(key, lp);
  }

  const currency: "ZAR" | "USD" | "GBP" | "EUR" =
    region === "us" ? "USD" : region === "uk" ? "GBP" : "ZAR";

  return options.map((opt) => {
    const live = byKey.get(opt.id);
    if (!live) return opt;

    const livePriceForRegion =
      currency === "USD" ? Number(live.usd_price)
      : currency === "GBP" ? Number(live.gbp_price)
      : Number(live.zar_price);

    return {
      ...opt,
      basePrice: livePriceForRegion,
      displayPrice: formatPrice(livePriceForRegion, currency),
      name: live.name || opt.name,
      features: live.features?.length ? live.features : opt.features,
      // null in the DB = unlimited; map to the 999999 sentinel the UI
      // already understands for the "Unlimited" label.
      limits: {
        activeClients: live.active_clients_limit === null
          ? 999999
          : (live.active_clients_limit ?? opt.limits.activeClients),
        ordersPerQuarter: live.orders_per_quarter_limit === null
          ? 999999
          : (live.orders_per_quarter_limit ?? opt.limits.ordersPerQuarter),
      },
      referencePricing: {
        ZAR: formatPrice(Number(live.zar_price), "ZAR"),
        USD: formatPrice(Number(live.usd_price), "USD"),
        GBP: formatPrice(Number(live.gbp_price), "GBP"),
        EUR: formatPrice(Number(live.eur_price), "EUR"),
      },
    };
  });
}

/**
 * Calculate savings with annual billing
 */
export function calculateAnnualSavings(monthlyPrice: number): {
  monthlyTotal: number;
  annualPrice: number;
  savings: number;
  savingsPercentage: number;
} {
  const monthlyTotal = monthlyPrice * 12;
  const annualDiscount = 0.15; // 15% discount for annual billing
  const annualPrice = monthlyTotal * (1 - annualDiscount);
  const savings = monthlyTotal - annualPrice;
  
  return {
    monthlyTotal,
    annualPrice: Math.round(annualPrice),
    savings: Math.round(savings),
    savingsPercentage: Math.round(annualDiscount * 100),
  };
}
