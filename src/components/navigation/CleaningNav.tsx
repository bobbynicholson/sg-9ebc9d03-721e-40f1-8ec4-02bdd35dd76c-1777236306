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
    { href: "/team-portal/cleaning/jobs",      label: "Today's jobs", sub: "Active cleans",   icon: ClipboardCheck, accent: "from-cyan-500 to-blue-500" },
    { href: "/team-portal/cleaning/schedule",  label: "Schedule",     sub: "Upcoming events", icon: Calendar,       accent: "from-purple-500 to-pink-500" },
    { href: "/team-portal/cleaning/equipment", label: "Equipment",    sub: "Check + return",  icon: Wrench,         accent: "from-amber-500 to-orange-500" },
  ],
  sections: [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        { title: "Overview",      href: "/team-portal/cleaning/dashboard",     icon: LayoutDashboard, description: "Today's tasks" },
        { title: "Notifications", href: "/team-portal/cleaning/notifications", icon: Bell,            description: "Cleaning alerts" },
      ],
    },
    {
      id: "tasks",
      title: "Tasks & Schedules",
      defaultOpen: true,
      items: [
        { title: "Cleaning Tasks", href: "/team-portal/cleaning/tasks",     icon: ClipboardCheck, description: "Task list" },
        { title: "Schedules",      href: "/team-portal/cleaning/schedules", icon: Calendar,       description: "Cleaning schedules" },
        { title: "Workflows",      href: "/team-portal/cleaning/workflows", icon: Sparkles,       description: "Standard procedures" },
      ],
    },
    {
      id: "equipment",
      title: "Equipment",
      defaultOpen: false,
      items: [
        { title: "Equipment Verification", href: "/team-portal/cleaning/equipment", icon: Package,      description: "Verify equipment" },
        { title: "Damage Reports",         href: "/team-portal/cleaning/damage",    icon: AlertCircle,  description: "Report damage" },
        { title: "Supplies",               href: "/team-portal/cleaning/supplies",  icon: Wrench,       description: "Cleaning supplies" },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      defaultOpen: false,
      items: [
        { title: "Cleaning Settings", href: "/team-portal/cleaning/settings", icon: Settings, description: "Configure settings" },
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
