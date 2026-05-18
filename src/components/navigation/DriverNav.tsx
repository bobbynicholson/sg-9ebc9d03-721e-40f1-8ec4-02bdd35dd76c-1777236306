/**
 * DriverNav - Wave 70.10
 *
 * Restructured into the kitchen-style 3-section + footer pattern.
 * A driver's mental model is "what am I driving today / where have
 * I been / how much have I earned / account stuff" - the original
 * 4 sections gave Notifications + Profile their own sections with
 * one item each, wasting hierarchy on quiet items.
 *
 * Now:
 *   LIVE NOW    - Today (was Overview), Routes, GPS Tracking
 *   HISTORY     - All Deliveries, Earnings, Schedule
 *   Footer      - Notifications, Profile
 *
 * Digital clock + skip-to-content land for free via PortalSidebar.
 */
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
      id: "live-now",
      title: "Live now",
      defaultOpen: true,
      items: [
        { title: "Today",        href: "/team-portal/driver/dashboard", icon: LayoutDashboard, description: "Today's deliveries" },
        { title: "Routes",       href: "/team-portal/driver/routes",    icon: Navigation,      description: "What you're driving" },
        { title: "GPS Tracking", href: "/team-portal/driver/tracking",  icon: MapPin,          description: "Live status updates" },
      ],
    },
    {
      id: "history",
      title: "History",
      defaultOpen: false,
      items: [
        { title: "All Deliveries", href: "/team-portal/driver/deliveries", icon: Truck,      description: "Past trips" },
        { title: "Earnings",       href: "/team-portal/driver/earnings",   icon: DollarSign, description: "Hours + pay" },
        { title: "Schedule",       href: "/team-portal/driver/schedule",   icon: Calendar,   description: "Work schedule" },
      ],
    },
    {
      id: "footer",
      title: "",
      defaultOpen: true,
      footerTreatment: true,
      items: [
        { title: "Notifications", href: "/team-portal/driver/notifications", icon: Bell },
        { title: "Profile",       href: "/account/settings",                  icon: User },
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
