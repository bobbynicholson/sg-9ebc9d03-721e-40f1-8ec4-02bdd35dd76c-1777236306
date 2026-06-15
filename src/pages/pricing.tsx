import { useState, useEffect } from "react";
import { getRegionFromPath, getRegionCurrency, type MarketRegion } from "@/lib/geoLocation";
import { getAllPricingOptions, calculateAnnualSavings, formatPrice, applyLivePlans, type LivePlan } from "@/lib/pricingCalculator";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, Info, Sparkles, HelpCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

// Pricing rendering is driven by getAllPricingOptions() + applyLivePlans()
// pulling from /api/platform/pricing-plans (single source of truth in
// platform_pricing_plans). The hard-coded PRICING_PLANS / convertCurrency /
// formatCurrency that used to live here have been removed - they were
// stale copies of the same data and never wired into the JSX.

export default function PricingPage() {
  const [region, setRegion] = useState<MarketRegion>("za");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annually">("monthly");
  const [isLoading, setIsLoading] = useState(true);
  const [livePlans, setLivePlans] = useState<LivePlan[] | null>(null);
  // When a signed-in company views pricing, the plan CTA takes them
  // straight to checkout (upgrade). Logged-out prospects register first.
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setLoggedIn(!!data.session))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const initRegion = async () => {
      const pathRegion = getRegionFromPath(window.location.pathname);
      setRegion(pathRegion);
      // Fetch live prices from the platform_pricing_plans table.
      // If the API is down we fall back to the hard-coded defaults
      // baked into pricingCalculator - the page never blanks.
      try {
        const r = await fetch("/api/platform/pricing-plans");
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.plans) && j.plans.length) setLivePlans(j.plans);
        }
      } catch {
        // ignore - fallback to baked-in pricing
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  const faqs = [
    {
      question: "Why is the South African pricing more affordable?",
      body: (
        <>
          <p className="mb-4 leading-relaxed text-slate-600">
            This is a question close to our hearts. We're not charging US and UK customers more; we're intentionally charging our fellow South Africans less.
          </p>
          <p className="mb-4 leading-relaxed text-slate-600">
            CateringMS was born from the struggles of running a catering business right here in South Africa. We know the challenges of tight margins, and we also know that many of the powerful tools and APIs that make this platform possible are priced in dollars. The volatile Rand makes it incredibly difficult for local small and medium-sized businesses to invest in the technology they need to grow.
          </p>
          <p className="font-medium leading-relaxed text-slate-700">
            Our mission is to give South African caterers access to something amazing that can genuinely transform their businesses. We believe this tool will help level the playing field, and our pricing reflects that commitment. The international pricing is still well below market value for comparable solutions, but our SA price is set to empower our local industry first.
          </p>
        </>
      ),
    },
    {
      question: "What happens if I exceed my plan limits?",
      body: (
        <p className="leading-relaxed text-slate-600">
          You'll receive a notification when approaching your limits. You can easily upgrade to the next tier at any time. Your new plan will be prorated based on your current billing cycle.
        </p>
      ),
    },
    {
      question: "Can I cancel my subscription anytime?",
      body: (
        <p className="leading-relaxed text-slate-600">
          Yes! You can cancel your subscription at any time from your account settings. Your access will continue until the end of your current billing period. No refunds for partial months.
        </p>
      ),
    },
    {
      question: "Do you offer discounts for annual billing?",
      body: (
        <p className="leading-relaxed text-slate-600">
          Yes! Save 15% by paying annually instead of monthly. Annual subscriptions also receive priority support and early access to new features.
        </p>
      ),
    },
    {
      question: "What payment methods do you accept?",
      body: (
        <p className="leading-relaxed text-slate-600">
          We accept all major credit cards (Visa, Mastercard) via PayFast, Stripe, and other secure payment processors. All transactions are processed in ZAR.
        </p>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-16 md:py-20">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden">
          {/* Soft brand glow, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.10),transparent)]" />

          <Stagger className="relative mx-auto max-w-3xl text-center" gap={0.07}>
            <StaggerItem className="mb-6 flex justify-center">
              <Eyebrow icon={Sparkles} className="border-violet-200 bg-violet-50 text-violet-700">
                {region === "za" && "South African Pricing"}
                {region === "us" && "United States Pricing"}
                {region === "uk" && "United Kingdom Pricing"}
                {region === "eu" && "European Pricing"}
              </Eyebrow>
            </StaggerItem>

            <StaggerItem>
              <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Simple, transparent{" "}
                <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                  pricing
                </span>
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                Choose the plan that fits your catering business. All plans include a 14-day free trial.
              </p>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-4 text-sm text-slate-500">{currencyNote}</p>
              <p className="mt-1 text-xs text-slate-400">
                Base pricing is set in ZAR. International pricing reflects regional market rates.
              </p>
            </StaggerItem>
          </Stagger>
        </section>

        {/* ===================== BILLING TOGGLE =====================
            Interactive control the user clicks repeatedly -> NO scroll-reveal.
            Restyle only; the knob keeps a crisp, explicit transition. */}
        <div className="mt-10 mb-12 flex items-center justify-center gap-4">
          <span className={billingCycle === "monthly" ? "font-semibold text-slate-900" : "text-slate-500"}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === "monthly" ? "annually" : "monthly")}
            aria-label="Toggle billing cycle"
            className={`relative inline-flex h-6 w-11 items-center rounded-full bg-violet-600 ${btnPress}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${EASE} ${
                billingCycle === "annually" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={`flex items-center ${billingCycle === "annually" ? "font-semibold text-slate-900" : "text-slate-500"}`}>
            Annually
            <Badge variant="outline" className="ml-2 border-emerald-200 bg-emerald-50 text-emerald-700">
              Save 15%
            </Badge>
          </span>
        </div>

        {/* ===================== PRICING CARDS ===================== */}
        <Stagger className="mx-auto mb-20 grid max-w-6xl gap-8 md:grid-cols-3" gap={0.08}>
          {pricingOptions.map((plan, index) => {
            const annualSavings = calculateAnnualSavings(plan.basePrice);
            const displayPrice = billingCycle === "annually"
              ? formatPrice(annualSavings.annualPrice / 12, currency)
              : plan.displayPrice;
            const highlighted = index === 1;

            return (
              <StaggerItem key={plan.id} className="h-full">
                <div
                  className={`${cardBase} relative flex h-full flex-col p-7 ${
                    highlighted
                      ? "border-2 border-violet-600 shadow-xl shadow-violet-600/10 md:-translate-y-2"
                      : ""
                  }`}
                >
                  {highlighted && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1 text-white shadow-md shadow-violet-600/20">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  {/* Header */}
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">{plan.name}</h2>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight text-slate-900">{displayPrice}</span>
                      <span className="text-slate-500">/month</span>
                    </div>
                    {billingCycle === "annually" && (
                      <p className="mt-2 text-sm font-medium text-emerald-600">
                        Save {formatPrice(annualSavings.savings, currency)} per year
                      </p>
                    )}
                    <p className="mt-2 text-sm text-slate-500">
                      Billed {billingCycle === "annually" ? "annually" : "monthly"}
                    </p>
                  </div>

                  {/* Limits */}
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Active Clients</span>
                      <span className="font-semibold text-slate-900">
                        {plan.limits.activeClients === 999999 ? "Unlimited" : `Up to ${plan.limits.activeClients}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Orders per Quarter</span>
                      <span className="font-semibold text-slate-900">
                        {plan.limits.ordersPerQuarter === 999999 ? "Unlimited" : `Up to ${plan.limits.ordersPerQuarter}`}
                      </span>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* Features */}
                  <ul className="flex-1 space-y-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                        <span className="text-sm leading-relaxed text-slate-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Mobile-Optimized CTA Button.
                      Signed-in companies go straight to checkout for the
                      chosen plan; prospects register first (then upgrade
                      from Admin -> Subscription). The middle tier's slug
                      is "pro" here but "professional" in the billing
                      plans (getPlanById), so map it. */}
                  {(() => {
                    const checkoutPlanId = plan.id === "pro" ? "professional" : plan.id;
                    const cycleParam = billingCycle === "annually" ? "annual" : "monthly";
                    const href = loggedIn
                      ? `/subscription/checkout?plan=${checkoutPlanId}&cycle=${cycleParam}`
                      : "/company-signup";
                    return (
                      <Link href={href} className="mt-7 block">
                        <Button
                          className={`h-12 w-full rounded-full text-base font-semibold ${
                            highlighted
                              ? "bg-gradient-to-b from-violet-600 to-violet-700 text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 hover:shadow-xl hover:shadow-violet-600/30"
                              : ""
                          }`}
                          variant={highlighted ? "default" : "outline"}
                          size="lg"
                        >
                          {loggedIn ? "Choose this plan" : "Start Free Trial"}
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </Button>
                      </Link>
                    );
                  })()}
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>

        {/* ===================== PRICING POLICY ===================== */}
        <Reveal className="mx-auto mb-20 max-w-4xl">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 md:p-10">
            <div className="mb-6 flex items-center gap-3">
              <div className={`${iconChip} h-11 w-11 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                <Info className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Pricing Policy</h2>
            </div>

            <div className="grid gap-6 text-sm md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold text-slate-900">Currency Display</h3>
                <p className="leading-relaxed text-slate-600">Prices shown in {currency}. All payments are processed in ZAR (South African Rand). {region !== "za" && "USD, GBP, and EUR are approximate conversions for reference only."}</p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-slate-900">USD-Pegged Pricing</h3>
                <p className="leading-relaxed text-slate-600">Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR prices to maintain USD equivalency if significant currency fluctuations occur (exceeding 15% over 90 days). You will receive 30 days advance notice of any price changes.</p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-slate-900">Billing Limits</h3>
                <p className="leading-relaxed text-slate-600">Pricing is based on whichever limit is reached first: Active Clients OR Orders per Quarter. For example, Starter plan includes up to 50 active clients OR up to 50 orders per quarter.</p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-slate-900">Free Trial</h3>
                <p className="leading-relaxed text-slate-600">All plans include a 14-day free trial. No credit card required to start. Cancel anytime during the trial period with no charges.</p>
              </div>

              <div className="md:col-span-2">
                <h3 className="mb-2 font-semibold text-slate-900">Contact Information</h3>
                <p className="leading-relaxed text-slate-600">
                  All support and billing inquiries are handled from our South African office:
                  <br />
                  <strong className="text-slate-900">CateringMS</strong> (A product of Skylight Digital)
                  <br />
                  17 Swalle Street, Golden Acre, South Africa
                  <br />
                  Tel: 083 652 5755
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ===================== FAQ ===================== */}
        <section className="mx-auto mb-20 max-w-4xl">
          <Reveal className="mb-12 text-center">
            <Eyebrow icon={HelpCircle} className="border-blue-200 bg-blue-50 text-blue-600">
              Common questions
            </Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Frequently Asked Questions
            </h2>
          </Reveal>

          <Stagger className="space-y-4" gap={0.05}>
            {faqs.map((faq, index) => (
              <StaggerItem key={index}>
                <div className={`rounded-2xl border border-slate-200 bg-white p-6 transition-[border-color,box-shadow] duration-300 ${EASE} hover:border-violet-200 hover:shadow-sm`}>
                  <h3 className="mb-3 flex items-start gap-3 text-lg font-semibold text-slate-900">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                    {faq.question}
                  </h3>
                  <div className="pl-8">{faq.body}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12">
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
          <div className="relative mx-auto max-w-3xl">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to Transform Your Catering Business?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
              Join hundreds of catering companies already using CateringMS to streamline operations and boost profitability.
            </p>

            {/* Mobile-Optimized CTA Buttons */}
            <div className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <Link href="/company-signup" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/contact" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className={`h-12 w-full rounded-full border-white/60 bg-transparent px-9 text-base font-semibold text-white hover:border-white hover:bg-white/10 sm:w-auto ${btnPress}`}
                >
                  Contact Sales
                </Button>
              </Link>
            </div>

            <p className="mt-6 text-sm text-violet-100">
              No credit card required · Cancel anytime · Setup in under 3 hours
            </p>
          </div>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
