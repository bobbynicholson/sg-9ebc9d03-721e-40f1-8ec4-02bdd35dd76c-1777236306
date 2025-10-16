import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Users,
  Settings,
  Mail,
  MapPin,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  Package,
  Building2,
  DollarSign,
  Search,
  Clock,
  TrendingUp,
  Bell,
  Menu,
  ChevronRight,
  Briefcase,
  MessageSquare,
  Truck,
  Layers,
  Calendar,
  ShoppingCart,
  UserPlus,
  FileSpreadsheet,
  Plug
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

interface AdminNavProps {
  className?: string;
  companySlug?: string;
}

export function AdminNav({ className, companySlug: propCompanySlug }: AdminNavProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const companySlug = propCompanySlug || user?.company_slug || "your-company";

  const adminNavSections: NavSection[] = [
    {
      title: "Dashboard",
      items: [
        {
          title: "Analytics Dashboard",
          href: `/${companySlug}/admin/dashboard`,
          icon: LayoutDashboard,
          description: "Business insights and metrics"
        },
        {
          title: "Notifications",
          href: `/${companySlug}/admin/notifications`,
          icon: Bell,
          description: "View all notifications"
        }
      ]
    },
    {
      title: "Core Management",
      items: [
        {
          title: "Leads",
          href: `/${companySlug}/admin/leads`,
          icon: UserPlus,
          description: "Manage potential clients"
        },
        {
          title: "Quotes",
          href: `/${companySlug}/admin/quotes`,
          icon: FileSpreadsheet,
          description: "Create and manage quotes"
        },
        {
          title: "Orders",
          href: `/${companySlug}/admin/orders`,
          icon: ClipboardList,
          description: "View and manage orders"
        },
        {
          title: "Calendar",
          href: `/${companySlug}/admin/calendar`,
          icon: Calendar,
          description: "Event scheduling"
        },
        {
          title: "Inventory",
          href: `/${companySlug}/admin/inventory`,
          icon: Package,
          description: "Stock management"
        }
      ]
    },
    {
      title: "Team Management",
      items: [
        {
          title: "Users",
          href: `/${companySlug}/admin/users`,
          icon: Users,
          description: "Manage user accounts"
        },
        {
          title: "Drivers",
          href: `/${companySlug}/admin/drivers`,
          icon: Truck,
          description: "Manage delivery drivers"
        },
        {
          title: "Staff Hours",
          href: `/${companySlug}/admin/staff-hours`,
          icon: Clock,
          description: "Track staff working hours"
        }
      ]
    },
    {
      title: "Operations",
      items: [
        {
          title: "Operations Hub",
          href: `/${companySlug}/admin/operations-hub`,
          icon: Layers,
          description: "40 operational standards"
        },
        {
          title: "Operations Standards",
          href: `/${companySlug}/admin/operations-standards`,
          icon: Briefcase,
          description: "Standards 41-75: Equipment & Fleet"
        },
        {
          title: "Job Progress Overview",
          href: `/${companySlug}/admin/job-progress-overview`,
          icon: TrendingUp,
          description: "Monitor all jobs"
        },
        {
          title: "Equipment Shortages",
          href: `/${companySlug}/admin/equipment-shortages`,
          icon: Package,
          description: "Track inventory issues"
        },
        {
          title: "Regions",
          href: `/${companySlug}/admin/regions`,
          icon: MapPin,
          description: "Manage service regions"
        }
      ]
    },
    {
      title: "Communications",
      items: [
        {
          title: "Email Templates",
          href: `/${companySlug}/admin/email-templates`,
          icon: Mail,
          description: "Manage email templates"
        },
        {
          title: "After-Sales Emails",
          href: `/${companySlug}/admin/after-sales-emails`,
          icon: MessageSquare,
          description: "Follow-up communications"
        },
        {
          title: "Email Automation",
          href: `/${companySlug}/admin/email-automation-dashboard`,
          icon: Mail,
          description: "Automated email campaigns"
        },
        {
          title: "Automation Settings",
          href: `/${companySlug}/admin/email-automation-settings`,
          icon: Settings,
          description: "Configure automation"
        },
        {
          title: "Notification Settings",
          href: `/${companySlug}/admin/notification-settings`,
          icon: Bell,
          description: "Configure notifications"
        }
      ]
    },
    {
      title: "Client Portal",
      items: [
        {
          title: "Client Portal Management",
          href: `/${companySlug}/admin/client-portal`,
          icon: Users,
          description: "Manage client portal access"
        },
        {
          title: "Client Search",
          href: `/${companySlug}/admin/client-search`,
          icon: Search,
          description: "Search and filter clients"
        }
      ]
    },
    {
      title: "Shopping & Procurement",
      items: [
        {
          title: "Shopping Dashboard",
          href: `/${companySlug}/admin/shopping`,
          icon: ShoppingCart,
          description: "Procurement overview"
        }
      ]
    },
    {
      title: "Branding & Settings",
      items: [
        {
          title: "White Label",
          href: `/${companySlug}/admin/white-label`,
          icon: Building2,
          description: "Branding customization"
        },
        {
          title: "Integrations",
          href: `/${companySlug}/admin/integrations`,
          icon: Plug,
          description: "Third-party integrations"
        },
        {
          title: "System Settings",
          href: `/${companySlug}/admin/settings`,
          icon: Settings,
          description: "General configuration"
        }
      ]
    },
    {
      title: "Finance & Billing",
      items: [
        {
          title: "Financial Dashboard",
          href: `/${companySlug}/admin/financial-dashboard`,
          icon: DollarSign,
          description: "Financial insights"
        },
        {
          title: "Subscription",
          href: `/${companySlug}/admin/subscription`,
          icon: CreditCard,
          description: "Manage subscriptions"
        },
        {
          title: "Payment Gateways",
          href: `/${companySlug}/admin/payment-gateways`,
          icon: CreditCard,
          description: "Configure payments"
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
        {adminNavSections.map((section) => (
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-purple-50 hover:text-purple-700",
                      active
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-md"
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
            <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-500 to-pink-500">
              <h2 className="text-xl font-bold text-white">Admin Portal</h2>
              <p className="text-sm text-purple-100 mt-1">Catering Management System</p>
            </div>
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Navigation */}
      <div className={cn("hidden lg:block", className)}>
        <div className="fixed left-0 top-0 h-screen w-64 xl:w-72 border-r bg-white shadow-lg overflow-hidden z-40">
          <div className="px-6 py-6 border-b bg-gradient-to-r from-purple-500 to-pink-500">
            <h2 className="text-xl font-bold text-white">Admin Portal</h2>
            <p className="text-sm text-purple-100 mt-1">Catering Management System</p>
          </div>
          <NavContent />
        </div>
      </div>
    </>
  );
}
