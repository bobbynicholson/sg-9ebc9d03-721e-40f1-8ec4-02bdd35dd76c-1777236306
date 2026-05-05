/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Offering glance -- "what are we actually selling?".
 *
 * Two big tiles above the fold (Menu + Equipment) plus a "recently
 * quoted" strip below pulling the last accepted-quote line items from
 * the last 30 days. Owner-level summary, no edits happen here.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  UtensilsCrossed, Package, AlertTriangle, ImageOff, Tag,
  TrendingUp, Loader2, ArrowRight, Sparkles,
} from "lucide-react";

interface MenuTile {
  active: number;
  lastEdited: string | null;
  topQuoted: { id: string; name: string; count: number }[];
}

interface EquipmentTile {
  total: number;
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

const dateFmt = (iso: string | null) => {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return "Unknown"; }
};

function OfferingPage() {
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [menuTile, setMenuTile] = useState<MenuTile>({ active: 0, lastEdited: null, topQuoted: [] });
  const [equipTile, setEquipTile] = useState<EquipmentTile>({ total: 0, missingPrice: 0, missingPhoto: 0 });
  const [recent, setRecent] = useState<RecentItem[]>([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const today = new Date();
      const since30 = new Date(today.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const since90 = new Date(today.getTime() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      // Menu count + last-edited
      const [menuCountRes, menuLatestRes, equipRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("is_available", true),
        supabase
          .from("menu_items")
          .select("updated_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase
          .from("equipment")
          .select("id, rental_price, image_url")
          .eq("company_id", companyId),
      ]);

      const lastEdited = (menuLatestRes.data?.[0] as any)?.updated_at || null;

      // Top-quoted last 90d via order_items joined to orders -- order_items
      // is the canonical line-items table. We sum quantity to "frequency".
      const { data: oiRows } = await supabase
        .from("order_items")
        .select("menu_item_id, item_name, orders!inner(company_id, event_date, deleted_at, status)")
        .eq("orders.company_id", companyId)
        .is("orders.deleted_at", null)
        .gte("orders.event_date", since90)
        .not("menu_item_id", "is", null)
        .limit(5000);

      const freq: Record<string, { id: string; name: string; count: number }> = {};
      for (const r of (oiRows || []) as any[]) {
        const id = r.menu_item_id;
        if (!id) continue;
        const k = id;
        if (!freq[k]) freq[k] = { id, name: r.item_name || "Unnamed", count: 0 };
        freq[k].count += 1;
      }
      const topQuoted = Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);

      const equipRows = (equipRes.data || []) as any[];
      const missingPrice = equipRows.filter((e) => !e.rental_price || Number(e.rental_price) === 0).length;
      const missingPhoto = equipRows.filter((e) => !e.image_url).length;

      setMenuTile({ active: menuCountRes.count ?? 0, lastEdited, topQuoted });
      setEquipTile({ total: equipRows.length, missingPrice, missingPhoto });

      // Recently quoted: last 30 days, accepted orders, distinct items
      const { data: acceptedItems } = await supabase
        .from("order_items")
        .select("menu_item_id, item_name, orders!inner(company_id, event_date, status, deleted_at)")
        .eq("orders.company_id", companyId)
        .is("orders.deleted_at", null)
        .gte("orders.event_date", since30)
        .in("orders.status", ["confirmed", "completed", "preparing", "ready", "in_transit"])
        .not("menu_item_id", "is", null)
        .order("event_date", { foreignTable: "orders", ascending: false })
        .limit(2000);

      const menuRecent: Record<string, RecentItem> = {};
      for (const r of (acceptedItems || []) as any[]) {
        const id = r.menu_item_id;
        if (!id) continue;
        const date = r.orders?.event_date || "";
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

      const { data: equipBookings } = await supabase
        .from("equipment_bookings")
        .select("equipment_id, booked_from, equipment:equipment_id(name)")
        .eq("company_id", companyId)
        .gte("booked_from", since30)
        .not("equipment_id", "is", null)
        .order("booked_from", { ascending: false })
        .limit(2000);

      const equipRecent: Record<string, RecentItem> = {};
      for (const r of (equipBookings || []) as any[]) {
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
    } catch (err: any) {
      console.error("Offering load failed:", err);
      toast({
        title: "Could not load offering",
        description: err?.message || "Check your connection and retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const showMenuEmpty = !loading && menuTile.active === 0;
  const showEquipEmpty = !loading && equipTile.total === 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Offering -- CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                  Offering
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">What you are actually selling, at a glance.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            {/* Menu tile */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <UtensilsCrossed className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                      <CardTitle className="text-lg sm:text-xl">Menu</CardTitle>
                      <p className="text-xs text-slate-600">Active items in your catalogue</p>
                    </div>
                  </div>
                  <Link href="/admin/menu">
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
                    <Link href="/admin/menu">
                      <Button size="sm" className="mt-3">Add your first item</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-4xl font-bold text-slate-900">
                        {loading ? "--" : menuTile.active}
                      </span>
                      <span className="text-sm text-slate-600">active item{menuTile.active === 1 ? "" : "s"}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">Last edited: {dateFmt(menuTile.lastEdited)}</p>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Top 3 quoted (90d)</p>
                      {menuTile.topQuoted.length === 0 ? (
                        <p className="text-sm text-slate-500">Nothing quoted in the last 90 days.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {menuTile.topQuoted.map((m) => (
                            <li key={m.id} className="flex items-center justify-between text-sm">
                              <span className="truncate text-slate-700">{m.name}</span>
                              <Badge variant="secondary" className="ml-2 flex-shrink-0">{m.count}x</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Equipment tile */}
            <Card className="border-0 shadow-lg overflow-hidden">
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
                  <Link href="/admin/equipment">
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
                    <Link href="/admin/equipment">
                      <Button size="sm" className="mt-3">Add equipment</Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-4xl font-bold text-slate-900">
                        {loading ? "--" : equipTile.total}
                      </span>
                      <span className="text-sm text-slate-600">item{equipTile.total === 1 ? "" : "s"} on the books</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={equipTile.missingPrice > 0 ? "destructive" : "secondary"} className={equipTile.missingPrice > 0 ? "bg-amber-500 hover:bg-amber-600" : ""}>
                        <Tag className="w-3 h-3 mr-1" />
                        {equipTile.missingPrice} missing price
                      </Badge>
                      <Badge variant={equipTile.missingPhoto > 0 ? "destructive" : "secondary"} className={equipTile.missingPhoto > 0 ? "bg-amber-500 hover:bg-amber-600" : ""}>
                        <ImageOff className="w-3 h-3 mr-1" />
                        {equipTile.missingPhoto} missing photo
                      </Badge>
                    </div>
                    {(equipTile.missingPrice > 0 || equipTile.missingPhoto > 0) && (
                      <p className="text-xs text-amber-700 mt-3 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        Items without a price or photo will look thin on quotes -- worth tidying up.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recently quoted strip */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Recently quoted (30 days)</CardTitle>
              <p className="text-xs text-slate-600 mt-0.5">What clients accepted onto orders most recently.</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : recent.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">Nothing in the last 30 days. Once an order goes confirmed, it lands here.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {recent.map((r) => (
                    <div key={r.key} className="flex-shrink-0 w-56 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminOfferingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <OfferingPage />
    </ProtectedRoute>
  );
}
