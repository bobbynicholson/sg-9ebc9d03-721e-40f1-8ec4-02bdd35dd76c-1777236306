import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  ArrowLeft, 
  Users, 
  Zap, 
  Crown,
  TrendingUp,
  DollarSign,
  Calendar,
  Package,
  Truck,
  MessageSquare,
  BarChart3,
  Globe,
  Shield,
  Headphones
} from "lucide-react";
import { Footer } from "@/components/Footer";

const PRICING_TIERS = [
  {
    name: "Starter",
    icon: Users,
    description: "Perfect for small catering businesses just getting started",
    monthlyPrice: 299,
    annualPrice: 2990,
    color: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-200",
    bgColor: "bg-blue-50",
    popular: false,
    features: [
      "Up to 50 orders per month",
      "Basic lead management",
      "Quote generation & email automation",
      "Calendar & booking system",
      "Inventory tracking (200 items)",
      "Client portal access",
      "Basic reporting",
      "Email support",
      "1 region/kitchen",
      "Up to 5 team members"
    ],
    limits: {
      orders: 50,
      regions: 1,
      users: 5,
      inventory: 200
    }
  },
  {
    name: "Professional",
    icon: Zap,
    description: "For growing catering companies ready to scale",
    monthlyPrice: 599,
    annualPrice: 5990,
    color: "from-purple-500 to-pink-500",
    borderColor: "border-purple-200",
    bgColor: "bg-purple-50",
    popular: true,
    features: [
      "Up to 200 orders per month",
      "Advanced lead & CRM features",
      "Automated quote follow-ups",
      "Multi-region support (3 regions)",
      "Unlimited inventory items",
      "GPS driver tracking",
      "Receipt scanning & auto-stock",
      "Supplier price comparison",
      "Product expiry tracking",
      "Kitchen & shopping management",
      "Equipment cleaning scheduler",
      "Driver earnings calculator",
      "Advanced analytics & reports",
      "Priority email & chat support",
      "Up to 20 team members",
      "After-sales automation (6 emails)"
    ],
    limits: {
      orders: 200,
      regions: 3,
      users: 20,
      inventory: "unlimited"
    }
  },
  {
    name: "Enterprise",
    icon: Crown,
    description: "Complete solution for established catering operations",
    monthlyPrice: 1299,
    annualPrice: 12990,
    color: "from-orange-500 to-red-500",
    borderColor: "border-orange-200",
    bgColor: "bg-orange-50",
    popular: false,
    features: [
      "Unlimited orders",
      "Unlimited regions/franchises",
      "White-label options available",
      "Custom email templates",
      "Advanced automation rules",
      "Multi-currency support",
      "API access for integrations",
      "Dedicated account manager",
      "Custom training sessions",
      "24/7 priority support",
      "Unlimited team members",
      "Custom reporting dashboards",
      "Data export & backups",
      "Early access to new features",
      "Dedicated onboarding specialist"
    ],
    limits: {
      orders: "unlimited",
      regions: "unlimited",
      users: "unlimited",
      inventory: "unlimited"
    }
  }
];

const FEATURES_COMPARISON = [
  {
    category: "Core Features",
    icon: Package,
    features: [
      { name: "Lead Management", starter: true, pro: true, enterprise: true },
      { name: "Quote Generation", starter: true, pro: true, enterprise: true },
      { name: "Calendar & Bookings", starter: true, pro: true, enterprise: true },
      { name: "Client Portal", starter: true, pro: true, enterprise: true },
      { name: "Email Automation", starter: "Basic", pro: "Advanced", enterprise: "Custom" },
      { name: "Inventory Management", starter: "200 items", pro: "Unlimited", enterprise: "Unlimited" }
    ]
  },
  {
    category: "Operations",
    icon: Truck,
    features: [
      { name: "Kitchen Management", starter: false, pro: true, enterprise: true },
      { name: "Shopping Lists", starter: false, pro: true, enterprise: true },
      { name: "GPS Driver Tracking", starter: false, pro: true, enterprise: true },
      { name: "Driver Earnings", starter: false, pro: true, enterprise: true },
      { name: "Equipment Cleaning", starter: false, pro: true, enterprise: true },
      { name: "Receipt Scanning", starter: false, pro: true, enterprise: true }
    ]
  },
  {
    category: "Analytics & Optimization",
    icon: BarChart3,
    features: [
      { name: "Basic Reports", starter: true, pro: true, enterprise: true },
      { name: "Supplier Comparison", starter: false, pro: true, enterprise: true },
      { name: "Expiry Tracking", starter: false, pro: true, enterprise: true },
      { name: "Advanced Analytics", starter: false, pro: true, enterprise: true },
      { name: "Custom Dashboards", starter: false, pro: false, enterprise: true },
      { name: "Data Export", starter: false, pro: false, enterprise: true }
    ]
  },
  {
    category: "Scale & Growth",
    icon: Globe,
    features: [
      { name: "Regions/Franchises", starter: "1", pro: "3", enterprise: "Unlimited" },
      { name: "Team Members", starter: "5", pro: "20", enterprise: "Unlimited" },
      { name: "Multi-Currency", starter: false, pro: false, enterprise: true },
      { name: "API Access", starter: false, pro: false, enterprise: true },
      { name: "White-Label Option", starter: false, pro: false, enterprise: true }
    ]
  },
  {
    category: "Support",
    icon: Headphones,
    features: [
      { name: "Email Support", starter: true, pro: true, enterprise: true },
      { name: "Chat Support", starter: false, pro: true, enterprise: true },
      { name: "Priority Support", starter: false, pro: true, enterprise: true },
      { name: "Dedicated Manager", starter: false, pro: false, enterprise: true },
      { name: "Custom Training", starter: false, pro: false, enterprise: true },
      { name: "24/7 Support", starter: false, pro: false, enterprise: true }
    ]
  }
];

const ROI_CALCULATOR_EXAMPLES = [
  {
    title: "Reduce Admin Time",
    description: "Save 15+ hours per week on manual tasks",
    monthlySavings: 6000,
    icon: Calendar
  },
  {
    title: "Optimize Purchasing",
    description: "Reduce food costs by 8-12% with supplier insights",
    monthlySavings: 4500,
    icon: DollarSign
  },
  {
    title: "Increase Bookings",
    description: "Convert 25% more quotes with automated follow-ups",
    monthlySavings: 8000,
    icon: TrendingUp
  },
  {
    title: "Reduce Waste",
    description: "Cut inventory waste by 15% with expiry tracking",
    monthlySavings: 3000,
    icon: Package
  }
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<"ZAR" | "USD">("ZAR");

  const convertPrice = (price: number) => {
    if (currency === "USD") {
      return Math.round(price * 0.054);
    }
    return price;
  };

  const formatPrice = (price: number) => {
    const converted = convertPrice(price);
    return currency === "ZAR" ? `R${converted}` : `$${converted}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-12">
          <Badge className="mb-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
            Simple, Transparent Pricing
          </Badge>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Choose Your Growth Plan
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
            Start transforming your catering business today. No hidden fees, cancel anytime.
          </p>

          <div className="flex items-center justify-center gap-6 mb-6">
            <div className="flex items-center gap-3 bg-white rounded-full p-2 shadow-lg">
              <Button
                variant={billingCycle === "monthly" ? "default" : "ghost"}
                onClick={() => setBillingCycle("monthly")}
                className="rounded-full"
              >
                Monthly
              </Button>
              <Button
                variant={billingCycle === "annual" ? "default" : "ghost"}
                onClick={() => setBillingCycle("annual")}
                className="rounded-full"
              >
                Annual
              </Button>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-200 px-4 py-2">
              Save 17% with Annual
            </Badge>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant={currency === "ZAR" ? "default" : "outline"}
              onClick={() => setCurrency("ZAR")}
              size="sm"
            >
              ZAR (R)
            </Button>
            <Button
              variant={currency === "USD" ? "default" : "outline"}
              onClick={() => setCurrency("USD")}
              size="sm"
            >
              USD ($)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {PRICING_TIERS.map((tier) => {
            const Icon = tier.icon;
            const price = billingCycle === "monthly" ? tier.monthlyPrice : tier.annualPrice;
            const monthlyEquivalent = billingCycle === "annual" ? Math.round(tier.annualPrice / 12) : tier.monthlyPrice;

            return (
              <Card
                key={tier.name}
                className={`border-0 shadow-xl transition-all hover:shadow-2xl relative ${
                  tier.popular ? "ring-2 ring-purple-500 scale-105" : ""
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 px-6 py-1 text-sm">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-8">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${tier.color} mx-auto flex items-center justify-center shadow-lg mb-4`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                  <CardDescription className="text-sm mt-2">{tier.description}</CardDescription>
                  <div className="mt-6">
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="text-4xl font-bold text-slate-900">
                        {formatPrice(monthlyEquivalent)}
                      </span>
                      <span className="text-slate-600">/month</span>
                    </div>
                    {billingCycle === "annual" && (
                      <p className="text-sm text-slate-500 mt-2">
                        Billed {formatPrice(price)} annually
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Button
                    className={`w-full h-12 text-base font-semibold ${
                      tier.popular
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                        : "bg-gradient-to-r from-slate-700 to-slate-900 hover:opacity-90"
                    }`}
                  >
                    Get Started
                  </Button>

                  <div className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mb-16">
          <Card className="border-0 shadow-xl bg-gradient-to-br from-green-50 to-emerald-50">
            <CardHeader>
              <CardTitle className="text-center text-3xl mb-2">Return on Investment</CardTitle>
              <CardDescription className="text-center text-base">
                See how much you could save with our platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {ROI_CALCULATOR_EXAMPLES.map((example) => {
                  const Icon = example.icon;
                  return (
                    <div key={example.title} className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg mb-3">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-1">{example.title}</h3>
                      <p className="text-xs text-slate-600 mb-2">{example.description}</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatPrice(example.monthlySavings)}
                        <span className="text-sm text-slate-600">/mo</span>
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 p-6 bg-white rounded-xl text-center">
                <p className="text-lg text-slate-700 mb-2">
                  <strong>Total Potential Savings:</strong>
                </p>
                <p className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">
                  {formatPrice(21500)}
                  <span className="text-2xl">/month</span>
                </p>
                <p className="text-slate-600">
                  Even with our Professional plan at {formatPrice(599)}/month, your ROI is{" "}
                  <strong className="text-green-600">3500%</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">Feature Comparison</h2>
          <Card className="border-0 shadow-xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                    <tr>
                      <th className="text-left p-4 font-semibold text-slate-900">Feature</th>
                      <th className="text-center p-4 font-semibold text-slate-900">Starter</th>
                      <th className="text-center p-4 font-semibold text-slate-900 bg-purple-50">
                        Professional
                      </th>
                      <th className="text-center p-4 font-semibold text-slate-900">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURES_COMPARISON.map((category, catIdx) => {
                      const Icon = category.icon;
                      return (
                        <>
                          <tr key={`cat-${catIdx}`} className="bg-slate-50">
                            <td colSpan={4} className="p-3">
                              <div className="flex items-center gap-2 font-semibold text-slate-900">
                                <Icon className="w-5 h-5 text-purple-600" />
                                {category.category}
                              </div>
                            </td>
                          </tr>
                          {category.features.map((feature, featIdx) => (
                            <tr
                              key={`feat-${catIdx}-${featIdx}`}
                              className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                            >
                              <td className="p-4 text-slate-700">{feature.name}</td>
                              <td className="p-4 text-center">
                                {typeof feature.starter === "boolean" ? (
                                  feature.starter ? (
                                    <Check className="w-5 h-5 text-green-600 mx-auto" />
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )
                                ) : (
                                  <span className="text-sm text-slate-600">{feature.starter}</span>
                                )}
                              </td>
                              <td className="p-4 text-center bg-purple-50">
                                {typeof feature.pro === "boolean" ? (
                                  feature.pro ? (
                                    <Check className="w-5 h-5 text-green-600 mx-auto" />
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )
                                ) : (
                                  <span className="text-sm text-slate-600 font-medium">{feature.pro}</span>
                                )}
                              </td>
                              <td className="p-4 text-center">
                                {typeof feature.enterprise === "boolean" ? (
                                  feature.enterprise ? (
                                    <Check className="w-5 h-5 text-green-600 mx-auto" />
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )
                                ) : (
                                  <span className="text-sm text-slate-600">{feature.enterprise}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-16">
          <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-pink-50">
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-purple-600" />
              <h2 className="text-3xl font-bold mb-4">Risk-Free Trial</h2>
              <p className="text-lg text-slate-600 mb-6 max-w-2xl mx-auto">
                Not sure which plan is right for you? Start with a 14-day free trial of the Professional plan. 
                No credit card required. Cancel anytime.
              </p>
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 text-white h-12 px-8 text-base">
                Start Free Trial
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4 max-w-3xl mx-auto text-left">
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <h3 className="font-semibold text-slate-900 mb-2">Can I upgrade or downgrade my plan?</h3>
                <p className="text-slate-600 text-sm">
                  Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades will take effect at the end of your current billing cycle.
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <h3 className="font-semibold text-slate-900 mb-2">What payment methods do you accept?</h3>
                <p className="text-slate-600 text-sm">
                  We accept all major credit cards, debit cards, and local South African payment methods. Enterprise clients can also pay via invoice.
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <h3 className="font-semibold text-slate-900 mb-2">Is there a setup fee?</h3>
                <p className="text-slate-600 text-sm">
                  No setup fees for Starter and Professional plans. Enterprise clients receive dedicated onboarding included in their subscription.
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <h3 className="font-semibold text-slate-900 mb-2">Do you offer custom enterprise pricing?</h3>
                <p className="text-slate-600 text-sm">
                  Yes! For large operations with unique needs, we offer custom pricing and features. Contact our sales team to discuss your requirements.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}