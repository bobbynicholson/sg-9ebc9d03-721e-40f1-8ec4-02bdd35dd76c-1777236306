import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, Users, Truck, ChefHat, 
  ShoppingCart, Sparkles, Settings, BarChart3,
  Zap, Shield, TrendingUp
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
    // Enable investor mode
    localStorage.setItem("INVESTOR_MODE", "true");
    localStorage.setItem("BYPASS_AUTH", "true");
    router.push(route);
  };

  const handleExitDemo = () => {
    localStorage.removeItem("INVESTOR_MODE");
    localStorage.removeItem("BYPASS_AUTH");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                CateringMS Investor Demo
              </h1>
              <p className="text-sm text-slate-600 mt-1">Explore all platform features with unrestricted access</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-green-100 text-green-800 border-green-300 px-4 py-1.5">
                <Zap className="w-3 h-3 mr-1" />
                Super User Mode Active
              </Badge>
              <Button variant="outline" size="sm" onClick={handleExitDemo}>
                Exit Demo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Platform Overview Stats */}
        <Card className="mb-8 border-0 shadow-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <BarChart3 className="w-6 h-6" />
              Platform Overview
            </CardTitle>
            <CardDescription className="text-blue-100">
              Complete catering management ecosystem - 6 interconnected portals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-4xl font-bold">68</div>
                <div className="text-sm text-blue-100 mt-1">Total Pages</div>
              </div>
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-4xl font-bold">35+</div>
                <div className="text-sm text-blue-100 mt-1">Backend Services</div>
              </div>
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-4xl font-bold">150+</div>
                <div className="text-sm text-blue-100 mt-1">UI Components</div>
              </div>
              <div className="text-center bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-4xl font-bold">34</div>
                <div className="text-sm text-blue-100 mt-1">Database Tables</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Value Propositions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Enterprise Ready</h3>
              </div>
              <p className="text-sm text-slate-600">
                Role-based access control, audit logs, and SOC 2 compliant infrastructure
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Real-time Everything</h3>
              </div>
              <p className="text-sm text-slate-600">
                Live GPS tracking, instant notifications, and real-time order updates
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-900">AI-Powered</h3>
              </div>
              <p className="text-sm text-slate-600">
                Automated route optimization, demand forecasting, and smart inventory
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Portal Selection Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Choose a Portal to Explore</h2>
          <p className="text-slate-600 mb-6">Click any portal below to experience its full functionality</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PORTALS.map((portal) => {
              const Icon = portal.icon;
              const isSelected = selectedPortal === portal.id;
              
              return (
                <Card 
                  key={portal.id}
                  className={`cursor-pointer transition-all hover:shadow-2xl border-2 ${
                    isSelected
                      ? 'border-blue-500 shadow-2xl scale-105' 
                      : 'border-transparent hover:border-slate-200'
                  }`}
                  onClick={() => setSelectedPortal(portal.id)}
                >
                  <CardHeader>
                    <div className={`w-14 h-14 rounded-xl bg-${portal.color}-100 flex items-center justify-center mb-3 shadow-sm`}>
                      <Icon className={`w-7 h-7 text-${portal.color}-600`} />
                    </div>
                    <CardTitle className="text-lg">{portal.name}</CardTitle>
                    <CardDescription className="text-sm">{portal.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {portal.features.map((feature, idx) => (
                        <div key={idx} className="text-sm text-slate-600 flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full bg-${portal.color}-500`} />
                          {feature}
                        </div>
                      ))}
                    </div>
                    <Button 
                      className="w-full"
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

        {/* Demo Features */}
        <Card className="border-0 shadow-lg bg-gradient-to-r from-slate-50 to-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-700" />
              Investor Demo Capabilities
            </CardTitle>
            <CardDescription>
              This demo environment has unrestricted access to all platform features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">No authentication required</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">Full database access</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">All features enabled</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">Realistic demo data</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">Real-time notifications</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">Live GPS tracking</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">Portal quick-switch</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-slate-700">Export all data</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
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
              <CardTitle className="text-lg">Key Metrics</CardTitle>
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