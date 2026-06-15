import { useState, useEffect } from "react";
import { getRegionFromPath, getRegionCurrency, type MarketRegion } from "@/lib/geoLocation";
import { getAllPricingOptions, calculateAnnualSavings, formatPrice, applyLivePlans, type LivePlan } from "@/lib/pricingCalculator";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

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
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-amber-600 motion-reduce:animate-none"></div>
      </div>
    );
  }

  const faqs = [
    {
      question: "Why is the South African pricing more affordable?",
      body: (
        <>
          <p className="mb-4 leading-relaxed text-stone-600">
            This is a question close to our hearts. We're not charging US and UK customers more; we're intentionally charging our fellow South Africans less.
          </p>
          <p className="mb-4 leading-relaxed text-stone-600">
            CateringMS was born from the struggles of running a catering business right here in South Africa. We know the challenges of tight margins, and we also know that many of the powerful tools and APIs that make this platform possible are priced in dollars. The volatile Rand makes it incredibly difficult for local small and medium-sized businesses to invest in the technology they need to grow.
          </p>
          <p className="font-medium leading-relaxed text-stone-700">
            Our mission is to give South African caterers access to something amazing that can genuinely transform their businesses. We believe this tool will help level the playing field, and our pricing reflects that commitment. The international pricing is still well below market value for comparable solutions, but our SA price is set to empower our local industry first.
          </p>
        </>
      ),
    },
    {
      question: "What happens if I exceed my plan limits?",
      body: (
        <p className="leading-relaxed text-stone-600">
          You'll receive a notification when approaching your limits. You can easily upgrade to the next tier at any time. Your new plan will be prorated based on your current billing cycle.
        </p>
      ),
    },
    {
      question: "Can I cancel my subscription anytime?",
      body: (
        <p className="leading-relaxed text-stone-600">
          Yes! You can cancel your subscription at any time from your account settings. Your access will continue until the end of your current billing period. No refunds for partial months.
        </p>
      ),
    },
    {
      question: "Do you offer discounts for annual billing?",
      body: (
        <p className="leading-relaxed text-stone-600">
          Yes! Save 15% by paying annually instead of monthly. Annual subscriptions also receive priority support and early access to new features.
        </p>
      ),
    },
    {
      question: "What payment methods do you accept?",
      body: (
        <p className="leading-relaxed text-stone-600">
          We accept all major credit cards (Visa, Mastercard) via PayFast, Stripe, and other secure payment processors. All transactions are processed in ZAR.
        </p>
      ),
    },
  ];

  return (
    <div className="font-body min-h-screen bg-stone-50 text-stone-900">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-16 md:py-24">
        {/* ===================== HERO ===================== */}
        <section>
          <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
            <StaggerItem>
              <h1 className="text-balance font-display text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
                Simple, transparent{" "}
                <span className="text-amber-700">pricing</span>
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                Choose the plan that fits your catering business. All plans include a 14-day free trial.
              </p>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-5 text-sm font-medium text-stone-600">{currencyNote}</p>
              <p className="mt-1 text-xs text-stone-500">
                Base pricing is set in ZAR. International pricing reflects regional market rates.
              </p>
            </StaggerItem>
          </Stagger>
        </section>

        {/* ===================== BILLING TOGGLE =====================
            Interactive control the user clicks repeatedly -> NO scroll-reveal.
            Restyle only; the knob keeps a crisp, explicit transition. */}
        <div className="mb-14 mt-12 flex items-center justify-center gap-4">
          <span className={billingCycle === "monthly" ? "font-semibold text-stone-900" : "text-stone-500"}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === "monthly" ? "annually" : "monthly")}
            aria-label="Toggle billing cycle"
            className={`relative inline-flex h-6 w-11 items-center rounded-full bg-amber-600 ${btnPress}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${EASE} ${
                billingCycle === "annually" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={`flex items-center ${billingCycle === "annually" ? "font-semibold text-stone-900" : "text-stone-500"}`}>
            Annually
            <Badge variant="outline" className="ml-2 border-emerald-300 bg-emerald-50 text-emerald-800">
              Save 15%
            </Badge>
          </span>
        </div>

        {/* ===================== PRICING CARDS =====================
            The popular tier carries the emphasis: amber border, lift, solid
            amber CTA. The flanking tiers stay deliberately quiet (hairline
            border, ghost CTA) so the eye lands on the recommended plan rather
            than reading three identical cards. */}
        <Stagger className="mx-auto mb-24 grid max-w-6xl items-stretch gap-8 md:grid-cols-3" gap={0.08}>
          {pricingOptions.map((plan, index) => {
            const annualSavings = calculateAnnualSavings(plan.basePrice);
            const displayPrice = billingCycle === "annually"
              ? formatPrice(annualSavings.annualPrice / 12, currency)
              : plan.displayPrice;
            const highlighted = index === 1;

            return (
              <StaggerItem key={plan.id} className="h-full">
                <div
                  className={`relative flex h-full flex-col rounded-2xl bg-white transition-[transform,box-shadow,border-color] duration-300 ${EASE} ${
                    highlighted
                      ? "border-2 border-amber-600 p-8 shadow-xl shadow-amber-700/10 md:-translate-y-3 md:p-9"
                      : "border border-stone-200 p-7 hover:-translate-y-1 hover:border-stone-300 hover:shadow-lg"
                  }`}
                >
                  {highlighted && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-amber-600 px-3 py-1 text-white shadow-md shadow-amber-700/20">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  {/* Header */}
                  <div>
                    <h2 className={`font-display font-semibold tracking-tight text-stone-900 ${highlighted ? "text-2xl" : "text-xl"}`}>
                      {plan.name}
                    </h2>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="font-display text-4xl font-semibold tracking-tight text-stone-900">{displayPrice}</span>
                      <span className="text-stone-500">/month</span>
                    </div>
                    {billingCycle === "annually" && (
                      <p className="mt-2 text-sm font-medium text-emerald-700">
                        Save {formatPrice(annualSavings.savings, currency)} per year
                      </p>
                    )}
                    <p className="mt-2 text-sm text-stone-500">
                      Billed {billingCycle === "annually" ? "annually" : "monthly"}
                    </p>
                  </div>

                  {/* Limits */}
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">Active Clients</span>
                      <span className="font-semibold text-stone-900">
                        {plan.limits.activeClients === 999999 ? "Unlimited" : `Up to ${plan.limits.activeClients}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">Orders per Quarter</span>
                      <span className="font-semibold text-stone-900">
                        {plan.limits.ordersPerQuarter === 999999 ? "Unlimited" : `Up to ${plan.limits.ordersPerQuarter}`}
                      </span>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* Features */}
                  <ul className="flex-1 space-y-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2.5">
                        <Check className={`mt-0.5 h-5 w-5 flex-shrink-0 ${highlighted ? "text-amber-600" : "text-stone-400"}`} />
                        <span className="text-sm leading-relaxed text-stone-700">{feature}</span>
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
                          className={`group h-12 w-full rounded-full text-base font-semibold ${
                            highlighted
                              ? `bg-amber-600 text-white shadow-lg shadow-amber-700/20 hover:bg-amber-700 hover:shadow-xl hover:shadow-amber-700/30 ${btnPress}`
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

        {/* ===================== PRICING POLICY =====================
            A single quiet reference panel, not a card grid. The detail lives
            in a definition list so it reads as documentation, not as feature
            tiles competing with the pricing above. */}
        <Reveal className="mx-auto mb-24 max-w-4xl">
          <div className="rounded-3xl border border-stone-200 bg-white p-8 md:p-10">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Pricing policy</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
              The detail behind the numbers, so there are no surprises on your invoice.
            </p>

            <dl className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-2">
              <div>
                <dt className="font-semibold text-stone-900">Currency Display</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-stone-600">Prices shown in {currency}. All payments are processed in ZAR (South African Rand). {region !== "za" && "USD, GBP, and EUR are approximate conversions for reference only."}</dd>
              </div>

              <div>
                <dt className="font-semibold text-stone-900">USD-Pegged Pricing</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-stone-600">Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR prices to maintain USD equivalency if significant currency fluctuations occur (exceeding 15% over 90 days). You will receive 30 days advance notice of any price changes.</dd>
              </div>

              <div>
                <dt className="font-semibold text-stone-900">Billing Limits</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-stone-600">Pricing is based on whichever limit is reached first: Active Clients OR Orders per Quarter. For example, Starter plan includes up to 50 active clients OR up to 50 orders per quarter.</dd>
              </div>

              <div>
                <dt className="font-semibold text-stone-900">Free Trial</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-stone-600">All plans include a 14-day free trial. No credit card required to start. Cancel anytime during the trial period with no charges.</dd>
              </div>

              <div className="md:col-span-2">
                <dt className="font-semibold text-stone-900">Contact Information</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-stone-600">
                  All support and billing inquiries are handled from our South African office:
                  <br />
                  <strong className="text-stone-900">CateringMS</strong> (A product of Skylight Digital)
                  <br />
                  17 Swalle Street, Golden Acre, South Africa
                  <br />
                  Tel: 083 652 5755
                </dd>
              </div>
            </dl>
          </div>
        </Reveal>

        {/* ===================== FAQ =====================
            A divided list rather than a stack of identical cards: one quiet
            container, hairline dividers, questions carry the weight. */}
        <section className="mx-auto mb-24 max-w-3xl">
          <Reveal className="mb-10 text-center">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              Frequently asked questions
            </h2>
          </Reveal>

          <Stagger className="divide-y divide-stone-200 border-y border-stone-200">
            {faqs.map((faq, index) => (
              <StaggerItem key={index}>
                <div className="py-7">
                  <h3 className="text-lg font-semibold text-stone-900">
                    {faq.question}
                  </h3>
                  <div className="mt-3">{faq.body}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-stone-950 px-6 py-16 text-center sm:px-12">
          <div className="relative mx-auto max-w-3xl">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to transform your catering business?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-300 sm:text-xl">
              Join hundreds of catering companies already using CateringMS to streamline operations and boost profitability.
            </p>

            {/* Mobile-Optimized CTA Buttons */}
            <div className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <Link href="/company-signup" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className={`group h-12 w-full rounded-full bg-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-900/30 hover:bg-amber-700 sm:w-auto ${btnPress}`}
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/contact" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className={`h-12 w-full rounded-full border-white/30 bg-transparent px-9 text-base font-semibold text-white hover:border-white/60 hover:bg-white/10 sm:w-auto ${btnPress}`}
                >
                  Contact Sales
                </Button>
              </Link>
            </div>

            <p className="mt-6 text-sm text-stone-400">
              No credit card required · Cancel anytime · Setup in under 3 hours
            </p>
          </div>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
