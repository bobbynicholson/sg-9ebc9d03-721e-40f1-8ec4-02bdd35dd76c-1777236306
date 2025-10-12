
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
 * All other markets calculate from this base
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
      ordersPerQuarter: 50,
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
      ordersPerQuarter: 200,
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
 * Regional pricing multipliers
 * US/UK pricing is 3x ZA base (200% markup as requested)
 */
const REGIONAL_MULTIPLIERS: Record<MarketRegion, number> = {
  za: 1.0,
  us: 3.0,
  uk: 3.0,
  other: 1.0,
};

/**
 * Currency symbols and formatting
 */
const CURRENCY_CONFIG = {
  ZAR: { symbol: "R", decimals: 2, position: "before" },
  USD: { symbol: "$", decimals: 2, position: "before" },
  GBP: { symbol: "£", decimals: 2, position: "before" },
};

/**
 * Get pricing for a specific market region
 */
export function getRegionalPricing(region: MarketRegion): Record<string, PricingTier> {
  const multiplier = REGIONAL_MULTIPLIERS[region];
  
  const regionalPricing: Record<string, PricingTier> = {};
  
  for (const [key, tier] of Object.entries(BASE_PRICING_ZAR)) {
    regionalPricing[key] = {
      ...tier,
      basePrice: Math.round(tier.basePrice * multiplier),
    };
  }
  
  return regionalPricing;
}

/**
 * Format price with currency symbol
 */
export function formatPrice(
  amount: number,
  currency: "ZAR" | "USD" | "GBP"
): string {
  const config = CURRENCY_CONFIG[currency];
  const formatted = amount.toFixed(config.decimals);
  
  if (config.position === "before") {
    return `${config.symbol}${formatted}`;
  }
  
  return `${formatted}${config.symbol}`;
}

/**
 * Convert ZAR price to other currencies (for reference only)
 * Note: These are approximate conversions for display purposes
 */
export function convertCurrency(
  amountZAR: number,
  toCurrency: "USD" | "GBP" | "EUR"
): number {
  const rates = {
    USD: 0.053, // 1 ZAR ≈ 0.053 USD
    GBP: 0.043, // 1 ZAR ≈ 0.043 GBP
    EUR: 0.049, // 1 ZAR ≈ 0.049 EUR
  };
  
  return Math.round(amountZAR * rates[toCurrency] * 100) / 100;
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
    },
  }));
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
