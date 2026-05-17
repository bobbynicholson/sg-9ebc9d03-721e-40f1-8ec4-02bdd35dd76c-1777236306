/**
 * ShoppingLiveStateStrip -- Wave 70.29
 *
 * The 4-metric "what's happening right now" strip that sits at the
 * top of the shopping nav (below the mode badge). Each pill is a
 * tap target that deep-links into the right view.
 *
 *   Short    -- inventory_demand_outlook rows with status='shortfall'
 *               (critical+pulse when > 0)
 *   List     -- active shopping_list rows (draft / in_progress)
 *   Receipts -- today's completed lists with no receipt_url (warning)
 *   Spend    -- sum of today's actual_total in tenant currency
 *
 * Layout: 2x2 grid (drawer + collapsed-friendly).
 *
 * Empty-state: when everything is zero and no upcoming events, the
 * whole strip collapses to a single "All caught up" status pill.
 */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { useShoppingLiveCounts } from "@/hooks/useShoppingLiveCounts";
import { useShoppingPortalMode } from "@/hooks/useShoppingPortalMode";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { TrendingDown, ShoppingCart, Receipt, Wallet, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pill {
  key: string;
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "warning" | "critical" | "info" | "muted";
  href: string;
  pulse?: boolean;
  aria: string;
}

const TONE_BG: Record<Pill["tone"], string> = {
  default:  "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900",
  warning:  "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900",
  critical: "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900",
  info:     "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900",
  muted:    "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500",
};

const TONE_ICON_BG: Record<Pill["tone"], string> = {
  default:  "bg-emerald-200/70 text-emerald-700",
  warning:  "bg-amber-200/70 text-amber-700",
  critical: "bg-rose-200/70 text-rose-700",
  info:     "bg-blue-200/70 text-blue-700",
  muted:    "bg-slate-200/40 text-slate-400",
};

export function ShoppingLiveStateStrip() {
  const { withSlug } = useTenantHref();
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;
  const tenantCurrency = useTenantCurrency(companyId ?? null);
  const counts = useShoppingLiveCounts();
  const mode = useShoppingPortalMode();

  // Empty-state collapse: nothing live, nothing short, no upcoming
  // events, no spend today -> single "All caught up" pill.
  if (
    counts.shortItems === 0
    && counts.activeListItems === 0
    && counts.receiptsToFile === 0
    && counts.spendToday === 0
    && mode.upcomingEvents48h === 0
    && !counts.loading
  ) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2.5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">All caught up</p>
          <p className="text-[10px] text-slate-500 truncate">Stock looks good, nothing to file.</p>
        </div>
      </div>
    );
  }

  // Spend formatter: use tenant currency, no decimals for the pill
  // (keeps it under 6 chars so the badge stays readable at 320px).
  const fmtSpend = (n: number) => {
    if (!n) return tenantCurrency.symbol + "0";
    // Strip ".00" for whole numbers to save space; round to nearest
    // for sub-thousand values, k-suffix for >= 10k.
    if (n >= 10_000) return `${tenantCurrency.symbol}${(n / 1000).toFixed(0)}k`;
    return tenantCurrency.format(Math.round(n), 0);
  };

  const pills: Pill[] = [
    {
      key: "short",
      label: "Short",
      value: counts.loading ? "…" : String(counts.shortItems),
      icon: TrendingDown,
      tone: counts.shortItems > 0 ? "critical" : "muted",
      pulse: counts.shortItems > 0,
      // Wave 70.30: re-pointed to /buy-list (canonical action surface).
      href: "/team-portal/shopping/buy-list",
      aria: `${counts.shortItems} items short in the next 7 days. Tap to open the buy list.`,
    },
    {
      key: "list",
      label: "Active",
      value: counts.loading ? "…" : String(counts.activeListItems),
      icon: ShoppingCart,
      tone: counts.activeListItems > 0 ? "default" : "muted",
      // Wave 70.30: dashboard becomes the canonical "your active
      // list" view in commit 2 of this wave.
      href: "/team-portal/shopping/dashboard",
      aria: `${counts.activeListItems} active shopping list${counts.activeListItems === 1 ? "" : "s"}. Tap to open your list.`,
    },
    {
      key: "receipts",
      label: "Receipts",
      value: counts.loading ? "…" : String(counts.receiptsToFile),
      icon: Receipt,
      tone: counts.receiptsToFile > 0 ? "warning" : "muted",
      href: "/team-portal/shopping/receipts",
      aria: `${counts.receiptsToFile} receipt${counts.receiptsToFile === 1 ? "" : "s"} to file from today. Tap to open the receipt scanner.`,
    },
    {
      key: "spend",
      label: "Spend",
      value: counts.loading ? "…" : fmtSpend(counts.spendToday),
      icon: Wallet,
      tone: counts.spendToday > 0 ? "info" : "muted",
      href: "/team-portal/shopping/invoices",
      aria: `Today's spend: ${tenantCurrency.format(counts.spendToday)}. Tap to open the spend log.`,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-1.5"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Shopping live state"
    >
      {pills.map((p) => {
        const Icon = p.icon;
        return (
          <Link
            key={p.key}
            href={withSlug(p.href)}
            aria-label={p.aria}
            title={p.aria}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all active:scale-[0.98]",
              TONE_BG[p.tone],
            )}
          >
            <span
              className={cn(
                "flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center",
                TONE_ICON_BG[p.tone],
                p.pulse ? "motion-safe:animate-pulse" : "",
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold tabular-nums leading-none">
                {p.value}
              </span>
              <span className="block text-[9px] uppercase tracking-wider opacity-80 mt-0.5 leading-none">
                {p.label}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
