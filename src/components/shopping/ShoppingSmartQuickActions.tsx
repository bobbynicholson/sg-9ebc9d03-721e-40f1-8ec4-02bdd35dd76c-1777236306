/**
 * ShoppingSmartQuickActions - Wave 70.29
 *
 * Three quick-action tiles at the top of the mobile drawer. The
 * trio rotates based on the current shopping mode so the shopper
 * sees the most likely "what I need right now" action first.
 *
 *   quiet     - Suppliers, Inventory, Kitchen demand   (catch-up)
 *   plan      - Build buy list, Kitchen demand, Inventory  (gear up)
 *   run       - Snap a receipt, Active list, Quick add   (act fast)
 *   reconcile - File receipts, Spend today, Match suppliers (wrap)
 *
 * Wraps the existing MobileQuickActions presenter so the visual
 * treatment stays consistent with the other portals.
 */
import { MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import {
  Users,
  Warehouse,
  ChefHat,
  ListChecks,
  Camera,
  ShoppingCart,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useShoppingPortalMode } from "@/hooks/useShoppingPortalMode";

interface ShoppingSmartQuickActionsProps {
  /** Called after the user taps a tile so the drawer can close. */
  onNavigate?: () => void;
}

export function ShoppingSmartQuickActions({ onNavigate }: ShoppingSmartQuickActionsProps) {
  const { withSlug } = useTenantHref();
  const { mode } = useShoppingPortalMode();

  const ACTIONS_BY_MODE = {
    quiet: [
      { href: "/team-portal/shopping/suppliers",      label: "Suppliers",      sub: "Contacts + prices",     icon: Users,     accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/inventory",      label: "Inventory",      sub: "Stock levels",          icon: Warehouse, accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/kitchen-demand", label: "Kitchen demand", sub: "What's coming up",      icon: ChefHat,   accent: "from-brand-primary to-brand-secondary" },
    ],
    plan: [
      // Wave 70.30: re-pointed at the canonical /buy-list page.
      { href: "/team-portal/shopping/buy-list",       label: "Build buy list", sub: "Shortfall first",       icon: ListChecks, accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/kitchen-demand", label: "Kitchen demand", sub: "Recipe pull",           icon: ChefHat,    accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/inventory",      label: "Inventory",      sub: "Check par levels",      icon: Warehouse,  accent: "from-brand-primary to-brand-secondary" },
    ],
    run: [
      { href: "/team-portal/shopping/receipts",       label: "Snap a receipt", sub: "Photo the slip",        icon: Camera,      accent: "from-brand-primary to-brand-secondary" },
      // Wave 70.30: "Active list" now lives on the dashboard.
      { href: "/team-portal/shopping/dashboard",      label: "Your list",      sub: "Tick items off",        icon: ShoppingCart, accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/buy-list",       label: "Quick add",      sub: "Add more from shortfall", icon: Plus,       accent: "from-brand-primary to-brand-secondary" },
    ],
    reconcile: [
      { href: "/team-portal/shopping/receipts",       label: "File receipts",  sub: "Upload today's slips",  icon: Receipt,   accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/invoices",       label: "Spend today",    sub: "Match totals",          icon: Wallet,    accent: "from-brand-primary to-brand-secondary" },
      { href: "/team-portal/shopping/suppliers",      label: "Suppliers",      sub: "Confirm contacts",      icon: Users,     accent: "from-brand-primary to-brand-secondary" },
    ],
  } as const;

  const set = ACTIONS_BY_MODE[mode];

  return (
    <MobileQuickActions
      onNavigate={onNavigate}
      actions={set.map((a) => ({
        ...a,
        href: withSlug(a.href),
      }))}
    />
  );
}
