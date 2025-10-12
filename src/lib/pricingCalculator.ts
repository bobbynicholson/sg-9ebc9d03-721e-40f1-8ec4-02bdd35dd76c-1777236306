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
