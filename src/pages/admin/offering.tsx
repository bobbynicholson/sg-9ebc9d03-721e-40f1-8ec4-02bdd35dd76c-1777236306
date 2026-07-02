/**
 * Offering glance - "what are we actually selling?".
 *
 * Two tiles above the fold (Menu, Equipment) plus a
 * "recently quoted" strip and a "never quoted" callout below.
 * Owner-level snapshot, no edits happen here - every chip + tile
 * deep-links to the action surface (/admin/menu, /admin/equipment)
 * so a tap on a gap lands the operator on the filtered list ready to
 * fix.
 *
 * OFR-B (offering deferred, 2026-05-24):
 *   - OWNER role admitted (per project_cateringms_owner_dashboard)
 *   - Missing-photo / missing-price chips on both menu + equipment,
 *     linkifying to the action surface
 *   - "29 active items" / "7 items on the books" big-number tiles
 *     wrapped in Link
 *   - Photo coverage health bar under each big number
 *   - Period selector (30 / 60 / 90 days) drives Top quoted + Recent
 *     strip + Never-quoted callout
 *   - "Never quoted in N days" callout - dead-stock signal
 *   - Revenue-weighted Top 3 alongside the volume Top 3
 *   - Linkified Top 3 rows deep-linking to the menu editor via ?item=
 *   - Realtime channel on menu_items + equipment
 *   - Inline error banner with Retry
 *   - captureException tagged route + step + companyId
 *   - as-any cleanup on auth
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { CatalogueOperationsStrip } from "@/components/admin/CatalogueOperationsStrip";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { formatZAR } from "@/lib/formatters";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import {
  UtensilsCrossed, Package, AlertTriangle, ImageOff, Tag,
  TrendingUp, Loader2, ArrowRight, Sparkles,
  RefreshCw,
} from "lucide-react";

interface MenuTile {
  active: number;
  total: number;
  withPhoto: number;
  withPrice: number;
  missingPhoto: number;
  missingPrice: number;
  // OFR-C (task #183 deferred, 2026-05-24): photo-age chip. Counts
  // menu items whose photo (proxy: updated_at) is older than 180
  // days. Stale photos drag conversion on the public quote view.
  stalePhoto: number;
  lastEdited: string | null;
  // OFR-C: per-item revenue + margin from order_items in the
  // active period. marginPct is averaged across rows so it survives
  // missing unit_cost on a subset (those rows contribute 0%).
  topQuoted: { id: string; name: string; count: number }[];
  topByRevenue: { id: string; name: string; revenue: number; marginPct: number | null }[];
}

// OFR-C: bundle suggestions - menu_item co-occurrence on the same
// order. Top 3 unordered pairs (a, b) by frequency. Useful "what
// goes with what" intel for the operator building the next quote.
interface BundlePair {
  a: { id: string; name: string };
  b: { id: string; name: string };
  count: number;
}

interface EquipmentTile {
  total: number;
  withPhoto: number;
  withPrice: number;
  missingPrice: number;
  missingPhoto: number;
}

interface RecentItem {
  key: string;
  name: string;
  kind: "menu" | "equipment";
  lastDate: string;
  acceptedCount: number;
}

interface NeverQuotedItem {
  id: string;
  name: string;
  kind: "menu" | "equipment";
}

type Period = 30 | 60 | 90;

const dateFmt = (iso: string | null) => {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return "Unknown"; }
};

// formatZAR is the display source of truth for money on every surface.
const fmtR = (n: number) => formatZAR(n, { decimals: 0 });

function OfferingPage() {
  // OFR-B: drop the `as any` cast - useAuth is typed in @/contexts/AuthContext.
  const { user, profile } = useAuth();
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id || user?.company_id;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(90);
  const [menuTile, setMenuTile] = useState<MenuTile>({
    active: 0, total: 0, withPhoto: 0, withPrice: 0, missingPhoto: 0, missingPrice: 0,
    stalePhoto: 0, lastEdited: null, topQuoted: [], topByRevenue: [],
  });
  const [bundlePairs, setBundlePairs] = useState<BundlePair[]>([]);
  const [equipTile, setEquipTile] = useState<EquipmentTile>({
    total: 0, withPhoto: 0, withPrice: 0, missingPrice: 0, missingPhoto: 0,
  });
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [neverQuoted, setNeverQuoted] = useState<NeverQuotedItem[]>([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const today = new Date();
      const sincePeriod = toLocalISO(new Date(today.getTime() - period * 24 * 3600 * 1000));

      // Parallel fan-out: menu list (with image + price for gap chips),
      // equipment list, recent order_items, recent equipment_bookings.
      // One round trip per source.
      const [
        menuRes,
        equipRes,
        oiRes,
        equipBookingsRes,
      ] = await Promise.all([
        // OFR-B: pull the columns we need to compute photo/price gaps
        // on the menu side - pre-OFR-B the menu tile was just a count.
        // menu_items uses `item_name` not `name`.
        supabase
          .from("menu_items")
          .select("id, item_name, image_url, base_price, is_available, updated_at")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("equipment")
          .select("id, name, rental_price, image_url, is_available")
          .eq("company_id", companyId)
          .eq("is_available", true),
        // order_items uses line_total (not total_price).
        // OFR-C (task #183 deferred, 2026-05-24): also pull order_id
        // (for bundle co-occurrence), unit_cost (for margin maths)
        // and order status/date for recent accepted items.
        supabase
          .from("order_items")
          .select("order_id, menu_item_id, item_name, line_total, quantity, unit_cost, orders!inner(company_id, event_date, deleted_at, status)")
          .eq("orders.company_id", companyId)
          .is("orders.deleted_at", null)
          .gte("orders.event_date", sincePeriod)
          .not("menu_item_id", "is", null)
          .limit(5000),
        supabase
          .from("equipment_bookings")
          .select("equipment_id, booked_from, equipment:equipment_id(name)")
          .eq("company_id", companyId)
          .gte("booked_from", sincePeriod)
          .not("equipment_id", "is", null)
          .order("booked_from", { ascending: false })
          .limit(2000),
      ]);

      if (menuRes.error) throw menuRes.error;
      if (equipRes.error) throw equipRes.error;
      // Audit 2026-07-02: these two used to be silently ignored. A
      // failed order_items query zeroed the Top 3 / Recent strips AND
      // marked the whole catalogue as "never quoted" - actively wrong,
      // not just empty. Throw so the error banner + Retry show up.
      if (oiRes.error) throw oiRes.error;
      if (equipBookingsRes.error) throw equipBookingsRes.error;

      const menuRows = (menuRes.data || []) as Array<{
        id: string; item_name: string; image_url: string | null; base_price: number | null;
        is_available: boolean | null; updated_at: string | null;
      }>;
      const equipRows = (equipRes.data || []) as Array<{
        id: string; name: string; rental_price: number | null; image_url: string | null; is_available: boolean | null;
      }>;

      // OFR-B: menu-side gap chips - matches the equipment framing.
      const menuActive = menuRows.filter((m) => m.is_available !== false).length;
      const menuMissingPhoto = menuRows.filter((m) => m.is_available !== false && !m.image_url).length;
      const menuMissingPrice = menuRows.filter(
        (m) => m.is_available !== false && (!m.base_price || Number(m.base_price) <= 0),
      ).length;
      const menuWithPhoto = menuActive - menuMissingPhoto;
      const menuWithPrice = menuActive - menuMissingPrice;
      const menuLastEdited = menuRows
        .map((m) => m.updated_at)
        .filter((d): d is string => !!d)
        .sort()
        .reverse()[0] || null;
      // OFR-C: stale-photo count. updated_at is a proxy - the column
      // bumps for every edit not just photo upload - so this is a
      // ceiling estimate. Better than nothing: if a row hasn't seen
      // any edit in 6 months the photo is almost certainly stale.
      const photoStaleCutoff = today.getTime() - 180 * 24 * 3600 * 1000;
      const menuStalePhoto = menuRows.filter((m) => {
        if (m.is_available === false) return false;
        if (!m.image_url) return false;
        if (!m.updated_at) return true;
        return new Date(m.updated_at).getTime() < photoStaleCutoff;
      }).length;

      const equipMissingPrice = equipRows.filter((e) => !e.rental_price || Number(e.rental_price) === 0).length;
      const equipMissingPhoto = equipRows.filter((e) => !e.image_url).length;
      const equipWithPhoto = equipRows.length - equipMissingPhoto;
      const equipWithPrice = equipRows.length - equipMissingPrice;

      // Volume + revenue Top 3 from order_items. order_items uses
      // line_total (= unit_price * quantity).
      // OFR-C: now also tracks per-item cost (sum quantity * unit_
      // cost where unit_cost not null) so we can render a margin
      // chip on the top-by-revenue rows.
      const oiRows = (oiRes.data || []) as Array<{
        order_id: string | null;
        menu_item_id: string | null; item_name: string | null;
        line_total: number | null; quantity: number | null;
        unit_cost: number | null;
        orders: {
          status?: string; event_date?: string;
        } | null;
      }>;
      const freq: Record<string, { id: string; name: string; count: number; revenue: number; cost: number; costRows: number }> = {};
      for (const r of oiRows) {
        const id = r.menu_item_id;
        if (!id) continue;
        if (!freq[id]) freq[id] = { id, name: r.item_name || "Unnamed", count: 0, revenue: 0, cost: 0, costRows: 0 };
        freq[id].count += 1;
        freq[id].revenue += Number(r.line_total || 0);
        if (r.unit_cost != null && r.quantity != null) {
          freq[id].cost += Number(r.unit_cost) * Number(r.quantity);
          freq[id].costRows += 1;
        }
      }
      const topQuoted = Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);
      const topByRevenue = Object.values(freq).sort((a, b) => b.revenue - a.revenue).slice(0, 3).map((m) => ({
        id: m.id,
        name: m.name,
        revenue: m.revenue,
        // marginPct null = no cost data on any line; don't render the
        // chip (better than rendering a misleading 100%).
        marginPct: m.costRows > 0 && m.revenue > 0
          ? Math.round(((m.revenue - m.cost) / m.revenue) * 100)
          : null,
      }));

      // OFR-C: bundle co-occurrence. Group order_items by order_id,
      // emit every unordered (a, b) pair, count frequency. O(n^2) on
      // line count per order but n is small (5-20 lines). 5000-row
      // cap on the select keeps the outer loop bounded.
      const linesByOrder = new Map<string, Array<{ id: string; name: string }>>();
      for (const r of oiRows) {
        const oid = r.order_id;
        const mid = r.menu_item_id;
        if (!oid || !mid) continue;
        const arr = linesByOrder.get(oid) || [];
        // Skip duplicates of the same menu_item_id on the same order.
        if (arr.some((x) => x.id === mid)) continue;
        arr.push({ id: mid, name: r.item_name || "Unnamed" });
        linesByOrder.set(oid, arr);
      }
      const pairCount = new Map<string, { a: { id: string; name: string }; b: { id: string; name: string }; count: number }>();
      for (const items of linesByOrder.values()) {
        if (items.length < 2) continue;
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            // Canonicalise pair so (A,B) and (B,A) collapse.
            const [a, b] = items[i].id < items[j].id ? [items[i], items[j]] : [items[j], items[i]];
            const key = `${a.id}|${b.id}`;
            const slot = pairCount.get(key) || { a, b, count: 0 };
            slot.count += 1;
            pairCount.set(key, slot);
          }
        }
      }
      const topPairs: BundlePair[] = Array.from(pairCount.values())
        .filter((p) => p.count >= 2) // single co-occurrence is noise
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setMenuTile({
        active: menuActive,
        total: menuRows.length,
        withPhoto: menuWithPhoto,
        withPrice: menuWithPrice,
        missingPhoto: menuMissingPhoto,
        missingPrice: menuMissingPrice,
        stalePhoto: menuStalePhoto,
        lastEdited: menuLastEdited,
        topQuoted,
        topByRevenue,
      });
      setBundlePairs(topPairs);
      setEquipTile({
        total: equipRows.length,
        withPhoto: equipWithPhoto,
        withPrice: equipWithPrice,
        missingPrice: equipMissingPrice,
        missingPhoto: equipMissingPhoto,
      });
      // Recent strip: accepted orders in window.
      const acceptedRows = oiRows.filter((r) => {
        const orders = (r as unknown as { orders: { status?: string } }).orders;
        const status = orders?.status;
        return status && ["confirmed", "completed", "preparing", "ready", "in_transit"].includes(status);
      });
      const menuRecent: Record<string, RecentItem> = {};
      for (const r of acceptedRows) {
        const id = r.menu_item_id;
        if (!id) continue;
        const orders = (r as unknown as { orders: { event_date?: string } }).orders;
        const date = orders?.event_date || "";
        if (!menuRecent[id]) {
          menuRecent[id] = {
            key: `m:${id}`, kind: "menu", name: r.item_name || "Unnamed",
            lastDate: date, acceptedCount: 0,
          };
        }
        menuRecent[id].acceptedCount += 1;
        if (date > menuRecent[id].lastDate) menuRecent[id].lastDate = date;
      }
      const menuTop5 = Object.values(menuRecent).sort((a, b) => (b.lastDate > a.lastDate ? 1 : -1)).slice(0, 5);

      const equipBookings = (equipBookingsRes.data || []) as Array<{
        equipment_id: string; booked_from: string | null; equipment: { name: string } | null;
      }>;
      const equipRecent: Record<string, RecentItem> = {};
      for (const r of equipBookings) {
        const id = r.equipment_id;
        if (!id) continue;
        const date = (r.booked_from || "").slice(0, 10);
        const name = r.equipment?.name || "Unnamed equipment";
        if (!equipRecent[id]) {
          equipRecent[id] = {
            key: `e:${id}`, kind: "equipment", name,
            lastDate: date, acceptedCount: 0,
          };
        }
        equipRecent[id].acceptedCount += 1;
        if (date > equipRecent[id].lastDate) equipRecent[id].lastDate = date;
      }
      const equipTop5 = Object.values(equipRecent).sort((a, b) => (b.lastDate > a.lastDate ? 1 : -1)).slice(0, 5);

      setRecent([...menuTop5, ...equipTop5]);

      // OFR-B: never-quoted callout. Universe of active menu items
      // minus the set of menu_item_id seen in oiRows. Same for
      // equipment. Surfaces dead stock at a glance.
      const quotedMenuIds = new Set(oiRows.map((r) => r.menu_item_id).filter((x): x is string => !!x));
      const quotedEquipIds = new Set(equipBookings.map((r) => r.equipment_id));
      const dead: NeverQuotedItem[] = [];
      for (const m of menuRows) {
        if (m.is_available === false) continue;
        if (!quotedMenuIds.has(m.id)) dead.push({ id: m.id, name: m.item_name, kind: "menu" });
      }
      for (const e of equipRows) {
        if (!quotedEquipIds.has(e.id)) dead.push({ id: e.id, name: e.name, kind: "equipment" });
      }
      setNeverQuoted(dead);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      captureException(err, {
        tags: { route: "/admin/offering", step: "load", companyId },
      });
      setError(msg);
      toast({
        title: "Could not load offering",
        description: msg || "Check your connection and retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId, period]);

  // OFR-B: realtime channel. A photo upload on /admin/menu or a new
  // equipment row should refresh this page without a manual tap.
  // Debounced 1.5s because edits often arrive in clusters (e.g. a
  // bulk price update).
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 1500);
    };
    const channel = supabase
      .channel(`offering:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const showMenuEmpty = !loading && menuTile.active === 0;
  const showEquipEmpty = !loading && equipTile.total === 0;

  const menuPhotoPct = useMemo(
    () => menuTile.active > 0 ? Math.round((menuTile.withPhoto / menuTile.active) * 100) : 0,
    [menuTile.active, menuTile.withPhoto],
  );
  const equipPhotoPct = useMemo(
    () => equipTile.total > 0 ? Math.round((equipTile.withPhoto / equipTile.total) * 100) : 0,
    [equipTile.total, equipTile.withPhoto],
  );

  return (
    <>
      <NoIndexMeta />
      <Head><title>Offering - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title="Offering"
            icon={Sparkles}
            subtitle="Snapshot of what you sell. Menu items and equipment for hire in one view so you can spot gaps in pricing or photos before they hit a quote."
            meta={
              !loading && !error ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {menuTile.active} menu item{menuTile.active === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {equipTile.total} equipment item{equipTile.total === 1 ? "" : "s"}
                  </span>
                  {(menuTile.missingPrice + menuTile.missingPhoto + equipTile.missingPrice + equipTile.missingPhoto) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {menuTile.missingPrice + menuTile.missingPhoto + equipTile.missingPrice + equipTile.missingPhoto} catalogue gap{(menuTile.missingPrice + menuTile.missingPhoto + equipTile.missingPrice + equipTile.missingPhoto) === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
            <>
              {/* OFR-B: period selector. Drives Top 3 + Recent strip
                  + Never-quoted callout so the operator can flex the
                  window between 30 / 60 / 90 days without leaving
                  the page. Restyled for the dark hero band; active
                  state uses the tenant brand colour, not amber. */}
              <div className="flex gap-1 rounded-lg border border-white/15 bg-white/10 p-1 text-xs">
                {([30, 60, 90] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-md ${
                      period === p
                        ? "bg-brand-primary text-white font-medium"
                        : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {p}d
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </>
            }
          />
          <PageWorkbench />
          <CatalogueOperationsStrip active="offering" />

          {/* OFR-B: inline error banner. Pre-OFR-B a network failure
              left the page showing zeros silently; now the operator
              sees what went wrong + can retry without a tab reload. */}
          {error && (
            <Card className="bg-rose-50 border-l-4 border-l-rose-500 mb-4">
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-900">Could not load offering</p>
                  <p className="text-xs text-rose-800/90">{error}</p>
                </div>
                <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* OFR-B: Menu + Equipment. Snapshot
              framing - every chip + big number deep-links to the
              action surface. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            {/* Menu tile */}
            <Card className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-brand-primary/10 to-brand-secondary/10 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                      <UtensilsCrossed className="w-5 h-5 text-brand-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg sm:text-xl">Menu</CardTitle>
                      <p className="text-xs text-slate-600">Active items in your catalogue</p>
                    </div>
                  </div>
                  <Link href={withSlug("/admin/menu")}>
                    <Button size="sm" className="gap-1">
                      Manage menu <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {showMenuEmpty ? (
                  <div className="py-8 text-center text-slate-500">
                    <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium text-slate-700">No menu items yet</p>
                    <p className="text-sm mt-1">Build your offering so the quote builder has something to pull from.</p>
                    <Link href={withSlug("/admin/menu")}>
                      <Button size="sm" className="mt-3">Add your first item</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* OFR-B: big number is now a Link to /admin/menu
                        - operator's next click after reading "29
                        active items" is always to go look at them. */}
                    <Link href={withSlug("/admin/menu")} className="block group">
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-4xl font-bold text-slate-900 group-hover:text-brand-primary transition-colors">
                          {loading ? "-" : menuTile.active}
                        </span>
                        <span className="text-sm text-slate-600">active item{menuTile.active === 1 ? "" : "s"}</span>
                      </div>
                    </Link>
                    {/* OFR-B: photo-coverage health bar. One-glance
                        "how complete is the catalogue?" - matches
                        the equipment tile below. */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>Photo coverage</span>
                        <span className="tabular-nums">{menuTile.withPhoto} / {menuTile.active} ({menuPhotoPct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${menuPhotoPct >= 90 ? "bg-brand-primary" : menuPhotoPct >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${menuPhotoPct}%` }}
                        />
                      </div>
                    </div>
                    {/* OFR-B: menu-side gap chips - matching equipment.
                        Hero copy promised "spot gaps in pricing or
                        photos", asymmetry pre-OFR-B was confusing. */}
                    {(menuTile.missingPrice > 0 || menuTile.missingPhoto > 0 || menuTile.stalePhoto > 0) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {menuTile.missingPrice > 0 && (
                          <Link href={withSlug("/admin/menu?filter=missing-price")}>
                            <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600 cursor-pointer">
                              <Tag className="w-3 h-3 mr-1" />
                              {menuTile.missingPrice} missing price
                            </Badge>
                          </Link>
                        )}
                        {menuTile.missingPhoto > 0 && (
                          <Link href={withSlug("/admin/menu?filter=missing-photo")}>
                            <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600 cursor-pointer">
                              <ImageOff className="w-3 h-3 mr-1" />
                              {menuTile.missingPhoto} missing photo
                            </Badge>
                          </Link>
                        )}
                        {/* OFR-C (task #183 deferred, 2026-05-24):
                            stale-photo chip. Photo > 6 months since
                            any item edit - likely outdated and worth
                            a refresh. Conversion driver. */}
                        {menuTile.stalePhoto > 0 && (
                          <Link href={withSlug("/admin/menu?filter=stale-photo")}>
                            <Badge variant="outline" className="border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 cursor-pointer" title="Photo > 6 months old. Refreshing helps conversion on the public quote view.">
                              <ImageOff className="w-3 h-3 mr-1" />
                              {menuTile.stalePhoto} stale photo
                            </Badge>
                          </Link>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mb-3">Last edited: {dateFmt(menuTile.lastEdited)}</p>
                    {/* OFR-B: Top 3 sections. Both volume + revenue
                        side-by-side so the operator sees what's
                        ordered most AND what brings in the most rand.
                        Revenue-weighted alone hides cheap fast-movers;
                        volume alone hides high-margin big-tickets. */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Top 3 by volume ({period}d)</p>
                        {menuTile.topQuoted.length === 0 ? (
                          <p className="text-sm text-slate-500">Nothing quoted in the last {period} days.</p>
                        ) : (
                          <ul className="space-y-1">
                            {menuTile.topQuoted.map((m) => (
                              <li key={`v-${m.id}`}>
                                <Link
                                  href={withSlug(`/admin/menu?item=${m.id}`)}
                                  className="flex items-center justify-between text-sm hover:bg-slate-50 rounded px-1 -mx-1 py-0.5"
                                >
                                  <span className="truncate text-slate-700">{m.name}</span>
                                  <Badge variant="secondary" className="ml-2 flex-shrink-0">{m.count}x</Badge>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Top 3 by revenue ({period}d)</p>
                        {menuTile.topByRevenue.length === 0 || menuTile.topByRevenue[0].revenue === 0 ? (
                          <p className="text-sm text-slate-500">No revenue data in the last {period} days.</p>
                        ) : (
                          <ul className="space-y-1">
                            {menuTile.topByRevenue.map((m) => (
                              <li key={`r-${m.id}`}>
                                <Link
                                  href={withSlug(`/admin/menu?item=${m.id}`)}
                                  className="flex items-center justify-between text-sm hover:bg-slate-50 rounded px-1 -mx-1 py-0.5"
                                >
                                  <span className="truncate text-slate-700">{m.name}</span>
                                  <span className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                    {/* OFR-C: margin chip. Hidden when
                                        no unit_cost data on file - a
                                        suppressed chip is honest;
                                        rendering 100% would mislead. */}
                                    {m.marginPct != null && (
                                      <Badge
                                        variant="outline"
                                        className={`tabular-nums text-[10px] ${
                                          m.marginPct >= 50 ? "border-brand-primary/30 text-brand-primary bg-brand-primary/10" :
                                          m.marginPct >= 25 ? "border-amber-300 text-amber-700 bg-amber-50" :
                                          "border-rose-300 text-rose-700 bg-rose-50"
                                        }`}
                                        title="Margin = (revenue - cost) / revenue. Cost from order_items.unit_cost snapshot."
                                      >
                                        {m.marginPct}% margin
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="tabular-nums">{fmtR(m.revenue)}</Badge>
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Equipment tile */}
            <Card className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-sky-50 to-blue-50 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                      <Package className="w-5 h-5 text-sky-700" />
                    </div>
                    <div>
                      <CardTitle className="text-lg sm:text-xl">Equipment</CardTitle>
                      <p className="text-xs text-slate-600">Hire stock available to clients</p>
                    </div>
                  </div>
                  <Link href={withSlug("/admin/equipment")}>
                    <Button size="sm" className="gap-1">
                      Manage equipment <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {showEquipEmpty ? (
                  <div className="py-8 text-center text-slate-500">
                    <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium text-slate-700">No equipment yet</p>
                    <p className="text-sm mt-1">Add hire stock so it appears on quotes.</p>
                    <Link href={withSlug("/admin/equipment")}>
                      <Button size="sm" className="mt-3">Add equipment</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <Link href={withSlug("/admin/equipment")} className="block group">
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-4xl font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                          {loading ? "-" : equipTile.total}
                        </span>
                        <span className="text-sm text-slate-600">item{equipTile.total === 1 ? "" : "s"} on the books</span>
                      </div>
                    </Link>
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>Photo coverage</span>
                        <span className="tabular-nums">{equipTile.withPhoto} / {equipTile.total} ({equipPhotoPct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${equipPhotoPct >= 90 ? "bg-brand-primary" : equipPhotoPct >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${equipPhotoPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* OFR-B: chips now Link to filtered equipment
                          view so a tap on "7 missing photo" lands the
                          operator on those exact 7 rows. */}
                      {equipTile.missingPrice > 0 ? (
                        <Link href={withSlug("/admin/equipment?filter=missing-price")}>
                          <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600 cursor-pointer">
                            <Tag className="w-3 h-3 mr-1" />
                            {equipTile.missingPrice} missing price
                          </Badge>
                        </Link>
                      ) : (
                        <Badge variant="secondary">
                          <Tag className="w-3 h-3 mr-1" />
                          0 missing price
                        </Badge>
                      )}
                      {equipTile.missingPhoto > 0 ? (
                        <Link href={withSlug("/admin/equipment?filter=missing-photo")}>
                          <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600 cursor-pointer">
                            <ImageOff className="w-3 h-3 mr-1" />
                            {equipTile.missingPhoto} missing photo
                          </Badge>
                        </Link>
                      ) : (
                        <Badge variant="secondary">
                          <ImageOff className="w-3 h-3 mr-1" />
                          0 missing photo
                        </Badge>
                      )}
                    </div>
                    {(equipTile.missingPrice > 0 || equipTile.missingPhoto > 0) && (
                      <Link
                        href={withSlug(`/admin/equipment?filter=${equipTile.missingPhoto > 0 ? "missing-photo" : "missing-price"}`)}
                        className="block mt-3"
                      >
                        <p className="text-xs text-amber-700 flex items-start gap-1 hover:underline">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          Items without a price or photo look thin on quotes - tap to tidy up.
                        </p>
                      </Link>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

          </div>

          {/* OFR-C (task #183 deferred, 2026-05-24): bundle suggestions.
              Pairs of menu items that co-occurred on the same order >= 2
              times in the window. Cross-sell intel - "clients who picked
              X also picked Y". Hidden when no qualifying pairs exist. */}
          {!loading && bundlePairs.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-slate-600" />
                  Often ordered together ({period}d)
                </CardTitle>
                <p className="text-xs text-slate-600 mt-0.5">
                  Menu pairs that landed on the same order more than once. Useful when building a quote - one tap to add the natural companion.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {bundlePairs.map((p) => (
                    <div
                      key={`${p.a.id}|${p.b.id}`}
                      className="rounded-lg border border-slate-200 bg-slate-50/40 p-3"
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3 h-3 text-slate-600" />
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                          Co-ordered {p.count}x
                        </span>
                      </div>
                      <Link
                        href={withSlug(`/admin/menu?item=${p.a.id}`)}
                        className="text-sm text-slate-900 font-semibold hover:text-brand-primary hover:underline block truncate"
                      >
                        {p.a.name}
                      </Link>
                      <p className="text-xs text-slate-400 my-0.5">with</p>
                      <Link
                        href={withSlug(`/admin/menu?item=${p.b.id}`)}
                        className="text-sm text-slate-900 font-semibold hover:text-brand-primary hover:underline block truncate"
                      >
                        {p.b.name}
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recently quoted strip */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Recently quoted ({period} days)</CardTitle>
              <p className="text-xs text-slate-600 mt-0.5">What clients accepted onto orders most recently.</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : recent.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">Nothing in the last {period} days. Once an order goes confirmed, it lands here.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {recent.map((r) => {
                    const href = r.kind === "menu"
                      ? withSlug(`/admin/menu?item=${r.key.slice(2)}`)
                      : withSlug(`/admin/equipment`);
                    return (
                      <Link
                        key={r.key}
                        href={href}
                        className="flex-shrink-0 w-56 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {r.kind === "menu"
                            ? <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
                            : <Package className="w-3.5 h-3.5 text-sky-600" />}
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                            {r.kind === "menu" ? "Menu" : "Equipment"}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate">{r.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{dateFmt(r.lastDate)}</p>
                        <p className="text-xs text-slate-500">{r.acceptedCount} time{r.acceptedCount === 1 ? "" : "s"}</p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* OFR-B: never-quoted callout. Dead-stock catalogue items
              the operator should review or retire. Far more actionable
              than "recently quoted" for catalogue hygiene. */}
          {!loading && neverQuoted.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Not quoted in {period} days
                </CardTitle>
                <p className="text-xs text-slate-600 mt-0.5">
                  Items on the catalogue that nobody's ordered. Worth a review - update the photo, drop the price, or retire.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {neverQuoted.slice(0, 20).map((d) => (
                    <Link
                      key={`${d.kind}:${d.id}`}
                      href={d.kind === "menu"
                        ? withSlug(`/admin/menu?item=${d.id}`)
                        : withSlug(`/admin/equipment`)}
                    >
                      <Badge variant="outline" className="bg-white hover:bg-slate-50 cursor-pointer gap-1">
                        {d.kind === "menu"
                          ? <UtensilsCrossed className="w-3 h-3 text-amber-600" />
                          : <Package className="w-3 h-3 text-sky-600" />}
                        {d.name}
                      </Badge>
                    </Link>
                  ))}
                  {neverQuoted.length > 20 && (
                    <Badge variant="secondary">+ {neverQuoted.length - 20} more</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </PortalShell>
      </div>
    </>
  );
}

export default function AdminOfferingPage() {
  return (
    // OFR-A (offering audit, OFR-2): admit sales_admin (capability
    // snapshot for client advisories) + region_admin (regional view).
    // OFR-B: admit OWNER per project_cateringms_owner_dashboard - the
    // owner persona behaves like company_admin until a dedicated
    // dashboard ships, but pre-OFR-B the owner couldn't open their
    // own offering snapshot.
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.OWNER,
      UserRole.ADMIN,
      UserRole.SALES_ADMIN,
      UserRole.REGION_ADMIN,
    ]}>
      <OfferingPage />
    </ProtectedRoute>
  );
}
