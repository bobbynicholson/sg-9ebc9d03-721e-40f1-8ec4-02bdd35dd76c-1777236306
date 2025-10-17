import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LayoutDashboard,
  Truck,
  ChefHat,
  ShoppingCart,
  Sparkles,
  Users,
  Copy,
  Check,
  ArrowRight,
  Eye,
  LogIn
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

interface DemoPortal {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  role: string;
  features: string[];
  email: string;
  password: string;
  loginUrl: string;
  bgGradient: string;
}

const DEMO_PORTALS: DemoPortal[] = [
  {
    id: "admin",
    name: "Admin Portal",
    description: "Complete business management dashboard for catering company owners and managers",
    icon: LayoutDashboard,
    role: "admin",
    features: [
      "Manage leads and quotes",
      "View all orders and calendar",
      "Team management and assignments",
      "Financial dashboard and reports",
      "Equipment and inventory tracking",
      "Email automation and templates"
    ],
    email: "test+admin@cateringms.com",
    password: "demo123",
    loginUrl: "/test-company/auth/login",
    bgGradient: "from-purple-500 to-pink-500"
  },
  {
    id: "driver",
    name: "Driver Portal",
    description: "Delivery and logistics management for drivers and waitstaff",
    icon: Truck,
    role: "driver",
    features: [
      "View assigned deliveries",
      "GPS route tracking",
      "Delivery confirmation",
      "Equipment collection tracking",
      "Real-time notifications",
      "Earnings and hours tracking"
    ],
    email: "test+driver@cateringms.com",
    password: "demo123",
    loginUrl: "/test-company/auth/login",
    bgGradient: "from-blue-500 to-cyan-500"
  },
  {
    id: "kitchen",
    name: "Kitchen Portal",
    description: "Food preparation and kitchen operations management",
    icon: ChefHat,
    role: "kitchen",
    features: [
      "Daily prep lists",
      "Recipe management",
      "Stock and ingredients tracking",
      "Duty shift management",
      "Equipment readiness tracking",
      "Order timeline coordination"
    ],
    email: "test+kitchen@cateringms.com",
    password: "demo123",
    loginUrl: "/test-company/auth/login",
    bgGradient: "from-orange-500 to-red-500"
  },
  {
    id: "shopping",
    name: "Shopping Portal",
    description: "Procurement and inventory management for shopping team",
    icon: ShoppingCart,
    role: "shopping",
    features: [
      "Supplier management",
      "Purchase orders",
      "Inventory tracking",
      "Stock level alerts",
      "Cost management",
      "Delivery scheduling"
    ],
    email: "test+shopping@cateringms.com",
    password: "demo123",
    loginUrl: "/test-company/auth/login",
    bgGradient: "from-green-500 to-emerald-500"
  },
  {
    id: "cleaning",
    name: "Cleaning Portal",
    description: "Equipment cleaning and maintenance tracking",
    icon: Sparkles,
    role: "cleaning",
    features: [
      "Equipment cleaning schedules",
      "Duty assignment tracking",
      "Equipment verification",
      "Broken equipment dashboard",
      "Cleaning workflow tracker",
      "Maintenance logs"
    ],
    email: "test+cleaning@cateringms.com",
    password: "demo123",
    loginUrl: "/test-company/auth/login",
    bgGradient: "from-cyan-500 to-blue-500"
  },
  {
    id: "client",
    name: "Client Portal",
    description: "Customer-facing portal for clients to manage their orders",
    icon: Users,
    role: "client",
    features: [
      "View order history",
      "Track deliveries",
      "Payment schedules",
      "Invoice downloads",
      "Event details",
      "Support tickets"
    ],
    email: "test+client@cateringms.com",
    password: "demo123",
    loginUrl: "/test-company/auth/login",
    bgGradient: "from-violet-500 to-purple-500"
  }
];

export default function DemoPage() {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCredentials = (portal: DemoPortal) => {
    const credentials = `Email: ${portal.email}\nPassword: ${portal.password}`;
    navigator.clipboard.writeText(credentials);
    setCopiedId(portal.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDirectLogin = (portal: DemoPortal) => {
    // Store credentials in sessionStorage for auto-fill
    sessionStorage.setItem("demo_email", portal.email);
    sessionStorage.setItem("demo_password", portal.password);
    sessionStorage.setItem("demo_role", portal.role);
    
    // Navigate to login page
    router.push(portal.loginUrl);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold text-xl">C</span>
              </div>
              <span className="text-xl font-bold text-slate-900">CateringMS</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/features">
                <Button variant="ghost" size="sm">Features</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="sm">Pricing</Button>
              </Link>
              <Link href="/company-signup">
                <Button className="bg-gradient-to-r from-purple-500 to-pink-500">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            <Eye className="w-3 h-3 mr-1" />
            Live Demo
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Explore CateringMS Portals
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Test drive our complete catering management system. Each portal is designed for specific roles in your catering business.
          </p>
        </div>

        <Alert className="mb-8 bg-blue-50 border-blue-200">
          <AlertDescription className="text-blue-800">
            <strong>🎯 How to Test:</strong> Click "Login as Demo User" on any portal below to access a fully functional demo environment. All demo accounts use the same test company: <strong>Test Company</strong>
          </AlertDescription>
        </Alert>

        {/* Portal Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {DEMO_PORTALS.map((portal) => {
            const Icon = portal.icon;
            const isCopied = copiedId === portal.id;

            return (
              <Card key={portal.id} className="border-2 hover:shadow-xl transition-all hover:-translate-y-1">
                <CardHeader>
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${portal.bgGradient} flex items-center justify-center mb-4 shadow-lg`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl">{portal.name}</CardTitle>
                  <CardDescription className="text-sm">
                    {portal.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Features */}
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
                      Key Features
                    </h4>
                    <ul className="space-y-2">
                      {portal.features.slice(0, 4).map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                          <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Demo Credentials */}
                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Demo Credentials
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyCredentials(portal)}
                        className="h-7 text-xs"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">
                        <strong>Email:</strong>
                        <code className="ml-2 bg-white px-2 py-0.5 rounded text-xs">
                          {portal.email}
                        </code>
                      </p>
                      <p className="text-xs text-slate-600">
                        <strong>Password:</strong>
                        <code className="ml-2 bg-white px-2 py-0.5 rounded text-xs">
                          {portal.password}
                        </code>
                      </p>
                    </div>
                  </div>

                  {/* Login Button */}
                  <Button
                    className={`w-full bg-gradient-to-r ${portal.bgGradient} hover:opacity-90`}
                    onClick={() => handleDirectLogin(portal)}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Login as Demo {portal.role.charAt(0).toUpperCase() + portal.role.slice(1)}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-center text-white shadow-2xl">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Catering Business?</h2>
          <p className="text-lg text-purple-100 mb-6 max-w-2xl mx-auto">
            Start your 14-day free trial today. No credit card required.
          </p>
          <Link href="/company-signup">
            <Button size="lg" className="bg-white text-purple-600 hover:bg-slate-100 text-lg px-8">
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
