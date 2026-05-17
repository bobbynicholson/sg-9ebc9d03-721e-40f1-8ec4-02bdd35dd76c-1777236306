/**
 * CleaningSmartQuickActions -- Wave 70.28
 *
 * Three quick-action tiles at the top of the mobile drawer. The
 * trio rotates based on the current cleaning mode so the cleaner
 * sees the most likely "what I need right now" action first.
 *
 *   quiet     -- Open damages, Equipment, Stock check
 *   dispatch  -- Verify outgoing, Today's events, Report damage
 *   returns   -- Verify a return, Active washes, Clock in
 *   wrap      -- Sign off jobs, Open damages, Clock out
 *
 * Wraps the existing MobileQuickActions presenter so the visual
 * treatment stays consistent with the other portals.
 */
import { MobileQuickActions } from "@/components/portal/MobileDrawerExtras";
import {
  AlertTriangle,
  Package,
  SprayCan,
  ClipboardCheck,
  PackageOpen,
  Droplets,
  Clock,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";
import { useCleaningPortalMode } from "@/hooks/useCleaningPortalMode";

interface CleaningSmartQuickActionsProps {
  /** Called after the user taps a tile so the drawer can close. */
  onNavigate?: () => void;
}

export function CleaningSmartQuickActions({ onNavigate }: CleaningSmartQuickActionsProps) {
  const { withSlug } = useTenantHref();
  const { mode } = useCleaningPortalMode();

  const ACTIONS_BY_MODE = {
    quiet: [
      { href: "/team-portal/cleaning/damage",    label: "Open damages",  sub: "Clear the backlog",     icon: AlertTriangle, accent: "from-amber-500 to-orange-500" },
      { href: "/team-portal/cleaning/equipment", label: "Equipment",     sub: "Catalogue + verify",    icon: Package,       accent: "from-cyan-500 to-blue-500" },
      { href: "/team-portal/cleaning/supplies",  label: "Stock check",   sub: "Detergents + cloths",   icon: SprayCan,      accent: "from-emerald-500 to-teal-500" },
    ],
    dispatch: [
      { href: "/team-portal/cleaning/equipment", label: "Verify outgoing", sub: "Check before dispatch", icon: ClipboardCheck, accent: "from-amber-500 to-orange-500" },
      { href: "/team-portal/cleaning/dashboard", label: "Today's events",  sub: "What's going out",      icon: Calendar,       accent: "from-cyan-500 to-blue-500" },
      { href: "/team-portal/cleaning/damage",    label: "Report damage",   sub: "Log a broken item",     icon: AlertTriangle,  accent: "from-rose-500 to-pink-500" },
    ],
    returns: [
      { href: "/team-portal/cleaning/dashboard#returns", label: "Verify a return", sub: "Equipment coming back", icon: PackageOpen, accent: "from-cyan-500 to-blue-500" },
      { href: "/team-portal/cleaning/dashboard#washing", label: "Active washes",   sub: "Jobs in progress",      icon: Droplets,    accent: "from-blue-500 to-indigo-500" },
      { href: "/team-portal/cleaning/tasks",             label: "Clock in",        sub: "Start your shift",      icon: Clock,       accent: "from-emerald-500 to-teal-500" },
    ],
    wrap: [
      { href: "/team-portal/cleaning/dashboard#washing", label: "Sign off jobs", sub: "Mark handovers done", icon: CheckCircle2,  accent: "from-emerald-500 to-teal-500" },
      { href: "/team-portal/cleaning/damage",            label: "Open damages",  sub: "End-of-day log",      icon: AlertTriangle, accent: "from-amber-500 to-orange-500" },
      { href: "/team-portal/cleaning/tasks",             label: "Clock out",     sub: "End your shift",      icon: Clock,         accent: "from-slate-500 to-slate-600" },
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
