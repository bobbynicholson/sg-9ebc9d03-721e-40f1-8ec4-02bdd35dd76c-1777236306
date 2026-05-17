/**
 * KitchenNav -- Wave 70.7 redesign.
 *
 * Before this wave the kitchen nav was a generic 4-section / 8-item
 * list copied from the driver / cleaning / shopping pattern with
 * labels swapped in. That's fine for a portal whose user opens it
 * once a day; the kitchen portal user opens it dozens of times
 * during a service and needs a tighter, more intelligent surface.
 *
 * Restructured into:
 *   LIVE NOW    -- Today, Production, Prep List   (3 items, always open)
 *   KITCHEN OPS -- Team, Stock, Recipes           (3 items, closed by default)
 *   FOOTER      -- Notifications, Settings        (footer treatment)
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
  Settings,
  BookOpen,
  Flame,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";
import { useKitchenLiveCounts } from "@/hooks/useKitchenLiveCounts";
import { usePortalServiceMode } from "@/hooks/usePortalServiceMode";
import { KitchenServiceModeBadge } from "@/components/kitchen/KitchenServiceModeBadge";
import { KitchenLiveStateStrip } from "@/components/kitchen/KitchenLiveStateStrip";
import { KitchenSmartQuickActions } from "@/components/kitchen/KitchenSmartQuickActions";

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

  const isService = serviceMode.mode === "service";

  const config: PortalSidebarConfig = {
    role: "kitchen",
    title: "Kitchen Portal",
    mobileSubtitle: "Manage production",
    brandIcon: ChefHat,
    accentGradient: "from-orange-500 to-red-500",
    accentGradientDark: "from-orange-600 to-red-600",
    hoverClasses: "hover:bg-orange-50 hover:text-orange-700",
    activeHoverClasses: "hover:from-orange-600 hover:to-red-600",
    mobileSubtitleClasses: "text-orange-100",
    searchAccent: "bg-orange-50 hover:bg-orange-100 text-orange-700",
    searchHint: "Search recipes, prep...",
    dashboardHref: "/team-portal/kitchen/today",
    mobileQuickActions: [
      { href: "/team-portal/kitchen/prep-list",  label: "Today's prep",  sub: "Per-order ingredients", icon: ClipboardList, accent: "from-orange-500 to-red-500" },
      { href: "/team-portal/kitchen/production", label: "Production",    sub: "Mark items ready",      icon: ChefHat,       accent: "from-amber-500 to-orange-500" },
      { href: "/team-portal/kitchen/stock",      label: "Stock check",   sub: "Pull from inventory",   icon: Package,       accent: "from-emerald-500 to-teal-500" },
    ],
    renderTopSlot: () => (
      <div className="space-y-2">
        <KitchenServiceModeBadge />
        <KitchenLiveStateStrip />
      </div>
    ),
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
            // Wave 70.7 -- icon overlay swap during service.
            // The base ChefHat icon stays so the chef's muscle-memory
            // shape isn't disrupted; a small flame badge sits in the
            // top-right corner only during service hours.
            iconOverlay: () => isService ? (
              <Flame className="h-2.5 w-2.5 text-amber-600 drop-shadow-sm" />
            ) : null,
          },
          {
            title: "Prep List",
            href: "/team-portal/kitchen/prep-list",
            icon: ClipboardList,
            description: "Daily prep tasks",
            liveDescription: () => counts.inPrep === 0 && !counts.loading
              ? "All caught up"
              : null,
          },
        ],
      },
      {
        id: "kitchen-ops",
        title: "Kitchen ops",
        defaultOpen: false,
        items: [
          { title: "Team",    href: "/team-portal/kitchen/duty",  icon: Users,    description: "Staff on duty" },
          { title: "Stock",   href: "/team-portal/kitchen/stock", icon: Package,  description: "Inventory levels" },
          { title: "Recipes", href: "/team-portal/kitchen/menu",  icon: BookOpen, description: "Recipe library" },
        ],
      },
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
          {
            title: "Settings",
            href: "/team-portal/kitchen/settings",
            icon: Settings,
          },
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}
