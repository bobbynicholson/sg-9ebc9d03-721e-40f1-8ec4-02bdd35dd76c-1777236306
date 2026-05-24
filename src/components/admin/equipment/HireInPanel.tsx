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
  AlertTriangle, Search, Edit, ExternalLink, Download, Send,
  CheckSquare, Square, Phone,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { captureException } from "@/lib/observability";

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
  // HIR-B: supplier_id FK + payable_id link.
  supplier_id: string | null;
  payable_id: string | null;
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

interface SupplierOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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
  // HIR-B: independent overdue filter (pickup date passed + still draft).
  const [overdueOnly, setOverdueOnly] = useState(false);
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

  // HIR-B (hire-in deferred, 2026-05-24) ────────────────────────────
  // Suppliers list for the bulk-set + edit dialogs. Loaded once
  // alongside the hire-in rows.
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  // Multi-select for bulk operations (Set supplier, Confirm).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<null | "supplier" | "confirm">(null);
  const [bulkSupplierId, setBulkSupplierId] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Confirm dialogue (per-row 2-step). Step 1 confirms intent;
  // step 2 asks whether to email the supplier now.
  const [confirmDialog, setConfirmDialog] = useState<null | { row: HireOrder; sendEmail: boolean }>(null);
  // Finance visibility - hire-in cost is supplier pricing.
  const { profile } = useAuth() as { profile: { active_role?: string; role?: string } | null };
  const financeRole = String(profile?.active_role || profile?.role || "").toLowerCase();
  const canSeeFinance =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "admin" || financeRole === "super_admin";

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  const load = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [hireRes, supRes] = await Promise.all([
        supabase
          .from("equipment_hire_orders")
          .select("*")
          .eq("company_id", companyId)
          .order("expected_pickup_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("suppliers")
          .select("id, supplier_name, email, phone")
          .eq("company_id", companyId)
          .order("supplier_name", { ascending: true }),
      ]);
      if (hireRes.error) throw hireRes.error;
      setRows((hireRes.data || []) as unknown as HireOrder[]);
      setSuppliers(((supRes.data || []) as Array<{ id: string; supplier_name: string | null; email: string | null; phone: string | null }>)
        .map((s) => ({ id: s.id, name: s.supplier_name || "Unnamed", email: s.email, phone: s.phone })));
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "load", tenant: companyId || "" } });
      toast({
        title: "Could not load hire orders",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // HIR-B: realtime channel. Status flips elsewhere (timeline,
  // shopping page) refresh this tab automatically. Debounced 1500ms.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { load(); }, 1500);
    };
    const channel = supabase
      .channel(`hire-in:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_hire_orders", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return rows.filter((r) => {
      // Wave 66.6 - order-scoped filter takes precedence.
      if (orderIdFilter && r.order_id !== orderIdFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (overdueOnly) {
        const overdue = r.expected_pickup_date && new Date(r.expected_pickup_date) < today && r.status === "draft";
        if (!overdue) return false;
      }
      if (!q) return true;
      return (
        (r.equipment_name || "").toLowerCase().includes(q) ||
        (r.supplier_name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, orderIdFilter, overdueOnly]);

  const counts = useMemo(() => {
    const c = { all: rows.length, draft: 0, confirmed: 0, picked_up: 0, returned: 0, cancelled: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  // HIR-B audit fix: the old "Open spend committed" tile was lying -
  // it treated Drafts as commitments. Split into Draft (estimated) +
  // Committed (R) so finance sees the honest picture.
  const draftTotal = useMemo(() =>
    rows.filter((r) => r.status === "draft").reduce((s, r) => s + Number(r.total_cost || 0), 0),
    [rows],
  );
  const committedTotal = useMemo(() =>
    rows.filter((r) => r.status === "confirmed" || r.status === "picked_up")
        .reduce((s, r) => s + Number(r.total_cost || 0), 0),
    [rows],
  );
  const overdueCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return rows.filter((r) =>
      r.status === "draft" && r.expected_pickup_date && new Date(r.expected_pickup_date) < today,
    ).length;
  }, [rows]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      // HIR-B: supplier_id is now the source of truth; supplier_name
      // mirrors the linked supplier so legacy free-text reads still work.
      const linkedSupplier = suppliers.find((s) => s.id === editing.supplier_id);
      const { error } = await supabase
        .from("equipment_hire_orders")
        .update({
          supplier_id: editing.supplier_id || null,
          supplier_name: linkedSupplier?.name || editing.supplier_name?.trim() || null,
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
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "save", tenant: companyId || "" } });
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const transitionStatus = async (r: HireOrder, next: HireOrder["status"]) => {
    try {
      const patch: {
        status: HireOrder["status"];
        actual_pickup_date?: string;
        actual_return_date?: string;
      } = { status: next };
      if (next === "picked_up" && !r.actual_pickup_date) patch.actual_pickup_date = toLocalISO(new Date());
      if (next === "returned" && !r.actual_return_date) patch.actual_return_date = toLocalISO(new Date());
      const { error } = await supabase.from("equipment_hire_orders").update(patch).eq("id", r.id);
      if (error) throw error;
      // HIR-B: payable reconciliation. When the row hits picked_up
      // the money is owed for real - drop a supplier_payables row so
      // finance sees it. Idempotent: skip if a payable already
      // exists for this hire (payable_id set).
      if (next === "picked_up" && !r.payable_id && r.supplier_id && r.total_cost > 0) {
        await createPayableForHire(r);
      }
      toast({ title: `Marked ${STATUS_META[next].label.toLowerCase()}` });
      load();
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "transition", tenant: companyId || "" } });
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  };

  // HIR-B: create a supplier_payables row for a confirmed hire-in
  // so finance sees the upcoming bill. Stamps the payable_id back
  // on the hire-in row so we don't double-create. Best-effort - a
  // failure here doesn't block the status transition.
  const createPayableForHire = async (r: HireOrder) => {
    if (!companyId || !r.supplier_id || r.total_cost <= 0) return;
    try {
      const dueIso = r.expected_pickup_date || r.expected_return_date || toLocalISO(new Date());
      const { data: payable, error: payErr } = await supabase
        .from("supplier_payables")
        .insert({
          company_id: companyId,
          supplier_id: r.supplier_id,
          amount_cents: Math.round(Number(r.total_cost) * 100),
          due_date: dueIso,
          status: "unpaid",
          invoice_ref: `Hire ${r.id.slice(0, 8)}`,
          notes: `Auto-generated from equipment hire-in: ${r.quantity} x ${r.equipment_name || "equipment"}`,
        })
        .select("id")
        .single();
      if (payErr || !payable) throw payErr || new Error("Insert failed");
      await supabase
        .from("equipment_hire_orders")
        .update({ payable_id: payable.id })
        .eq("id", r.id);
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "create-payable", tenant: companyId } });
      // Don't toast - the transition succeeded, the payable side is
      // bookkeeping. Finance can record it manually if needed.
    }
  };

  // HIR-B: Confirm dialogue step 1 -> 2 (intent then email-now ask).
  // Per Bobby: "2-step open dialogue ... no action happens without
  // understanding". Step 1 prevents accidental confirms; step 2 gives
  // the operator the choice to queue the supplier email or to email
  // out-of-band (some suppliers prefer WhatsApp/phone).
  const openConfirmDialog = (r: HireOrder) => {
    if (!r.supplier_id && !r.supplier_name) {
      toast({
        title: "Set the supplier first",
        description: "A hire-in can't be confirmed without a supplier to chase.",
        variant: "destructive",
      });
      return;
    }
    if (r.hire_in_cost_per_unit <= 0) {
      toast({
        title: "Set the unit cost first",
        description: "The line total is R 0 - confirm a real cost so finance sees the correct payable.",
        variant: "destructive",
      });
      return;
    }
    setConfirmDialog({ row: r, sendEmail: true });
  };

  const runConfirm = async () => {
    if (!confirmDialog) return;
    const { row, sendEmail } = confirmDialog;
    setConfirmDialog(null);
    await transitionStatus(row, "confirmed");
    if (sendEmail) {
      await queueSupplierEmail(row);
    }
  };

  // HIR-B: queue a templated email to the supplier. Reuses the
  // existing outgoing_email_queue infrastructure that already powers
  // invoices and reminders - no new templates table. The worker
  // picks the row up on its next pass and delivers via the per-tenant
  // email provider.
  const queueSupplierEmail = async (r: HireOrder) => {
    if (!companyId) return;
    const supplierEmail = (suppliers.find((s) => s.id === r.supplier_id)?.email) || null;
    if (!supplierEmail) {
      toast({
        title: "Supplier has no email on file",
        description: "Confirmed without queuing email. Send out-of-band, or add the supplier's email on /admin/suppliers.",
        variant: "destructive",
      });
      return;
    }
    const subject = `Hire request: ${r.quantity}x ${r.equipment_name || "equipment"} for ${r.expected_pickup_date || "soon"}`;
    const body = [
      `Hello,`,
      ``,
      `Please confirm availability for the following hire-in order:`,
      ``,
      `  Item:         ${r.quantity} x ${r.equipment_name || "(unspecified)"}`,
      `  Pickup:       ${r.expected_pickup_date || "TBC"}`,
      `  Return:       ${r.expected_return_date || "TBC"}`,
      `  Total quoted: R ${Number(r.total_cost || 0).toFixed(2)}`,
      r.supplier_notes ? `  Notes:        ${r.supplier_notes}` : "",
      ``,
      `Reply to confirm and let us know your invoice reference.`,
      ``,
      `Thanks,`,
      `CateringMS`,
    ].filter(Boolean).join("\n");
    try {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("outgoing_email_queue")
        .insert({
          company_id: companyId,
          to_email: supplierEmail,
          subject,
          body_text: body,
          status: "queued",
          source_kind: "hire_in_supplier_request",
          source_id: r.id,
        });
      if (error) throw new Error(error.message);
      toast({ title: "Supplier email queued", description: `Will send to ${supplierEmail}.` });
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "queue-email", tenant: companyId } });
      toast({
        title: "Could not queue email",
        description: e instanceof Error ? e.message : "Send out-of-band.",
        variant: "destructive",
      });
    }
  };

  // HIR-B: bulk operations. The "9 rows, all supplier not set"
  // reality on the screenshot is the canonical use case - one click
  // to apply a supplier across the selected rows.
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const runBulkSetSupplier = async () => {
    if (!companyId || selectedIds.size === 0 || !bulkSupplierId) return;
    setBulkBusy(true);
    try {
      const sup = suppliers.find((s) => s.id === bulkSupplierId);
      const { error } = await supabase
        .from("equipment_hire_orders")
        .update({ supplier_id: bulkSupplierId, supplier_name: sup?.name || null })
        .in("id", Array.from(selectedIds));
      if (error) throw error;
      toast({
        title: `Supplier set on ${selectedIds.size} order${selectedIds.size === 1 ? "" : "s"}`,
        description: sup?.name || "",
      });
      clearSelection();
      setBulkDialog(null);
      await load();
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "bulk-supplier", tenant: companyId } });
      toast({ title: "Bulk set failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBulkBusy(false); }
  };

  const runBulkConfirm = async () => {
    if (!companyId || selectedIds.size === 0) return;
    // Filter to rows that can actually be confirmed: in draft + have
    // a supplier set. Skip the rest with a toast tally so the
    // operator knows what was bypassed.
    const targets = rows.filter((r) =>
      selectedIds.has(r.id) && r.status === "draft" && (r.supplier_id || r.supplier_name)
    );
    const skipped = selectedIds.size - targets.length;
    if (targets.length === 0) {
      toast({
        title: "Nothing to confirm",
        description: "Selected rows are either already confirmed or have no supplier set.",
        variant: "destructive",
      });
      return;
    }
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from("equipment_hire_orders")
        .update({ status: "confirmed" })
        .in("id", targets.map((t) => t.id));
      if (error) throw error;
      toast({
        title: `Confirmed ${targets.length} order${targets.length === 1 ? "" : "s"}`,
        description: skipped > 0 ? `${skipped} skipped (no supplier or wrong status).` : undefined,
      });
      clearSelection();
      setBulkDialog(null);
      await load();
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/equipment/hire-in", area: "bulk-confirm", tenant: companyId } });
      toast({ title: "Bulk confirm failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBulkBusy(false); }
  };

  // HIR-B: per-supplier rollup for the strip above the list. Groups
  // by supplier_name so the operator sees "Coastal Hire: 4 orders,
  // R X" and can phone them with the full list in hand.
  const supplierRollup = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      if (r.status === "cancelled" || r.status === "returned") continue;
      const key = r.supplier_name || "(no supplier)";
      const cur = map.get(key) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.total_cost || 0);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count);
  }, [rows]);

  // HIR-B: CSV export. UTF-8 BOM for Excel-ZA; the standard pattern
  // every other admin export uses.
  const exportCsv = () => {
    if (filtered.length === 0) {
      toast({ title: "Nothing to export", description: "Adjust filters until at least one row is visible." });
      return;
    }
    const headers = [
      "Status", "Quantity", "Equipment", "Category", "Supplier", "Supplier contact",
      "Expected pickup", "Expected return", "Actual pickup", "Actual return",
      "Unit cost", "Total cost", "Order ID", "Quote ID", "Notes",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        esc(r.status), esc(r.quantity), esc(r.equipment_name), esc(r.category),
        esc(r.supplier_name), esc(r.supplier_contact),
        esc(r.expected_pickup_date), esc(r.expected_return_date),
        esc(r.actual_pickup_date), esc(r.actual_return_date),
        esc(r.hire_in_cost_per_unit), esc(r.total_cost),
        esc(r.order_id), esc(r.quote_id), esc(r.supplier_notes),
      ].join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hire-in-orders_${toLocalISO(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // HIR-B: draft-age in days. Drives the "Draft for Nd" red chip.
  const daysSinceCreated = (r: HireOrder) =>
    Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000);

  return (
    <div>
      {/* Stats - HIR-B: five-tile split. Draft estimated vs Committed
          honest about which spend is locked in. Overdue tile is
          clickable as the "show me what's broken" pivot. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <p className="text-xs text-slate-600 mb-1">All orders</p>
            <p className="text-2xl font-bold text-slate-900">{counts.all}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <p className="text-xs text-slate-600 mb-1">Draft</p>
            <p className="text-2xl font-bold text-slate-700">{counts.draft}</p>
            {canSeeFinance && (
              <p className="text-[11px] text-slate-500 mt-0.5">est. {fmtR(draftTotal)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <p className="text-xs text-slate-600 mb-1">In hand (confirmed + picked up)</p>
            <p className="text-2xl font-bold text-amber-600">{(counts.confirmed || 0) + (counts.picked_up || 0)}</p>
            {canSeeFinance && (
              <p className="text-[11px] text-slate-500 mt-0.5">committed {fmtR(committedTotal)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <p className="text-xs text-slate-600 mb-1">Returned</p>
            <p className="text-2xl font-bold text-emerald-600">{counts.returned || 0}</p>
          </CardContent>
        </Card>
        <button
          type="button"
          onClick={() => { setOverdueOnly((v) => !v); setStatusFilter("all"); }}
          className="text-left"
        >
          <Card className={`border-0 shadow-md transition ${overdueOnly ? "ring-2 ring-rose-300" : ""} ${overdueCount > 0 ? "bg-rose-50" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-slate-600 mb-1">Overdue draft</p>
              <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-rose-700" : "text-slate-400"}`}>{overdueCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{overdueOnly ? "Filtering" : "Click to filter"}</p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* HIR-B: per-supplier rollup strip. The "phone Coastal Hire
          with the full list in hand" view. Only shows when there's
          more than one supplier in play. */}
      {supplierRollup.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {supplierRollup.map(([name, agg]) => (
            <div
              key={name}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
            >
              <span className={`font-medium ${name === "(no supplier)" ? "text-amber-700" : "text-slate-800"}`}>
                {name}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-600">{agg.count} order{agg.count === 1 ? "" : "s"}</span>
              {canSeeFinance && (
                <>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-700">{fmtR(agg.total)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

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
        <Button variant="outline" size="sm" onClick={exportCsv} title="Export filtered rows to CSV">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* HIR-B: bulk action bar. Appears when rows are selected.
          Sticky so it stays in view while scrolling a long list. */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm shadow-sm">
          <span className="font-medium text-amber-900">
            {selectedIds.size} selected
          </span>
          <span className="text-amber-700">·</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setBulkSupplierId(""); setBulkDialog("supplier"); }}
          >
            Set supplier
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkDialog("confirm")}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Confirm all
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs text-amber-700 hover:text-amber-900 underline"
          >
            Clear selection
          </button>
        </div>
      )}

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
            const selected = selectedIds.has(r.id);
            const age = daysSinceCreated(r);
            const showAging = r.status === "draft" && age >= 2;
            const supplierEmail = suppliers.find((s) => s.id === r.supplier_id)?.email;
            return (
              <Card key={r.id} className={`border-0 shadow-md ${overdue ? "ring-2 ring-rose-200" : ""} ${selected ? "ring-2 ring-amber-300" : ""}`}>
                <CardContent className="p-4 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleSelected(r.id)}
                    className="flex-shrink-0 text-slate-500 hover:text-amber-600"
                    title={selected ? "Deselect" : "Select for bulk action"}
                  >
                    {selected ? <CheckSquare className="w-4 h-4 text-amber-600" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Package className="w-4 h-4 text-slate-400" />
                    <Badge className={`border ${meta.tone}`}>{meta.label}</Badge>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                      <span>{r.quantity} × {r.equipment_name || "(unnamed)"}</span>
                      {r.category && <span className="text-xs text-slate-400 font-normal">{r.category}</span>}
                      {showAging && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 text-[10px] font-medium">
                          Draft for {age}d
                        </span>
                      )}
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
                      {supplierEmail && (
                        <span className="text-slate-400 inline-flex items-center gap-1" title={supplierEmail}>
                          <Phone className="w-3 h-3" />
                        </span>
                      )}
                      {canSeeFinance && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span>{fmtR(r.total_cost)} ({fmtR(r.hire_in_cost_per_unit)} ea)</span>
                        </>
                      )}
                      {r.payable_id && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px]">
                          Payable linked
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => openConfirmDialog(r)}>
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
                    {r.order_id ? (
                      <Link
                        href={`${slugPrefix}/admin/orders?orderId=${r.order_id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        title="Open parent order"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    ) : r.quote_id ? (
                      <Link
                        href={`${slugPrefix}/admin/quotes?quoteId=${r.quote_id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        title="Open source quote"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    ) : null}
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
                <select
                  value={editing.supplier_id || ""}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const sup = suppliers.find((s) => s.id === id);
                    setEditing({
                      ...editing,
                      supplier_id: id,
                      supplier_name: sup?.name || editing.supplier_name,
                    });
                  }}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                >
                  <option value="">- Not set -</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {!editing.supplier_id && editing.supplier_name && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Legacy free text: {editing.supplier_name}. Pick a supplier above to link it properly.
                  </p>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Don't see them? Add via <Link href={`${slugPrefix}/admin/suppliers`} className="underline">Suppliers</Link>.
                </p>
              </div>
              <div>
                <Label className="text-xs">Supplier contact (override)</Label>
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

      {/* HIR-B: 2-step confirm dialog. Per Bobby - no action without
          understanding. Step 1 shows what's being committed (supplier,
          cost, dates); step 2 asks whether to queue the email now. */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm hire-in with supplier?</DialogTitle>
            <DialogDescription>
              This commits the spend. A payable will be created when the item is picked up.
            </DialogDescription>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div className="font-medium text-slate-900">
                  {confirmDialog.row.quantity} × {confirmDialog.row.equipment_name || "(unnamed)"}
                </div>
                <div className="text-xs text-slate-600">
                  via <strong>{confirmDialog.row.supplier_name || "(not set)"}</strong>
                </div>
                <div className="text-xs text-slate-600">
                  Pickup: {confirmDialog.row.expected_pickup_date || "TBC"}
                  {confirmDialog.row.expected_return_date && ` · Return: ${confirmDialog.row.expected_return_date}`}
                </div>
                {canSeeFinance && (
                  <div className="text-xs text-slate-700 font-medium">
                    {fmtR(confirmDialog.row.total_cost)} ({fmtR(confirmDialog.row.hire_in_cost_per_unit)} ea)
                  </div>
                )}
              </div>
              <label className="flex items-start gap-2 cursor-pointer rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={confirmDialog.sendEmail}
                  onChange={(e) => setConfirmDialog({ ...confirmDialog, sendEmail: e.target.checked })}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Queue templated email now
                  </span>
                  <span className="text-xs text-slate-600 block mt-0.5">
                    Sends to the supplier's email on file. Uncheck if you'd rather phone or WhatsApp them.
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={runConfirm}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Confirm{confirmDialog?.sendEmail ? " + queue email" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HIR-B: bulk set-supplier dialog. */}
      <Dialog open={bulkDialog === "supplier"} onOpenChange={(o) => { if (!o) setBulkDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set supplier on {selectedIds.size} order{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              The supplier_name on each row will be overwritten with the picked supplier's name.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label className="text-xs">Supplier</Label>
            <select
              value={bulkSupplierId}
              onChange={(e) => setBulkSupplierId(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
            >
              <option value="">- Pick a supplier -</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Don't see them? Add via <Link href={`${slugPrefix}/admin/suppliers`} className="underline">Suppliers</Link>, then come back.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={runBulkSetSupplier} disabled={!bulkSupplierId || bulkBusy}>
              {bulkBusy ? "Working..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HIR-B: bulk confirm dialog. Same 2-step intent gate. */}
      <Dialog open={bulkDialog === "confirm"} onOpenChange={(o) => { if (!o) setBulkDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm {selectedIds.size} hire-in order{selectedIds.size === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              Only Draft rows with a supplier set will flip to Confirmed. Rows missing a supplier or already past Draft will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {(() => {
              const targets = rows.filter((r) => selectedIds.has(r.id) && r.status === "draft" && (r.supplier_id || r.supplier_name));
              const skipped = selectedIds.size - targets.length;
              return (
                <div className="text-sm space-y-1">
                  <div className="text-slate-700"><strong>{targets.length}</strong> will be confirmed.</div>
                  {skipped > 0 && (
                    <div className="text-amber-700"><strong>{skipped}</strong> will be skipped.</div>
                  )}
                </div>
              );
            })()}
            <p className="text-xs text-slate-500 mt-2">
              No emails are queued in bulk. Use the per-row Confirm button if you want the templated supplier email.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={runBulkConfirm} disabled={bulkBusy}>
              {bulkBusy ? "Working..." : "Confirm all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HireInPanel;
