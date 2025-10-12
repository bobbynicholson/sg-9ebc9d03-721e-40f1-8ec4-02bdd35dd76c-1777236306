import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
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
import { PayFastService, getPlanById, formatCurrency, calculateTrialEndDate } from "@/lib/payfastService";

export default function CheckoutPage() {
  const router = useRouter();
  const { plan: planId, cycle } = router.query;

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    (cycle as "monthly" | "annual") || "monthly"
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const plan = getPlanById(planId as string);
  const trialEndDate = calculateTrialEndDate(14);

  useEffect(() => {
    if (!plan && planId) {
      router.push("/pricing");
    }
  }, [plan, planId, router]);

  if (!plan) {
    return null;
  }

  const amount = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
  const monthlyEquivalent = billingCycle === "annual" ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
  const savings = billingCycle === "annual" ? plan.monthlyPrice * 12 - plan.annualPrice : 0;
  const savingsPercentage = billingCycle === "annual" ? Math.round((savings / (plan.monthlyPrice * 12)) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const payfastConfig = {
        merchantId: process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID || "",
        merchantKey: process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY || "",
        passphrase: process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE || "",
        testMode: process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE === "true",
      };

      const payfastService = new PayFastService(payfastConfig);

      const subscriptionParams = payfastService.createSubscriptionParams(
        plan,
        {
          firstName,
          lastName,
          email,
          userId: `temp_${Date.now()}`,
        },
        billingCycle
      );

      const form = document.createElement("form");
      form.method = "POST";
      form.action = payfastService.getPaymentFormUrl();

      Object.entries(subscriptionParams).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value as string;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError("Failed to process payment. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <title>Checkout - CateringMS</title>
        <Link href="/pricing">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Pricing
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-xl">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                    14-Day Free Trial
                  </Badge>
                </div>
                <CardTitle className="text-2xl">Start Your Free Trial</CardTitle>
                <CardDescription>
                  No payment required today. Your card will only be charged after your trial ends on{" "}
                  {trialEndDate.toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
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

                  <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-green-600" />
                      <p className="text-sm text-slate-700 font-medium">
                        Your trial includes all {plan.name} features
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Lock className="w-5 h-5 text-blue-600" />
                      <p className="text-sm text-slate-700">
                        Secure payment processing by PayFast
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <p className="text-sm text-slate-700">
                        Cancel anytime during your trial, no questions asked
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
                      <Link href="/terms" className="text-purple-600 hover:underline">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="text-purple-600 hover:underline">
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
                    className="w-full h-12 text-base font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                  >
                    {isProcessing ? (
                      "Processing..."
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        Start 14-Day Free Trial
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-slate-500">
                    By starting your trial, you authorize us to charge your payment method after the trial ends
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="border-0 shadow-xl sticky top-8">
              <CardHeader className="bg-gradient-to-br from-purple-50 to-pink-50">
                <CardTitle className="text-xl">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-1">{plan.name} Plan</h3>
                  <p className="text-sm text-slate-600">{billingCycle === "monthly" ? "Monthly" : "Annual"} Billing</p>
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
                      <span className="text-green-600 font-medium">Annual savings</span>
                      <span className="text-green-600 font-medium">
                        {formatCurrency(savings)} ({savingsPercentage}%)
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">14-day trial discount</span>
                    <span className="text-green-600 font-medium">-{formatCurrency(amount)}</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between items-baseline">
                  <span className="font-semibold">Due Today</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold">R0</span>
                    <p className="text-xs text-slate-500">Free for 14 days</p>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Zap className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-900 mb-1">Starting {trialEndDate.toLocaleDateString()}</p>
                      <p className="text-sm text-blue-700">
                        {formatCurrency(billingCycle === "monthly" ? plan.monthlyPrice : monthlyEquivalent)}/month
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium mb-2">What's included:</p>
                  {plan.features.slice(0, 5).map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
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
      </div>
    </div>
  );
}
