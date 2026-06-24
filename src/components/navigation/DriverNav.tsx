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
  Banknote,
  Calendar,
  User,
  Bell,
  Navigation,
  Clock,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";
// Wave 71 - driver gets its own theme combination (secondary -> accent)
// so the portal is visually distinct from kitchen/shopping/cleaning while
// still drawing only from the tenant's brand tokens. See portalPalette.ts.
import { DRIVER_PORTAL_PALETTE as BRAND_PORTAL_PALETTE, DRIVER_ACCENT as BRAND_ACCENT } from "@/lib/branding/portalPalette";

const config: PortalSidebarConfig = {
  role: "driver",
  title: "Driver Portal",
  mobileSubtitle: "Manage deliveries",
  brandIcon: Truck,
  // Tenant brand accent via brand-* CSS vars (amber default). See portalPalette.ts.
  ...BRAND_PORTAL_PALETTE,
  searchHint: "Search routes, deliveries...",
  dashboardHref: "/team-portal/driver/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/driver/routes",   label: "Today's routes", sub: "What you're driving", icon: Navigation, accent: BRAND_ACCENT },
    { href: "/team-portal/driver/tracking", label: "Live tracking",  sub: "Update status",       icon: MapPin,     accent: BRAND_ACCENT },
    { href: "/team-portal/driver/earnings", label: "My earnings",    sub: "Hours + pay",         icon: Banknote, accent: BRAND_ACCENT },
  ],
  sections: [
    {
      id: "live-now",
      title: "Live now",
      defaultOpen: true,
      items: [
        { title: "Today",        href: "/team-portal/driver/dashboard", icon: LayoutDashboard, description: "Today's deliveries" },
        // Clock in / out lives on the dashboard (DriverClockButton).
        // Surfaced as its own labelled item so a driver looking for
        // "the clock" finds it instantly at shift start / end.
        { title: "Clock",        href: "/team-portal/driver/dashboard", icon: Clock,           description: "Clock in / out for your shift" },
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
        { title: "Earnings",       href: "/team-portal/driver/earnings",   icon: Banknote, description: "Hours + pay" },
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
