/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/equipment -- equipment hub.
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
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
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
  Calendar as CalendarIcon, ExternalLink, Loader2,
} from "lucide-react";
import {
  listUpcomingReservations, getEquipmentAvailability,
  type EquipmentReservationRow,
} from "@/services/equipmentAvailabilityService";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import { equipmentManagementService } from "@/services/equipmentManagementService";
import { ShortagesPanel } from "@/components/admin/equipment/ShortagesPanel";
import { HireInPanel } from "@/components/admin/equipment/HireInPanel";

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
}

const SUGGESTED_CATEGORIES = [
  "chafing", "tables", "chairs", "linen", "crockery", "cutlery",
  "glassware", "lighting", "gas", "serving", "decor", "other",
];

const TABS = ["catalog", "availability", "shortages", "hire-in"] as const;
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
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
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
        <title>Equipment | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl shadow-lg">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Equipment
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Catering equipment catalogue. Availability per date, current bookings, shortages, and hire-in cover when you're running short for an event.
              </p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto h-auto">
              <TabsTrigger value="catalog" className="text-xs md:text-sm">Catalog</TabsTrigger>
              <TabsTrigger value="availability" className="text-xs md:text-sm">Availability</TabsTrigger>
              <TabsTrigger value="shortages" className="text-xs md:text-sm">Shortages</TabsTrigger>
              <TabsTrigger value="hire-in" className="text-xs md:text-sm">Hire-in orders</TabsTrigger>
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
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAvailable, setFilterAvailable] = useState<"all" | "available" | "hidden">("all");

  const [editing, setEditing] = useState<EquipmentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [reservationsFor, setReservationsFor] = useState<EquipmentRow | null>(null);
  const [reservations, setReservations] = useState<EquipmentReservationRow[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  const loadRows = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await equipmentManagementService.getAllEquipment(companyId);
      setRows((data as any) || []);
    } catch (e: any) {
      toast({ title: "Could not load equipment", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [companyId]);

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
      if (!q) return true;
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterAvailable]);

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
        image_url: editing.image_url || null,
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

  return (
    <>
      <div className="mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="text-sm text-slate-600">
          Chafing dishes, tables, chairs, hire add-ons. The catalog feeds the quote builder, kitchen pack list and driver load list.
        </div>
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
          className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add equipment
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Catalog items</p><p className="text-2xl font-bold text-slate-900">{totalItems}</p></CardContent></Card>
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Total units</p><p className="text-2xl font-bold text-blue-600">{totalUnits}</p></CardContent></Card>
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">No stock free</p><p className="text-2xl font-bold text-amber-600">{lowStock}</p></CardContent></Card>
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Hidden from quotes</p><p className="text-2xl font-bold text-slate-500">{offlineItems}</p></CardContent></Card>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, description..."
            className="pl-9"
          />
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
                            {r.condition && r.condition !== "good" && (
                              <Badge variant="outline" className="text-[10px]">{r.condition}</Badge>
                            )}
                          </div>
                          {r.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{r.description}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>{safeNum(r.available_quantity)} / {safeNum(r.quantity)} free</div>
                          <div className="text-base font-semibold text-blue-700 mt-0.5">{fmtR(safeNum(r.rental_price))}</div>
                          {safeNum(r.hire_in_cost) > 0 && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              hire-in {fmtR(safeNum(r.hire_in_cost))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View upcoming bookings" onClick={() => setReservationsFor(r)}>
                            <CalendarIcon className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title={offline ? "Show in quote builder" : "Hide from quote builder"} onClick={() => toggleAvailable(r)}>
                            {offline ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeletingId(r.id)}>
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
        <DialogContent className="max-w-xl">
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
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    placeholder="e.g. chafing, tables, lighting"
                  />
                  <datalist id="cat-suggest">
                    {SUGGESTED_CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">Rental price client pays (R)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.rental_price ?? 0}
                    onChange={(e) => setEditing({ ...editing, rental_price: safeNum(e.target.value) })}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">What you charge per booking.</p>
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
                          href={`${slugPrefix}/admin/orders?orderId=${r.order_id}`}
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
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
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
