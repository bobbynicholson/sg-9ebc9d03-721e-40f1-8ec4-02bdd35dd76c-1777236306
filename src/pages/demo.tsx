import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  LogIn
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress } from "@/components/motion/marketing";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";

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
    loginUrl: "/test-company/auth/login"
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
    loginUrl: "/test-company/auth/login"
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
    loginUrl: "/test-company/auth/login"
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
    loginUrl: "/test-company/auth/login"
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
    loginUrl: "/test-company/auth/login"
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
    loginUrl: "/test-company/auth/login"
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
    <div className="font-body min-h-screen bg-stone-50 text-stone-900">
      <LandingHeader />

      {/* ===================== HERO ===================== */}
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 pb-14 pt-20 text-center sm:px-6 md:pb-20 md:pt-28 lg:px-8">
          <Stagger gap={0.07}>
            <StaggerItem>
              <h1 className="text-balance font-display text-4xl font-medium leading-[1.05] tracking-tight text-stone-900 sm:text-5xl lg:text-[clamp(3.25rem,5.5vw,4.5rem)]">
                Explore CateringMS Portals
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-stone-700 sm:text-xl">
                Test drive our complete catering management system. Each portal is designed for specific roles in your catering business.
              </p>
            </StaggerItem>
          </Stagger>

          <Reveal className="mx-auto mt-9 max-w-2xl" delay={0.05}>
            <Alert className="border-amber-200 bg-amber-50 text-left">
              <AlertDescription className="text-stone-800">
                <strong className="font-semibold text-stone-900">How to test:</strong> Click &ldquo;Login as Demo User&rdquo; on any portal below to access a fully functional demo environment. All demo accounts use the same test company: <strong className="font-semibold text-stone-900">Test Company</strong>.
              </AlertDescription>
            </Alert>
          </Reveal>
        </div>
      </section>

      {/* ===================== PORTAL CARDS ===================== */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-28 lg:px-8">
        <Reveal className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            One platform, every role connected
          </h2>
          <p className="mt-4 text-pretty text-lg text-stone-700">
            Pick a portal and sign in instantly with the demo credentials below.
          </p>
        </Reveal>

        <Stagger className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {DEMO_PORTALS.map((portal) => {
            const Icon = portal.icon;
            const isCopied = copiedId === portal.id;

            return (
              <StaggerItem key={portal.id}>
                <Card className={`${cardBase} flex h-full flex-col border-stone-200 hover:border-amber-200`}>
                  <CardHeader>
                    <div className="mb-4 flex items-center gap-3">
                      <Icon className="h-7 w-7 flex-shrink-0 text-amber-600" />
                      <CardTitle className="font-display text-xl text-stone-900">{portal.name}</CardTitle>
                    </div>
                    <CardDescription className="text-sm leading-relaxed text-stone-600">
                      {portal.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    {/* Features */}
                    <div className="mb-6">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Key Features
                      </h3>
                      <ul className="space-y-2">
                        {portal.features.slice(0, 4).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-stone-700">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Demo Credentials */}
                    <div className="mb-4 mt-auto rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                          Demo Credentials
                        </h3>
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
                        <p className="text-xs text-stone-700">
                          <strong className="font-semibold text-stone-900">Email:</strong>
                          <code className="ml-2 rounded bg-white px-2 py-0.5 text-xs text-stone-800">
                            {portal.email}
                          </code>
                        </p>
                        <p className="text-xs text-stone-700">
                          <strong className="font-semibold text-stone-900">Password:</strong>
                          <code className="ml-2 rounded bg-white px-2 py-0.5 text-xs text-stone-800">
                            {portal.password}
                          </code>
                        </p>
                      </div>
                    </div>

                    {/* Login Button */}
                    <Button
                      className={`w-full bg-amber-600 text-white hover:bg-amber-700 ${btnPress}`}
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
      <section className="px-4 pb-24 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-6xl rounded-3xl bg-stone-950 px-6 py-16 text-center shadow-xl sm:px-12 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to Transform Your Catering Business?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-stone-300">
              Start your 14-day free trial today. No credit card required.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/company-signup">
                <Button size="lg" className={`group h-12 rounded-full bg-amber-500 px-9 text-base font-semibold text-stone-950 shadow-lg hover:bg-amber-400 ${btnPress}`}>
                  Start Free Trial
                  <ArrowRight className={`ml-2 h-5 w-5 transition-transform duration-200 ${EASE} group-hover:translate-x-0.5`} />
                </Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
      <LandingFooter />
    </div>
  );
}
