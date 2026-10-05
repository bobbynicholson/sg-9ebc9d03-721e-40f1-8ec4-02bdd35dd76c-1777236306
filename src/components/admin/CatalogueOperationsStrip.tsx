import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Building2,
  CheckCircle2,
  HardHat,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";

export type CatalogueSurface =
  | "offering"
  | "menu"
  | "stock"
  | "inventory"
  | "equipment"
  | "damages"
  | "suppliers"
  | "outsource"
  | "shopping";

interface CatalogueCounts {
  menuActive: number;
  menuGaps: number;
  outsourcedWithoutProvider: number;
  inventoryItems: number;
  lowStock: number;
  equipmentActive: number;
  equipmentGaps: number;
  unresolvedDamages: number;
  activeSuppliers: number;
  activeOutsource: number;
  openShoppingLists: number;
}

const EMPTY_COUNTS: CatalogueCounts = {
  menuActive: 0,
  menuGaps: 0,
  outsourcedWithoutProvider: 0,
  inventoryItems: 0,
  lowStock: 0,
  equipmentActive: 0,
  equipmentGaps: 0,
  unresolvedDamages: 0,
  activeSuppliers: 0,
  activeOutsource: 0,
  openShoppingLists: 0,
};

const SURFACES: Array<{
  key: CatalogueSurface;
  title: string;
  href: string;
  icon: typeof Sparkles;
}> = [
  { key: "offering", title: "Offering", href: "/admin/offering", icon: Sparkles },
  { key: "menu", title: "Menu", href: "/admin/menu", icon: BookOpen },
  { key: "stock", title: "Stock", href: "/admin/stock", icon: Boxes },
  { key: "inventory", title: "Inventory", href: "/admin/inventory", icon: Package },
  { key: "equipment", title: "Equipment", href: "/admin/equipment", icon: Layers },
  { key: "damages", title: "Damages", href: "/admin/equipment?tab=damages", icon: AlertTriangle },
  { key: "suppliers", title: "Suppliers", href: "/admin/suppliers?active=1", icon: Building2 },
  { key: "outsource", title: "Outsource", href: "/admin/outsource-providers?active=1", icon: HardHat },
  { key: "shopping", title: "Shopping", href: "/admin/shopping", icon: ShoppingCart },
];

function asRows<T>(res: { data: T[] | null; error: unknown }, surface: string, errors: string[]): T[] {
  if (res.error) {
    const message = res.error instanceof Error ? res.error.message : String(res.error);
    errors.push(`${surface}: ${message}`);
    return [];
  }
  return res.data || [];
}

function metricFor(surface: CatalogueSurface, counts: CatalogueCounts) {
  switch (surface) {
    case "offering":
      return `${counts.menuActive + counts.equipmentActive} sellable`;
    case "menu":
      return `${counts.menuActive} live`;
    case "stock":
      return `${counts.lowStock + counts.openShoppingLists + counts.unresolvedDamages} flags`;
    case "inventory":
      return `${counts.inventoryItems} items`;
    case "equipment":
      return `${counts.equipmentActive} active`;
    case "damages":
      return `${counts.unresolvedDamages} open`;
    case "suppliers":
      return `${counts.activeSuppliers} active`;
    case "outsource":
      return `${counts.activeOutsource} active`;
    case "shopping":
      return `${counts.openShoppingLists} open`;
  }
}

function flagFor(surface: CatalogueSurface, counts: CatalogueCounts) {
  switch (surface) {
    case "menu":
      if (counts.menuGaps > 0) return { text: `${counts.menuGaps} gaps`, tone: "warning" as const };
      if (counts.outsourcedWithoutProvider > 0) return { text: `${counts.outsourcedWithoutProvider} provider`, tone: "warning" as const };
      return null;
    case "stock":
      return counts.lowStock > 0 ? { text: `${counts.lowStock} low`, tone: "critical" as const } : null;
    case "inventory":
      return counts.lowStock > 0 ? { text: `${counts.lowStock} low`, tone: "critical" as const } : null;
    case "equipment":
      return counts.equipmentGaps > 0 ? { text: `${counts.equipmentGaps} gaps`, tone: "warning" as const } : null;
    case "damages":
      return counts.unresolvedDamages > 0 ? { text: "follow up", tone: "critical" as const } : null;
    case "shopping":
      return counts.openShoppingLists > 0 ? { text: "in progress", tone: "default" as const } : null;
    default:
      return null;
  }
}

function flagClass(tone: "default" | "warning" | "critical") {
  if (tone === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-brand-primary/20 bg-brand-primary/10 text-brand-primary";
}

export function CatalogueOperationsStrip({
  active,
  className = "",
}: {
  active: CatalogueSurface;
  className?: string;
}) {
  const { user, profile } = useAuth() as {
    user?: { company_id?: string; user_metadata?: { company_id?: string } } | null;
    profile?: { company_id?: string } | null;
  };
  const { withSlug } = useTenantHref();
  const companyId =
    profile?.company_id ||
    user?.company_id ||
    user?.user_metadata?.company_id ||
    null;

  const [counts, setCounts] = useState<CatalogueCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const errors: string[] = [];
    try {
      const [
        menuRes,
        inventoryRes,
        equipmentRes,
        damagesRes,
        suppliersRes,
        outsourceRes,
        shoppingRes,
      ] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id, is_available, base_price, image_url, deleted_at, fulfilment_type, default_outsource_provider_id")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("inventory_items")
          .select("id, current_stock, minimum_stock, deleted_at")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("equipment")
          .select("id, is_available, rental_price, image_url")
          .eq("company_id", companyId),
        supabase
          .from("equipment_damages")
          .select("id, resolved")
          .eq("company_id", companyId),
        supabase
          .from("suppliers")
          .select("id, is_active, deleted_at")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("outsource_providers")
          .select("id, is_active, deleted_at")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("shopping_lists")
          .select("id, status")
          .eq("company_id", companyId),
      ]);

      const menuRows = asRows<{
        is_available: boolean | null;
        base_price: number | null;
        image_url: string | null;
        fulfilment_type: string | null;
        default_outsource_provider_id: string | null;
      }>(menuRes, "menu", errors);
      const inventoryRows = asRows<{
        current_stock: number | null;
        minimum_stock: number | null;
      }>(inventoryRes, "inventory", errors);
      const equipmentRows = asRows<{
        is_available: boolean | null;
        rental_price: number | null;
        image_url: string | null;
      }>(equipmentRes, "equipment", errors);
      const damagesRows = asRows<{ resolved: boolean | null }>(damagesRes, "damages", errors);
      const supplierRows = asRows<{ is_active: boolean | null }>(suppliersRes, "suppliers", errors);
      const outsourceRows = asRows<{ is_active: boolean | null }>(outsourceRes, "outsource", errors);
      const shoppingRows = asRows<{ status: string | null }>(shoppingRes, "shopping", errors);

      const activeMenu = menuRows.filter((r) => r.is_available !== false);
      const activeEquipment = equipmentRows.filter((r) => r.is_available !== false);
      const nextCounts: CatalogueCounts = {
        menuActive: activeMenu.length,
        menuGaps: activeMenu.filter((r) => !r.image_url || !r.base_price || Number(r.base_price) <= 0).length,
        outsourcedWithoutProvider: activeMenu.filter((r) =>
          (r.fulfilment_type === "outsourced" || r.fulfilment_type === "hybrid") &&
          !r.default_outsource_provider_id,
        ).length,
        inventoryItems: inventoryRows.length,
        lowStock: inventoryRows.filter((r) => {
          const minimum = Number(r.minimum_stock || 0);
          if (minimum <= 0) return false;
          return Number(r.current_stock || 0) <= minimum;
        }).length,
        equipmentActive: activeEquipment.length,
        equipmentGaps: activeEquipment.filter((r) => !r.image_url || !r.rental_price || Number(r.rental_price) <= 0).length,
        unresolvedDamages: damagesRows.filter((r) => r.resolved !== true).length,
        activeSuppliers: supplierRows.filter((r) => r.is_active !== false).length,
        activeOutsource: outsourceRows.filter((r) => r.is_active !== false).length,
        openShoppingLists: shoppingRows.filter((r) => !["completed", "cancelled", "canceled"].includes(String(r.status || "").toLowerCase())).length,
      };

      setCounts(nextCounts);
      setLastLoadedAt(new Date());
      if (errors.length > 0) setError(errors[0]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      captureException(err, { tags: { surface: "catalogue-operations-strip", companyId } });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 1200);
    };
    const channel = supabase
      .channel(`catalogue-strip:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_damages", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "outsource_providers", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_lists", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId, load]);

  const health = useMemo(() => {
    const totalProblems =
      counts.menuGaps +
      counts.outsourcedWithoutProvider +
      counts.lowStock +
      counts.equipmentGaps +
      counts.unresolvedDamages +
      counts.openShoppingLists;
    if (totalProblems === 0) return { label: "Clean", className: "border-brand-primary/20 bg-brand-primary/10 text-brand-primary", icon: CheckCircle2 };
    if (totalProblems <= 3) return { label: `${totalProblems} to check`, className: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle };
    return { label: `${totalProblems} to fix`, className: "border-rose-200 bg-rose-50 text-rose-700", icon: AlertTriangle };
  }, [counts]);
  const HealthIcon = health.icon;

  return (
    // One compact tab row: section links with their warning flags, and the
    // overall health + refresh on the right. Full counts show on hover.
    <section className={`mb-5 rounded-lg border border-slate-200 bg-white shadow-sm ${className}`} aria-label="Catalogue sections">
      <div className="flex flex-col gap-2 p-1.5 lg:flex-row lg:items-center">
        <nav className="flex min-w-0 flex-1 flex-wrap gap-1">
          {SURFACES.map((surface) => {
            const Icon = surface.icon;
            const activeSurface = surface.key === active;
            const flag = flagFor(surface.key, counts);
            const metric = loading ? "" : metricFor(surface.key, counts);
            return (
              <Link
                key={surface.key}
                href={withSlug(surface.href)}
                title={metric ? `${surface.title}: ${metric}` : surface.title}
                aria-current={activeSurface ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  activeSurface
                    ? "bg-brand-primary/10 text-brand-primary"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${activeSurface ? "text-brand-primary" : "text-slate-400"}`} />
                {surface.title}
                {flag && !loading && (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${flagClass(flag.tone)}`}>
                    {flag.text}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 border-t border-slate-100 px-1 pt-1.5 lg:border-l lg:border-t-0 lg:pl-2 lg:pt-0">
          <Badge
            variant="outline"
            className={`gap-1 ${health.className}`}
            title={loading ? "Refreshing live counts..." : error ? "Some live counts could not refresh." : `Live counts${lastLoadedAt ? `, updated ${lastLoadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`}
          >
            <HealthIcon className="h-3 w-3" />
            {health.label}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading || !companyId}
            className="h-8 w-8 p-0 text-slate-600"
            aria-label="Refresh catalogue counts"
            title="Refresh catalogue counts"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      {error && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}
    </section>
  );
}
