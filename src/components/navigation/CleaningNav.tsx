import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Sparkles,
  ClipboardCheck,
  Calendar,
  Package,
  AlertCircle,
  Bell,
  Settings,
  Menu,
  ChevronRight,
  Wrench
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

interface CleaningNavProps {
  className?: string;
  companySlug?: string;
}

export function CleaningNav({ className, companySlug }: CleaningNavProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const baseUrl = companySlug ? `/company/${companySlug}` : "";

  const cleaningNavSections: NavSection[] = [
    {
      title: "Dashboard",
      items: [
        {
          title: "Overview",
          href: `${baseUrl}/portal/cleaning/dashboard`,
          icon: LayoutDashboard,
          description: "Today's tasks"
        },
        {
          title: "Notifications",
          href: `${baseUrl}/portal/cleaning/notifications`,
          icon: Bell,
          description: "Cleaning alerts"
        }
      ]
    },
    {
      title: "Tasks & Schedules",
      items: [
        {
          title: "Cleaning Tasks",
          href: `${baseUrl}/portal/cleaning/tasks`,
          icon: ClipboardCheck,
          description: "Task list"
        },
        {
          title: "Schedules",
          href: `${baseUrl}/portal/cleaning/schedules`,
          icon: Calendar,
          description: "Cleaning schedules"
        },
        {
          title: "Workflows",
          href: `${baseUrl}/portal/cleaning/workflows`,
          icon: Sparkles,
          description: "Standard procedures"
        }
      ]
    },
    {
      title: "Equipment",
      items: [
        {
          title: "Equipment Verification",
          href: `${baseUrl}/portal/cleaning/equipment`,
          icon: Package,
          description: "Verify equipment"
        },
        {
          title: "Damage Reports",
          href: `${baseUrl}/portal/cleaning/damage`,
          icon: AlertCircle,
          description: "Report damage"
        },
        {
          title: "Supplies",
          href: `${baseUrl}/portal/cleaning/supplies`,
          icon: Wrench,
          description: "Cleaning supplies"
        }
      ]
    },
    {
      title: "Settings",
      items: [
        {
          title: "Cleaning Settings",
          href: `${baseUrl}/portal/cleaning/settings`,
          icon: Settings,
          description: "Configure settings"
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
        {cleaningNavSections.map((section) => (
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
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all hover:bg-cyan-50 hover:text-cyan-700",
                      active
                        ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 shadow-md"
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
            <div className="px-6 py-4 border-b bg-gradient-to-r from-cyan-500 to-blue-500">
              <h2 className="text-xl font-bold text-white">Cleaning Portal</h2>
              <p className="text-sm text-cyan-100 mt-1">Manage equipment</p>
            </div>
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Navigation */}
      <div className={cn("hidden lg:block", className)}>
        <div className="fixed left-0 top-0 h-screen w-64 xl:w-72 border-r bg-white shadow-lg overflow-hidden z-40">
          <div className="px-6 py-6 border-b bg-gradient-to-r from-cyan-500 to-blue-500">
            <h2 className="text-xl font-bold text-white">Cleaning Portal</h2>
            <p className="text-sm text-cyan-100 mt-1">Manage equipment</p>
          </div>
          <NavContent />
        </div>
      </div>
    </>
  );
}