/**
 * KitchenNav - Wave 70.7 redesign.
 *
 * Before this wave the kitchen nav was a generic 4-section / 8-item
 * list copied from the driver / cleaning / shopping pattern with
 * labels swapped in. That's fine for a portal whose user opens it
 * once a day; the kitchen portal user opens it dozens of times
 * during a service and needs a tighter, more intelligent surface.
 *
 * Restructured into:
 *   LIVE NOW    - Today, Production, Prep List   (3 items, always open)
 *   KITCHEN OPS - Team, Stock, Recipes           (3 items, closed by default)
 *   FOOTER      - Notifications, Settings        (footer treatment)
 *
 * Renames done in this wave:
 *   "Overview"            -> "Today"
 *   "Production Schedule" -> "Production"
 *   "Duty Roster"         -> "Team"
 *   "Menu Items"          -> "Recipes"
 *   "Kitchen Stock"       -> "Stock"
 *   "Kitchen Settings"    -> "Settings"
 *   "Kitchen Notifications" -> "Notifications"
 *
 * The live-counts + service-mode awareness wiring (KitchenLiveStateStrip,
 * KitchenServiceModeBadge, smart icon overlay, smart quick action
 * rotation) lands in Wave 70.8.
 */
import {
  LayoutDashboard,
  ChefHat,
  ClipboardList,
  Package,
  Users,
  Bell,
  BookOpen,
  Flame,
  Clock,
  CalendarClock,
  Settings,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";
import { BRAND_PORTAL_PALETTE, BRAND_ACCENT } from "@/lib/branding/portalPalette";
import { useKitchenLiveCounts } from "@/hooks/useKitchenLiveCounts";
import { usePortalServiceMode } from "@/hooks/usePortalServiceMode";
import { KitchenServiceModeBadge } from "@/components/kitchen/KitchenServiceModeBadge";
import { KitchenSmartQuickActions } from "@/components/kitchen/KitchenSmartQuickActions";
import { useServiceModeToast } from "@/hooks/useServiceModeToast";
import { useAuth } from "@/contexts/AuthContext";

interface KitchenNavProps {
  className?: string;
  companySlug?: string;
}

export function KitchenNav(_: KitchenNavProps = {}) {
  // Hooks run at the consumer-component level so the badges + icon
  // overlay can read live state. The config object below references
  // these closures via per-item `badge` / `iconOverlay` functions.
  const counts = useKitchenLiveCounts();
  const serviceMode = usePortalServiceMode();
  const { user, profile } = useAuth() as any;

  // Wave 70.7c - fires a single toast on the first transition to
  // service mode each browser session. Mounted at the nav level so
  // it runs on every kitchen portal page.
  useServiceModeToast();

  const isService = serviceMode.mode === "service";
  const activeRole = String(profile?.active_role || profile?.role || user?.active_role || user?.role || "").toLowerCase();
  const canSeeManagerLinks = [
    "kitchen_manager",
    "admin",
    "company_admin",
    "super_admin",
    "owner",
    "region_admin",
  ].includes(activeRole);

  const config: PortalSidebarConfig = {
    role: "kitchen",
    title: "Kitchen Portal",
    mobileSubtitle: "Manage production",
    brandIcon: ChefHat,
    // Tenant brand palette via brand-* CSS vars. See portalPalette.ts.
    ...BRAND_PORTAL_PALETTE,
    // Match the company-admin rail: the kitchen portal should wear the
    // tenant's own white-label colours, not the neutral app sidebar.
    appearance: "brand",
    searchHint: "Search recipes, prep...",
    dashboardHref: "/team-portal/kitchen/today",
    mobileQuickActions: [
      { href: "/team-portal/kitchen/prep-list",  label: "Today's prep",  sub: "Per-order ingredients", icon: ClipboardList, accent: BRAND_ACCENT },
      { href: "/team-portal/kitchen/production", label: "Production",    sub: "Mark items ready",      icon: ChefHat,       accent: BRAND_ACCENT },
      { href: "/team-portal/kitchen/stock",      label: "Stock check",   sub: "Pull from inventory",   icon: Package,       accent: BRAND_ACCENT },
    ],
    // Keep just the compact service-mode badge in the sidebar; the live
    // prep/production pill strip was dropped from the rail (it lives on
    // the kitchen dashboard) to match the slimmer admin + platform nav.
    renderTopSlot: () => <KitchenServiceModeBadge />,
    renderMobileQuickActions: ({ onNavigate }) => (
      <KitchenSmartQuickActions onNavigate={onNavigate} />
    ),
    sections: [
      {
        id: "live-now",
        title: "Live now",
        defaultOpen: true,
        items: [
          {
            title: "Today",
            href: "/team-portal/kitchen/today",
            icon: LayoutDashboard,
            description: "Your service desk",
            liveDescription: () => serviceMode.todayEventCount === 0
              ? "No events today"
              : `${serviceMode.todayEventCount} event${serviceMode.todayEventCount === 1 ? "" : "s"}`,
          },
          {
            // Clock in / out lives on the duty page. Surfaced here in
            // "Live now" (always open) so staff can find it fast at the
            // start + end of a shift instead of hunting in Kitchen ops.
            title: "Clock",
            href: activeRole === "kitchen_manager"
              ? "/team-portal/kitchen/management#clock"
              : "/team-portal/kitchen/duty#clock",
            icon: Clock,
            description: "Clock in / out",
          },
          {
            title: "Production",
            href: "/team-portal/kitchen/production",
            icon: ChefHat,
            description: "Mark items ready",
            badge: () => {
              if (counts.overdue > 0) return { text: `${counts.overdue} overdue`, tone: "critical", pulse: true };
              if (counts.onPass > 0)  return { text: `${counts.onPass} on pass`, tone: "warning" };
              if (counts.inPrep > 0)  return { text: `${counts.inPrep} in prep`, tone: "default" };
              return null;
            },
            // Wave 70.7 - icon overlay swap during service.
            // The base ChefHat icon stays so the chef's muscle-memory
            // shape isn't disrupted; a small flame badge sits in the
            // top-right corner only during service hours.
            iconOverlay: () => isService ? (
              <Flame className="h-2.5 w-2.5 text-brand-primary drop-shadow-sm" />
            ) : null,
          },
          {
            title: "Prep List",
            href: "/team-portal/kitchen/prep-list",
            icon: ClipboardList,
            description: "Daily prep tasks",
          },
        ],
      },
      {
        id: "kitchen-ops",
        title: "Kitchen ops",
        defaultOpen: false,
        items: [
          { title: "Team",    href: "/team-portal/kitchen/duty#team",  icon: Users,    description: "Staff on duty" },
          { title: "Stock",   href: "/team-portal/kitchen/stock", icon: Package,  description: "Inventory levels" },
          { title: "Recipes", href: "/team-portal/kitchen/menu",  icon: BookOpen, description: "Recipe library" },
        ],
      },
      ...(canSeeManagerLinks ? [{
        id: "manager",
        title: "Manager",
        defaultOpen: true,
        items: [
          { title: "Manage team", href: "/team-portal/kitchen/management", icon: Users, description: "Roster, clock-ins and diary" },
          { title: "Team overview", href: "/admin/teams/kitchen", icon: Users, description: "Prep intelligence and broadcasts" },
          { title: "Schedule", href: "/admin/kitchen-schedule", icon: CalendarClock, description: "Plan shifts + clock-ins" },
          { title: "Rules", href: "/admin/kitchen-settings", icon: Settings, description: "Prep timing + alerts" },
        ],
      }] : []),
      {
        id: "footer",
        title: "",
        defaultOpen: true,
        footerTreatment: true,
        items: [
          {
            title: "Notifications",
            href: "/team-portal/kitchen/notifications",
            icon: Bell,
            badge: () => counts.notifications > 0
              ? { text: String(counts.notifications), tone: "critical" }
              : null,
          },
          // Wave 70.8 - Settings removed from the kitchen nav.
          // Kitchen prep + shift policy is now tuned at
          // /admin/kitchen-settings by the owner / admin only.
          // BCEA thresholds and dietary alert sensitivity are
          // management decisions, not chef-tunable.
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}
