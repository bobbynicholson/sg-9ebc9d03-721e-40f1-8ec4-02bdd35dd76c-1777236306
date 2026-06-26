import {
  LayoutDashboard,
  Sparkles,
  Clock,
  Bell,
  User,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";
import { DRIVER_PORTAL_PALETTE as BRAND_PORTAL_PALETTE, DRIVER_ACCENT as BRAND_ACCENT } from "@/lib/branding/portalPalette";

const config: PortalSidebarConfig = {
  role: "waiter",
  title: "Waiter Portal",
  mobileSubtitle: "Service team",
  brandIcon: Sparkles,
  ...BRAND_PORTAL_PALETTE,
  leadToken: "primary",
  searchHint: "Search service work...",
  dashboardHref: "/team-portal/waiter/dashboard",
  mobileQuickActions: [
    { href: "/team-portal/waiter/dashboard#service", label: "Service", sub: "Assigned events", icon: Sparkles, accent: BRAND_ACCENT },
    { href: "/team-portal/waiter/dashboard#clock", label: "Clock", sub: "Shift time", icon: Clock, accent: BRAND_ACCENT },
    { href: "/team-portal/waiter/notifications", label: "Alerts", sub: "Updates", icon: Bell, accent: BRAND_ACCENT },
  ],
  sections: [
    {
      id: "today",
      title: "Today",
      defaultOpen: true,
      items: [
        { title: "Service Today", href: "/team-portal/waiter/dashboard#service", icon: LayoutDashboard, description: "Assigned events and phase taps" },
        { title: "Clock", href: "/team-portal/waiter/dashboard#clock", icon: Clock, description: "Clock in / out for your shift" },
      ],
    },
    {
      id: "footer",
      title: "",
      defaultOpen: true,
      footerTreatment: true,
      items: [
        { title: "Notifications", href: "/team-portal/waiter/notifications", icon: Bell },
        { title: "Profile", href: "/account/settings", icon: User },
      ],
    },
  ],
};

export function WaiterNav() {
  return <PortalSidebar config={config} />;
}
