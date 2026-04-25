import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, Users, Truck, ChefHat, 
  ShoppingCart, Sparkles, BarChart3,
  Crown, Shield, Database, Settings
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";

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

function SuperAdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user || user.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-red-600" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-600 mb-6">
              This area is restricted to Super Admin users only.
            </p>
            <Button onClick={() => router.push("/admin/dashboard")}>
              Go to Dashboard
            </Button>
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
                <Card 
                  key={portal.id}
                  className="cursor-pointer transition-all hover:shadow-2xl hover:scale-105 border-2 border-transparent hover:border-purple-200"
                  onClick={() => router.push(portal.route)}
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
                        router.push(portal.route);
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

export default function SuperAdminPage() {
  return (
    <ProtectedRoute requireAuth={true}>
      <SuperAdminDashboard />
    </ProtectedRoute>
  );
}