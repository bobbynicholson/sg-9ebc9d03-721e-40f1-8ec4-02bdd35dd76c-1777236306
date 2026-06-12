/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/equipment - equipment hub.
 *
 * Four tabs: Catalog (the catering company's hire-out items),
 * Availability (per-date free/committed lookup), Shortages (extracted
 * panel from /admin/equipment-shortages) and Hire-in orders (extracted
 * panel from /admin/equipment/hire-orders).
 *
 * Tab state is mirrored to ?tab=... so deep-links land on the right
 * surface (catalog by default).
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/router";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { staffOrderHref } from "@/lib/orderUrls";
import { SortMenu } from "@/components/ui/sort-menu";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Package, Edit, Trash2, AlertTriangle, CheckCircle2, ToggleLeft,
  Calendar as CalendarIcon, ExternalLink, Loader2, Download, X, RefreshCw, Sparkles,
} from "lucide-react";
import {
  listUpcomingReservations, getEquipmentAvailability,
  type EquipmentReservationRow,
} from "@/services/equipmentAvailabilityService";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { usePricingMode } from "@/hooks/usePricingMode";
import { toExVat, toIncVat } from "@/lib/vatMath";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import {
  equipmentManagementService,
  buyVsRentRecommendation,
  detectMaterialConflict,
} from "@/services/equipmentManagementService";
import { ShortagesPanel } from "@/components/admin/equipment/ShortagesPanel";
import { HireInPanel } from "@/components/admin/equipment/HireInPanel";
import { DamageAnalytics } from "@/components/cleaning/DamageAnalytics";
import { toLocalISO } from "@/lib/localDate";
import { captureException } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────

interface EquipmentRow {
  id: string;
  company_id: string | null;
  name: string | null;
  category: string | null;
  description?: string | null;
  rental_price?: number | null;
  hire_in_cost?: number | null;
  quantity?: number | null;
  available_quantity?: number | null;
  condition?: string | null;
  is_available?: boolean | null;
  image_url?: string | null;
  replacement_cost?: number | null;
  cleaning_time_hours?: number | null;
  // Wave 70.24 - per-equipment cleaning flags. Drive the cleaning
  // portal's filtering + the auto-trigger that creates
  // cleaning_jobs on order delivery.
  requires_cleaning?: boolean | null;
  dishwasher_safe?: boolean | null;
  cleaning_time_manual_minutes?: number | null;
  cleaning_time_dishwasher_minutes?: number | null;
  is_hire_in?: boolean | null;
  supplier_cleans?: boolean | null;
  // Phase 5 #1: maintenance log fields. Backed by Phase 4 #6
  // schema. service_interval_days NULL means "no recurring
  // schedule"; the cron leaves these alone.
  service_interval_days?: number | null;
  last_serviced_at?: string | null;
  next_service_due?: string | null;
}

// Wave 70.24 - category-driven smart defaults for the cleaning
// flags. Mirrors the migration's backfill SQL so a fresh tenant
// picking a category gets sensible defaults without having to
// understand every checkbox.
const CLEANING_DEFAULTS_BY_CATEGORY: Record<string, {
  requires_cleaning: boolean;
  dishwasher_safe: boolean;
  cleaning_time_manual_minutes: number | null;
  cleaning_time_dishwasher_minutes: number | null;
}> = {
  cutlery:   { requires_cleaning: true,  dishwasher_safe: true,  cleaning_time_manual_minutes: 0.5, cleaning_time_dishwasher_minutes: 0.2 },
  crockery:  { requires_cleaning: true,  dishwasher_safe: true,  cleaning_time_manual_minutes: 1,   cleaning_time_dishwasher_minutes: 0.5 },
  glassware: { requires_cleaning: true,  dishwasher_safe: true,  cleaning_time_manual_minutes: 1.5, cleaning_time_dishwasher_minutes: 0.5 },
  chafing:   { requires_cleaning: true,  dishwasher_safe: false, cleaning_time_manual_minutes: 10,  cleaning_time_dishwasher_minutes: null },
  serving:   { requires_cleaning: true,  dishwasher_safe: false, cleaning_time_manual_minutes: 10,  cleaning_time_dishwasher_minutes: null },
  linen:     { requires_cleaning: true,  dishwasher_safe: false, cleaning_time_manual_minutes: null, cleaning_time_dishwasher_minutes: null },
  tables:    { requires_cleaning: false, dishwasher_safe: false, cleaning_time_manual_minutes: null, cleaning_time_dishwasher_minutes: null },
  chairs:    { requires_cleaning: false, dishwasher_safe: false, cleaning_time_manual_minutes: null, cleaning_time_dishwasher_minutes: null },
  lighting:  { requires_cleaning: false, dishwasher_safe: false, cleaning_time_manual_minutes: null, cleaning_time_dishwasher_minutes: null },
  gas:       { requires_cleaning: false, dishwasher_safe: false, cleaning_time_manual_minutes: null, cleaning_time_dishwasher_minutes: null },
  decor:     { requires_cleaning: false, dishwasher_safe: false, cleaning_time_manual_minutes: null, cleaning_time_dishwasher_minutes: null },
};

const SUGGESTED_CATEGORIES = [
  "chafing", "tables", "chairs", "linen", "crockery", "cutlery",
  "glassware", "lighting", "gas", "serving", "decor", "other",
];

const TABS = ["catalog", "availability", "shortages", "hire-in", "damages"] as const;
type TabKey = typeof TABS[number];

const safeNum = (v: any) => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtR = (v: number) =>
  `R ${(Number.isFinite(v) ? v : 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ── Page ─────────────────────────────────────────────────────────────

export default function ProtectedEquipmentPage() {
  return (
    // EQP-A (equipment audit, EQP-3): admit sales_admin (hire-in
    // capability check) + region_admin (regional fleet RLS).
    // EQP-C (task #190 must-fix, 2026-05-24): admit OWNER. The
    // finance gates inside the page (canSeeFinance) already include
    // owner, but owner couldn't reach the page at all - 403'd at the
    // route. Inconsistent with stock / inventory / financial pages.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <EquipmentPage />
    </ProtectedRoute>
  );
}

function EquipmentPage() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const router = useRouter();
  const companyId = (user?.user_metadata?.company_id as string | undefined) || (user?.company_id as string | undefined) || null;

  // Tab state mirrored to URL.
  const initialTab = useMemo<TabKey>(() => {
    const t = (router.query.tab as string | undefined) || "";
    return (TABS as readonly string[]).includes(t) ? (t as TabKey) : "catalog";
  }, [router.query.tab]);
  const [tab, setTab] = useState<TabKey>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const handleTabChange = (next: string) => {
    const t = (TABS as readonly string[]).includes(next) ? (next as TabKey) : "catalog";
    setTab(t);
    const query = { ...router.query, tab: t };
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Equipment - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-full">
          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl shadow-lg">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                Equipment
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Catering equipment catalogue. Availability per date, current bookings, shortages, and hire-in cover when you're running short for an event.
              </p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full md:w-auto h-auto">
              <TabsTrigger value="catalog" className="text-xs md:text-sm">Catalog</TabsTrigger>
              <TabsTrigger value="availability" className="text-xs md:text-sm">Availability</TabsTrigger>
              <TabsTrigger value="shortages" className="text-xs md:text-sm">Shortages</TabsTrigger>
              <TabsTrigger value="hire-in" className="text-xs md:text-sm">Hire-in orders</TabsTrigger>
              <TabsTrigger value="damages" className="text-xs md:text-sm">Damages</TabsTrigger>
            </TabsList>

            <TabsContent value="catalog" className="mt-6">
              <CatalogTab companyId={companyId} />
            </TabsContent>

            <TabsContent value="availability" className="mt-6">
              <AvailabilityTab companyId={companyId} />
            </TabsContent>

            <TabsContent value="shortages" className="mt-6">
              <ShortagesPanel />
            </TabsContent>

            <TabsContent value="hire-in" className="mt-6">
              <HireInPanel />
            </TabsContent>

            {/* CLN2-I: cost-breakdown analytics moved off the
                cleaner daily dashboard onto the admin equipment
                hub. The cleaner sees a flag-form + recent strip
                only - finance-grade roll-ups belong here. */}
            <TabsContent value="damages" className="mt-6">
              <DamageAnalytics />
            </TabsContent>
          </Tabs>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}

// ── Catalog tab (the existing catalog UI, now a tab pane) ──────────

function CatalogTab({ companyId }: { companyId: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const pricingMode = usePricingMode();
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Phase 26 #8: "/" or Cmd-F focuses the search input.
  // Phase 29 #6: "n" opens the Add equipment dialog.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setEditing({
          id: "",
          company_id: companyId,
          name: "",
          category: "",
          description: "",
          rental_price: 0,
          quantity: 0,
          available_quantity: 0,
          condition: "good",
          is_available: true,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  const [filterAvailable, setFilterAvailable] = useState<"all" | "available" | "hidden">("all");
  // OFR-B (offering deferred, 2026-05-24): honour ?filter= from the
  // /admin/offering page. "missing-photo" filters to rows without an
  // image_url, "missing-price" to rows with no rental_price set.
  // Lets the operator land on the exact rows that need fixing
  // straight from the chip on /admin/offering.
  const [gapFilter, setGapFilter] = useState<"none" | "missing-photo" | "missing-price">("none");
  useEffect(() => {
    if (!router.isReady) return;
    const f = typeof router.query.filter === "string" ? router.query.filter : "";
    if (f === "missing-photo" || f === "missing-price") setGapFilter(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.filter]);

  const [editing, setEditing] = useState<EquipmentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [reservationsFor, setReservationsFor] = useState<EquipmentRow | null>(null);
  // Phase 5 #1: maintenance log entry dialog state.
  const [loggingServiceFor, setLoggingServiceFor] = useState<EquipmentRow | null>(null);
  const [logServiceType, setLogServiceType] = useState<string>("routine");
  const [logServiceNotes, setLogServiceNotes] = useState("");
  const [logServiceCost, setLogServiceCost] = useState("");
  const [logServiceSaving, setLogServiceSaving] = useState(false);
  const [reservations, setReservations] = useState<EquipmentReservationRow[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  // EQP-B (equipment deferred, 2026-05-24): intel maps. Loaded
  // alongside the catalogue rows in one fan-out so the per-row chips
  // (utilisation, damages, buy-vs-rent) render without an N+1 query.
  const [utilByItem, setUtilByItem] = useState<Map<string, { bookedEvents: number; totalEvents: number; pct: number }>>(new Map());
  const [damagesByItem, setDamagesByItem] = useState<Map<string, { count: number; totalCost: number }>>(new Map());
  const [hireSpendByItem, setHireSpendByItem] = useState<Map<string, { hireCount: number; totalSpend: number }>>(new Map());

  const loadRows = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, util, damages, hireSpend] = await Promise.all([
        equipmentManagementService.getAllEquipment(companyId),
        equipmentManagementService.getUtilisationByItem(companyId, 90),
        equipmentManagementService.getDamagesByItem(companyId, 90),
        equipmentManagementService.getHireInSpendByItem(companyId, 90),
      ]);
      setRows((data as any) || []);
      setUtilByItem(util);
      setDamagesByItem(damages);
      setHireSpendByItem(hireSpend);
    } catch (e: unknown) {
      captureException(e, { tags: { route: "/admin/equipment", step: "load-catalog", companyId } });
      toast({
        title: "Could not load equipment",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [companyId]);

  // EQP-B: realtime channel. Damage logged elsewhere or a hire-in
  // status change refreshes the catalogue chips. Debounced 1500ms.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void loadRows(); }, 1500);
    };
    const channel = supabase
      .channel(`equipment:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_damages", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_bookings", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!reservationsFor || !companyId) return;
    let cancelled = false;
    (async () => {
      setReservationsLoading(true);
      try {
        const list = await listUpcomingReservations(companyId, reservationsFor.id, { days: 90 });
        if (!cancelled) setReservations(list);
      } finally {
        if (!cancelled) setReservationsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reservationsFor, companyId]);

  const filteredRaw = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterAvailable === "available" && r.is_available === false) return false;
      if (filterAvailable === "hidden" && r.is_available !== false) return false;
      // OFR-B: gap-filter from /admin/offering deep-link.
      if (gapFilter === "missing-photo" && r.image_url) return false;
      if (gapFilter === "missing-price" && r.rental_price && Number(r.rental_price) > 0) return false;
      if (!q) return true;
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterAvailable, gapFilter]);

  const equipmentSortColumns: ColumnDef<EquipmentRow>[] = useMemo(() => [
    { key: "name",     accessor: (r) => r.name,                             type: "string" },
    { key: "category", accessor: (r) => r.category || "",                   type: "string" },
    { key: "rate",     accessor: (r) => Number(r.rental_price || 0),        type: "number" },
    { key: "free",     accessor: (r) => Number(r.available_quantity || 0),  type: "number" },
    { key: "qty",      accessor: (r) => Number(r.quantity || 0),            type: "number" },
  ], []);
  const equipmentSort = useSortable<EquipmentRow>(filteredRaw, equipmentSortColumns, { defaultKey: "name", defaultDir: "asc" });
  const filtered = equipmentSort.rows;

  const grouped = useMemo(() => {
    const m = new Map<string, EquipmentRow[]>();
    for (const r of filtered) {
      const k = r.category || "Uncategorised";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const handleSave = async () => {
    if (!editing || !companyId) return;
    if (!(editing.name || "").trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        name: editing.name?.trim() || null,
        category: editing.category?.trim() || null,
        description: editing.description?.trim() || null,
        rental_price: safeNum(editing.rental_price),
        hire_in_cost: safeNum(editing.hire_in_cost),
        quantity: safeNum(editing.quantity),
        available_quantity: safeNum(editing.available_quantity ?? editing.quantity),
        condition: editing.condition || "good",
        is_available: editing.is_available !== false,
        replacement_cost: editing.replacement_cost != null ? safeNum(editing.replacement_cost) : null,
        cleaning_time_hours: editing.cleaning_time_hours != null ? safeNum(editing.cleaning_time_hours) : null,
        // Wave 70.24 - per-equipment cleaning flags. requires_cleaning
        // defaults to true to preserve the existing trigger behaviour
        // when a tenant doesn't touch the toggle. Per-piece times
        // default to null (the service falls back to the coarse
        // cleaning_time_hours, then to its own per-method defaults).
        requires_cleaning: editing.requires_cleaning !== false,
        dishwasher_safe: editing.dishwasher_safe === true,
        cleaning_time_manual_minutes:
          editing.cleaning_time_manual_minutes != null && String(editing.cleaning_time_manual_minutes) !== ""
            ? safeNum(editing.cleaning_time_manual_minutes) : null,
        cleaning_time_dishwasher_minutes:
          editing.cleaning_time_dishwasher_minutes != null && String(editing.cleaning_time_dishwasher_minutes) !== ""
            ? safeNum(editing.cleaning_time_dishwasher_minutes) : null,
        is_hire_in: editing.is_hire_in === true,
        supplier_cleans: editing.is_hire_in === true && editing.supplier_cleans === true,
        image_url: editing.image_url || null,
        // Phase 5 #1: maintenance schedule. service_interval_days
        // empty -> NULL means no recurring service. The cron only
        // alerts on equipment with non-NULL next_service_due, which
        // the trigger derives from service_interval_days when a log
        // entry lands.
        service_interval_days:
          editing.service_interval_days != null && String(editing.service_interval_days) !== ""
            ? safeNum(editing.service_interval_days)
            : null,
        next_service_due: editing.next_service_due || null,
      } as any;
      if (editing.id && rows.some((r) => r.id === editing.id)) {
        await equipmentManagementService.updateEquipment(editing.id, payload);
        toast({ title: "Equipment updated" });
      } else {
        await equipmentManagementService.createEquipment(payload);
        toast({ title: "Equipment added to your catalog" });
      }
      setEditing(null);
      loadRows();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await equipmentManagementService.deleteEquipment(deletingId);
      toast({ title: "Equipment removed" });
      setDeletingId(null);
      loadRows();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const toggleAvailable = async (r: EquipmentRow) => {
    try {
      await equipmentManagementService.updateEquipment(r.id, {
        is_available: !(r.is_available !== false),
      } as any);
      loadRows();
    } catch (e: any) {
      toast({ title: "Toggle failed", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const totalItems = rows.length;
  const totalUnits = rows.reduce((s, r) => s + safeNum(r.quantity), 0);
  const offlineItems = rows.filter((r) => r.is_available === false).length;
  const lowStock = rows.filter(
    (r) => r.is_available !== false && safeNum(r.available_quantity) === 0 && safeNum(r.quantity) > 0,
  ).length;
  // EQP-B: hire-in spend rollup for the replaced "Total units" tile.
  let hireInCommittedTotal = 0;
  let hireInCommittedCount = 0;
  for (const v of hireSpendByItem.values()) {
    hireInCommittedTotal += v.totalSpend;
    hireInCommittedCount += v.hireCount;
  }
  // EQP-B: finance visibility gate. Hire-in cost is supplier pricing
  // (not customer pricing) - finance role only. Mirrors the Skylight
  // "finance to Directors" rule we apply on /admin/wages, refunds,
  // and the cashflow pages. Same role check pattern menu.tsx uses.
  const { profile } = useAuth();
  const financeRole = String(
    (profile as { active_role?: string; role?: string } | null)?.active_role
    || (profile as { active_role?: string; role?: string } | null)?.role
    || "",
  ).toLowerCase();
  const canSeeFinance =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "admin" || financeRole === "super_admin";
  // Phase 19 #3: roll up service-due state so an operator scanning
  // the page sees how much kit needs servicing without having to
  // scroll through and read each row's badge. Same definition as the
  // per-row badge (within 7 days = due soon, in the past = overdue).
  const SEVEN_DAYS_MS = 7 * 86400_000;
  const nowMs = Date.now();
  const overdueServiceCount = rows.filter((r) => {
    const t = r.next_service_due ? new Date(r.next_service_due as string).getTime() : null;
    return !!t && t < nowMs;
  }).length;
  const dueSoonServiceCount = rows.filter((r) => {
    const t = r.next_service_due ? new Date(r.next_service_due as string).getTime() : null;
    return !!t && t >= nowMs && t - nowMs <= SEVEN_DAYS_MS;
  }).length;

  return (
    <>
      <div className="mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="text-sm text-slate-600">
          Chafing dishes, tables, chairs, hire add-ons. The catalog feeds the quote builder, kitchen pack list and driver load list.
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {/* Phase 27 #10: manual refresh. The page caches the
            catalogue at mount; an operator who has added a kit
            from a colleague's mobile tablet needs a way to pull
            the new row without hard-reloading. */}
        <Button
          variant="outline"
          onClick={loadRows}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {/* Phase 15 #6: equipment CSV export. Lets the team
            stocktake / hand the catalogue to an insurer / quote
            an external hire-out without opening each row. Reads
            from the filtered list so search + availability scope
            flows through. */}
        <Button
          variant="outline"
          onClick={() => {
            if (filtered.length === 0) {
              toast({ title: "Nothing to export", description: "Adjust filters until at least one item is visible." });
              return;
            }
            // EQP-B: column accessor was reading hire_in_cost_per_unit
            // which doesn't exist on this table - the column is
            // hire_in_cost. Pre-EQP-B the Hire-in cost column was
            // permanently empty in the export. Also added BOM + CRLF.
            const headers = [
              "Name", "Category", "Quantity", "Available", "Condition",
              "Rental price", "Hire-in cost", "Cleaning hrs", "Hidden", "Description",
            ];
            const esc = (v: unknown) => {
              if (v == null) return "";
              const s = String(v).replace(/"/g, '""');
              return /[",\n]/.test(s) ? `"${s}"` : s;
            };
            const lines = [headers.join(",")];
            for (const r of filtered as unknown as Array<Record<string, unknown>>) {
              lines.push([
                esc(r.name), esc(r.category),
                esc(r.quantity), esc(r.available_quantity),
                esc(r.condition),
                esc(r.rental_price), esc(r.hire_in_cost),
                esc(r.cleaning_time_hours),
                esc(r.is_available === false ? "yes" : "no"),
                esc(r.description),
              ].join(","));
            }
            const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const stamp = toLocalISO(new Date());
            a.download = `equipment_${stamp}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
        <Button
          onClick={() =>
            setEditing({
              id: "",
              company_id: companyId,
              name: "",
              category: "",
              description: "",
              rental_price: 0,
              quantity: 0,
              available_quantity: 0,
              condition: "good",
              is_available: true,
            })
          }
          className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add equipment
        </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Catalog items</p><p className="text-2xl font-bold text-slate-900">{totalItems}</p></CardContent></Card>
        {/* EQP-B: replaced "Total units" vanity tile with hire-in
            committed - the operator-actionable number is "how much
            am I spending on third-party rentals". Falls back to
            total-units for roles without finance visibility. */}
        {canSeeFinance ? (
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-xs text-slate-600 mb-1">Hire-in spend (90d)</p>
              <p className="text-2xl font-bold text-rose-600">
                R {hireInCommittedTotal.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
              </p>
              {hireInCommittedCount > 0 && (
                <p className="text-[10px] text-slate-500 mt-0.5">{hireInCommittedCount} order{hireInCommittedCount === 1 ? "" : "s"}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Total units</p><p className="text-2xl font-bold text-blue-600">{totalUnits}</p></CardContent></Card>
        )}
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">No stock free</p><p className="text-2xl font-bold text-amber-600">{lowStock}</p></CardContent></Card>
        {/* EQP-B: clickable tile drilldown to the hidden subset. */}
        <button
          type="button"
          onClick={() => setFilterAvailable("hidden")}
          className={`text-left rounded-lg border bg-white p-4 shadow-md transition-all hover:shadow ${
            filterAvailable === "hidden" ? "ring-2 ring-slate-300 border-slate-400" : "border-slate-200"
          }`}
        >
          <p className="text-xs text-slate-600 mb-1">Hidden from quotes</p>
          <p className="text-2xl font-bold text-slate-500">{offlineItems}</p>
          {offlineItems > 0 && (
            <p className="text-[10px] text-slate-500 mt-0.5">Tap to filter</p>
          )}
        </button>
      </div>

      {/* Phase 19 #3: service-due rollup banner. Renders only when
          something actually needs servicing so the page stays clean
          for tenants who don't track maintenance. */}
      {(overdueServiceCount > 0 || dueSoonServiceCount > 0) && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-700" />
          <span className="text-xs font-medium text-amber-900">Maintenance:</span>
          {overdueServiceCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 text-red-800 text-xs px-2 py-0.5">
              <span className="font-semibold">{overdueServiceCount}</span> overdue
            </span>
          )}
          {dueSoonServiceCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs px-2 py-0.5">
              <span className="font-semibold">{dueSoonServiceCount}</span> due within 7 days
            </span>
          )}
          <span className="text-[11px] text-amber-700 ml-auto">Open each row to log a service.</span>
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, description... (press /)"
            className="pl-9 pr-9"
          />
          {/* Phase 25 #7: clear-search affordance. */}
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {(["all", "available", "hidden"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterAvailable(k)}
              className={`px-3 py-1.5 rounded-md ${
                filterAvailable === k
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {k === "all" ? "All" : k === "available" ? "In catalog" : "Hidden"}
            </button>
          ))}
        </div>
        <SortMenu
          activeKey={equipmentSort.sortKey}
          activeDir={equipmentSort.sortDir}
          onPick={equipmentSort.setSort}
          options={[
            { key: "name",     dir: "asc",  label: "Name (A to Z)" },
            { key: "name",     dir: "desc", label: "Name (Z to A)" },
            { key: "category", dir: "asc",  label: "Category (A to Z)" },
            { key: "rate",     dir: "desc", label: "Rate (high to low)" },
            { key: "rate",     dir: "asc",  label: "Rate (low to high)" },
            { key: "free",     dir: "desc", label: "Most free units" },
            { key: "free",     dir: "asc",  label: "Fewest free units" },
            { key: "qty",      dir: "desc", label: "Largest catalog qty" },
          ]}
        />
      </div>

      {loading ? (
        <Card className="border-0 shadow-md"><CardContent className="p-12 text-center text-slate-500">Loading...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-12 text-center">
            <Package className="w-14 h-14 mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No equipment yet</h3>
            <p className="text-sm text-slate-600 mb-4">Add the items you typically hire out so they show up automatically when you build a quote.</p>
            <Button
              onClick={() =>
                setEditing({
                  id: "",
                  company_id: companyId,
                  name: "",
                  category: "",
                  description: "",
                  rental_price: 0,
                  quantity: 0,
                  available_quantity: 0,
                  condition: "good",
                  is_available: true,
                })
              }
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</h2>
                <span className="text-xs text-slate-400">{items.length} item{items.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-2">
                {items.map((r) => {
                  const offline = r.is_available === false;
                  const noFree = safeNum(r.available_quantity) === 0 && safeNum(r.quantity) > 0;
                  // Phase 6 #8: surface service-due state inline.
                  // The Phase 4 #6 cron broadcasts daily but the
                  // catalog list itself never showed which kit was
                  // due / overdue; an operator scanning the page
                  // has to mentally cross-reference notifications.
                  // Now: a coloured badge per row when next_service_
                  // due is within 7 days (amber 'due') or in the
                  // past (red 'overdue').
                  const nextDue = r.next_service_due
                    ? new Date(r.next_service_due as string).getTime()
                    : null;
                  const now = Date.now();
                  const sevenDays = 7 * 86400_000;
                  const isOverdue = !!nextDue && nextDue < now;
                  const isDueSoon = !!nextDue && !isOverdue && nextDue - now <= sevenDays;
                  return (
                    <Card key={r.id} className={`border-0 shadow-md ${offline ? "opacity-60" : ""}`}>
                      <CardContent className="p-4 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900">{r.name || "(unnamed)"}</span>
                            {offline ? (
                              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">hidden</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">in catalog</Badge>
                            )}
                            {noFree && (
                              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> none free
                              </Badge>
                            )}
                            {isOverdue && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-red-50 text-red-700 border-red-300"
                                title={`Service was due ${new Date(r.next_service_due as string).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`}
                              >
                                Service overdue
                              </Badge>
                            )}
                            {isDueSoon && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-700 border-amber-300"
                                title={`Service due ${new Date(r.next_service_due as string).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`}
                              >
                                Service due
                              </Badge>
                            )}
                            {r.condition && r.condition !== "good" && (
                              <Badge variant="outline" className="text-[10px]">{r.condition}</Badge>
                            )}
                            {/* Wave 70.24 - cleaning chip so admin can
                                spot at-a-glance which items hit the
                                cleaning queue on return. */}
                            {r.requires_cleaning === false ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-50 text-slate-500 border-slate-200"
                                title="Does not go to cleaning team on return (disposable / non-cleanable)"
                              >
                                no cleaning
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-cyan-50 text-cyan-700 border-cyan-200"
                                title={r.dishwasher_safe ? "Dishwasher-safe - defaults to dishwasher method" : "Hand-wash item - defaults to manual method"}
                              >
                                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                                {r.dishwasher_safe ? "dishwasher" : "hand-wash"}
                              </Badge>
                            )}
                            {r.is_hire_in === true && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                                title={r.supplier_cleans ? "Hire-in; supplier handles cleaning" : "Hire-in equipment"}
                              >
                                hire-in{r.supplier_cleans ? " - supplier cleans" : ""}
                              </Badge>
                            )}
                            {/* EQP-B: utilisation chip (90d). High = booked
                                on >60% of upcoming events. Dead = 0 bookings. */}
                            {(() => {
                              const util = utilByItem.get(r.id);
                              if (!util || util.totalEvents === 0) return null;
                              if (util.bookedEvents === 0) {
                                return (
                                  <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200" title="Zero bookings in the last 90 days. Consider archiving or repurposing.">
                                    Dead 90d
                                  </Badge>
                                );
                              }
                              if (util.pct >= 0.6) {
                                return (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200" title={`Booked on ${util.bookedEvents} of ${util.totalEvents} events in the last 90 days. Consider buying more stock.`}>
                                    High-util ({util.bookedEvents}/{util.totalEvents})
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                            {/* EQP-B: damages chip (90d). Cost masked from
                                non-finance roles per the Skylight rule. */}
                            {(() => {
                              const dmg = damagesByItem.get(r.id);
                              if (!dmg || dmg.count === 0) return null;
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-rose-50 text-rose-700 border-rose-200"
                                  title={canSeeFinance
                                    ? `${dmg.count} damage${dmg.count === 1 ? "" : "s"} logged in last 90 days, total R ${dmg.totalCost.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
                                    : `${dmg.count} damage${dmg.count === 1 ? "" : "s"} logged in last 90 days`}
                                >
                                  {dmg.count} damages 90d
                                </Badge>
                              );
                            })()}
                            {/* EQP-B: buy-vs-rent recommendation chip. */}
                            {(() => {
                              if (!canSeeFinance) return null;
                              const spend = hireSpendByItem.get(r.id);
                              if (!spend) return null;
                              const rec = buyVsRentRecommendation(spend.totalSpend, spend.hireCount, r.replacement_cost as number | null);
                              if (!rec.recommend) return null;
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-amber-50 text-amber-800 border-amber-300"
                                  title={`Hired in ${spend.hireCount}x in last 90d for R ${spend.totalSpend.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}. Replacement cost R ${(r.replacement_cost as number).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}. You've spent ${rec.multiplier?.toFixed(1)}x what you'd pay to buy.`}
                                >
                                  Consider buying
                                </Badge>
                              );
                            })()}
                            {/* EQP-B: material-conflict warning. Catches
                                "Bowl (porcelain)" + "Plastic pudding bowl"
                                style data entry errors. */}
                            {(() => {
                              const conflict = detectMaterialConflict(r.name, r.description);
                              if (!conflict) return null;
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-rose-50 text-rose-700 border-rose-200"
                                  title={`Name says "${conflict.nameMaterial}" but description says "${conflict.descMaterial}". Looks like a data-entry mix-up - review the row.`}
                                >
                                  Material mismatch
                                </Badge>
                              );
                            })()}
                          </div>
                          {r.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{r.description}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{safeNum(r.available_quantity)} / {safeNum(r.quantity)} free</div>
                          <div className="text-base font-semibold text-blue-700 mt-0.5">{fmtR(safeNum(r.rental_price))}</div>
                          {/* EQP-B: hire-in cost gated to finance role. */}
                          {canSeeFinance && safeNum(r.hire_in_cost) > 0 && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              hire-in {fmtR(safeNum(r.hire_in_cost))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* EQP-B: per-row icon aria-labels. */}
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`View upcoming bookings for ${r.name}`} title="View upcoming bookings" onClick={() => setReservationsFor(r)}>
                            <CalendarIcon className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={offline ? `Show ${r.name} in quote builder` : `Hide ${r.name} from quote builder`} title={offline ? "Show in quote builder" : "Hide from quote builder"} onClick={() => toggleAvailable(r)}>
                            {offline ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${r.name}`} title={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Delete ${r.name}`} title={`Delete ${r.name}`} onClick={() => setDeletingId(r.id)}>
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / add dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {/* max-h + overflow keeps the dialog inside the viewport on
            short laptop screens. The previous max-w-xl alone let the
            tall form (cleaning + hire-in + maintenance sections)
            push past the bottom edge and clip the Save / Cancel
            controls. */}
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id && rows.some((r) => r.id === editing.id) ? "Edit equipment" : "Add equipment"}</DialogTitle>
            <DialogDescription>
              These details appear in the quote builder, kitchen pack list and driver load list.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Name *</Label>
                <Input
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Chafing dish (rectangular, 4L)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Input
                    value={editing.category || ""}
                    list="cat-suggest"
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      // Wave 70.24 - when the category changes,
                      // apply the cleaning defaults for the new
                      // category UNLESS the operator already
                      // explicitly set them (existing edit). Only
                      // applied when the cleaning fields are still
                      // at their default-null state, so we don't
                      // clobber tenant choices.
                      const defaults = CLEANING_DEFAULTS_BY_CATEGORY[newCategory.toLowerCase()];
                      const cleaningFieldsUntouched =
                        editing.cleaning_time_manual_minutes == null &&
                        editing.cleaning_time_dishwasher_minutes == null;
                      const next: any = { ...editing, category: newCategory };
                      if (defaults && cleaningFieldsUntouched) {
                        next.requires_cleaning = defaults.requires_cleaning;
                        next.dishwasher_safe = defaults.dishwasher_safe;
                        next.cleaning_time_manual_minutes = defaults.cleaning_time_manual_minutes;
                        next.cleaning_time_dishwasher_minutes = defaults.cleaning_time_dishwasher_minutes;
                      }
                      setEditing(next);
                    }}
                    placeholder="e.g. chafing, tables, lighting"
                  />
                  <datalist id="cat-suggest">
                    {SUGGESTED_CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">Rental price client pays (R) {pricingMode.label}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.rental_price ?? 0}
                    onChange={(e) => setEditing({ ...editing, rental_price: safeNum(e.target.value) })}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    What you charge per booking.
                    {Number(editing.rental_price) > 0 && (
                      <>
                        {" "}{pricingMode.mode === "inc"
                          ? `= R${toExVat(Number(editing.rental_price), 0.15).toFixed(2)} ex VAT`
                          : `= R${toIncVat(Number(editing.rental_price), 0.15).toFixed(2)} inc VAT`}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-xs">Hire-in cost to you (R, per unit)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.hire_in_cost ?? 0}
                  onChange={(e) => setEditing({ ...editing, hire_in_cost: safeNum(e.target.value) })}
                  placeholder="What you pay if you have to hire-in extras"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  When the quote builder sees you've committed more units than you own on a given date,
                  it surfaces (shortfall x this cost) as a margin signal so you don't quote at a loss.
                </p>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  rows={2}
                  value={editing.description || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Optional, pack notes, dimensions, where it's stored..."
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Total quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.quantity ?? 0}
                    onChange={(e) => {
                      const q = safeNum(e.target.value);
                      setEditing({
                        ...editing,
                        quantity: q,
                        available_quantity: Math.min(safeNum(editing.available_quantity ?? q), q),
                      });
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Available now</Label>
                  <Input
                    type="number"
                    min={0}
                    max={safeNum(editing.quantity)}
                    value={editing.available_quantity ?? 0}
                    onChange={(e) => setEditing({ ...editing, available_quantity: safeNum(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Condition</Label>
                  <select
                    value={editing.condition || "good"}
                    onChange={(e) => setEditing({ ...editing, condition: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                  >
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                    <option value="repair">Out for repair</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Replacement cost (R, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.replacement_cost ?? ""}
                    onChange={(e) => setEditing({ ...editing, replacement_cost: e.target.value === "" ? null : safeNum(e.target.value) })}
                    placeholder="So damages settle correctly"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={editing.is_available !== false}
                      onCheckedChange={(c) => setEditing({ ...editing, is_available: c })}
                    />
                    Show in quote builder
                  </label>
                </div>
              </div>

              {/* Wave 70.24 - per-equipment cleaning flags. Drives
                  whether the cleaning queue picks up this item when
                  it comes back from an event. Defaults pre-applied
                  by category (cutlery / glassware = dishwasher-safe,
                  tables / chairs = no cleaning), tenant edits per
                  item. */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-600" />
                    Cleaning
                  </p>
                  <p className="text-xs text-slate-500">
                    Drives the cleaning queue. When an order delivers, items marked here generate a cleaning job for the cleaning team.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2 text-sm border border-slate-200 rounded-md px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <Switch
                      checked={editing.requires_cleaning !== false}
                      onCheckedChange={(c) => setEditing({ ...editing, requires_cleaning: c })}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-medium">Needs cleaning</div>
                      <div className="text-[11px] text-slate-500">Off for disposables, signage, gas burners and the like.</div>
                    </div>
                  </label>
                  {editing.requires_cleaning !== false && (
                    <label className="flex items-start gap-2 text-sm border border-slate-200 rounded-md px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <Switch
                        checked={editing.dishwasher_safe === true}
                        onCheckedChange={(c) => setEditing({ ...editing, dishwasher_safe: c })}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="font-medium">Dishwasher safe</div>
                        <div className="text-[11px] text-slate-500">Cleaning jobs default to dishwasher method.</div>
                      </div>
                    </label>
                  )}
                </div>
                {editing.requires_cleaning !== false && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Manual wash time per piece (min, optional)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        value={editing.cleaning_time_manual_minutes ?? ""}
                        onChange={(e) => setEditing({
                          ...editing,
                          cleaning_time_manual_minutes: e.target.value === "" ? null : safeNum(e.target.value),
                        })}
                        placeholder="e.g. 1.5"
                      />
                    </div>
                    {editing.dishwasher_safe === true && (
                      <div>
                        <Label className="text-xs">Dishwasher time per piece (min, optional)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={editing.cleaning_time_dishwasher_minutes ?? ""}
                          onChange={(e) => setEditing({
                            ...editing,
                            cleaning_time_dishwasher_minutes: e.target.value === "" ? null : safeNum(e.target.value),
                          })}
                          placeholder="e.g. 0.5"
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2 text-sm border border-slate-200 rounded-md px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <Switch
                      checked={editing.is_hire_in === true}
                      onCheckedChange={(c) => setEditing({ ...editing, is_hire_in: c })}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-medium">Hire-in from supplier</div>
                      <div className="text-[11px] text-slate-500">Equipment rented in (vs your own stock).</div>
                    </div>
                  </label>
                  {editing.is_hire_in === true && (
                    <label className="flex items-start gap-2 text-sm border border-slate-200 rounded-md px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <Switch
                        checked={editing.supplier_cleans === true}
                        onCheckedChange={(c) => setEditing({ ...editing, supplier_cleans: c })}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="font-medium">Supplier handles cleaning</div>
                        <div className="text-[11px] text-slate-500">Skip the cleaning queue; supplier cleans on return.</div>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Phase 5 #1: maintenance schedule + log entry. Only
                  show on edit (existing rows) since you can't log
                  service for an item that doesn't exist yet. */}
              {editing.id && rows.some((r) => r.id === editing.id) && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Maintenance schedule</p>
                      <p className="text-xs text-slate-500">
                        Drives the daily 'service due' notifications to admin.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLoggingServiceFor(editing)}
                    >
                      Log a service
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Service interval (days)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editing.service_interval_days ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            service_interval_days:
                              e.target.value === "" ? null : safeNum(e.target.value),
                          })
                        }
                        placeholder="e.g. 90 for gas burners"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Empty = no recurring schedule. The next_service_due field auto-fills when a service is logged.
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Next service due (manual)</Label>
                      <Input
                        type="date"
                        value={editing.next_service_due || ""}
                        onChange={(e) =>
                          setEditing({ ...editing, next_service_due: e.target.value || null })
                        }
                      />
                      {editing.last_serviced_at && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Last serviced{" "}
                          {new Date(editing.last_serviced_at).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 5 #1: log a service event. Inserts into
          equipment_maintenance_log; the AFTER INSERT trigger rolls
          last_serviced_at + next_service_due onto the equipment row. */}
      <Dialog
        open={!!loggingServiceFor}
        onOpenChange={(o) => {
          if (!o) {
            setLoggingServiceFor(null);
            setLogServiceType("routine");
            setLogServiceNotes("");
            setLogServiceCost("");
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log a service</DialogTitle>
            <DialogDescription>
              {loggingServiceFor?.name
                ? `Record a service event for ${loggingServiceFor.name}. Stamps last_serviced_at and rolls next_service_due forward by the schedule.`
                : "Record a service event."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Service type</Label>
              <select
                value={logServiceType}
                onChange={(e) => setLogServiceType(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
              >
                <option value="routine">Routine</option>
                <option value="repair">Repair</option>
                <option value="deep_clean">Deep clean</option>
                <option value="inspection">Inspection / certification</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Cost (R, optional)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={logServiceCost}
                onChange={(e) => setLogServiceCost(e.target.value)}
                placeholder="What you paid the technician"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={3}
                value={logServiceNotes}
                onChange={(e) => setLogServiceNotes(e.target.value)}
                placeholder="Replaced burner igniter, parts on file..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setLoggingServiceFor(null)}
              disabled={logServiceSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!loggingServiceFor || !companyId) return;
                setLogServiceSaving(true);
                try {
                  const { supabase } = await import("@/integrations/supabase/client");
                  const { error } = await (supabase as any)
                    .from("equipment_maintenance_log")
                    .insert({
                      company_id: companyId,
                      equipment_id: loggingServiceFor.id,
                      serviced_at: new Date().toISOString(),
                      service_type: logServiceType,
                      notes: logServiceNotes.trim() || null,
                      cost: logServiceCost ? Number(logServiceCost) : null,
                    });
                  if (error) throw error;
                  toast({
                    title: "Service logged",
                    description: "next_service_due rolled forward by the schedule.",
                  });
                  setLoggingServiceFor(null);
                  setLogServiceType("routine");
                  setLogServiceNotes("");
                  setLogServiceCost("");
                  loadRows();
                } catch (e: any) {
                  toast({
                    title: "Could not log service",
                    description: e?.message || "Try again",
                    variant: "destructive",
                  });
                } finally {
                  setLogServiceSaving(false);
                }
              }}
              disabled={logServiceSaving}
            >
              {logServiceSaving ? "Logging..." : "Log service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove equipment from your catalog?</AlertDialogTitle>
            <AlertDialogDescription>
              The item won't show up in the quote builder anymore. Existing quotes that already
              reference it stay untouched. If you just want to hide it temporarily, use the
              "in catalog / hidden" toggle instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 text-white hover:bg-rose-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ComposeDrawerHost
        open={!!reservationsFor}
        onClose={() => { setReservationsFor(null); setReservations([]); }}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            {reservationsFor?.name || "Equipment"}
          </SheetTitle>
          <SheetDescription>
            Upcoming bookings against this item over the next 90 days.
            Cancelled and completed orders are excluded.
          </SheetDescription>
        </SheetHeader>

        {reservationsFor && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                <strong className="text-slate-900">{safeNum(reservationsFor.quantity)}</strong> owned
              </span>
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                <strong>{reservations.reduce((s, r) => s + r.quantity, 0)}</strong> committed across {reservations.length} booking{reservations.length === 1 ? "" : "s"}
              </span>
              {reservations.some((r) => r.from_hire_qty > 0) && (
                <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-orange-800">
                  {reservations.reduce((s, r) => s + r.from_hire_qty, 0)} units hire-in across the period
                </span>
              )}
            </div>

            {reservationsLoading ? (
              <div className="py-12 text-center text-sm text-slate-500">Loading bookings...</div>
            ) : reservations.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Nothing on the calendar for this item.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {reservations.map((r) => {
                  const d = new Date(r.event_date);
                  const dayLabel = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                  return (
                    <li key={`${r.order_id}_${r.event_date}`} className="px-3 py-2.5 flex flex-wrap items-center gap-2">
                      <div className="text-xs text-slate-500 w-32 flex-shrink-0">{dayLabel}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {r.client_name || "Order"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                          <span className="capitalize">{r.status.replace(/_/g, " ")}</span>
                          {r.from_stock_qty > 0 && (
                            <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5">
                              {r.from_stock_qty} owned
                            </span>
                          )}
                          {r.from_hire_qty > 0 && (
                            <span className="rounded bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5">
                              {r.from_hire_qty} hire-in
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-sm font-bold text-slate-900">x {r.quantity}</span>
                        <Link
                          href={`${slugPrefix}${staffOrderHref(r.order_id, "admin")}`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                          title="Open order"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </ComposeDrawerHost>
    </>
  );
}

// ── Availability tab ────────────────────────────────────────────────

interface AvailabilityRow {
  id: string;
  name: string;
  category: string;
  owned: number;
  reserved: number;
  available: number;
  loading: boolean;
}

function AvailabilityTab({ companyId }: { companyId: string | null }) {
  const { toast } = useToast();
  const [date, setDate] = useState<string>(() => toLocalISO(new Date()));
  const [items, setItems] = useState<EquipmentRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AvailabilityRow[]>([]);
  const [computing, setComputing] = useState(false);

  // Fetch the catalog once.
  useEffect(() => {
    if (!companyId) { setLoadingItems(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingItems(true);
      try {
        const data = await equipmentManagementService.getAllEquipment(companyId);
        if (!cancelled) setItems((data as any) || []);
      } catch (e: any) {
        if (!cancelled) toast({ title: "Could not load equipment", description: e?.message ?? "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, toast]);

  // Recompute availability whenever the date or catalog changes.
  useEffect(() => {
    if (!companyId || items.length === 0 || !date) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setComputing(true);
      try {
        // Seed pending rows so the table fills in progressively rather
        // than blocking on the slowest call.
        if (!cancelled) {
          setResults(items.map((it) => ({
            id: it.id,
            name: it.name || "(unnamed)",
            category: it.category || "Uncategorised",
            owned: safeNum(it.quantity),
            reserved: 0,
            available: safeNum(it.quantity),
            loading: true,
          })));
        }
        const rows = await Promise.all(items.map(async (it) => {
          try {
            const a = await getEquipmentAvailability(companyId, it.id, date, { windowDays: 0 });
            return {
              id: it.id,
              name: it.name || "(unnamed)",
              category: it.category || "Uncategorised",
              owned: a.owned,
              reserved: a.reserved,
              available: a.available,
              loading: false,
            } as AvailabilityRow;
          } catch {
            return {
              id: it.id,
              name: it.name || "(unnamed)",
              category: it.category || "Uncategorised",
              owned: safeNum(it.quantity),
              reserved: 0,
              available: safeNum(it.quantity),
              loading: false,
            } as AvailabilityRow;
          }
        }));
        if (!cancelled) setResults(rows);
      } finally {
        if (!cancelled) setComputing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, items, date]);

  const filteredResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return results;
    return results.filter((r) =>
      r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q),
    );
  }, [results, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, AvailabilityRow[]>();
    for (const r of filteredResults) {
      const k = r.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredResults]);

  const friendlyDate = useMemo(() => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, [date]);

  return (
    <>
      <Card className="border-0 shadow-md mb-5">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Pick a date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Filter items</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or category..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 inline-flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              {friendlyDate}
            </div>
          </div>
        </CardContent>
      </Card>

      {loadingItems ? (
        <Card className="border-0 shadow-md"><CardContent className="p-12 text-center text-slate-500">
          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
          Loading catalog...
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-12 text-center">
            <Package className="w-14 h-14 mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Nothing in the catalog yet</h3>
            <p className="text-sm text-slate-600">Add items in the Catalog tab first, then come back to check availability.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, rows]) => (
            <div key={cat}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</h2>
                <span className="text-xs text-slate-400">{rows.length} item{rows.length === 1 ? "" : "s"}</span>
              </div>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                          <th className="px-4 py-2.5 font-medium">Item</th>
                          <th className="px-3 py-2.5 font-medium text-right">Owned</th>
                          <th className="px-3 py-2.5 font-medium text-right">Committed</th>
                          <th className="px-3 py-2.5 font-medium text-right">Free on date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const tight = !r.loading && r.available === 0 && r.owned > 0;
                          const over  = !r.loading && r.reserved > r.owned;
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-2.5">
                                <div className="font-medium text-slate-900">{r.name}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{r.owned}</td>
                              <td className={`px-3 py-2.5 text-right tabular-nums ${over ? "text-rose-700 font-semibold" : "text-slate-700"}`}>
                                {r.loading ? <Loader2 className="w-3.5 h-3.5 inline animate-spin text-slate-400" /> : r.reserved}
                              </td>
                              <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                                tight ? "text-amber-700" : over ? "text-rose-700" : "text-emerald-700"
                              }`}>
                                {r.loading ? <Loader2 className="w-3.5 h-3.5 inline animate-spin text-slate-400" /> : r.available}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
          {!computing && filteredResults.length === 0 && (
            <Card className="border-0 shadow-sm"><CardContent className="p-8 text-center text-sm text-slate-500">
              No items match the filter.
            </CardContent></Card>
          )}
        </div>
      )}
    </>
  );
}
