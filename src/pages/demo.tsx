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
  Check,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress } from "@/components/motion/marketing";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";

interface DemoPortal {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
}

const DEMO_PORTALS: DemoPortal[] = [
  {
    id: "admin",
    name: "Admin Portal",
    description: "Complete business management dashboard for catering company owners and managers",
    icon: LayoutDashboard,
    features: [
      "Manage leads and quotes",
      "View all orders and calendar",
      "Team management and assignments",
      "Financial dashboard and reports",
      "Equipment and inventory tracking",
      "Email automation and templates"
    ],
  },
  {
    id: "driver",
    name: "Driver Portal",
    description: "Delivery and logistics management for drivers and waitstaff",
    icon: Truck,
    features: [
      "View assigned deliveries",
      "GPS route tracking",
      "Delivery confirmation",
      "Equipment collection tracking",
      "Real-time notifications",
      "Earnings and hours tracking"
    ],
  },
  {
    id: "kitchen",
    name: "Kitchen Portal",
    description: "Food preparation and kitchen operations management",
    icon: ChefHat,
    features: [
      "Daily prep lists",
      "Recipe management",
      "Stock and ingredients tracking",
      "Duty shift management",
      "Equipment readiness tracking",
      "Order timeline coordination"
    ],
  },
  {
    id: "shopping",
    name: "Shopping Portal",
    description: "Procurement and inventory management for shopping team",
    icon: ShoppingCart,
    features: [
      "Supplier management",
      "Purchase orders",
      "Inventory tracking",
      "Stock level alerts",
      "Cost management",
      "Delivery scheduling"
    ],
  },
  {
    id: "cleaning",
    name: "Cleaning Portal",
    description: "Equipment cleaning and maintenance tracking",
    icon: Sparkles,
    features: [
      "Equipment cleaning schedules",
      "Duty assignment tracking",
      "Equipment verification",
      "Broken equipment dashboard",
      "Cleaning workflow tracker",
      "Maintenance logs"
    ],
  },
  {
    id: "client",
    name: "Client Portal",
    description: "Customer-facing portal for clients to manage their orders",
    icon: Users,
    features: [
      "View order history",
      "Track deliveries",
      "Payment schedules",
      "Invoice downloads",
      "Event details",
      "Support tickets"
    ],
  }
];

export default function DemoPage() {
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
                <strong className="font-semibold text-stone-900">Demo access:</strong> Public demo logins are temporarily disabled while we verify the demo workspace is isolated from live integrations and company data. Contact us for a guided walkthrough.
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
            Explore the tools available to each role. Contact us to arrange a secure walkthrough.
          </p>
        </Reveal>

        <Stagger className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {DEMO_PORTALS.map((portal) => {
            const Icon = portal.icon;

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

                    {/* Public credentials stay out of the client bundle. */}
                    <div className="mb-4 mt-auto rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Guided demo</h3>
                      <p className="mt-2 text-sm leading-relaxed text-stone-700">
                        We&apos;ll walk you through this workspace without sharing reusable public login credentials.
                      </p>
                    </div>

                    <Link href="/contact">
                      <Button className={`w-full bg-amber-600 text-white hover:bg-amber-700 ${btnPress}`}>
                        Request a guided demo
                      </Button>
                    </Link>
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
              Our team will help set up your company workspace and show you the right plan for your operation.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/contact">
                <Button size="lg" className={`group h-12 rounded-full bg-amber-500 px-9 text-base font-semibold text-stone-950 shadow-lg hover:bg-amber-400 ${btnPress}`}>
                  Talk to our team
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
