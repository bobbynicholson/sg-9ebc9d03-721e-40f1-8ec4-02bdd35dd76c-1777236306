/**
 * AdminSmartQuickActions - Wave 70.31
 *
 * Three quick-action tiles at the top of the mobile drawer. The
 * trio rotates by mode so the owner sees the most likely
 * "what I need right now" action first.
 *
 *   setup     - Continue onboarding, Add first client, Add inventory
 *   quiet     - Today's events, New leads, Stock outlook
 *   pipeline  - Overdue quotes, New leads, Calendar
 *   ops       - Live ops, Dispatch, Today's events
 *   review    - Financial dashboard, Unpaid invoices, Recent payments
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
import { BRAND_ACCENT } from "@/lib/branding/portalPalette";

interface AdminSmartQuickActionsProps {
  /** Called after the user taps a tile so the drawer can close. */
  onNavigate?: () => void;
}

export function AdminSmartQuickActions({ onNavigate }: AdminSmartQuickActionsProps) {
  const { withSlug } = useTenantHref();
  const { mode } = useAdminPortalMode();

  const ACTIONS_BY_MODE = {
    setup: [
      { href: "/admin/onboarding", label: "Continue setup",  sub: "Finish onboarding",     icon: Wand2,     accent: BRAND_ACCENT },
      { href: "/admin/contacts",   label: "Add client",      sub: "Build your CRM",        icon: UserPlus,  accent: BRAND_ACCENT },
      { href: "/admin/inventory",  label: "Stock setup",     sub: "Items + par levels",    icon: Package,   accent: BRAND_ACCENT },
    ],
    quiet: [
      { href: "/admin/calendar",   label: "Today's events",  sub: "Calendar",              icon: Calendar,  accent: BRAND_ACCENT },
      { href: "/admin/leads",      label: "New leads",       sub: "Inbox",                 icon: UserPlus,  accent: BRAND_ACCENT },
      { href: "/admin/stock",      label: "Stock outlook",   sub: "Pressure feed",         icon: Package,   accent: BRAND_ACCENT },
    ],
    pipeline: [
      { href: "/admin/quotes",     label: "Quotes to chase", sub: "> 48h overdue",         icon: FileSpreadsheet, accent: BRAND_ACCENT },
      { href: "/admin/leads",      label: "Lead inbox",      sub: "New today",             icon: UserPlus,  accent: BRAND_ACCENT },
      { href: "/admin/calendar",   label: "Calendar",        sub: "What's coming",         icon: Calendar,  accent: BRAND_ACCENT },
    ],
    ops: [
      { href: "/admin/tracking",          label: "Live ops",      sub: "Today's jobs in flight", icon: MapPin,        accent: BRAND_ACCENT },
      { href: "/admin/order-assignments", label: "Dispatch",      sub: "Assign drivers",         icon: ClipboardList, accent: BRAND_ACCENT },
      { href: "/admin/calendar",          label: "Today",         sub: "Full schedule",          icon: Activity,      accent: BRAND_ACCENT },
    ],
    review: [
      { href: "/admin/financial-dashboard", label: "Revenue today", sub: "Day's numbers",      icon: BarChart3, accent: BRAND_ACCENT },
      { href: "/admin/invoices",            label: "Unpaid",        sub: "Chase outstanding",  icon: Wallet,    accent: BRAND_ACCENT },
      { href: "/admin/refunds",             label: "Refunds",       sub: "Pending payouts",    icon: Receipt,   accent: BRAND_ACCENT },
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
