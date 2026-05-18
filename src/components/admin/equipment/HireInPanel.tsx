/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HireInPanel - procurement checklist for the auto-generated
 * equipment_hire_orders rows.
 *
 * Extracted from /admin/equipment/hire-orders so the same surface
 * works inside the Equipment hub's "Hire-in" tab AND remains the
 * standalone page used by deep-links.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Package, Calendar as CalendarIcon, Truck, CheckCircle2,
  AlertTriangle, Search, Edit, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";

interface HireOrder {
  id: string;
  company_id: string;
  order_id: string | null;
  quote_id: string | null;
  equipment_id: string | null;
  equipment_name: string | null;
  category: string | null;
  quantity: number;
  hire_in_cost_per_unit: number;
  total_cost: number;
  supplier_name: string | null;
  supplier_contact: string | null;
  supplier_notes: string | null;
  status: "draft" | "confirmed" | "picked_up" | "returned" | "cancelled";
  expected_pickup_date: string | null;
  actual_pickup_date: string | null;
  expected_return_date: string | null;
  actual_return_date: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<HireOrder["status"], { label: string; tone: string }> = {
  draft:     { label: "Draft",     tone: "bg-slate-100 text-slate-700 border-slate-200" },
  confirmed: { label: "Confirmed", tone: "bg-blue-100 text-blue-700 border-blue-200" },
  picked_up: { label: "Picked up", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  returned:  { label: "Returned",  tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", tone: "bg-rose-100 text-rose-700 border-rose-200" },
};

const fmtR = (v: number) =>
  `R ${(Number.isFinite(v) ? v : 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HireInPanel() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const router = useRouter();
  const companyId = (user?.user_metadata?.company_id as string | undefined) || (user?.company_id as string | undefined) || null;

  const [rows, setRows] = useState<HireOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HireOrder["status"] | "all">("all");
  // Wave 66.6 - order-scoped filter. When the URL carries ?orderId=X
  // (the timeline's equipment_hire_booked / hire_collected deeplinks
  // route here now), filter the list to that order's hire rows and
  // surface a "Filtered to ORD-XXX" chip with a clear button. Without
  // this the operator clicked the timeline dot and landed on every
  // hire order across every order in the company.
  const [orderIdFilter, setOrderIdFilter] = useState<string | null>(null);
  const [orderNumberFilter, setOrderNumberFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.orderId === "string" ? router.query.orderId : null;
    setOrderIdFilter(q);
  }, [router.isReady, router.query.orderId]);

  // Resolve the order number for the chip label so the operator sees
  // ORD-003828 (their mental model) instead of the uuid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderIdFilter) { setOrderNumberFilter(null); return; }
      const { data } = await (supabase as any)
        .from("orders")
        .select("order_number")
        .eq("id", orderIdFilter)
        .maybeSingle();
      if (!cancelled) setOrderNumberFilter((data as any)?.order_number || orderIdFilter.slice(0, 8));
    })();
    return () => { cancelled = true; };
  }, [orderIdFilter]);

  const clearOrderFilter = () => {
    setOrderIdFilter(null);
    const { orderId: _drop, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true, scroll: false },
    );
  };

  const [editing, setEditing] = useState<HireOrder | null>(null);
  const [saving, setSaving] = useState(false);

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  const load = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Cast to any - equipment_hire_orders not yet in generated types.
      const { data, error } = await (supabase as any)
        .from("equipment_hire_orders")
        .select("*")
        .eq("company_id", companyId)
        .order("expected_pickup_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      setRows((data || []) as HireOrder[]);
    } catch (e: any) {
      toast({ title: "Could not load hire orders", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      // Wave 66.6 - order-scoped filter takes precedence.
      if (orderIdFilter && r.order_id !== orderIdFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.equipment_name || "").toLowerCase().includes(q) ||
        (r.supplier_name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, orderIdFilter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, draft: 0, confirmed: 0, picked_up: 0, returned: 0, cancelled: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const totalCommitted = useMemo(() =>
    rows.filter((r) => r.status !== "cancelled" && r.status !== "returned")
        .reduce((s, r) => s + Number(r.total_cost || 0), 0),
    [rows],
  );

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("equipment_hire_orders")
        .update({
          supplier_name: editing.supplier_name?.trim() || null,
          supplier_contact: editing.supplier_contact?.trim() || null,
          supplier_notes: editing.supplier_notes?.trim() || null,
          expected_pickup_date: editing.expected_pickup_date || null,
          actual_pickup_date: editing.actual_pickup_date || null,
          expected_return_date: editing.expected_return_date || null,
          actual_return_date: editing.actual_return_date || null,
          status: editing.status,
          quantity: editing.quantity,
          hire_in_cost_per_unit: editing.hire_in_cost_per_unit,
          total_cost: editing.quantity * editing.hire_in_cost_per_unit,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast({ title: "Hire order updated" });
      setEditing(null);
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const transitionStatus = async (r: HireOrder, next: HireOrder["status"]) => {
    try {
      const patch: any = { status: next };
      if (next === "picked_up" && !r.actual_pickup_date) patch.actual_pickup_date = toLocalISO(new Date());
      if (next === "returned" && !r.actual_return_date) patch.actual_return_date = toLocalISO(new Date());
      const { error } = await (supabase as any).from("equipment_hire_orders").update(patch).eq("id", r.id);
      if (error) throw error;
      toast({ title: `Marked ${STATUS_META[next].label.toLowerCase()}` });
      load();
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message ?? "", variant: "destructive" });
    }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">All orders</p><p className="text-2xl font-bold text-slate-900">{counts.all}</p></CardContent></Card>
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Draft</p><p className="text-2xl font-bold text-slate-700">{counts.draft}</p></CardContent></Card>
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">In hand (confirmed + picked up)</p><p className="text-2xl font-bold text-amber-600">{(counts.confirmed || 0) + (counts.picked_up || 0)}</p></CardContent></Card>
        <Card className="border-0 shadow-md"><CardContent className="p-4"><p className="text-xs text-slate-600 mb-1">Open spend committed</p><p className="text-lg font-bold text-rose-700">{fmtR(totalCommitted)}</p></CardContent></Card>
      </div>

      {/* Wave 66.6 - order-scoped filter chip. Surfaces when the
          URL carries ?orderId=X so the operator clicking from the
          order timeline lands on a focused view, not the full list. */}
      {orderIdFilter && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span className="font-medium">Filtered to</span>
          <Link
            href={`${slugPrefix}/admin/orders?orderId=${orderIdFilter}`}
            className="font-semibold hover:underline inline-flex items-center gap-1"
          >
            {orderNumberFilter || "this order"}
            <ExternalLink className="w-3 h-3" />
          </Link>
          <span className="text-blue-700">
            {filtered.length} hire row{filtered.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={clearOrderFilter}
            className="ml-auto text-xs text-blue-700 hover:text-blue-900 underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item, supplier, category..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {(["all", "draft", "confirmed", "picked_up", "returned", "cancelled"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatusFilter(k)}
              className={`px-2.5 py-1.5 rounded-md ${
                statusFilter === k
                  ? "bg-amber-100 text-amber-800 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {k === "all" ? "All" : STATUS_META[k as HireOrder["status"]].label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <Card className="border-0 shadow-md"><CardContent className="p-12 text-center text-slate-500">Loading...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-12 text-center">
            <Truck className="w-14 h-14 mx-auto text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No hire-in orders yet</h3>
            <p className="text-sm text-slate-600">
              When a quote flips to "accepted" with from-hire equipment,
              one of these gets generated for each line. They'll show up here
              as drafts for you to assign a supplier.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-md"><CardContent className="p-8 text-center text-slate-500">No matches in this view.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const meta = STATUS_META[r.status];
            const overdue = r.expected_pickup_date && new Date(r.expected_pickup_date) < new Date() && r.status === "draft";
            return (
              <Card key={r.id} className={`border-0 shadow-md ${overdue ? "ring-2 ring-rose-200" : ""}`}>
                <CardContent className="p-4 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Package className="w-4 h-4 text-slate-400" />
                    <Badge className={`border ${meta.tone}`}>{meta.label}</Badge>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold text-slate-900">
                      {r.quantity} × {r.equipment_name || "(unnamed)"}
                      {r.category && <span className="ml-2 text-xs text-slate-400">{r.category}</span>}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {r.expected_pickup_date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {new Date(r.expected_pickup_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          {overdue && <AlertTriangle className="w-3 h-3 text-rose-600 ml-0.5" />}
                        </span>
                      )}
                      {r.supplier_name ? (
                        <span className="text-slate-700">via <strong>{r.supplier_name}</strong></span>
                      ) : (
                        <span className="text-amber-700 font-medium">Supplier not set</span>
                      )}
                      <span className="text-slate-400">·</span>
                      <span>{fmtR(r.total_cost)} ({fmtR(r.hire_in_cost_per_unit)} ea)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => transitionStatus(r, "confirmed")}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Confirm
                      </Button>
                    )}
                    {r.status === "confirmed" && (
                      <Button size="sm" variant="outline" onClick={() => transitionStatus(r, "picked_up")}>
                        <Truck className="w-3.5 h-3.5 mr-1.5" /> Picked up
                      </Button>
                    )}
                    {r.status === "picked_up" && (
                      <Button size="sm" variant="outline" onClick={() => transitionStatus(r, "returned")}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Returned
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit details" onClick={() => setEditing(r)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    {r.order_id && (
                      <Link
                        href={`${slugPrefix}/admin/orders?orderId=${r.order_id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        title="Open parent order"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit hire-in order</DialogTitle>
            <DialogDescription>
              Set the supplier, planned pickup + return dates, and adjust
              quantity / cost if your supplier quoted you something different.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div>
                <Label className="text-xs">Equipment</Label>
                <p className="text-sm font-medium text-slate-900">
                  {editing.quantity} × {editing.equipment_name}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.quantity || ""}
                    onChange={(e) => setEditing({ ...editing, quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Cost per unit (R)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.hire_in_cost_per_unit || ""}
                    onChange={(e) => setEditing({ ...editing, hire_in_cost_per_unit: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Supplier</Label>
                <Input
                  value={editing.supplier_name || ""}
                  onChange={(e) => setEditing({ ...editing, supplier_name: e.target.value })}
                  placeholder="e.g. Cape Hire Supplies"
                />
              </div>
              <div>
                <Label className="text-xs">Supplier contact</Label>
                <Input
                  value={editing.supplier_contact || ""}
                  onChange={(e) => setEditing({ ...editing, supplier_contact: e.target.value })}
                  placeholder="Phone, email, or contact name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Expected pickup</Label>
                  <Input type="date" value={editing.expected_pickup_date || ""} onChange={(e) => setEditing({ ...editing, expected_pickup_date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Actual pickup</Label>
                  <Input type="date" value={editing.actual_pickup_date || ""} onChange={(e) => setEditing({ ...editing, actual_pickup_date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Expected return</Label>
                  <Input type="date" value={editing.expected_return_date || ""} onChange={(e) => setEditing({ ...editing, expected_return_date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Actual return</Label>
                  <Input type="date" value={editing.actual_return_date || ""} onChange={(e) => setEditing({ ...editing, actual_return_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as HireOrder["status"] })}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={2}
                  value={editing.supplier_notes || ""}
                  onChange={(e) => setEditing({ ...editing, supplier_notes: e.target.value })}
                  placeholder="Pickup logistics, condition, special requests..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HireInPanel;
