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
 *   LIVE NOW    - Today, Clock, Routes, All Deliveries, Calendar
 *   HISTORY     - Earnings
 *   Footer      - Notifications, Profile
 *
 * Digital clock + skip-to-content land for free via PortalSidebar.
 */
import {
  LayoutDashboard,
  Truck,
  Banknote,
  Calendar,
  User,
  Bell,
  Route,
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
    { href: "/team-portal/driver/earnings",       label: "My earnings",    sub: "Hours + pay",         icon: Banknote,   accent: BRAND_ACCENT },
  ],
  sections: [
    {
      id: "live-now",
      title: "Live now",
      defaultOpen: true,
      items: [
        { title: "Today",        href: "/team-portal/driver/dashboard#today", icon: LayoutDashboard, description: "Today's deliveries", groupHeading: "Shift & clock" },
        // Clock in / out lives on the dashboard (DriverClockButton).
        // Surfaced as its own labelled item so a driver looking for
        // "the clock" finds it instantly at shift start / end.
        { title: "Clock",        href: "/team-portal/driver/dashboard#clock", icon: Clock,           description: "Clock in / out for your shift" },
        { title: "Routes",       href: "/team-portal/driver/routes", icon: Route, description: "Current stop and delivery sequence", groupHeading: "Deliveries" },
        // "All Deliveries" is a primary destination (every job assigned to the
        // driver, plus the per-leg confirmation panel) - it was buried in a
        // collapsed History section, so it now sits in Live now for one-tap
        // access alongside the other core views.
        { title: "All Deliveries", href: "/team-portal/driver/deliveries", icon: Truck,     description: "Every job, upcoming and past" },
        { title: "Calendar",     href: "/team-portal/driver/calendar",  icon: Calendar,        description: "Bookings, open jobs and your schedule" },
      ],
    },
    {
      id: "history",
      title: "History",
      defaultOpen: true,
      items: [
        // "Schedule" was a read-only subset of Calendar (which also shows
        // claimable jobs) and Deliveries (which adds history + comms), so the
        // page now redirects to Calendar and the nav row is gone.
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
