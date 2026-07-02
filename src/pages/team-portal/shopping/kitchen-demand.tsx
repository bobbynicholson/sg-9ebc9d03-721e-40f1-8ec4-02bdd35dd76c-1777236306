/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChefHat, ShoppingCart, Search, AlertTriangle, Calendar, Loader2, Package, ExternalLink, Boxes, ClipboardList, RefreshCw } from "lucide-react";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useToast } from "@/hooks/use-toast";
import { toLocalISO } from "@/lib/localDate";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";
import {
  kitchenPrepService,
  type IngredientDemand,
} from "@/services/kitchenPrepService";

// ── Helpers ──────────────────────────────────────────────────────────────

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

const HORIZONS = [
  { key: 7, label: "Next 7 days" },
  { key: 14, label: "Next 14 days" },
  { key: 30, label: "Next 30 days" },
];

function ShoppingKitchenDemandPageInner() {
  const { user, profile } = useAuth();
  const { withSlug } = useTenantHref();
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id || user?.company_id;
  const role = String((profile as any)?.role || (user as any)?.role || "");
  const canOpenMenuBuilder = ["super_admin", "owner", "company_admin", "admin"].includes(role);

  const [horizon, setHorizon] = useState(7);
  const [demand, setDemand] = useState<IngredientDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Command-centre restructure: a failed demand read used to toast and
  // fall through to "No kitchen demand in this window", which reads as
  // a covered kitchen. Failures now render a rose recovery card instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shortfallOnly, setShortfallOnly] = useState(true);
  const [creating, setCreating] = useState(false);

  const todayStr = useMemo(() => toLocalISO(new Date()), []);
  const horizonStr = useMemo(() => isoOffset(horizon), [horizon]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await kitchenPrepService.getAggregatedDemand(companyId, todayStr, horizonStr, regionFilterId);
      setDemand(data);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId, todayStr, horizonStr, regionFilterId]);

  // ── Filtering ─────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return demand
      .filter(d => !shortfallOnly || d.shortfall > 0)
      .filter(d => !term
        || d.name.toLowerCase().includes(term)
        || (d.unit || "").toLowerCase().includes(term)
      )
      .sort((a, b) => b.shortfall - a.shortfall || a.name.localeCompare(b.name));
  }, [demand, shortfallOnly, search]);

  // Stat strip
  const stats = useMemo(() => {
    const shortfall = demand.filter(d => d.shortfall > 0);
    const ordersCovered = new Set<string>();
    for (const d of demand) for (const u of d.used_by || []) ordersCovered.add(u.order_id);
    return {
      ingredients: demand.length,
      shortfall: shortfall.length,
      orders: ordersCovered.size,
    };
  }, [demand]);

  const handleCreateList = async () => {
    if (!companyId || !user?.id || creating) return;
    setCreating(true);
    try {
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        companyId,
        user.id,
        demand,
        { from: todayStr, to: horizonStr },
        `Kitchen demand ${todayStr} -> ${horizonStr}`,
      );
      if (result) {
        toast({
          title: "Shopping list created",
          description: `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} ready to buy.`,
        });
      } else {
        toast({ title: "Nothing to buy", description: "No shortfalls in this window." });
      }
    } catch (e: any) {
      toast({ title: "Could not create list", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <ShoppingPageShell
      pageTitle="Kitchen demand - CateringMS"
      heading="Kitchen demand"
      subheading={
        chipsReady
          ? stats.shortfall > 0
            ? `${stats.shortfall} ingredient${stats.shortfall === 1 ? "" : "s"} short for confirmed orders in the next ${horizon} days.`
            : `Confirmed orders in the next ${horizon} days are covered by stock on hand.`
          : `Aggregated ingredient need from confirmed orders in the next ${horizon} days.`
      }
      icon={ChefHat}
      headerAction={
        <Button
          size="sm"
          onClick={handleCreateList}
          disabled={creating || stats.shortfall === 0}
          className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg"
        >
          {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating</> : (
            <><ShoppingCart className="w-4 h-4 mr-2" />Create shopping list</>
          )}
        </Button>
      }
      meta={
        chipsReady ? (
          <>
            <span className={SHOPPING_HERO_CHIP}>
              <span className={cn("h-1.5 w-1.5 rounded-full", stats.shortfall > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              {stats.shortfall > 0 ? `${stats.shortfall} short` : "All covered"}
            </span>
            <span className={SHOPPING_HERO_CHIP}>
              <Boxes className="h-3 w-3" />
              {stats.ingredients} ingredient{stats.ingredients === 1 ? "" : "s"} in play
            </span>
            <span className={SHOPPING_HERO_CHIP}>
              <ClipboardList className="h-3 w-3" />
              {stats.orders} order{stats.orders === 1 ? "" : "s"} feeding this
            </span>
          </>
        ) : undefined
      }
    >
      {/* Recovery card: the demand read failed. Never dress a failed
          load up as a covered kitchen. */}
      {loadError && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
          <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load kitchen demand</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
          <Button
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="bg-brand-primary hover:opacity-90 text-white"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
            Retry
          </Button>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatTile
          label="Ingredients in play"
          value={stats.ingredients}
          icon={Boxes}
        />
        <StatTile
          label="Short"
          value={
            <span className={stats.shortfall > 0 ? "text-rose-700 dark:text-rose-400" : undefined}>
              {stats.shortfall}
            </span>
          }
          hint="Need to buy"
          icon={AlertTriangle}
        />
        <StatTile
          label="Orders feeding this"
          value={stats.orders}
          icon={ClipboardList}
        />
      </div>

      {/* Horizon picker + filter bar */}
      <PortalCard padded className="mb-5">
        <div className="flex flex-col gap-3">
          {/* Segmented horizon picker: amber marks the active window only */}
          <div
            role="group"
            aria-label="Demand window"
            className="inline-flex w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/60 p-1"
          >
            {HORIZONS.map(h => {
              const active = horizon === h.key;
              return (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => setHorizon(h.key)}
                  aria-pressed={active}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-150 ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 ${
                    active
                      ? "bg-brand-primary text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >{h.label}</button>
              );
            })}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ingredient or unit..."
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              variant={shortfallOnly ? "default" : "outline"}
              onClick={() => setShortfallOnly(v => !v)}
              aria-pressed={shortfallOnly}
              className={shortfallOnly ? "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg" : "rounded-lg"}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />Shortfall only
            </Button>
          </div>
        </div>
      </PortalCard>

      {/* List */}
      {showSkeleton ? (
        <PortalCard padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-200/70 dark:bg-slate-800 animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-40 max-w-[60%] rounded bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
                    <div className="h-3 w-56 max-w-[80%] rounded bg-slate-200/60 dark:bg-slate-800/70 animate-pulse" />
                  </div>
                  <div className="w-12 h-9 rounded bg-slate-200/70 dark:bg-slate-800 animate-pulse shrink-0" />
                </div>
              </li>
            ))}
          </ul>
        </PortalCard>
      ) : loadError && demand.length === 0 ? (
        /* The recovery card above owns this state; keep the body quiet. */
        <PortalCard className="p-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kitchen demand is unavailable right now. Use Retry above to reload it.
          </p>
        </PortalCard>
      ) : visible.length === 0 ? (
        <PortalCard className="p-10 text-center">
          <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <ChefHat className="w-6 h-6 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-slate-900 dark:text-white font-medium">
            {demand.length === 0
              ? "No kitchen demand in this window"
              : shortfallOnly
                ? "No shortfalls, the kitchen is covered for this window"
                : "No matches"}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
            {demand.length === 0
              ? "This page pulls recipe ingredients from confirmed orders, then subtracts what's on hand. Once a confirmed order's menu items have recipes attached, their ingredients show up here, ready to buy."
              : shortfallOnly
                ? "Everything in this window is covered by stock. Toggle 'Shortfall only' off to see the full pull list."
                : "Nothing matches that search. Try a different ingredient or unit."}
          </p>
          {demand.length === 0 && canOpenMenuBuilder && (
            <Link
              href={withSlug("/admin/menu")}
              className="inline-flex items-center gap-1.5 mt-4 px-3 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white text-sm font-medium transition-[background-color,transform] duration-150 ease-standard active:scale-[0.97]"
            >
              Open menu builder <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
          {demand.length === 0 && !canOpenMenuBuilder && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              Ask an admin or owner to attach recipes to the menu items.
            </p>
          )}
        </PortalCard>
      ) : (
        <PortalCard padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((d, idx) => {
              const isShort = d.shortfall > 0;
              const orderCount = d.used_by?.length || 0;
              return (
                <li
                  key={`${d.name}-${idx}`}
                  className="p-4 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isShort
                        ? "bg-rose-100 dark:bg-rose-950/50"
                        : "bg-brand-primary/15 dark:bg-brand-primary/15"
                    }`}>
                      <Package className={`w-4 h-4 ${isShort ? "text-rose-700 dark:text-rose-400" : "text-brand-primary dark:text-brand-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{d.name}</span>
                        {isShort && (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 text-[10px]">
                            Short {Number(d.shortfall).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}
                          </Badge>
                        )}
                        {!isShort && (
                          <Badge variant="outline" className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30 text-[10px]">
                            Covered
                          </Badge>
                        )}
                        {!d.inventory_item_id && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-[10px]">
                            Free-text
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                        <span>Need {Number(d.total_quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}</span>
                        <span>have {Number(d.on_hand).toLocaleString(undefined, { maximumFractionDigits: 2 })} {d.unit}</span>
                        {orderCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                            {orderCount} order{orderCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      {/* Top 3 events feeding this ingredient, helps shopping understand
                          why we need it. */}
                      {d.used_by && d.used_by.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {/* ODOC G.5: each source-order chip
                              deep-links into the doc with the
                              shopping section auto-expanded. */}
                          {d.used_by.slice(0, 3).map((u, ui) => (
                            <Link
                              key={`${u.order_id}-${ui}`}
                              href={withSlug(staffOrderHref(u.order_id, "shopping_staff"))}
                              className="text-[10px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 dark:hover:border-amber-800 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 inline-flex items-center gap-1 transition-colors duration-150 tabular-nums"
                              title="Open this order's shopping shortfalls"
                            >
                              <Calendar className="w-2.5 h-2.5" />
                              {u.event_date}, {u.client_name || "client"} ({u.qty} {d.unit})
                            </Link>
                          ))}
                          {d.used_by.length > 3 && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">+{d.used_by.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Buy</div>
                      <div className={`text-lg font-semibold tabular-nums ${isShort ? "text-rose-700 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"}`}>
                        {isShort ? Number(d.shortfall).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{d.unit}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </PortalCard>
      )}

      {/* Helper line */}
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 text-center">
        Demand math comes from menu item recipes. If something&apos;s missing, {canOpenMenuBuilder ? (
          <>
            attach the recipe in
            <Link href={withSlug("/admin/menu")} className="text-brand-primary hover:text-brand-primary/80 dark:text-brand-primary dark:hover:text-brand-primary/80 ml-1 underline">Menu builder</Link>.
          </>
        ) : (
          "ask an admin or owner to attach the recipe."
        )}
      </p>
    </ShoppingPageShell>
  );
}

// Route guard was missing on this page pre-restructure (the nav hid it
// but the URL was open to any signed-in role). Same allow-list as the
// shopping dashboard.
export default function ShoppingKitchenDemandPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN]}>
      <ShoppingKitchenDemandPageInner />
    </ProtectedRoute>
  );
}
