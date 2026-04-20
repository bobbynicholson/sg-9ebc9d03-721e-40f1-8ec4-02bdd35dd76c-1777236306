import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ShoppingBag,
  FileText,
  CreditCard,
  MapPin,
  Calendar,
  MessageSquare,
  Settings,
  Menu,
  ChevronRight,
  Bell,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface ClientNavProps {
  className?: string;
  companySlug?: string;
}

export function ClientNav({ className, companySlug }: ClientNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const baseUrl = companySlug ? `/company/${companySlug}` : "";

  const clientNavSections: NavSection[] = [
    {
      title: "My Account",
      items: [
        {
          title: "Dashboard",
          href: `${baseUrl}/portal/client/dashboard`,
          icon: LayoutDashboard,
          description: "Overview of your events"
        },
        {
          title: "My Orders",
          href: `${baseUrl}/portal/client/orders`,
          icon: ShoppingBag,
          description: "View your order history"
        },
        {
          title: "Track Delivery",
          href: `${baseUrl}/portal/client/tracking`,
          icon: MapPin,
          description: "Live tracking of your order"
        }
      ]
    },
    {
      title: "Bookings",
      items: [
        {
          title: "Request Quote",
          href: `${baseUrl}/portal/client/request-quote`,
          icon: FileText,
          description: "Get a quote for your event"
        },
        {
          title: "My Quotes",
          href: `${baseUrl}/portal/client/quotes`,
          icon: FileText,
          description: "View quote history"
        },
        {
          title: "Event Calendar",
          href: `${baseUrl}/portal/client/calendar`,
          icon: Calendar,
          description: "Upcoming events"
        }
      ]
    },
    {
      title: "Payments",
      items: [
        {
          title: "Payment Schedule",
          href: `${baseUrl}/portal/client/payments`,
          icon: CreditCard,
          description: "View payment schedules"
        },
        {
          title: "Invoices",
          href: `${baseUrl}/portal/client/invoices`,
          icon: FileText,
          description: "Download invoices"
        }
      ]
    },
    {
      title: "Support",
      items: [
        {
          title: "Messages",
          href: `${baseUrl}/portal/client/messages`,
          icon: MessageSquare,
          description: "Chat with support"
        },
        {
          title: "Notifications",
          href: `${baseUrl}/portal/client/notifications`,
          icon: Bell,
          description: "View notifications"
        },
        {
          title: "Settings",
          href: `${baseUrl}/portal/client/settings`,
          icon: Settings,
          description: "Account settings"
        }
      ]
    }
  ];

  const isActive = (href: string) => {
    return router.pathname === href || router.asPath === href;
  };

  const NavContent = () => (
    <ScrollArea className="h-full py-6 px-4">
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-blue-50 hover:text-blue-700",
                      active
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-md"
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
            <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500 to-cyan-500">
              <h2 className="text-xl font-bold text-white">Client Portal</h2>
              <p className="text-sm text-blue-100 mt-1">Manage your events</p>
            </div>
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Navigation */}
      <div className={cn("hidden lg:block", className)}>
        <div className="fixed left-0 top-0 h-screen w-64 xl:w-72 border-r bg-white shadow-lg overflow-hidden z-40">
          <div className="px-6 py-6 border-b bg-gradient-to-r from-blue-500 to-cyan-500">
            <h2 className="text-xl font-bold text-white">Client Portal</h2>
            <p className="text-sm text-blue-100 mt-1">Manage your events</p>
          </div>
          <NavContent />
        </div>
      </div>
    </>
  );
}