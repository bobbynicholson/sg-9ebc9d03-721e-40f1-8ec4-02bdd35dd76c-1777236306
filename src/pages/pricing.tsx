import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Check, 
  Zap, 
  TrendingUp, 
  Shield, 
  Users, 
  Star,
  ArrowRight,
  Sparkles,
  Clock,
  Target,
  Award,
  ChevronRight,
  Info
} from "lucide-react";

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
  
  const USD_RATE = 0.055;
  const GBP_RATE = 0.043;
  const EUR_RATE = 0.050;
  
  return {
    zar: zarAmount,
    usd: Math.round(zarAmount * USD_RATE),
    gbp: Math.round(zarAmount * GBP_RATE),
    eur: Math.round(zarAmount * EUR_RATE)
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
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");

  const handleSelectPlan = (planId: string) => {
    if (planId === "enterprise") {
      router.push("/contact?subject=Enterprise Plan Inquiry");
    } else {
      router.push(`/subscription/checkout?plan=${planId}&cycle=${billingCycle}`);
    }
  };

  const calculateSavings = (monthlyPrice: number, annualPrice: number) => {
    const annualCostIfMonthly = monthlyPrice * 12;
    const savings = annualCostIfMonthly - annualPrice;
    const percentage = Math.round((savings / annualCostIfMonthly) * 100);
    return { amount: savings, percentage };
  };

  return (
    <TooltipProvider>
      <Head>
        <title>Pricing Plans - CateringMS | Simple & Transparent Pricing</title>
        <meta name="description" content="Choose the perfect plan for your catering business. Starting at R399/month with 14-day free trial. Flexible limits based on active clients or orders per quarter." />
        <meta name="keywords" content="catering software pricing, catering management cost, subscription plans, free trial, affordable catering software" />
        <link rel="canonical" href="https://cateringms.com/pricing" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-12 max-w-7xl">
          <div className="text-center mb-12 space-y-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 px-4 py-1.5 text-sm">
                <Sparkles className="w-3 h-3 mr-1.5" />
                14-Day Free Trial on All Plans
              </Badge>
            </div>
            
            <h1 className="text-5xl font-bold bg-gradient-to-r from-slate-900 via-purple-800 to-slate-900 bg-clip-text text-transparent leading-tight">
              Simple, Transparent Pricing
            </h1>
            
            <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Choose the plan that fits your catering business. Flexible limits that grow with you.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-600" />
                <span className="text-sm text-slate-600">No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-slate-600">Cancel anytime</span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" />
                <span className="text-sm text-slate-600">Setup in 5 minutes</span>
              </div>
            </div>

            <div className="flex justify-center pt-6">
              <Tabs value={billingCycle} onValueChange={(value) => setBillingCycle(value as "monthly" | "annual")} className="w-auto">
                <TabsList className="grid w-auto grid-cols-2 h-12 p-1">
                  <TabsTrigger value="monthly" className="px-8 text-base">
                    Monthly
                  </TabsTrigger>
                  <TabsTrigger value="annual" className="px-8 text-base relative">
                    Annual
                    <Badge className="ml-2 bg-green-500 text-white text-xs px-2 py-0.5">
                      Save 17%
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {PRICING_PLANS.map((plan) => {
              const price = plan.monthlyPriceZAR ? (billingCycle === "monthly" ? plan.monthlyPriceZAR : plan.annualPriceZAR) : null;
              const monthlyEquivalent = price && billingCycle === "annual" ? Math.round(price / 12) : plan.monthlyPriceZAR;
              const savings = plan.monthlyPriceZAR && plan.annualPriceZAR && billingCycle === "annual" 
                ? calculateSavings(plan.monthlyPriceZAR, plan.annualPriceZAR) 
                : null;
              
              const currencies = monthlyEquivalent ? convertCurrency(monthlyEquivalent) : null;

              return (
                <Card 
                  key={plan.id} 
                  className={`relative border-2 transition-all duration-300 hover:shadow-2xl ${
                    plan.recommended 
                      ? "border-purple-500 shadow-xl scale-105" 
                      : "border-slate-200 hover:border-purple-300"
                  }`}
                >
                  {plan.recommended && (
                    <div className="absolute -top-4 left-0 right-0 flex justify-center">
                      <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 px-6 py-1.5 text-sm font-semibold shadow-lg">
                        <Star className="w-3 h-3 mr-1.5" />
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className={plan.recommended ? "pt-8" : ""}>
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                    <CardDescription className="text-base">
                      {plan.id === "starter" && "Perfect for small catering businesses starting out"}
                      {plan.id === "professional" && "Ideal for growing operations with multiple events"}
                      {plan.id === "enterprise" && "Built for large-scale catering enterprises"}
                    </CardDescription>
                    
                    <div className="pt-6 space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-bold">
                          {currencies ? formatCurrency(currencies.zar, "ZAR") : "Custom"}
                        </span>
                        {currencies && <span className="text-slate-600 text-lg">/month</span>}
                      </div>
                      
                      {currencies && (
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500">
                            ≈ {formatCurrency(currencies.usd, "USD")} | {formatCurrency(currencies.gbp, "GBP")} | {formatCurrency(currencies.eur, "EUR")}
                          </p>
                          {billingCycle === "annual" && price && (
                            <>
                              <p className="text-sm text-slate-600">
                                Billed annually at {formatCurrency(price, "ZAR")}
                              </p>
                              {savings && (
                                <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                                  <TrendingUp className="w-4 h-4" />
                                  <span>Save {formatCurrency(savings.amount, "ZAR")} ({savings.percentage}%)</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {plan.id !== "enterprise" && (
                        <div className="flex items-center gap-1 pt-2">
                          <span className="text-sm font-medium text-slate-700">
                            {plan.limits.activeClients} active clients OR {plan.limits.ordersPerQuarter} orders/quarter
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-4 h-4 text-slate-400 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-semibold mb-2">Whichever Comes First</p>
                              <p className="text-sm mb-2">Your plan limit is based on whichever metric you reach first.</p>
                              <p className="text-sm mb-2"><strong>Active Clients:</strong> Clients who placed at least one order in the last 90 days. Importing existing clients does not count until they place new orders.</p>
                              <p className="text-sm"><strong>Orders per Quarter:</strong> Total orders in a 3-month period (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec). This smooths seasonal fluctuations.</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <Button 
                      onClick={() => handleSelectPlan(plan.id)}
                      className={`w-full h-12 text-base font-semibold ${
                        plan.recommended
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                          : "bg-slate-900 hover:bg-slate-800"
                      }`}
                    >
                      {plan.id === "enterprise" ? "Contact Sales" : "Start Free Trial"}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>

                    <div className="space-y-3 pt-2">
                      <p className="text-sm font-semibold text-slate-900">Everything in {plan.name}:</p>
                      {plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-slate-700 leading-relaxed">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>

                  <CardFooter className="flex justify-center border-t pt-6">
                    <Link href="/features">
                      <Button variant="ghost" className="text-purple-600 hover:text-purple-700">
                        View all features
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          <div className="bg-slate-50 rounded-2xl p-8 mb-12 border border-slate-200">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
              <div className="space-y-2">
                <h3 className="font-semibold text-lg text-slate-900">Important Pricing Information</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold">•</span>
                    <span><strong>Currency Display:</strong> Prices shown in ZAR (South African Rand). USD, GBP, and EUR are approximate conversions for reference only. All payments are processed in ZAR.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold">•</span>
                    <span><strong>USD-Pegged Pricing:</strong> Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR prices to maintain USD equivalency if significant currency fluctuations occur (exceeding 15% over 90 days). You will receive 30 days advance notice of any price changes.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold">•</span>
                    <span><strong>Database Storage:</strong> All plans include unlimited client database storage. You only pay for active clients (those who ordered in the last 90 days) or total orders per quarter, whichever limit you reach first.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-12 mb-16">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <h2 className="text-3xl font-bold text-slate-900">Why Catering Businesses Choose CateringMS</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6">
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg">Estimated Cost Savings</h3>
                  <p className="text-sm text-slate-600">
                    Potential to save R10,000-12,000/month through automation and efficiency gains (based on industry data)
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg">30-40 Hours Saved</h3>
                  <p className="text-sm text-slate-600">
                    Estimated time savings from eliminating manual admin work every month
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center mx-auto">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg">12-15% More Bookings</h3>
                  <p className="text-sm text-slate-600">
                    Estimated increase from automated follow-ups and professional quotes
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 pt-4">
                * Estimated figures based on industry knowledge and average catering business operations. Actual results may vary.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-12 mb-16">
            <h2 className="text-3xl font-bold text-center mb-10">Frequently Asked Questions</h2>
            
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">How does the "whichever comes first" limit work?</h3>
                <p className="text-slate-600">
                  Your plan limit is based on whichever metric you reach first. For example, if you are on the Starter plan and have 45 active clients but 160 orders in the quarter, you would need to upgrade to Professional because you exceeded the 150 orders/quarter limit (even though you are under the 50 active clients limit).
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-lg">What counts as an "active client"?</h3>
                <p className="text-slate-600">
                  An active client is someone who has placed at least one order in the last 90 days. If you import 3,000 existing clients into the system, they do not count toward your limit until they place new orders through the platform.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Why quarterly orders instead of monthly?</h3>
                <p className="text-slate-600">
                  Quarterly limits smooth out seasonal fluctuations in the catering business. You might have 200 orders in December but only 30 in February. Quarterly billing prevents your plan from bouncing between tiers every month.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-lg">How does the free trial work?</h3>
                <p className="text-slate-600">
                  Start your 14-day free trial with full access to all features in your chosen plan. No credit card required to start. You will only be charged after your trial ends if you decide to continue.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Can I change plans later?</h3>
                <p className="text-slate-600">
                  Absolutely! You can upgrade or downgrade your plan at any time. If you upgrade, the change is immediate. If you downgrade, the change takes effect at the end of your current billing cycle.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-lg">What happens if I exceed my plan limits?</h3>
                <p className="text-slate-600">
                  We will notify you when you approach your limits. You can upgrade to the next tier at any time. We will never shut off your access without notice.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-12 text-center text-white">
            <div className="max-w-3xl mx-auto space-y-6">
              <Zap className="w-16 h-16 mx-auto" />
              <h2 className="text-4xl font-bold">Ready to Transform Your Catering Business?</h2>
              <p className="text-xl text-purple-100">
                Join catering companies saving time, reducing costs, and growing their business with CateringMS.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button 
                  size="lg"
                  onClick={() => handleSelectPlan("professional")}
                  className="bg-white text-purple-600 hover:bg-slate-100 h-14 px-8 text-lg font-semibold"
                >
                  Start Your Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Link href="/features">
                  <Button 
                    size="lg"
                    variant="outline"
                    className="border-2 border-white text-white hover:bg-white/10 h-14 px-8 text-lg font-semibold"
                  >
                    Explore Features
                  </Button>
                </Link>
              </div>
              <p className="text-sm text-purple-200 pt-4">
                <Users className="w-4 h-4 inline mr-1" />
                Trusted by growing catering businesses across South Africa
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
