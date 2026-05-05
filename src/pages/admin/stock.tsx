/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Stock-pressure triage. Three tiles + a unified "Needs attention" feed
 * mixing low ingredients, equipment commitments in the next 14 days,
 * and pending hire-in receipts. The owner's morning glance for "what's
 * tight this week".
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
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { inventoryService } from "@/services/inventoryService";
import {
  Package, Truck, ShoppingBag, AlertTriangle, Loader2, TrendingUp,
  Boxes, ClipboardList, ArrowRight, Filter, MapPin,
} from "lucide-react";

interface AlertRow {
  key: string;
  kind: "ingredient" | "equipment" | "hire-in";
  title: string;
  subtitle: string;
  date: string;       // ISO yyyy-mm-dd, or "" for unspecified
  severity: "red" | "amber" | "blue";
  href: string;
}

const severityClasses: Record<string, string> = {
  red:   "border-red-300 bg-red-50",
  amber: "border-amber-300 bg-amber-50",
  blue:  "border-sky-300 bg-sky-50",
};

const severityIcon: Record<string, string> = {
  red:   "text-red-600",
  amber: "text-amber-600",
  blue:  "text-sky-600",
};

const dateFmt = (iso: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric", month: "short",
    });
  } catch { return iso; }
};

function StockPage() {
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { regionFilterId, options: regionOptions } = useRegionFilter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [filterChip, setFilterChip] = useState<"all" | "ingredient" | "equipment" | "hire-in">("all");

  // Tile data
  const [lowStock, setLowStock] = useState<{ count: number; top5: any[] }>({ count: 0, top5: [] });
  const [equipPressure, setEquipPressure] = useState<{ count: number; peakDate: string | null }>({ count: 0, peakDate: null });
  const [hireIn, setHireIn] = useState<{ count: number; oldest: string | null }>({ count: 0, oldest: null });

  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const regionLabel = useMemo(() => {
    if (!regionFilterId) return null;
    return regionOptions.find((r: any) => r.id === regionFilterId)?.label || null;
  }, [regionFilterId, regionOptions]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const today = new Date();
      const todayISO = today.toISOString().slice(0, 10);
      const in14ISO = new Date(today.getTime() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      // ---- Low stock -----------------------------------------------------
      const lowItems = await inventoryService.getLowStockItems(companyId);
      const filteredLow = regionFilterId
        ? lowItems.filter((i: any) => i.region_id === regionFilterId || i.is_shared)
        : lowItems;
      const top5Low = filteredLow.slice(0, 5);
      setLowStock({ count: filteredLow.length, top5: top5Low });

      // ---- Equipment commitments next 14d --------------------------------
      // equipment_bookings.booked_from is the start; we look at bookings
      // where the start sits in the 14-day window.
      const { data: bookingRows } = await supabase
        .from("equipment_bookings")
        .select("id, booked_from, quantity, status, equipment:equipment_id(name)")
        .eq("company_id", companyId)
        .gte("booked_from", todayISO)
        .lte("booked_from", in14ISO)
        .neq("status", "cancelled")
        .order("booked_from", { ascending: true });

      const bRows = (bookingRows || []) as any[];
      // Highest-pressure date = the date with the most line items
      const dayCount: Record<string, number> = {};
      for (const b of bRows) {
        const d = (b.booked_from || "").slice(0, 10);
        dayCount[d] = (dayCount[d] || 0) + 1;
      }
      const peakDate = Object.entries(dayCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      setEquipPressure({ count: bRows.length, peakDate });

      // ---- Hire-in pending receipts --------------------------------------
      // Pending purchase_history rows -- treated as "shopper went out, hasn't
      // logged the receipt yet". Status filter: not 'received' / not 'completed'.
      const { data: hireRows } = await supabase
        .from("purchase_history")
        .select("id, purchase_date, status, total_cost, supplier_name")
        .eq("company_id", companyId)
        .in("status", ["pending", "ordered", "draft"])
        .order("purchase_date", { ascending: true });
      const hRows = (hireRows || []) as any[];
      const oldest = hRows[0]?.purchase_date || null;
      setHireIn({ count: hRows.length, oldest });

      // ---- Unified feed --------------------------------------------------
      const feed: AlertRow[] = [];

      for (const i of filteredLow) {
        const cur = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        const reorderBuf = Number(i.maximum_stock || 0) || min * 1.5;
        const sev: "red" | "amber" = cur <= min ? "red" : (cur <= reorderBuf ? "amber" : "amber");
        feed.push({
          key: `i:${i.id}`,
          kind: "ingredient",
          title: i.item_name || "Unnamed item",
          subtitle: `${cur} ${i.unit_of_measure || ""} on hand, min ${min}`.trim(),
          date: "",
          severity: sev,
          href: `/admin/inventory?id=${i.id}`,
        });
      }

      for (const b of bRows) {
        const d = (b.booked_from || "").slice(0, 10);
        feed.push({
          key: `e:${b.id}`,
          kind: "equipment",
          title: b.equipment?.name || "Equipment booking",
          subtitle: `${b.quantity || 1}x committed for ${dateFmt(d)}`,
          date: d,
          severity: "blue",
          href: "/admin/equipment",
        });
      }

      for (const h of hRows) {
        feed.push({
          key: `h:${h.id}`,
          kind: "hire-in",
          title: h.supplier_name || "Hire-in receipt",
          subtitle: `Awaiting receipt -- ordered ${dateFmt((h.purchase_date || "").slice(0, 10))}`,
          date: (h.purchase_date || "").slice(0, 10),
          severity: "amber",
          href: "/admin/shopping",
        });
      }

      // Sort: dated items by date asc, undated (low stock) first because
      // they need action regardless of when the next event lands.
      feed.sort((a, b) => {
        if (!a.date && b.date) return -1;
        if (a.date && !b.date) return 1;
        if (!a.date && !b.date) return 0;
        return a.date < b.date ? -1 : 1;
      });

      setAlerts(feed);
    } catch (err: any) {
      console.error("Stock page load failed:", err);
      toast({
        title: "Could not load stock view",
        description: err?.message || "Check your connection and retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId, regionFilterId]);

  const filteredAlerts = useMemo(() => {
    if (filterChip === "all") return alerts;
    return alerts.filter((a) => a.kind === filterChip);
  }, [alerts, filterChip]);

  const totalAttention = lowStock.count + equipPressure.count + hireIn.count;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Stock -- CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <Boxes className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                  Stock
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Where the pressure is right now.
                  {regionLabel && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="w-3 h-3" /> {regionLabel}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
              {totalAttention > 0 && (
                <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600">
                  {totalAttention} need{totalAttention === 1 ? "s" : ""} attention
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </div>

          {/* Three top tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="w-4 h-4 text-red-600" />
                  Low stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-slate-900">{loading ? "--" : lowStock.count}</span>
                  <span className="text-xs text-slate-600">item{lowStock.count === 1 ? "" : "s"} below minimum</span>
                </div>
                {lowStock.top5.length > 0 && (
                  <ul className="space-y-1.5">
                    {lowStock.top5.map((i: any) => {
                      const cur = Number(i.current_stock || 0);
                      const min = Number(i.minimum_stock || 0);
                      const isCrit = cur <= min;
                      return (
                        <li key={i.id} className="flex items-center justify-between text-xs">
                          <span className="truncate text-slate-700">{i.item_name}</span>
                          <Badge variant="secondary" className={`ml-2 flex-shrink-0 ${isCrit ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {cur}/{min}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Link href="/admin/inventory">
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1">
                    Manage inventory <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="w-4 h-4 text-sky-600" />
                  Equipment (next 14d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-slate-900">{loading ? "--" : equipPressure.count}</span>
                  <span className="text-xs text-slate-600">commitment{equipPressure.count === 1 ? "" : "s"}</span>
                </div>
                <p className="text-xs text-slate-600">
                  {equipPressure.peakDate
                    ? <>Peak day: <span className="font-semibold text-slate-900">{dateFmt(equipPressure.peakDate)}</span></>
                    : "No commitments in window"}
                </p>
                <Link href="/admin/equipment-shortages">
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1">
                    Equipment shortages <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="w-4 h-4 text-amber-600" />
                  Hire-in pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-slate-900">{loading ? "--" : hireIn.count}</span>
                  <span className="text-xs text-slate-600">awaiting receipt</span>
                </div>
                <p className="text-xs text-slate-600">
                  {hireIn.oldest
                    ? <>Oldest: <span className="font-semibold text-slate-900">{dateFmt((hireIn.oldest || "").slice(0, 10))}</span></>
                    : "All caught up"}
                </p>
                <Link href="/admin/shopping">
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1">
                    Shopping <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Needs attention feed */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  Needs attention
                </CardTitle>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  {(["all", "ingredient", "equipment", "hire-in"] as const).map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={filterChip === c ? "default" : "outline"}
                      onClick={() => setFilterChip(c)}
                      className="h-7 px-2.5 text-xs capitalize"
                    >
                      {c === "all" ? "All" : c === "hire-in" ? "Hire-in" : c[0].toUpperCase() + c.slice(1) + "s"}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : filteredAlerts.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Nothing flagged. Stock looks healthy.</p>
              ) : (
                <ul className="space-y-2">
                  {filteredAlerts.slice(0, 30).map((a) => (
                    <li key={a.key}>
                      <Link
                        href={a.href}
                        className={`flex items-start sm:items-center justify-between gap-3 p-3 rounded-lg border-l-4 ${severityClasses[a.severity]} hover:bg-white transition-colors`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${severityIcon[a.severity]}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                            <p className="text-xs text-slate-600 truncate">{a.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            {a.kind === "hire-in" ? "Hire-in" : a.kind}
                          </Badge>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Shortcut grid */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Shortcuts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                {[
                  { href: "/admin/inventory", icon: Package, label: "Inventory", color: "from-emerald-50 to-teal-50", iconColor: "text-emerald-600" },
                  { href: "/admin/equipment", icon: Boxes, label: "Equipment", color: "from-sky-50 to-blue-50", iconColor: "text-sky-600" },
                  { href: "/admin/shopping", icon: ShoppingBag, label: "Shopping", color: "from-amber-50 to-orange-50", iconColor: "text-amber-600" },
                  { href: "/admin/shopping", icon: ClipboardList, label: "Hire-in orders", color: "from-rose-50 to-pink-50", iconColor: "text-rose-600" },
                  { href: "/admin/equipment-shortages", icon: AlertTriangle, label: "Shortages", color: "from-red-50 to-orange-50", iconColor: "text-red-600" },
                ].map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    className={`flex items-center gap-3 p-4 bg-gradient-to-br ${s.color} rounded-lg hover:shadow-md transition-all`}
                  >
                    <s.icon className={`w-5 h-5 ${s.iconColor} flex-shrink-0`} />
                    <span className="font-semibold text-sm text-slate-900">{s.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminStockPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <StockPage />
    </ProtectedRoute>
  );
}
