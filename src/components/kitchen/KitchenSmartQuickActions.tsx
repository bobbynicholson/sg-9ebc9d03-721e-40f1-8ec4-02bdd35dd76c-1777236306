/**
 * KitchenSmartQuickActions - Wave 70.7b
 *
 * Three quick-action tiles at the top of the mobile drawer. The
 * trio changes based on the current service mode so the chef sees
 * the most likely "what I need right now" actions:
 *
 *   off     - Today, Recipes, Stock     (informational browse)
 *   prep    - Prep List, Production, Stock  (gear up)
 *   service - Production, Today, Mark ready  (act fast)
 *   close   - Team, Hand-off note, Stock used  (wrap up)
 *
 * Wraps the existing MobileQuickActions presenter so the visual
 * treatment stays consistent with the other portals.
 */
import { MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import { ChefHat, ClipboardList, Package, BookOpen, Flame, LayoutDashboard, Users, MessageSquareText } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { usePortalServiceMode } from "@/hooks/usePortalServiceMode";

interface KitchenSmartQuickActionsProps {
  /** Called after the user taps a tile so the drawer can close. */
  onNavigate?: () => void;
}

export function KitchenSmartQuickActions({ onNavigate }: KitchenSmartQuickActionsProps) {
  const { withSlug } = useTenantHref();
  const { mode } = usePortalServiceMode();
  const accent = "from-brand-primary to-brand-secondary";

  const ACTIONS_BY_MODE = {
    off: [
      { href: "/team-portal/kitchen/today",    label: "Today",   sub: "What's coming up",  icon: LayoutDashboard, accent },
      { href: "/team-portal/kitchen/menu",     label: "Recipes", sub: "Recipe library",    icon: BookOpen,        accent },
      { href: "/team-portal/kitchen/stock",    label: "Stock",   sub: "Inventory levels",  icon: Package,         accent },
    ],
    prep: [
      { href: "/team-portal/kitchen/prep-list",  label: "Prep list",  sub: "Today's tasks",      icon: ClipboardList, accent },
      { href: "/team-portal/kitchen/production", label: "Production", sub: "Day grid",           icon: ChefHat,       accent },
      { href: "/team-portal/kitchen/stock",      label: "Stock",      sub: "Quick deduct",       icon: Package,       accent },
    ],
    service: [
      { href: "/team-portal/kitchen/production", label: "Production", sub: "Mark items ready",   icon: Flame,         accent },
      { href: "/team-portal/kitchen/today",      label: "Service",    sub: "Service desk view",  icon: LayoutDashboard, accent },
      { href: "/team-portal/kitchen/prep-list",  label: "Prep list",  sub: "Last-minute prep",   icon: ClipboardList, accent },
    ],
    close: [
      { href: "/team-portal/kitchen/duty",       label: "Clock out",   sub: "End your shift",     icon: Users,             accent },
      { href: "/team-portal/kitchen/duty",       label: "Hand-off",    sub: "Note for next shift",icon: MessageSquareText, accent },
      { href: "/team-portal/kitchen/stock",      label: "Stock used",  sub: "Deduct on inventory",icon: Package,           accent },
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
