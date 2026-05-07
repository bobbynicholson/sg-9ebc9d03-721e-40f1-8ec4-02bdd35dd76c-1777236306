import {
  LayoutDashboard,
  ChefHat,
  ClipboardList,
  Package,
  Calendar,
  Clock,
  Bell,
  Settings,
  Utensils,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";

const config: PortalSidebarConfig = {
  role: "kitchen",
  title: "Kitchen Portal",
  mobileSubtitle: "Manage production",
  brandIcon: ChefHat,
  accentGradient: "from-orange-500 to-red-500",
  accentGradientDark: "from-orange-600 to-red-600",
  hoverClasses: "hover:bg-orange-50 hover:text-orange-700",
  activeHoverClasses: "hover:from-orange-600 hover:to-red-600",
  mobileSubtitleClasses: "text-orange-100",
  searchAccent: "bg-orange-50 hover:bg-orange-100 text-orange-700",
  searchHint: "Search recipes, prep...",
  dashboardHref: "/team-portal/kitchen/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/kitchen/prep-list",  label: "Today's prep",  sub: "Per-order ingredients", icon: ClipboardList, accent: "from-orange-500 to-red-500" },
    { href: "/team-portal/kitchen/production", label: "Production",    sub: "Mark items ready",      icon: ChefHat,       accent: "from-amber-500 to-orange-500" },
    { href: "/team-portal/kitchen/stock",      label: "Stock check",   sub: "Pull from inventory",   icon: Package,       accent: "from-emerald-500 to-teal-500" },
  ],
  sections: [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        { title: "Overview",      href: "/team-portal/kitchen/dashboard",     icon: LayoutDashboard, description: "Today's production" },
        { title: "Notifications", href: "/team-portal/kitchen/notifications", icon: Bell,            description: "Kitchen alerts" },
      ],
    },
    {
      id: "production",
      title: "Production",
      defaultOpen: true,
      items: [
        { title: "Prep List",            href: "/team-portal/kitchen/prep-list",  icon: ClipboardList, description: "Daily prep tasks" },
        { title: "Production Schedule",  href: "/team-portal/kitchen/production", icon: Calendar,      description: "Upcoming orders" },
        { title: "Duty Roster",          href: "/team-portal/kitchen/duty",       icon: Clock,         description: "Staff on duty" },
      ],
    },
    {
      id: "menu-inventory",
      title: "Menu & Inventory",
      defaultOpen: false,
      items: [
        { title: "Menu Items",    href: "/team-portal/kitchen/menu",  icon: Utensils, description: "Manage menu" },
        { title: "Kitchen Stock", href: "/team-portal/kitchen/stock", icon: Package,  description: "Inventory levels" },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      defaultOpen: false,
      items: [
        { title: "Kitchen Settings", href: "/team-portal/kitchen/settings", icon: Settings, description: "Configure kitchen" },
      ],
    },
  ],
};

interface KitchenNavProps {
  className?: string;
  companySlug?: string;
}

export function KitchenNav(_: KitchenNavProps = {}) {
  return <PortalSidebar config={config} />;
}
