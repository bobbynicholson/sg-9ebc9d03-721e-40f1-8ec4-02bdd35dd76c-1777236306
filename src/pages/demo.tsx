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
  LogIn,
  Target
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

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
    email: "admin@test-company.com",
    password: "testadmin123",
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
    email: "driver@test-company.com",
    password: "testdriver123",
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
    email: "kitchen@test-company.com",
    password: "testkitchen123",
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
    email: "shopping@test-company.com",
    password: "testshopping123",
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
    email: "cleaning@test-company.com",
    password: "testcleaning123",
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
    email: "client@test-company.com",
    password: "testclient123",
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
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-sm">
                <span className="text-xl font-bold text-white">C</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">CateringMS</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link href="/features">
                <Button variant="ghost" size="sm">Features</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="sm">Pricing</Button>
              </Link>
              <Link href="/company-signup">
                <Button className={`rounded-full bg-gradient-to-b from-violet-600 to-violet-700 font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 hover:shadow-xl hover:shadow-violet-600/30`}>
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden border-b border-slate-100 bg-white">
        {/* Soft brand glow + faint grid, masked so it fades into the page. */}
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
            <StaggerItem className="mb-6 flex justify-center">
              <Eyebrow icon={Eye} className="border-violet-200 bg-violet-50 text-violet-700">
                Live Demo
              </Eyebrow>
            </StaggerItem>

            <StaggerItem>
              <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Explore CateringMS Portals
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                Test drive our complete catering management system. Each portal is designed for specific roles in your catering business.
              </p>
            </StaggerItem>
          </Stagger>

          <Reveal className="mx-auto mt-10 max-w-3xl" delay={0.05}>
            <Alert className="border-blue-200 bg-blue-50">
              <AlertDescription className="text-blue-800">
                <strong>🎯 How to Test:</strong> Click "Login as Demo User" on any portal below to access a fully functional demo environment. All demo accounts use the same test company: <strong>Test Company</strong>
              </AlertDescription>
            </Alert>
          </Reveal>
        </div>
      </section>

      {/* ===================== PORTAL CARDS ===================== */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <Reveal className="mx-auto mb-14 max-w-3xl text-center">
          <Eyebrow icon={Target} className="border-violet-200 bg-violet-50 text-violet-700">
            Six role-based portals
          </Eyebrow>
          <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            One platform, every role connected
          </h2>
          <p className="mt-4 text-balance text-lg text-slate-600">
            Pick a portal and sign in instantly with the demo credentials below.
          </p>
        </Reveal>

        <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {DEMO_PORTALS.map((portal) => {
            const Icon = portal.icon;
            const isCopied = copiedId === portal.id;

            return (
              <StaggerItem key={portal.id}>
                <Card className={`${cardBase} flex h-full flex-col`}>
                  <CardHeader>
                    <div className={`${iconChip} mb-4 h-16 w-16 bg-gradient-to-br ${portal.bgGradient}`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{portal.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {portal.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    {/* Features */}
                    <div className="mb-6">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Key Features
                      </h4>
                      <ul className="space-y-2">
                        {portal.features.slice(0, 4).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Demo Credentials */}
                    <div className="mb-4 mt-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                              <Check className="mr-1 h-3 w-3" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 h-3 w-3" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-600">
                          <strong>Email:</strong>
                          <code className="ml-2 rounded bg-white px-2 py-0.5 text-xs">
                            {portal.email}
                          </code>
                        </p>
                        <p className="text-xs text-slate-600">
                          <strong>Password:</strong>
                          <code className="ml-2 rounded bg-white px-2 py-0.5 text-xs">
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
                      <LogIn className="mr-2 h-4 w-4" />
                      Login as Demo {portal.role.charAt(0).toUpperCase() + portal.role.slice(1)}
                    </Button>
                  </CardContent>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12 md:py-20">
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
          <div className="relative mx-auto max-w-3xl">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to Transform Your Catering Business?
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50">
              Start your 14-day free trial today. No credit card required.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/company-signup">
                <Button size="lg" className={`h-12 rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50`}>
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
