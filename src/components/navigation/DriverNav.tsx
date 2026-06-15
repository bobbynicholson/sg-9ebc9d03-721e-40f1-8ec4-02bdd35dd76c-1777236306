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
  accentGradient: "from-amber-500 to-orange-500",
  accentGradientDark: "from-amber-600 to-orange-600",
  hoverClasses: "hover:bg-amber-50 hover:text-amber-700",
  activeHoverClasses: "hover:from-amber-600 hover:to-orange-600",
  mobileSubtitleClasses: "text-amber-100",
  searchAccent: "bg-amber-50 hover:bg-amber-100 text-amber-700",
  searchHint: "Search routes, deliveries...",
  dashboardHref: "/team-portal/driver/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/driver/routes",   label: "Today's routes", sub: "What you're driving", icon: Navigation, accent: "from-amber-500 to-orange-500" },
    { href: "/team-portal/driver/tracking", label: "Live tracking",  sub: "Update status",       icon: MapPin,     accent: "from-amber-500 to-orange-500" },
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
        { title: "Calendar",     href: "/team-portal/driver/calendar",  icon: Calendar,        description: "Your bookings and jobs you can claim" },
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
