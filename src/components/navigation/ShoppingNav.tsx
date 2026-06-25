/**
 * ShoppingNav - Wave 70.29 redesign.
 *
 * Restructured from the original 3-section static list (Live now /
 * Procurement / Footer) into 4 sections plus the live-intelligence
 * layer that's now proven on kitchen (Wave 70.7) and cleaning
 * (Wave 70.28).
 *
 *   LIVE NOW    - Today, Buy list, Active shop, Receipts   (4 items, always open)
 *   CATALOGUE   - Inventory, Suppliers                     (2 items, closed)
 *   INSIGHTS    - Kitchen demand, Spend                    (2 items, closed)
 *   FOOTER      - Notifications, Settings                  (footer treatment)
 *
 * Live layer:
 *   - ShoppingModeBadge       quiet / plan / run / reconcile with
 *                              subline copy + tap-to-override popover
 *   - ShoppingLiveStateStrip  4 pills: Short / Active / Receipts /
 *                              Spend - each deep-links to the right view
 *   - ShoppingSmartQuickActions  mobile-only, rotates 3 tiles by mode
 *   - useShoppingModeToast    one-shot toast when run mode kicks in
 *
 * Renames vs old nav (with rationale):
 *   "Purchase Orders" -> "Active shop"
 *     - "Purchase Orders" sounds like supplier-issued POs to a
 *        procurement person; the page actually shows shopping_lists
 *        the team is running.
 *   "Stock Alerts"    -> "Buy list"
 *     - Reframes the page as "things to buy" (action) instead of
 *        "alerts" (status). Same data, more imperative.
 *   "Current Stock"   -> "Inventory"
 *     - Shorter, matches the page header.
 *   "Receipt scanner" -> "Receipts"
 *     - The page does both scan + view; "Receipts" covers both.
 *   "Invoices"        -> "Spend"
 *     - These aren't supplier-issued invoices; they're our
 *        completed shopping_lists. "Spend" is what the owner
 *        actually wants to see.
 *
 * All hooks run unconditionally at the top so React rules-of-hooks
 * is honoured (Wave 70.25 lesson).
 */
import {
  LayoutDashboard,
  TrendingDown,
  ShoppingCart,
  Camera,
  Warehouse,
  Users,
  ChefHat,
  Wallet,
  Bell,
  Settings,
} from "lucide-react";
import { PortalSidebar, type PortalSidebarConfig } from "./PortalSidebar";
// Wave 71 - shopping gets its own theme combination (accent -> primary)
// so the portal is visually distinct from kitchen/driver/cleaning while
// still drawing only from the tenant's brand tokens. See portalPalette.ts.
import { SHOPPING_PORTAL_PALETTE as BRAND_PORTAL_PALETTE, SHOPPING_ACCENT as BRAND_ACCENT } from "@/lib/branding/portalPalette";
import { useShoppingLiveCounts } from "@/hooks/useShoppingLiveCounts";
import { useShoppingPortalMode } from "@/hooks/useShoppingPortalMode";
import { useActiveShoppingList } from "@/hooks/useActiveShoppingList";
import { ShoppingModeBadge } from "@/components/shopping/ShoppingModeBadge";
import { ShoppingSmartQuickActions } from "@/components/shopping/ShoppingSmartQuickActions";
import { useShoppingModeToast } from "@/hooks/useShoppingModeToast";

interface ShoppingNavProps {
  className?: string;
  companySlug?: string;
}

export function ShoppingNav(_: ShoppingNavProps = {}) {
  // Hooks at the top, stable order across renders.
  const counts = useShoppingLiveCounts();
  const mode = useShoppingPortalMode();
  // Wave 70.30: the active-list hook drives the Active shop badge
  // and live item counts. The item-level ticking surface is Today;
  // Active shop is list creation, claiming, and close-out.
  const activeList = useActiveShoppingList();

  // One-shot toast on auto-transition into run mode.
  useShoppingModeToast();

  const isRunActive = mode.mode === "run";
  const remainingOnList = activeList.items.filter(i => !i.purchased).length;

  const config: PortalSidebarConfig = {
    role: "shopping",
    title: "Shopping Portal",
    mobileSubtitle: "Plan, run, reconcile",
    brandIcon: ShoppingCart,
    // Tenant brand accent via brand-* CSS vars (amber default). See
    // portalPalette.ts. (Was green/emerald, then hardcoded amber.)
    ...BRAND_PORTAL_PALETTE,
    searchHint: "Search items, suppliers, lists...",
    dashboardHref: "/team-portal/shopping/dashboard",
    // Static fallback. The smart renderer below normally takes over.
    mobileQuickActions: [
      // Phase 3d shopping sweep: the static fallback used to point
      // "Buy list" at /alerts (the legacy passive table). Canonical
      // buy-list surface is /buy-list (action-driven with checkboxes
      // and bulk-add). /alerts kept as a deprecated alias for
      // bookmarks.
      { href: "/team-portal/shopping/buy-list", label: "Buy list",    sub: "Shortfalls first",  icon: TrendingDown, accent: BRAND_ACCENT },
      { href: "/team-portal/shopping/orders",   label: "Active shop", sub: "Current list",      icon: ShoppingCart, accent: BRAND_ACCENT },
      { href: "/team-portal/shopping/receipts", label: "Receipts",    sub: "Snap a slip",       icon: Camera,       accent: BRAND_ACCENT },
    ],
    // Keep just the compact mode badge in the sidebar; the live-state
    // pill strip was dropped from the rail (it lives on the shopping
    // dashboard) to match the slimmer admin + platform nav.
    renderTopSlot: () => <ShoppingModeBadge />,
    renderMobileQuickActions: ({ onNavigate }) => (
      <ShoppingSmartQuickActions onNavigate={onNavigate} />
    ),
    sections: [
      {
        id: "live-now",
        title: "Live now",
        defaultOpen: true,
        items: [
          {
            title: "Today",
            href: "/team-portal/shopping/dashboard",
            icon: LayoutDashboard,
            description: "Your shopping desk",
            liveDescription: () => {
              const bits: string[] = [];
              if (mode.shortfallCount > 0) bits.push(`${mode.shortfallCount} short`);
              if (mode.activeLists > 0) bits.push(`${mode.activeLists} list${mode.activeLists === 1 ? "" : "s"}`);
              if (mode.unfiledReceiptsToday > 0) bits.push(`${mode.unfiledReceiptsToday} receipt${mode.unfiledReceiptsToday === 1 ? "" : "s"}`);
              return bits.length ? bits.join(" · ") : "All caught up";
            },
          },
          {
            title: "Buy list",
            // Wave 70.30: re-pointed from /alerts to the canonical
            // /buy-list page (action-first surface). /alerts stays
            // live for backwards compat.
            href: "/team-portal/shopping/buy-list",
            icon: TrendingDown,
            description: "Shortfall + low-stock",
            badge: () => counts.shortItems > 0
              ? { text: `${counts.shortItems} short`, tone: "critical", pulse: true }
              : null,
            liveDescription: () => counts.shortItems === 0 && !counts.loading
              ? "Stock covers next 7 days"
              : null,
          },
          {
            title: "Active shop",
            href: "/team-portal/shopping/orders",
            icon: ShoppingCart,
            description: "Create, claim, close lists",
            badge: () => {
              if (remainingOnList > 0) {
                return { text: `${remainingOnList} left`, tone: "default", pulse: isRunActive };
              }
              if (activeList.list && remainingOnList === 0 && activeList.items.length > 0) {
                return { text: "All bought", tone: "default" };
              }
              return null;
            },
            liveDescription: () => {
              if (!activeList.list) return "No open list";
              if (remainingOnList === 0 && activeList.items.length > 0) {
                return "Ready to file receipt";
              }
              return null;
            },
          },
          {
            title: "Receipts",
            href: "/team-portal/shopping/receipts",
            icon: Camera,
            description: "Snap supplier slips",
            badge: () => counts.receiptsToFile > 0
              ? { text: `${counts.receiptsToFile} to file`, tone: "warning" }
              : null,
            liveDescription: () => counts.receiptsToFile === 0 && !counts.loading
              ? "All filed for today"
              : null,
          },
        ],
      },
      {
        id: "catalogue",
        title: "Catalogue",
        defaultOpen: false,
        items: [
          { title: "Inventory", href: "/team-portal/shopping/inventory", icon: Warehouse, description: "Stock + par levels" },
          { title: "Suppliers", href: "/team-portal/shopping/suppliers", icon: Users,     description: "Contacts + pricing" },
        ],
      },
      {
        id: "insights",
        title: "Insights",
        defaultOpen: false,
        items: [
          { title: "Kitchen demand", href: "/team-portal/shopping/kitchen-demand", icon: ChefHat, description: "Recipe pull from orders" },
          { title: "Spend",          href: "/team-portal/shopping/invoices",       icon: Wallet,  description: "Completed lists + totals" },
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
            href: "/team-portal/shopping/notifications",
            icon: Bell,
            badge: () => counts.notifications > 0
              ? { text: String(counts.notifications), tone: "critical" }
              : null,
          },
          { title: "Settings", href: "/team-portal/shopping/settings", icon: Settings },
        ],
      },
    ],
  };

  return <PortalSidebar config={config} />;
}
