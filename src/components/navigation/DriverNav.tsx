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
 *   LIVE NOW    - Today (was Overview), Routes, Current Delivery
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
// Shared tenant palette: all role portals use the admin-selected brand
// tokens, with primary leading normal navigation chrome.
import { DRIVER_PORTAL_PALETTE as BRAND_PORTAL_PALETTE, DRIVER_ACCENT as BRAND_ACCENT } from "@/lib/branding/portalPalette";

const config: PortalSidebarConfig = {
  role: "driver",
  title: "Driver Portal",
  mobileSubtitle: "Manage deliveries",
  brandIcon: Truck,
  // Tenant brand palette via brand-* CSS vars. See portalPalette.ts.
  ...BRAND_PORTAL_PALETTE,
  leadToken: "primary",
  // Command-centre restructure: the driver rail wears the tenant's own
  // colours (same brand-painted treatment as the company-admin nav) so
  // the field portal reads as part of the company, not a generic app.
  appearance: "brand",
  searchHint: "Search routes, deliveries...",
  dashboardHref: "/team-portal/driver/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/driver/routes",         label: "Today's routes", sub: "What you're driving", icon: Navigation, accent: BRAND_ACCENT },
    { href: "/team-portal/driver/routes#current", label: "Current stop",   sub: "Brief + status",      icon: MapPin,     accent: BRAND_ACCENT },
    { href: "/team-portal/driver/earnings",       label: "My earnings",    sub: "Hours + pay",         icon: Banknote,   accent: BRAND_ACCENT },
  ],
  sections: [
    {
      id: "live-now",
      title: "Live now",
      defaultOpen: true,
      items: [
        { title: "Today",        href: "/team-portal/driver/dashboard#today", icon: LayoutDashboard, description: "Today's deliveries" },
        // Clock in / out lives on the dashboard (DriverClockButton).
        // Surfaced as its own labelled item so a driver looking for
        // "the clock" finds it instantly at shift start / end.
        { title: "Clock",        href: "/team-portal/driver/dashboard#clock", icon: Clock,           description: "Clock in / out for your shift" },
        { title: "Routes",       href: "/team-portal/driver/routes",    icon: Navigation,      description: "What you're driving" },
        // Command-centre consolidation: the old /tracking page was a strict
        // subset of the routes board's current-stop panel (same order, same
        // actions, minus the map). Its manifest now lives on the routes page
        // and /tracking redirects there, so "Current Stop" deep-links to the
        // in-progress card instead of a duplicate page.
        { title: "Current Stop", href: "/team-portal/driver/routes#current", icon: MapPin,   description: "Brief, manifest and status" },
        { title: "Calendar",     href: "/team-portal/driver/calendar",  icon: Calendar,        description: "Bookings, open jobs and your schedule" },
      ],
    },
    {
      id: "history",
      title: "History",
      defaultOpen: false,
      items: [
        // "Schedule" was a read-only subset of Calendar (which also shows
        // claimable jobs) and Deliveries (which adds history + comms), so the
        // page now redirects to Calendar and the nav row is gone.
        { title: "All Deliveries", href: "/team-portal/driver/deliveries", icon: Truck,      description: "Past trips" },
        { title: "Earnings",       href: "/team-portal/driver/earnings",   icon: Banknote, description: "Hours + pay" },
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
