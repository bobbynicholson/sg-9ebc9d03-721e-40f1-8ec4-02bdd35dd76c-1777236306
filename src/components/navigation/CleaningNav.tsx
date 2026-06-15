/**
 * CleaningNav - Wave 70.28 redesign.
 *
 * Restructured from the original 3-section static list (Live now /
 * Equipment / Footer) into 4 sections plus a live-intelligence layer
 * that mirrors the kitchen portal pattern proven in Wave 70.7:
 *
 *   LIVE NOW   - Today, Returns, Washing, My shift  (4 items, always open)
 *   INVENTORY  - Equipment, Supplies, Workflows     (3 items, closed by default)
 *   REPORTS    - Damages, Schedules                 (2 items, closed by default)
 *   FOOTER     - Notifications, Settings            (footer treatment)
 *
 * The new live layer surfaces above the sections:
 *
 *   - CleaningModeBadge       - quiet / dispatch / returns / wrap
 *                                with subline copy + tap-to-override
 *   - CleaningLiveStateStrip  - 4 pills: Returns, Washing, Damages,
 *                                On duty - each is a deep-link
 *
 * Plus mobile-only:
 *
 *   - CleaningSmartQuickActions - 3 tiles that rotate by mode
 *   - useCleaningModeToast      - one-shot toast when returns mode
 *                                  first triggers
 *
 * Why the redesign:
 *   1. "Tasks" + "Schedules" + "Today" were three synonyms in the
 *      old nav. Collapsed and reframed around the handover lifecycle.
 *   2. Handovers are the strategic unit but had no nav slot --
 *      surfaced via Returns / Washing items.
 *   3. Verification was buried under Equipment; it's now reachable
 *      from a smart quick action that rotates to the top during
 *      returns mode.
 *   4. Icon set locked to match each page header (no more
 *      Sparkles-for-workflows / Package-for-verification mismatches).
 *
 * Live data wiring: counts + mode read in this component, passed
 * down via per-item badge / liveDescription closures so the config
 * stays declarative and the live-fetch components mount inside the
 * sidebar's React tree.
 */
import {
  LayoutDashboard,
  PackageOpen,
  Droplets,
  Clock,
  Package,
  SprayCan,
  BookOpen,
  AlertTriangle,
  CalendarClock,
  Bell,
  Settings,
  Sparkles,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";
import { useCleaningLiveCounts } from "@/hooks/useCleaningLiveCounts";
import { useCleaningPortalMode } from "@/hooks/useCleaningPortalMode";
import { CleaningModeBadge } from "@/components/cleaning/CleaningModeBadge";
import { CleaningLiveStateStrip } from "@/components/cleaning/CleaningLiveStateStrip";
import { CleaningSmartQuickActions } from "@/components/cleaning/CleaningSmartQuickActions";
import { useCleaningModeToast } from "@/hooks/useCleaningModeToast";

interface CleaningNavProps {
  className?: string;
  companySlug?: string;
}

export function CleaningNav(_: CleaningNavProps = {}) {
  // Hooks run unconditionally at the top so React's rules-of-hooks
  // contract is honoured (lesson from Wave 70.25). Order is stable
  // across renders.
  const counts = useCleaningLiveCounts();
  const mode = useCleaningPortalMode();

  // One-shot toast on auto-transition into returns mode. Mounted at
  // the nav level so it fires regardless of which cleaning page the
  // user happens to be on when the mode flips.
  useCleaningModeToast();

  const isReturnsActive = mode.mode === "returns";

  const config: PortalSidebarConfig = {
    role: "cleaning",
    title: "Cleaning Portal",
    mobileSubtitle: "Returns, washes, damages",
    brandIcon: Sparkles,
    accentGradient: "from-amber-500 to-orange-500",
    accentGradientDark: "from-amber-600 to-orange-600",
    hoverClasses: "hover:bg-amber-50 hover:text-amber-700",
    activeHoverClasses: "hover:from-amber-600 hover:to-orange-600",
    mobileSubtitleClasses: "text-amber-100",
    searchAccent: "bg-amber-50 hover:bg-amber-100 text-amber-700",
    searchHint: "Search handovers, equipment, supplies...",
    dashboardHref: "/team-portal/cleaning/dashboard",
    // Static fallback mobile quick actions - only used if the smart
    // renderer below somehow doesn't fire. Kept for safety.
    mobileQuickActions: [
      { href: "/team-portal/cleaning/dashboard#returns", label: "Returns",     sub: "Equipment coming back", icon: PackageOpen, accent: "from-amber-500 to-orange-500" },
      { href: "/team-portal/cleaning/dashboard#washing", label: "Washing",     sub: "Active jobs",           icon: Droplets,    accent: "from-amber-500 to-orange-500" },
      { href: "/team-portal/cleaning/equipment",         label: "Equipment",   sub: "Verify + catalogue",    icon: Package,     accent: "from-amber-500 to-orange-500" },
    ],
    renderTopSlot: () => (
      <div className="space-y-2">
        <CleaningModeBadge />
        <CleaningLiveStateStrip />
      </div>
    ),
    renderMobileQuickActions: ({ onNavigate }) => (
      <CleaningSmartQuickActions onNavigate={onNavigate} />
    ),
    sections: [
      {
        id: "live-now",
        title: "Live now",
        defaultOpen: true,
        items: [
          {
            title: "Today",
            href: "/team-portal/cleaning/dashboard",
            icon: LayoutDashboard,
            description: "The full cleaning desk",
            liveDescription: () => {
              if (mode.outboundToday === 0 && mode.returnsDue === 0 && mode.activeHandovers === 0) {
                return "Nothing live";
              }
              const bits: string[] = [];
              if (mode.outboundToday > 0) bits.push(`${mode.outboundToday} out`);
              if (mode.returnsDue > 0) bits.push(`${mode.returnsDue} due`);
              if (mode.activeHandovers > 0) bits.push(`${mode.activeHandovers} in wash`);
              return bits.join(" · ");
            },
          },
          {
            title: "Returns",
            href: "/team-portal/cleaning/dashboard#returns",
            icon: PackageOpen,
            description: "Equipment coming back",
            badge: () => {
              if (counts.returnsDue > 0) {
                return { text: `${counts.returnsDue} due`, tone: "critical", pulse: isReturnsActive };
              }
              return null;
            },
            liveDescription: () => counts.returnsDue === 0 && !counts.loading
              ? "Nothing due in the next 4h"
              : null,
          },
          {
            title: "Washing",
            href: "/team-portal/cleaning/dashboard#washing",
            icon: Droplets,
            description: "Active handover jobs",
            badge: () => counts.inProgress > 0
              ? { text: `${counts.inProgress} active`, tone: "default" }
              : null,
            liveDescription: () => counts.inProgress === 0 && !counts.loading
              ? "Nothing in the wash"
              : null,
          },
          {
            title: "My shift",
            href: "/team-portal/cleaning/tasks",
            icon: Clock,
            description: "Tasks + clock in/out",
            liveDescription: () => counts.onDutyNow > 0
              ? `${counts.onDutyNow} on duty`
              : "Off duty - tap to start",
          },
        ],
      },
      {
        id: "inventory",
        title: "Inventory",
        defaultOpen: false,
        items: [
          { title: "Equipment", href: "/team-portal/cleaning/equipment", icon: Package,   description: "Catalogue + verify returns" },
          {
            title: "Supplies",
            href: "/team-portal/cleaning/supplies",
            icon: SprayCan,
            description: "Detergents + consumables",
          },
          { title: "Workflows", href: "/team-portal/cleaning/workflows", icon: BookOpen,  description: "Cleaning SOPs per item" },
        ],
      },
      {
        id: "reports",
        title: "Reports",
        defaultOpen: false,
        items: [
          {
            title: "Damages",
            href: "/team-portal/cleaning/damage",
            icon: AlertTriangle,
            description: "Broken + missing register",
            badge: () => counts.openDamages > 0
              ? { text: `${counts.openDamages} open`, tone: "warning" }
              : null,
          },
          { title: "Schedules", href: "/team-portal/cleaning/schedules", icon: CalendarClock, description: "Recurring cleaning plan" },
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
            href: "/team-portal/cleaning/notifications",
            icon: Bell,
            badge: () => counts.notifications > 0
              ? { text: String(counts.notifications), tone: "critical" }
              : null,
          },
          { title: "Settings", href: "/team-portal/cleaning/settings", icon: Settings },
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}
