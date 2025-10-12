import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ChevronRight
} from "lucide-react";
import { SUBSCRIPTION_PLANS, formatCurrency } from "@/lib/payfastService";

export default function PricingPage() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");

  const handleSelectPlan = (planId: string) => {
    router.push(`/subscription/checkout?plan=${planId}&cycle=${billingCycle}`);
  };

  const calculateSavings = (monthlyPrice: number, annualPrice: number) => {
    const annualCostIfMonthly = monthlyPrice * 12;
    const savings = annualCostIfMonthly - annualPrice;
    const percentage = Math.round((savings / annualCostIfMonthly) * 100);
    return { amount: savings, percentage };
  };

  return (
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
            Choose the plan that fits your catering business. All plans include a 14-day free trial with full access.
          </p>

          <div className="flex items-center justify-center gap-8 pt-4">
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
          {SUBSCRIPTION_PLANS.map((plan) => {
            const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
            const monthlyEquivalent = billingCycle === "annual" ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
            const savings = billingCycle === "annual" ? calculateSavings(plan.monthlyPrice, plan.annualPrice) : null;

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
                    {plan.id === "enterprise" && "Built for large-scale catering operations"}
                  </CardDescription>
                  
                  <div className="pt-6 space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold">{formatCurrency(billingCycle === "annual" ? monthlyEquivalent : price)}</span>
                      <span className="text-slate-600 text-lg">/month</span>
                    </div>
                    
                    {billingCycle === "annual" && (
                      <div className="space-y-1">
                        <p className="text-sm text-slate-600">
                          Billed annually at {formatCurrency(price)}
                        </p>
                        {savings && (
                          <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                            <TrendingUp className="w-4 h-4" />
                            <span>Save {formatCurrency(savings.amount)} ({savings.percentage}%)</span>
                          </div>
                        )}
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
                    Start Free Trial
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
                  <Button variant="ghost" onClick={() => handleSelectPlan(plan.id)} className="text-purple-600 hover:text-purple-700">
                    View full features
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-12 mb-16">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold text-slate-900">Why Catering Businesses Love Our Platform</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6">
              <div className="space-y-3">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-lg">3,723% ROI</h3>
                <p className="text-sm text-slate-600">
                  Save R22,901/month on average through automation and efficiency gains
                </p>
              </div>

              <div className="space-y-3">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-lg">60+ Hours Saved</h3>
                <p className="text-sm text-slate-600">
                  Eliminate manual admin work every month and focus on growing your business
                </p>
              </div>

              <div className="space-y-3">
                <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center mx-auto">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-lg">25% More Bookings</h3>
                <p className="text-sm text-slate-600">
                  Automated follow-ups and professional quotes convert more leads to sales
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-12 mb-16">
          <h2 className="text-3xl font-bold text-center mb-10">Frequently Asked Questions</h2>
          
          <div className="max-w-3xl mx-auto space-y-6">
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
              <h3 className="font-semibold text-lg">What payment methods do you accept?</h3>
              <p className="text-slate-600">
                We use PayFast for secure payment processing in South Africa. We accept all major credit and debit cards, as well as instant EFT. All transactions are encrypted and secure.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Is there a setup fee?</h3>
              <p className="text-slate-600">
                No setup fees, ever. You only pay the monthly or annual subscription price. We want to make it as easy as possible for you to start growing your catering business.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-lg">What happens to my data if I cancel?</h3>
              <p className="text-slate-600">
                Your data is always yours. Before canceling, you can export all your data. We will retain your data for 30 days after cancellation in case you change your mind, then it will be permanently deleted.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Do you offer refunds?</h3>
              <p className="text-slate-600">
                If you are not satisfied within the first 14 days after your trial ends, we offer a full refund, no questions asked. We are confident you will love our platform.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-12 text-center text-white">
          <div className="max-w-3xl mx-auto space-y-6">
            <Zap className="w-16 h-16 mx-auto" />
            <h2 className="text-4xl font-bold">Ready to Transform Your Catering Business?</h2>
            <p className="text-xl text-purple-100">
              Join successful catering companies already using our platform to save time, reduce costs, and grow their business.
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
              <Link href="/blog">
                <Button 
                  size="lg"
                  variant="outline"
                  className="border-2 border-white text-white hover:bg-white/10 h-14 px-8 text-lg font-semibold"
                >
                  Learn More
                </Button>
              </Link>
            </div>
            <p className="text-sm text-purple-200 pt-4">
              <Users className="w-4 h-4 inline mr-1" />
              Join 500+ catering businesses already saving time and money
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}