/**
 * CleaningNav -- Wave 70.10
 *
 * Restructured into the kitchen-style 3-section + footer pattern.
 * Cleaning is the simplest of the staff portals -- the team mostly
 * uses Tasks + Equipment. Old structure had 4 sections, one of
 * which (Settings) had a single item.
 *
 *   LIVE NOW       -- Today, Tasks, Schedules
 *   EQUIPMENT      -- Verification, Damage Reports, Supplies
 *   Footer         -- Notifications, Settings
 */
import {
  LayoutDashboard,
  Sparkles,
  ClipboardCheck,
  Calendar,
  Package,
  AlertCircle,
  Bell,
  Settings,
  Wrench,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";

const config: PortalSidebarConfig = {
  role: "cleaning",
  title: "Cleaning Portal",
  mobileSubtitle: "Manage equipment",
  brandIcon: Sparkles,
  accentGradient: "from-cyan-500 to-blue-500",
  accentGradientDark: "from-cyan-600 to-blue-600",
  hoverClasses: "hover:bg-cyan-50 hover:text-cyan-700",
  activeHoverClasses: "hover:from-cyan-600 hover:to-blue-600",
  mobileSubtitleClasses: "text-cyan-100",
  searchAccent: "bg-cyan-50 hover:bg-cyan-100 text-cyan-700",
  searchHint: "Search jobs, equipment...",
  dashboardHref: "/team-portal/cleaning/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/cleaning/tasks",     label: "Today's tasks", sub: "Active cleans",   icon: ClipboardCheck, accent: "from-cyan-500 to-blue-500" },
    { href: "/team-portal/cleaning/schedules", label: "Schedule",      sub: "Upcoming events", icon: Calendar,       accent: "from-purple-500 to-pink-500" },
    { href: "/team-portal/cleaning/equipment", label: "Equipment",     sub: "Check + return",  icon: Wrench,         accent: "from-amber-500 to-orange-500" },
  ],
  sections: [
    {
      id: "live-now",
      title: "Live now",
      defaultOpen: true,
      items: [
        { title: "Today",     href: "/team-portal/cleaning/dashboard",  icon: LayoutDashboard, description: "Today's tasks" },
        { title: "Tasks",     href: "/team-portal/cleaning/tasks",      icon: ClipboardCheck,  description: "Active cleans" },
        { title: "Schedules", href: "/team-portal/cleaning/schedules",  icon: Calendar,        description: "Upcoming events" },
      ],
    },
    {
      id: "equipment",
      title: "Equipment",
      defaultOpen: false,
      items: [
        { title: "Verification",   href: "/team-portal/cleaning/equipment", icon: Package,     description: "Check equipment in/out" },
        { title: "Damage Reports", href: "/team-portal/cleaning/damage",    icon: AlertCircle, description: "Flag broken kit" },
        { title: "Supplies",       href: "/team-portal/cleaning/supplies",  icon: Wrench,      description: "Cleaning supplies" },
        { title: "Workflows",      href: "/team-portal/cleaning/workflows", icon: Sparkles,    description: "Standard procedures" },
      ],
    },
    {
      id: "footer",
      title: "",
      defaultOpen: true,
      footerTreatment: true,
      items: [
        { title: "Notifications", href: "/team-portal/cleaning/notifications", icon: Bell },
        { title: "Settings",      href: "/team-portal/cleaning/settings",      icon: Settings },
      ],
    },
  ],
};

interface CleaningNavProps {
  className?: string;
  companySlug?: string;
}

export function CleaningNav(_: CleaningNavProps = {}) {
  return <PortalSidebar config={config} />;
}
