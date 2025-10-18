import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ArrowRight,
  Users,
  Settings,
  Package,
  CreditCard,
  Rocket,
  ChefHat,
  Truck,
  ShoppingCart,
  Sparkles,
  Copy,
  Check,
  Database
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

export default function OnboardingPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const registrationUrl = `${window.location.origin}/${companySlug}/auth/register`;
    navigator.clipboard.writeText(registrationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onboardingSteps = [
    {
      title: "Welcome to CateringMS!",
      icon: Rocket,
      description: "Let's get your catering business set up in just a few minutes.",
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Rocket className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Welcome, {user?.full_name || "Admin"}!
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              You've successfully registered your catering company. Let's walk through the essential setup steps to get you up and running.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <Card className="border-2 border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">Company Created</h3>
                    <p className="text-sm text-slate-600">Your unique company URL is active</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">Admin Access</h3>
                    <p className="text-sm text-slate-600">You have full administrative privileges</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ),
    },
    {
      title: "Add Your Team",
      icon: Users,
      description: "Invite your staff and assign them to departments.",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 text-center max-w-2xl mx-auto">
            Your team members can register using your company URL and you can assign them to different departments.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="border-2 border-orange-200">
              <CardContent className="pt-6">
                <ChefHat className="w-12 h-12 text-orange-600 mb-4" />
                <h3 className="font-semibold text-slate-900 mb-2">Kitchen Team</h3>
                <p className="text-sm text-slate-600">Manage food preparation, recipes, and cooking schedules</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200">
              <CardContent className="pt-6">
                <Truck className="w-12 h-12 text-blue-600 mb-4" />
                <h3 className="font-semibold text-slate-900 mb-2">Drivers</h3>
                <p className="text-sm text-slate-600">Track deliveries, routes, and driver assignments</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-200">
              <CardContent className="pt-6">
                <ShoppingCart className="w-12 h-12 text-green-600 mb-4" />
                <h3 className="font-semibold text-slate-900 mb-2">Shopping Team</h3>
                <p className="text-sm text-slate-600">Manage inventory, suppliers, and procurement</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-cyan-200">
              <CardContent className="pt-6">
                <Sparkles className="w-12 h-12 text-cyan-600 mb-4" />
                <h3 className="font-semibold text-slate-900 mb-2">Cleaning Team</h3>
                <p className="text-sm text-slate-600">Track equipment cleaning and maintenance</p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
            <p className="text-sm text-purple-800 mb-3 text-center font-semibold">
              Your Team Registration URL:
            </p>
            <div className="flex items-center gap-2 bg-white rounded-lg p-3 border border-purple-300">
              <code className="flex-1 text-sm font-mono text-purple-900 overflow-x-auto">
                {typeof window !== "undefined" 
                  ? `${window.location.origin}/${companySlug}/auth/register`
                  : `cateringms.com/${companySlug}/auth/register`
                }
              </code>
              <Button
                size="sm"
                variant="outline"
                className="border-purple-400 text-purple-700 hover:bg-purple-100 flex-shrink-0"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-purple-700 mt-3 text-center">
              💡 Share this link with your team members to get started
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Configure Settings",
      icon: Settings,
      description: "Set up your business preferences and branding.",
      content: (
        <div className="space-y-6">
          <p className="text-slate-600 text-center max-w-2xl mx-auto">
            Customize your platform to match your business needs.
          </p>

          <div className="grid gap-4">
            <Card className="border-2 border-slate-200">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Settings className="w-8 h-8 text-slate-600 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-2">Business Settings</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Configure your company details, operating hours, and service regions
                    </p>
                    <Link href={`/${companySlug}/admin/settings`}>
                      <Button variant="outline" size="sm">
                        Go to Settings
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Package className="w-8 h-8 text-slate-600 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-2">Inventory Setup</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Add your equipment, crockery, cutlery, and stock items
                    </p>
                    <Link href={`/${companySlug}/admin/inventory`}>
                      <Button variant="outline" size="sm">
                        Manage Inventory
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <CreditCard className="w-8 h-8 text-slate-600 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-2">Payment Setup</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Configure payment gateways and billing preferences
                    </p>
                    <Link href={`/${companySlug}/admin/payment-gateways`}>
                      <Button variant="outline" size="sm">
                        Setup Payments
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ),
    },
    {
      title: "You're All Set!",
      icon: CheckCircle2,
      description: "Start managing your catering business efficiently.",
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              You're Ready to Go!
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
              Your CateringMS platform is set up and ready to use. Explore the features and start streamlining your operations.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Link href={`/${companySlug}/admin/dashboard`}>
              <Card className="border-2 border-purple-200 hover:border-purple-400 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Analytics Dashboard</h3>
                  <p className="text-sm text-slate-600">View business insights and key metrics</p>
                  <ArrowRight className="w-5 h-5 text-purple-600 mt-3" />
                </CardContent>
              </Card>
            </Link>

            <Link href={`/${companySlug}/admin/client-database`}>
              <Card className="border-2 border-blue-200 hover:border-blue-400 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Client Database</h3>
                  <p className="text-sm text-slate-600">View all clients who interacted with your platform</p>
                  <ArrowRight className="w-5 h-5 text-blue-600 mt-3" />
                </CardContent>
              </Card>
            </Link>

            <Link href={`/${companySlug}/admin/leads`}>
              <Card className="border-2 border-cyan-200 hover:border-cyan-400 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Manage Leads</h3>
                  <p className="text-sm text-slate-600">Track potential clients and quotes</p>
                  <ArrowRight className="w-5 h-5 text-cyan-600 mt-3" />
                </CardContent>
              </Card>
            </Link>

            <Link href={`/${companySlug}/admin/orders`}>
              <Card className="border-2 border-orange-200 hover:border-orange-400 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Orders</h3>
                  <p className="text-sm text-slate-600">Manage bookings and events</p>
                  <ArrowRight className="w-5 h-5 text-orange-600 mt-3" />
                </CardContent>
              </Card>
            </Link>

            <Link href={`/${companySlug}/admin/operations-hub`}>
              <Card className="border-2 border-green-200 hover:border-green-400 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Operations Hub</h3>
                  <p className="text-sm text-slate-600">40 operational standards checklist</p>
                  <ArrowRight className="w-5 h-5 text-green-600 mt-3" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      ),
    },
  ];

  const progress = ((currentStep + 1) / onboardingSteps.length) * 100;
  const CurrentIcon = onboardingSteps[currentStep].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Badge variant="secondary" className="text-sm">
              Step {currentStep + 1} of {onboardingSteps.length}
            </Badge>
            <span className="text-sm text-slate-600 font-medium">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <CurrentIcon className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
              {onboardingSteps[currentStep].title}
            </CardTitle>
            <p className="text-slate-600">
              {onboardingSteps[currentStep].description}
            </p>
          </CardHeader>

          <CardContent className="pb-8">
            {onboardingSteps[currentStep].content}

            <div className="flex items-center justify-between mt-12 pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                Previous
              </Button>

              {currentStep === onboardingSteps.length - 1 ? (
                <Link href={`/${companySlug}/admin/dashboard`}>
                  <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90">
                    Go to Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <Button
                  onClick={() => setCurrentStep(Math.min(onboardingSteps.length - 1, currentStep + 1))}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                >
                  Next Step
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Link href={`/${companySlug}/admin/dashboard`}>
            <Button variant="ghost" size="sm" className="text-slate-600">
              Skip onboarding and go to dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
