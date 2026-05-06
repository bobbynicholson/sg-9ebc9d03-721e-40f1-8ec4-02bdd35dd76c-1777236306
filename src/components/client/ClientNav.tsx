
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCloseOnDesktop } from "@/lib/useCloseOnDesktop";
import { useNavScrollRestore } from "@/hooks/useNavScrollRestore";
import {
  Home,
  FileText,
  CreditCard,
  Map,
  LifeBuoy,
  Gamepad2,
  Menu,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildIsActive } from "@/lib/navActiveMatcher";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const clientNavSections: NavSection[] = [
  {
    title: "Portal",
    items: [
      {
        title: "Dashboard",
        href: "/client-portal",
        icon: Home,
        description: "Your main dashboard"
      },
      {
        title: "My Orders",
        href: "/portal/client/my-orders",
        icon: FileText,
        description: "View your order history"
      },
      {
        title: "Payment Schedule",
        href: "/portal/client/payment-schedule",
        icon: CreditCard,
        description: "Upcoming payments"
      },
    ]
  },
  {
    title: "Tools & Tracking",
    items: [
      {
        title: "Live Order Tracking",
        href: "/tracking/client",
        icon: Map,
        description: "Track your delivery in real-time"
      },
      {
        title: "Play Game",
        href: "/portal/client/game",
        icon: Gamepad2,
        description: "Have some fun while you wait"
      },
    ]
  },
  {
    title: "Account",
    items: [
        {
            title: "Subscription & Invoices",
            href: "/client/subscription-invoices",
            icon: CreditCard,
            description: "Manage your subscription"
        },
        {
            title: "Support",
            href: "/support",
            icon: LifeBuoy,
            description: "Get help and support"
        },
    ]
  }
];

interface ClientNavProps {
  className?: string;
}

export function ClientNav({ className }: ClientNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useCloseOnDesktop(open, setOpen);

  // Path-vs-href matcher with sub-path matching ("/" boundary),
  // query-param disambiguation, and longest-match resolution. This
  // older client nav has no tenant slug awareness (paths are global)
  // so withSlug is identity. See navActiveMatcher.ts.
  const allHrefs = clientNavSections.flatMap((s) => s.items.map((i) => i.href));
  const isActive = buildIsActive(allHrefs, {
    router,
    withSlug: (h: string) => h,
  });

  const desktopScrollRef = useNavScrollRestore<HTMLDivElement>("client-nav");

  const NavContent = ({ mobile = false }: { mobile?: boolean } = {}) => (
    <ScrollArea ref={mobile ? undefined : desktopScrollRef} className="h-full py-6 px-4">
      <div className="space-y-6">
        {clientNavSections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section.title}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-sky-50 hover:text-sky-700",
                      active
                        ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white hover:from-sky-600 hover:to-blue-600 shadow-md"
                        : "text-slate-700"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-slate-600")} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.title}</div>
                      {item.description && !active && (
                        <div className="text-xs text-slate-500 truncate">{item.description}</div>
                      )}
                    </div>
                    {active && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed top-4 left-4 z-50 bg-white shadow-lg hover:shadow-xl transition-shadow"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-sky-500 to-blue-500">
              <h2 className="text-xl font-bold text-white">Client Portal</h2>
              <p className="text-sm text-sky-100 mt-1">Your Catering Hub</p>
            </div>
            <NavContent mobile />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Navigation */}
      <div className={cn("hidden lg:block", className)}>
        <div className="fixed left-0 top-0 h-screen w-64 xl:w-72 border-r bg-white shadow-lg overflow-hidden">
          <div className="px-6 py-6 border-b bg-gradient-to-r from-sky-500 to-blue-500">
            <h2 className="text-xl font-bold text-white">Client Portal</h2>
            <p className="text-sm text-sky-100 mt-1">Your Catering Hub</p>
          </div>
          <NavContent />
        </div>
      </div>
    </>
  );
}
