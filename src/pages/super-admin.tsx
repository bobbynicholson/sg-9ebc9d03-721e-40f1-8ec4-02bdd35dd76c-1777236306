import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Crown, Shield, Database, Settings, Building2, CreditCard, Clock, DollarSign, Globe, FileText, Layout } from "lucide-react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

interface Portal {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  features: string[];
  color: string;
}

const PORTALS: Portal[] = [
  {
    id: "platform-management",
    name: "Platform Management",
    description: "Core platform operations and settings",
    icon: Settings,
    route: "/admin/platform/dashboard",
    features: [
      "System overview",
      "Platform settings",
      "User management",
      "System health"
    ],
    color: "text-purple-600"
  },
  {
    id: "company-database",
    name: "Company Database",
    description: "View and manage all registered catering companies",
    icon: Building2,
    route: "/admin/platform/company-database",
    features: [
      "Company profiles",
      "Subscription status",
      "Usage analytics",
      "Support tickets"
    ],
    color: "text-blue-600"
  },
  {
    id: "subscription-management",
    name: "Subscription Management",
    description: "Monitor and manage all platform subscriptions",
    icon: CreditCard,
    route: "/admin/platform/subscription-management",
    features: [
      "Active subscriptions",
      "Billing history",
      "Revenue tracking",
      "Plan management"
    ],
    color: "text-green-600"
  },
  {
    id: "trial-management",
    name: "Trial Management",
    description: "Manage trial periods and conversions",
    icon: Clock,
    route: "/admin/platform/trial-management",
    features: [
      "Active trials",
      "Expiry tracking",
      "Conversion rates",
      "Trial extensions"
    ],
    color: "text-orange-600"
  },
  {
    id: "pricing-management",
    name: "Pricing Management",
    description: "Configure platform pricing and plans",
    icon: DollarSign,
    route: "/admin/platform/pricing-management",
    features: [
      "Plan tiers",
      "Feature pricing",
      "Regional pricing",
      "Discounts"
    ],
    color: "text-emerald-600"
  },
  {
    id: "currency-monitoring",
    name: "Currency Monitoring",
    description: "Track and manage multi-currency support",
    icon: Globe,
    route: "/admin/platform/currency-monitoring",
    features: [
      "Exchange rates",
      "Currency conversions",
      "Regional settings",
      "Rate alerts"
    ],
    color: "text-cyan-600"
  },
  {
    id: "cms-blog",
    name: "Blog CMS",
    description: "Create and manage blog content",
    icon: FileText,
    route: "/admin/platform/cms-blog",
    features: [
      "Create posts",
      "Edit content",
      "Publish schedule",
      "SEO optimization"
    ],
    color: "text-pink-600"
  },
  {
    id: "cms-pages",
    name: "Pages CMS",
    description: "Manage static pages and content",
    icon: Layout,
    route: "/admin/platform/cms-pages",
    features: [
      "Page templates",
      "Content editor",
      "Custom pages",
      "Navigation"
    ],
    color: "text-indigo-600"
  },
];

function SuperAdminDashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (loading) return; // Wait for auth to initialize

    console.log("Super Admin - Current user:", user);
    console.log("Super Admin - User role:", user?.active_role);
    
    if (!user) {
      console.log("No user found, redirecting to login");
      router.push("/auth/login");
      return;
    }

    if (user.active_role !== "super_admin") {
      console.log("User is not super_admin, role:", user.active_role);
      router.push("/auth/login");
      return;
    }

    console.log("User authorized as super_admin");
    setIsAuthorized(true);
  }, [user, loading, router]);

  if (loading || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-pulse" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Verifying Access...</h2>
            <p className="text-slate-600">Checking super admin credentials</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-blue-900 text-white border-b shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
                <p className="text-purple-200 text-sm mt-1">Complete system access - All portals available</p>
              </div>
            </div>
            <Badge className="bg-amber-500 text-white border-amber-400 px-4 py-2 text-sm font-semibold shadow-lg">
              <Crown className="w-4 h-4 mr-2" />
              SUPER ADMIN
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Platform Overview */}
        <Card className="mb-8 border-0 shadow-2xl bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white text-2xl">
              <BarChart3 className="w-7 h-7" />
              Platform Overview
            </CardTitle>
            <CardDescription className="text-purple-100 text-base">
              Complete catering management ecosystem - 6 interconnected portals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center bg-white/20 backdrop-blur-sm rounded-xl p-6 border border-white/30">
                <div className="text-5xl font-bold">68</div>
                <div className="text-sm text-purple-100 mt-2 font-medium">Total Pages</div>
              </div>
              <div className="text-center bg-white/20 backdrop-blur-sm rounded-xl p-6 border border-white/30">
                <div className="text-5xl font-bold">35+</div>
                <div className="text-sm text-purple-100 mt-2 font-medium">Backend Services</div>
              </div>
              <div className="text-center bg-white/20 backdrop-blur-sm rounded-xl p-6 border border-white/30">
                <div className="text-5xl font-bold">150+</div>
                <div className="text-sm text-purple-100 mt-2 font-medium">UI Components</div>
              </div>
              <div className="text-center bg-white/20 backdrop-blur-sm rounded-xl p-6 border border-white/30">
                <div className="text-5xl font-bold">34</div>
                <div className="text-sm text-purple-100 mt-2 font-medium">Database Tables</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portal Selection Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Any Portal</h2>
          <p className="text-slate-600 mb-6">Click any portal below to access its full functionality</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PORTALS.map((portal) => {
              const Icon = portal.icon;
              
              return (
                <Button
                  key={portal.id}
                  variant="outline"
                  onClick={() => router.push(portal.route)}
                  className="h-auto p-6 flex flex-col items-start gap-4 hover:border-purple-500 hover:shadow-lg transition-all group"
                >
                  <div className={`w-16 h-16 rounded-xl bg-${portal.color}-100 flex items-center justify-center mb-3 shadow-md`}>
                    <Icon className={`w-8 h-8 text-${portal.color}-600`} />
                  </div>
                  <CardTitle className="text-xl">{portal.name}</CardTitle>
                  <CardDescription className="text-sm">{portal.description}</CardDescription>
                </Button>
              );
            })}
          </div>
        </div>

        {/* System Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5" />
                Database Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Tables:</span>
                  <span className="font-semibold">34 with RLS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Backend:</span>
                  <span className="font-semibold">Supabase (PostgreSQL)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Realtime:</span>
                  <span className="font-semibold">15+ active channels</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Storage:</span>
                  <span className="font-semibold">Enabled</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Authentication:</span>
                  <Badge className="bg-green-100 text-green-700">Active</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Email Service:</span>
                  <Badge className="bg-green-100 text-green-700">Connected</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Payment Gateway:</span>
                  <Badge className="bg-yellow-100 text-yellow-700">Setup Required</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">GPS Tracking:</span>
                  <Badge className="bg-green-100 text-green-700">Enabled</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;