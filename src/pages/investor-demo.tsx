import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, Users, Truck, ChefHat, 
  ShoppingCart, Sparkles, Settings, BarChart3,
  Zap, Shield, TrendingUp, Crown
} from "lucide-react";

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
    id: "admin",
    name: "Admin Portal",
    description: "Complete platform oversight and management",
    icon: LayoutDashboard,
    route: "/admin/dashboard",
    features: ["Order Management", "User Administration", "Route Planning", "Financial Dashboard", "Email Automation"],
    color: "blue"
  },
  {
    id: "client",
    name: "Client Portal",
    description: "Customer ordering and tracking experience",
    icon: Users,
    route: "/client-portal/dashboard",
    features: ["Place Orders", "Real-time GPS Tracking", "Invoice Management", "Payment Processing"],
    color: "green"
  },
  {
    id: "driver",
    name: "Driver Portal",
    description: "Delivery driver route management and earnings",
    icon: Truck,
    route: "/team-portal/driver/dashboard",
    features: ["Optimized Routes", "GPS Navigation", "Delivery Proof", "Earnings Calculator"],
    color: "orange"
  },
  {
    id: "kitchen",
    name: "Kitchen Portal",
    description: "Food preparation workflow and inventory",
    icon: ChefHat,
    route: "/team-portal/kitchen/dashboard",
    features: ["Daily Prep Lists", "Active Orders", "Inventory Alerts", "Time Clock"],
    color: "red"
  },
  {
    id: "shopping",
    name: "Shopping Portal",
    description: "Ingredient procurement and budget tracking",
    icon: ShoppingCart,
    route: "/team-portal/shopping/dashboard",
    features: ["Auto Shopping Lists", "Budget Tracker", "Supplier Links", "Inventory Sync"],
    color: "purple"
  },
  {
    id: "cleaning",
    name: "Cleaning Portal",
    description: "Equipment maintenance and hygiene compliance",
    icon: Sparkles,
    route: "/team-portal/cleaning/dashboard",
    features: ["Task Checklists", "Equipment Status", "Supply Inventory", "Maintenance Alerts"],
    color: "teal"
  }
];

export default function InvestorDemo() {
  const router = useRouter();
  const [selectedPortal, setSelectedPortal] = useState<string | null>(null);

  const handleEnterPortal = (route: string) => {
    // Enable Super Admin mode
    localStorage.setItem("SUPER_ADMIN_MODE", "true");
    localStorage.setItem("BYPASS_AUTH", "true");
    router.push(route);
  };

  const handleExitDemo = () => {
    localStorage.removeItem("SUPER_ADMIN_MODE");
    localStorage.removeItem("BYPASS_AUTH");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-blue-900 text-white border-b shadow-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">
                  Super Admin Dashboard
                </h1>
                <p className="text-purple-200 text-sm mt-1">Unrestricted access to all platform features</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-amber-500 text-white border-amber-400 px-4 py-2 text-sm font-semibold shadow-lg">
                <Crown className="w-4 h-4 mr-2" />
                SUPER ADMIN ACTIVE
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExitDemo}
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Exit Super Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Platform Overview Stats */}
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

        {/* Super Admin Privileges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-amber-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-slate-900">Super Admin Access</h3>
              </div>
              <p className="text-sm text-slate-700">
                Bypass all authentication and access every portal, feature, and admin function without restrictions
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-md">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-slate-900">Instant Portal Switch</h3>
              </div>
              <p className="text-sm text-slate-700">
                Jump between all 6 user portals instantly with the floating quick-switch menu - no login required
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-slate-900">Full Data Control</h3>
              </div>
              <p className="text-sm text-slate-700">
                View, create, edit, and delete all data across the entire platform - complete god-mode access
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Portal Selection Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Any Portal Instantly</h2>
          <p className="text-slate-600 mb-6">Click any portal below to experience its full functionality as Super Admin</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PORTALS.map((portal) => {
              const Icon = portal.icon;
              const isSelected = selectedPortal === portal.id;
              
              return (
                <Card 
                  key={portal.id}
                  className={`cursor-pointer transition-all hover:shadow-2xl border-2 ${
                    isSelected
                      ? 'border-purple-500 shadow-2xl scale-105' 
                      : 'border-transparent hover:border-slate-200'
                  }`}
                  onClick={() => setSelectedPortal(portal.id)}
                >
                  <CardHeader>
                    <div className={`w-16 h-16 rounded-xl bg-${portal.color}-100 flex items-center justify-center mb-3 shadow-md`}>
                      <Icon className={`w-8 h-8 text-${portal.color}-600`} />
                    </div>
                    <CardTitle className="text-xl">{portal.name}</CardTitle>
                    <CardDescription className="text-sm">{portal.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {portal.features.map((feature, idx) => (
                        <div key={idx} className="text-sm text-slate-600 flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full bg-${portal.color}-500`} />
                          {feature}
                        </div>
                      ))}
                    </div>
                    <Button 
                      className="w-full font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterPortal(portal.route);
                      }}
                    >
                      Enter Portal →
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Super Admin Features */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-slate-50 to-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-700" />
              Super Admin Capabilities
            </CardTitle>
            <CardDescription>
              This mode grants unrestricted access to all platform features and data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">No authentication required</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">All roles accessible</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">Full database access</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">All features enabled</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">Real-time notifications</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">Live GPS tracking</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">Portal quick-switch</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm text-slate-700">Export all data</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Stack */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Technology Stack</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Framework:</span>
                  <span className="font-semibold">Next.js 15 (React 18)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Database:</span>
                  <span className="font-semibold">Supabase (PostgreSQL)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Styling:</span>
                  <span className="font-semibold">Tailwind CSS + shadcn/ui</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Maps:</span>
                  <span className="font-semibold">Google Maps API</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Payments:</span>
                  <span className="font-semibold">PayFast + Stripe</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Deployment:</span>
                  <span className="font-semibold">Vercel (Edge Runtime)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Platform Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Code Lines:</span>
                  <span className="font-semibold">89,000+</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Database Tables:</span>
                  <span className="font-semibold">34 with RLS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">API Endpoints:</span>
                  <span className="font-semibold">50+ RESTful</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Real-time Channels:</span>
                  <span className="font-semibold">15+ active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Email Templates:</span>
                  <span className="font-semibold">25+ automated</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Test Coverage:</span>
                  <span className="font-semibold">Comprehensive</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}