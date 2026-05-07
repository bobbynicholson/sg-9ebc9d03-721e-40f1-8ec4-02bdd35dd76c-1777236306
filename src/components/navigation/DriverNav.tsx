import {
  LayoutDashboard,
  Truck,
  MapPin,
  DollarSign,
  Calendar,
  User,
  Bell,
  Navigation,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";

const config: PortalSidebarConfig = {
  role: "driver",
  title: "Driver Portal",
  mobileSubtitle: "Manage deliveries",
  brandIcon: Truck,
  accentGradient: "from-blue-500 to-indigo-500",
  accentGradientDark: "from-blue-600 to-indigo-600",
  hoverClasses: "hover:bg-blue-50 hover:text-blue-700",
  activeHoverClasses: "hover:from-blue-600 hover:to-indigo-600",
  mobileSubtitleClasses: "text-blue-100",
  searchAccent: "bg-blue-50 hover:bg-blue-100 text-blue-700",
  searchHint: "Search routes, deliveries...",
  dashboardHref: "/team-portal/driver/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/driver/routes",   label: "Today's routes", sub: "What you're driving", icon: Navigation, accent: "from-blue-500 to-indigo-500" },
    { href: "/team-portal/driver/tracking", label: "Live tracking",  sub: "Update status",       icon: MapPin,     accent: "from-emerald-500 to-teal-500" },
    { href: "/team-portal/driver/earnings", label: "My earnings",    sub: "Hours + pay",         icon: DollarSign, accent: "from-amber-500 to-orange-500" },
  ],
  sections: [
    {
      id: "dashboard",
      title: "Dashboard",
      defaultOpen: true,
      items: [
        { title: "Overview",      href: "/team-portal/driver/dashboard",     icon: LayoutDashboard, description: "Today's summary" },
        { title: "Notifications", href: "/team-portal/driver/notifications", icon: Bell,            description: "View alerts" },
      ],
    },
    {
      id: "deliveries",
      title: "Deliveries",
      defaultOpen: true,
      items: [
        { title: "Today's Routes",   href: "/team-portal/driver/routes",     icon: Navigation, description: "Your delivery routes" },
        { title: "All Deliveries",   href: "/team-portal/driver/deliveries", icon: Truck,      description: "Delivery history" },
        { title: "GPS Tracking",     href: "/team-portal/driver/tracking",   icon: MapPin,     description: "Live tracking" },
      ],
    },
    {
      id: "earnings",
      title: "Earnings",
      defaultOpen: false,
      items: [
        { title: "My Earnings", href: "/team-portal/driver/earnings", icon: DollarSign, description: "View your earnings" },
        { title: "Schedule",    href: "/team-portal/driver/schedule", icon: Calendar,   description: "Work schedule" },
      ],
    },
    {
      id: "account",
      title: "Account",
      defaultOpen: false,
      items: [
        { title: "My Profile", href: "/account/settings", icon: User, description: "Update profile" },
      ],
    },
  ],
};

interface DriverNavProps {
  className?: string;
  companySlug?: string;
}

export function DriverNav(_: DriverNavProps = {}) {
  return <PortalSidebar config={config} />;
}
