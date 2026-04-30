import { useState, useEffect } from "react";
import { detectUserRegion, getRegionFromPath, getRegionCurrency, type MarketRegion } from "@/lib/geoLocation";
import { getAllPricingOptions, calculateAnnualSavings, formatPrice, applyLivePlans, type LivePlan } from "@/lib/pricingCalculator";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, Info } from "lucide-react";

const PRICING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthlyPriceZAR: 399,
    annualPriceZAR: 3990,
    recommended: false,
    limits: {
      activeClients: 50,
      ordersPerQuarter: 150
    },
    features: [
      "Up to 50 active clients OR 150 orders/quarter",
      "Unlimited client database storage",
      "Lead & quote management",
      "Order processing & calendar",
      "Basic inventory tracking",
      "Email automation (quotes & follow-ups)",
      "Driver management & GPS tracking",
      "Client portal",
      "Kitchen & shopping lists",
      "Email support"
    ]
  },
  {
    id: "professional",
    name: "Professional",
    monthlyPriceZAR: 699,
    annualPriceZAR: 6990,
    recommended: true,
    limits: {
      activeClients: 200,
      ordersPerQuarter: 600
    },
    features: [
      "Up to 200 active clients OR 600 orders/quarter",
      "Everything in Starter, plus:",
      "Multi-region support",
      "Advanced inventory with expiry alerts",
      "Receipt scanning & price tracking",
      "Equipment shortage management",
      "After-sales email automation (6 campaigns)",
      "Priority email support",
      "Custom branding (logo & colors)",
      "Advanced analytics dashboard"
    ]
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceZAR: null,
    annualPriceZAR: null,
    recommended: false,
    limits: {
      activeClients: "Unlimited",
      ordersPerQuarter: "Unlimited"
    },
    features: [
      "Unlimited active clients & orders",
      "Everything in Professional, plus:",
      "White-label branding (remove CateringMS)",
      "Dedicated account manager",
      "Priority phone & email support",
      "Custom integrations",
      "API access",
      "Custom training sessions",
      "SLA guarantee"
    ]
  }
];

const convertCurrency = (zarAmount: number | null) => {
  if (zarAmount === null) return null;
  
  // Formula: (SA Price × 3) ÷ Exchange Rate
  const multipliedAmount = zarAmount * 3;
  
  // Current exchange rates (as of Oct 2025)
  const ZAR_TO_USD = 18.5;
  const ZAR_TO_GBP = 23.5;
  const ZAR_TO_EUR = 20.0;
  
  return {
    zar: zarAmount,
    usd: Math.round(multipliedAmount / ZAR_TO_USD),
    gbp: Math.round(multipliedAmount / ZAR_TO_GBP),
    eur: Math.round(multipliedAmount / ZAR_TO_EUR)
  };
};

const formatCurrency = (amount: number | null, currency: string = "ZAR") => {
  if (amount === null) return "Custom";
  
  const symbols = {
    ZAR: "R",
    USD: "$",
    GBP: "£",
    EUR: "€"
  };
  
  return `${symbols[currency as keyof typeof symbols]}${amount.toLocaleString()}`;
};

export default function PricingPage() {
  const [region, setRegion] = useState<MarketRegion>("za");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");
  const [isLoading, setIsLoading] = useState(true);
  const [livePlans, setLivePlans] = useState<LivePlan[] | null>(null);

  useEffect(() => {
    const initRegion = async () => {
      const pathRegion = getRegionFromPath(window.location.pathname);
      setRegion(pathRegion);
      // Fetch live prices from the platform_pricing_plans table.
      // If the API is down we fall back to the hard-coded defaults
      // baked into pricingCalculator -- the page never blanks.
      try {
        const r = await fetch("/api/platform/pricing-plans");
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.plans) && j.plans.length) setLivePlans(j.plans);
        }
      } catch {
        // ignore -- fallback to baked-in pricing
      }
      setIsLoading(false);
    };

    initRegion();
  }, []);

  const pricingOptions = applyLivePlans(getAllPricingOptions(region), livePlans, region);
  const currency = getRegionCurrency(region);
  const currencyNote =
    region === "za" ? "All prices in South African Rand (ZAR)"
    : region === "us" ? "All prices in US Dollars (USD)"
    : region === "uk" ? "All prices in British Pounds (GBP)"
    : region === "eu" ? "All prices in Euros (EUR)"
    : "All prices in South African Rand (ZAR)";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <Header />

      <main className="container mx-auto px-4 py-16">
        {/* Regional Pricing Notice */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="mb-4">
            {region === "za" && "🇿🇦 South African Pricing"}
            {region === "us" && "🇺🇸 United States Pricing"}
            {region === "uk" && "🇬🇧 United Kingdom Pricing"}
            {region === "eu" && "🇪🇺 European Pricing"}
          </Badge>
          <p className="text-sm text-gray-600">{currencyNote}</p>
          <p className="text-xs text-gray-500 mt-1">
            Base pricing is set in ZAR. International pricing reflects regional market rates.
          </p>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your catering business. All plans include a 14-day free trial.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center items-center gap-4 mb-12">
          <span className={billingCycle === "monthly" ? "font-semibold" : "text-gray-600"}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === "monthly" ? "annually" : "monthly")}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-purple-600"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                billingCycle === "annually" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={billingCycle === "annually" ? "font-semibold" : "text-gray-600"}>
            Annually
            <Badge variant="outline" className="ml-2 bg-green-50">
              Save 15%
            </Badge>
          </span>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {pricingOptions.map((plan, index) => {
            const annualSavings = calculateAnnualSavings(plan.basePrice);
            const displayPrice = billingCycle === "annually" 
              ? formatPrice(annualSavings.annualPrice / 12, currency)
              : plan.displayPrice;

            return (
              <Card 
                key={plan.id}
                className={index === 1 ? "border-2 border-purple-600 relative" : ""}
              >
                {index === 1 && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white">Most Popular</Badge>
                  </div>
                )}
                
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{displayPrice}</span>
                    <span className="text-gray-600">/month</span>
                  </div>
                  {billingCycle === "annually" && (
                    <p className="text-sm text-green-600 mt-2">
                      Save {formatPrice(annualSavings.savings, currency)} per year
                    </p>
                  )}
                  <p className="text-sm text-gray-600 mt-2">
                    Billed {billingCycle === "annually" ? "annually" : "monthly"}
                  </p>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Active Clients</span>
                      <span className="font-semibold">
                        {plan.limits.activeClients === 999999 ? "Unlimited" : `Up to ${plan.limits.activeClients}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Orders per Quarter</span>
                      <span className="font-semibold">
                        {plan.limits.ordersPerQuarter === 999999 ? "Unlimited" : `Up to ${plan.limits.ordersPerQuarter}`}
                      </span>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  <ul className="space-y-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Mobile-Optimized CTA Button */}
                  <Link href="/company-signup" className="block mt-6">
                    <Button 
                      className="w-full h-12 text-base"
                      variant={index === 1 ? "default" : "outline"}
                      size="lg"
                    >
                      Start Free Trial
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pricing Notes */}
        <Card className="max-w-4xl mx-auto mb-16">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Pricing Policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div>
              <h3 className="font-semibold mb-2">Currency Display</h3>
              <p>Prices shown in {currency}. All payments are processed in ZAR (South African Rand). {region !== "za" && "USD, GBP, and EUR are approximate conversions for reference only."}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">USD-Pegged Pricing</h3>
              <p>Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR prices to maintain USD equivalency if significant currency fluctuations occur (exceeding 15% over 90 days). You will receive 30 days advance notice of any price changes.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Billing Limits</h3>
              <p>Pricing is based on whichever limit is reached first: Active Clients OR Orders per Quarter. For example, Starter plan includes up to 50 active clients OR up to 50 orders per quarter.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Free Trial</h3>
              <p>All plans include a 14-day free trial. No credit card required to start. Cancel anytime during the trial period with no charges.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Contact Information</h3>
              <p>
                All support and billing inquiries are handled from our South African office:
                <br />
                <strong>CateringMS</strong> (A product of Skylight Digital)
                <br />
                17 Swalle Street, Golden Acre, South Africa
                <br />
                Tel: 083 652 5755
              </p>
            </div>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Why is the South African pricing more affordable?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-4">
                  This is a question close to our hearts. We're not charging US and UK customers more; we're intentionally charging our fellow South Africans less.
                </p>
                <p className="text-gray-700 mb-4">
                  CateringMS was born from the struggles of running a catering business right here in South Africa. We know the challenges of tight margins, and we also know that many of the powerful tools and APIs that make this platform possible are priced in dollars. The volatile Rand makes it incredibly difficult for local small and medium-sized businesses to invest in the technology they need to grow.
                </p>
                <p className="text-gray-700 font-medium">
                  Our mission is to give South African caterers access to something amazing that can genuinely transform their businesses. We believe this tool will help level the playing field, and our pricing reflects that commitment. The international pricing is still well below market value for comparable solutions, but our SA price is set to empower our local industry first.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What happens if I exceed my plan limits?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">
                  You'll receive a notification when approaching your limits. You can easily upgrade to the next tier at any time. Your new plan will be prorated based on your current billing cycle.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I cancel my subscription anytime?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">
                  Yes! You can cancel your subscription at any time from your account settings. Your access will continue until the end of your current billing period. No refunds for partial months.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do you offer discounts for annual billing?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">
                  Yes! Save 15% by paying annually instead of monthly. Annual subscriptions also receive priority support and early access to new features.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What payment methods do you accept?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">
                  We accept all major credit cards (Visa, Mastercard) via PayFast, Stripe, and other secure payment processors. All transactions are processed in ZAR.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Mobile-Optimized CTA Section */}
        <div className="text-center mt-16 py-12 sm:py-16 px-4 sm:px-8 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
            Ready to Transform Your Catering Business?
          </h2>
          <p className="text-lg sm:text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
            Join hundreds of catering companies already using CateringMS to streamline operations and boost profitability.
          </p>
          
          {/* Mobile-Optimized CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch sm:items-center max-w-md mx-auto">
            <Link href="/company-signup" className="w-full sm:w-auto">
              <Button 
                size="lg" 
                className="w-full sm:w-auto bg-white text-purple-600 hover:bg-purple-50 h-12 px-8 text-base"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/contact" className="w-full sm:w-auto">
              <Button 
                size="lg" 
                variant="outline" 
                className="w-full sm:w-auto border-2 border-white text-white hover:bg-white/10 h-12 px-8 text-base"
              >
                Contact Sales
              </Button>
            </Link>
          </div>
          
          <p className="text-sm text-purple-200 mt-6">
            No credit card required • Cancel anytime • Setup in under 3 hours
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
