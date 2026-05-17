/**
 * AdminSmartQuickActions -- Wave 70.31
 *
 * Three quick-action tiles at the top of the mobile drawer. The
 * trio rotates by mode so the owner sees the most likely
 * "what I need right now" action first.
 *
 *   setup     -- Continue onboarding, Add first client, Add inventory
 *   quiet     -- Today's events, New leads, Stock outlook
 *   pipeline  -- Overdue quotes, New leads, Calendar
 *   ops       -- Live ops, Dispatch, Today's events
 *   review    -- Financial dashboard, Unpaid invoices, Recent payments
 *
 * Wraps the existing MobileQuickActions presenter so the visual
 * treatment matches the other portals.
 */
import { MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import {
  Wand2, UserPlus, Package, Calendar, FileSpreadsheet, MapPin, ClipboardList, Activity, BarChart3, Wallet, Receipt,
} from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useAdminPortalMode } from "@/hooks/useAdminPortalMode";

interface AdminSmartQuickActionsProps {
  /** Called after the user taps a tile so the drawer can close. */
  onNavigate?: () => void;
}

export function AdminSmartQuickActions({ onNavigate }: AdminSmartQuickActionsProps) {
  const { withSlug } = useTenantHref();
  const { mode } = useAdminPortalMode();

  const ACTIONS_BY_MODE = {
    setup: [
      { href: "/admin/onboarding", label: "Continue setup",  sub: "Finish onboarding",     icon: Wand2,     accent: "from-indigo-500 to-purple-500" },
      { href: "/admin/contacts",   label: "Add client",      sub: "Build your CRM",        icon: UserPlus,  accent: "from-blue-500 to-indigo-500" },
      { href: "/admin/inventory",  label: "Stock setup",     sub: "Items + par levels",    icon: Package,   accent: "from-emerald-500 to-teal-500" },
    ],
    quiet: [
      { href: "/admin/calendar",   label: "Today's events",  sub: "Calendar",              icon: Calendar,  accent: "from-purple-500 to-pink-500" },
      { href: "/admin/leads",      label: "New leads",       sub: "Inbox",                 icon: UserPlus,  accent: "from-blue-500 to-indigo-500" },
      { href: "/admin/stock",      label: "Stock outlook",   sub: "Pressure feed",         icon: Package,   accent: "from-emerald-500 to-teal-500" },
    ],
    pipeline: [
      { href: "/admin/quotes",     label: "Quotes to chase", sub: "> 48h overdue",         icon: FileSpreadsheet, accent: "from-blue-500 to-indigo-500" },
      { href: "/admin/leads",      label: "Lead inbox",      sub: "New today",             icon: UserPlus,  accent: "from-purple-500 to-pink-500" },
      { href: "/admin/calendar",   label: "Calendar",        sub: "What's coming",         icon: Calendar,  accent: "from-emerald-500 to-teal-500" },
    ],
    ops: [
      { href: "/admin/tracking",          label: "Live ops",      sub: "Today's jobs in flight", icon: MapPin,        accent: "from-purple-500 to-pink-500" },
      { href: "/admin/order-assignments", label: "Dispatch",      sub: "Assign drivers",         icon: ClipboardList, accent: "from-rose-500 to-orange-500" },
      { href: "/admin/calendar",          label: "Today",         sub: "Full schedule",          icon: Activity,      accent: "from-blue-500 to-indigo-500" },
    ],
    review: [
      { href: "/admin/financial-dashboard", label: "Revenue today", sub: "Day's numbers",      icon: BarChart3, accent: "from-emerald-500 to-teal-500" },
      { href: "/admin/invoices",            label: "Unpaid",        sub: "Chase outstanding",  icon: Wallet,    accent: "from-amber-500 to-orange-500" },
      { href: "/admin/refunds",             label: "Refunds",       sub: "Pending payouts",    icon: Receipt,   accent: "from-rose-500 to-pink-500" },
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
