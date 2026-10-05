import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Check,
  Shield,
  Lock,
  CreditCard,
  Calendar,
  Zap,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { getPlanById, formatCurrency } from "@/lib/payfastService";
import { PLATFORM_TRIAL_DAYS } from "@/lib/platformBilling";
import { applyPlatformPricingToPlan } from "@/lib/platformSubscriptionPlans";
import type { LivePlan } from "@/lib/pricingCalculator";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";
import { isPayfastTestPlan, isPayfastTestTenant } from "@/lib/payfastTestPlan";

type PlanProvider = "payfast" | "stripe" | "yoco";
const PROVIDER_LABELS: Record<PlanProvider, string> = { payfast: "PayFast", stripe: "Stripe", yoco: "Yoco" };
const PROVIDER_HINTS: Record<PlanProvider, string> = {
  payfast: "Card or EFT, auto-renews",
  stripe: "Card, auto-renews",
  yoco: "Card, prepaid per period",
};

export default function CheckoutPage() {
  const router = useRouter();
  const { plan: planId, cycle } = router.query;
  // The buyer is the logged-in catering company upgrading their plan.
  // We pass their company_id to PayFast (custom_str1) so the subscription
  // webhook can flip THIS company to 'active'. Prospects who aren't
  // signed in yet are sent to register first (a subscription must attach
  // to a real company).
  const { user, profile, company: authCompany, loading: authLoading } = useAuth() as any;
  const companyId: string | null = authCompany?.id || profile?.company_id || null;

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    (cycle as "monthly" | "annual") || "monthly"
  );
  const [livePlans, setLivePlans] = useState<LivePlan[] | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<Record<PlanProvider, boolean> | null>(null);
  const [provider, setProvider] = useState<PlanProvider>("payfast");

  const selectedPlanId = typeof planId === "string" ? planId : "";
  const isTestPlan = isPayfastTestPlan(selectedPlanId);
  const routeTenantSlug = getTenantSlugFromPathname(router.asPath);
  const basePlan = selectedPlanId ? getPlanById(selectedPlanId) : undefined;
  const plan = basePlan
    ? applyPlatformPricingToPlan(selectedPlanId, livePlans) || basePlan
    : undefined;
  const trialEndDate = authCompany?.trial_ends_at ? new Date(authCompany.trial_ends_at) : null;
  const hasTrial = !isTestPlan && authCompany?.subscription_status === "trial" && !!trialEndDate && trialEndDate.getTime() > Date.now();

  useEffect(() => {
    if (!plan && planId) {
      router.push("/pricing");
    }
  }, [plan, planId, router]);

  useEffect(() => {
    if (isTestPlan && !isPayfastTestTenant(routeTenantSlug)) {
      router.replace("/admin/subscription");
      return;
    }
    if (isTestPlan) setBillingCycle("monthly");
  }, [isTestPlan, routeTenantSlug, router]);

  useEffect(() => {
    if (!isTestPlan && (cycle === "monthly" || cycle === "annual")) setBillingCycle(cycle);
  }, [cycle, isTestPlan]);

  // Which platform payment providers are configured for plan billing.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription/providers", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body?.providers) return;
        setProviders(body.providers);
        const first = (["payfast", "stripe", "yoco"] as PlanProvider[]).find((key) => body.providers[key]);
        const requested = new URLSearchParams(window.location.search).get("provider") as PlanProvider | null;
        setProvider((current) => (requested && body.providers[requested] ? requested : body.providers[current] ? current : first || "payfast"));
      })
      .catch(() => { /* PayFast stays the default; the server rejects an unconfigured provider. */ });
    return () => { cancelled = true; };
  }, []);

  // Returning with the browser Back button from the payment page restores
  // this page from cache with the button still "Processing...". Reset it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsProcessing(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/pricing-plans")
      .then(async (response) => {
        if (!response.ok) throw new Error("Live pricing unavailable");
        return response.json();
      })
      .then((body) => {
        if (!cancelled && Array.isArray(body?.plans)) setLivePlans(body.plans);
      })
      .catch(() => {
        // The in-code plan prices are the documented fallback when the
        // public pricing endpoint is unavailable.
      });
    return () => { cancelled = true; };
  }, []);

  // Prefill the form from the signed-in company's profile.
  useEffect(() => {
    if (profile?.full_name) {
      const parts = String(profile.full_name).trim().split(/\s+/);
      setFirstName((p) => p || parts[0] || "");
      setLastName((p) => p || parts.slice(1).join(" ") || "");
    }
    const e = profile?.email || user?.email;
    if (e) setEmail((p) => p || e);
    if (authCompany?.company_name) setCompany((p) => p || authCompany.company_name);
  }, [profile, user, authCompany]);

  // A subscription has to attach to a real company. If the visitor isn't
  // signed in (a prospect arriving from /pricing), send them to register
  // first - they get a trial, then upgrade from Admin -> Subscription.
  useEffect(() => {
    if (!authLoading && !user && planId) {
      router.replace("/company-signup");
    }
  }, [authLoading, user, planId, router]);

  if (!plan) {
    return null;
  }

  const amount = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
  const monthlyEquivalent = billingCycle === "annual" ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
  const savings = billingCycle === "annual" ? plan.monthlyPrice * 12 - plan.annualPrice : 0;
  const savingsPercentage = billingCycle === "annual" ? Math.round((savings / (plan.monthlyPrice * 12)) * 100) : 0;

  const activeProvider: PlanProvider = isTestPlan ? "payfast" : provider;
  const providerName = PROVIDER_LABELS[activeProvider];
  const isPrepaid = activeProvider === "yoco";
  // Stripe/PayFast defer the first charge to the end of a trial. Yoco
  // charges now; its paid period simply starts when the trial ends.
  const deferredTrial = hasTrial && !isPrepaid;
  const availableProviders = (["payfast", "stripe", "yoco"] as PlanProvider[]).filter((key) => providers?.[key]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setError("");

    if (!agreeTerms) {
      setError("Please agree to the terms and conditions");
      return;
    }

    if (!firstName || !lastName || !email) {
      setError("Please fill in all required fields");
      return;
    }

    setIsProcessing(true);

    try {
      // Build + sign the PayFast subscription form SERVER-side so the
      // passphrase never reaches the browser and the company_id is
      // resolved from the session (not spoofable). The server returns a
      // self-submitting <form>; we inject + submit it - same pattern as
      // the order/deposit payment page.
      const resp = await fetch("/api/subscription/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          cycle: billingCycle,
          firstName,
          lastName,
          email,
          provider: activeProvider,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json?.ok && typeof json.url === "string") {
        // Stripe / Yoco hosted checkout. Access is granted only after the
        // provider confirms the payment, never by this redirect.
        window.location.assign(json.url);
        return;
      }
      if (!resp.ok || !json?.ok || !json?.html) {
        setError(json?.error || (resp.status >= 500
          ? "The payment service is temporarily unavailable. Nothing was charged - please try again."
          : "Could not start checkout. Please try again."));
        setIsProcessing(false);
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.innerHTML = json.html;
      const form = wrapper.querySelector("form");
      if (!form) {
        setError("Could not render the payment form. Please try again.");
        setIsProcessing(false);
        return;
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(typeof navigator !== "undefined" && navigator.onLine === false
        ? "You appear to be offline. Reconnect and try again - nothing was charged."
        : "Could not reach the server to start checkout. Nothing was charged - please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Checkout - CateringMS</title></Head>
      <PortalShell>
        <PortalHeader
          title="Subscription Checkout"
          subtitle={isTestPlan ? "Make one R5 payment to verify PayFast for this test tenant." : `Subscribe to the ${plan.name} plan for ${company || "your company"}.`}
          icon={CreditCard}
          actions={(
            <Link href="/pricing">
              <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Pricing
            </Button>
            </Link>
          )}
        />
        <PageWorkbench />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card className="border-0 shadow-xl">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-slate-600" />
                    <Badge className="bg-gradient-to-r from-slate-500 to-rose-500 text-white border-0">
                      {isTestPlan ? "One-time flow test" : deferredTrial ? "Trial period" : "Recurring subscription"}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl">{isTestPlan ? "Verify the PayFast Payment Flow" : deferredTrial ? "Set Up Billing After Your Trial" : "Start Your Subscription"}</CardTitle>
                  <CardDescription>
                    {isTestPlan ? <>PayFast will collect R5 once. This test plan does not start recurring billing.</> : deferredTrial ? <>No payment required today. Your card will be charged after your existing trial ends on{" "}
                    {trialEndDate!.toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}</> : isPrepaid ? <>Pay for one {billingCycle === "annual" ? "year" : "month"} now with Yoco. Before it ends we email you a renewal link; renewing adds a new period on top.</> : <>Your first payment is due today. {providerName} will charge your card automatically each {billingCycle === "annual" ? "year" : "month"} until you cancel.</>}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Smith"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john@cateringcompany.co.za"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="company">Company Name</Label>
                      <Input
                        id="company"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Your Catering Company"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+27 82 123 4567"
                      />
                    </div>

                    <Separator />

                    {!isTestPlan && availableProviders.length > 1 && (
                      <div className="space-y-2">
                        <Label>Pay with</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Payment provider">
                          {availableProviders.map((key) => (
                            <button
                              key={key}
                              type="button"
                              role="radio"
                              aria-checked={provider === key}
                              disabled={isProcessing}
                              onClick={() => setProvider(key)}
                              className={`rounded-lg border p-3 text-left transition ${provider === key ? "border-brand-primary ring-2 ring-brand-primary/30 bg-white" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
                            >
                              <span className="block font-medium text-slate-900">{PROVIDER_LABELS[key]}</span>
                              <span className="block text-xs text-slate-500">{PROVIDER_HINTS[key]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-brand-primary" />
                        <p className="text-sm text-slate-700 font-medium">
                          {isTestPlan ? "This is a single R5 test payment for this tenant." : "Your trial includes all " + plan.name + " features."}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Lock className="w-5 h-5 text-blue-600" />
                        <p className="text-sm text-slate-700">
                          Secure payment processing by {providerName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-slate-600" />
                        <p className="text-sm text-slate-700">
                          {isTestPlan ? "No repeat payments are created by this test." : "Cancel anytime during your trial, no questions asked."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="mt-1"
                      />
                      <Label htmlFor="terms" className="text-sm text-slate-600 cursor-pointer">
                        I agree to the{" "}
                        <Link href="/terms" className="text-slate-600 hover:underline">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="text-slate-600 hover:underline">
                          Privacy Policy
                        </Link>
                      </Label>
                    </div>

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="w-4 h-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      disabled={isProcessing || !agreeTerms}
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-slate-500 to-rose-500 hover:opacity-90"
                    >
                      {isProcessing ? (
                        "Processing..."
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5 mr-2" />
                          {isTestPlan ? "Pay R5 once and test access" : isPrepaid ? "Pay " + formatCurrency(amount) + " with Yoco" : deferredTrial ? "Set Up Recurring Billing" : "Pay " + formatCurrency(amount) + " and Subscribe"}
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-center text-slate-500">
                      {isTestPlan
                        ? "This is a single R5 payment. PayFast will not create a recurring payment."
                        : isPrepaid
                          ? <>Yoco charges {formatCurrency(amount)} once for this {billingCycle === "annual" ? "year" : "month"}. Renew from the emailed link or Billing before it ends to keep access.</>
                          : <>You authorize {providerName} to charge {formatCurrency(amount)} automatically every {billingCycle === "annual" ? "year" : "month"}{deferredTrial ? " after your existing trial ends" : ", starting today"}, until you cancel.</>}
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="border-0 shadow-xl sticky top-8">
                <CardHeader className="bg-gradient-to-br from-slate-50 to-rose-50">
                  <CardTitle className="text-xl">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{plan.name} Plan</h3>
                    <p className="text-sm text-slate-600">{isTestPlan ? "One-time payment" : (billingCycle === "monthly" ? "Monthly" : "Annual") + " Billing"}</p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Subscription</span>
                      <span className="font-medium">{formatCurrency(amount)}</span>
                    </div>
                    {billingCycle === "annual" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Monthly equivalent</span>
                        <span className="text-slate-500">{formatCurrency(monthlyEquivalent)}/month</span>
                      </div>
                    )}
                    {savings > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-brand-primary font-medium">Annual savings</span>
                        <span className="text-brand-primary font-medium">
                          {formatCurrency(savings)} ({savingsPercentage}%)
                        </span>
                      </div>
                    )}
                    {deferredTrial && <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Existing trial</span>
                      <span className="text-brand-primary font-medium">-{formatCurrency(amount)}</span>
                    </div>}
                  </div>

                  <Separator />

                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold">Due Today</span>
                    <div className="text-right">
                      <span className="text-2xl font-bold">{formatCurrency(deferredTrial ? 0 : amount)}</span>
                          <p className="text-xs text-slate-500">{isTestPlan ? "Single R5 test charge" : deferredTrial ? "No charge during your remaining trial" : "First subscription payment"}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Zap className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-900 mb-1">{isTestPlan ? "One payment only" : deferredTrial ? "Starting " + trialEndDate!.toLocaleDateString() : isPrepaid ? "Prepaid - renew by emailed link" : "Automatic recurring billing"}</p>
                        <p className="text-sm text-blue-700">
                          {isTestPlan ? formatCurrency(amount) + " once" : formatCurrency(amount) + "/" + (billingCycle === "annual" ? "year" : "month")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium mb-2">What's included:</p>
                    {plan.features.slice(0, 5).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{feature}</span>
                      </div>
                    ))}
                    {plan.features.length > 5 && (
                      <p className="text-sm text-slate-500 pl-6">
                        + {plan.features.length - 5} more features
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
      </PortalShell>
    </>
  );
}
