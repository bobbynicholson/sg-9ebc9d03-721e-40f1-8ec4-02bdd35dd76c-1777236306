/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Smart Shopping - the procurement brain.
 *
 * Wires together:
 *  - inventory_items   (current_stock, minimum_stock, reorder_quantity,
 *                        cost_per_unit, is_perishable, shelf_life_days,
 *                        preferred_supplier_id)
 *  - inventory_demand_outlook view  (stock vs demand 7/14/30 days)
 *  - order_ingredient_demand view   (which orders are pulling on what)
 *  - suppliers                      (email/phone for one-click PO email)
 *
 * Three intelligent modes:
 *  1. Buy now     - shortfalls + below-min items, urgency sorted
 *  2. Plan ahead  - 14-day forward window, with a "buy by" date that
 *                    respects shelf_life_days for perishables
 *  3. By supplier - rolled up so the admin can fire one PO email per
 *                    supplier with the items they actually need
 *
 * SV touches: tick rows -> live "PO total" pill in the header that
 * grows with each click, supplier groups expand with a per-supplier
 * subtotal + "Email this supplier" CTA, perishable items pulse amber
 * if their buy-by date is inside 48 hours.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Package, AlertTriangle, Calendar, Truck, Mail, MessageCircle, CheckCircle2, Loader2, TrendingDown, ChevronDown, ChevronUp, Building2, Snowflake, Flame, Receipt, ListChecks, Camera, Download, Printer } from "lucide-react";
import { ReceiptScanner } from "@/components/shopping/ReceiptScanner";
import { ReconcileSlipDrawer } from "@/components/shopping/ReconcileSlipDrawer";
import { ReceiptsTab } from "@/components/shopping/ReceiptsTab";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { composeEmail } from "@/lib/composeEmail";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { inventoryService } from "@/services/inventoryService";
import { captureException } from "@/lib/observability";

interface OutlookRow {
  inventory_item_id: string;
  item_name: string;
  category: string | null;
  unit_of_measure: string | null;
  current_stock: number;
  minimum_stock: number;
  reorder_quantity: number | null;
  demand_next_7_days: number;
  demand_next_14_days: number;
  demand_next_30_days: number;
  projected_stock_after_7_days: number;
  shortfall_next_7_days: number;
  upcoming_order_count: number;
  status: "shortfall" | "below_minimum" | "low" | "ok";
}

interface InvDetail {
  id: string;
  is_perishable: boolean;
  shelf_life_days: number | null;
  cost_per_unit: number;
  preferred_supplier_id: string | null;
  // SHOP-C: snooze + ordered state.
  snooze_until: string | null;
  ordered_qty: number | null;
  ordered_at: string | null;
  ordered_until: string | null;
}

// SHOP-C: per-item multi-supplier links for swap suggestions.
interface ItemSupplierLink {
  supplier_id: string;
  unit_price: number | null;
  pack_size: string | null;
  is_preferred: boolean;
}

// SHOP-C: per-supplier price-creep summary from the RPC shipped in
// the suppliers audit (supplier_price_creep_summary).
interface CreepRow {
  supplier_id: string;
  items_compared: number;
  median_pct_change: number | null;
}

interface DemandLine {
  inventory_item_id: string;
  order_number: string;
  event_name: string;
  event_date: string;
  menu_item_name: string;
  quantity_required: number;
  unit: string | null;
}

interface Supplier {
  id: string;
  supplier_name: string;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
}

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const STATUS_META: Record<string, { label: string; tone: string; rank: number }> = {
  shortfall:     { label: "Shortfall",     tone: "bg-red-100 text-red-700 border-red-200",       rank: 0 },
  below_minimum: { label: "Below par",     tone: "bg-amber-100 text-amber-800 border-amber-200", rank: 1 },
  low:           { label: "Low",           tone: "bg-yellow-100 text-yellow-800 border-yellow-200", rank: 2 },
  ok:            { label: "OK",            tone: "bg-emerald-100 text-emerald-700 border-emerald-200", rank: 3 },
};

const VALID_TABS = new Set(["buy_now", "plan", "supplier", "receipts"]);

function SmartShoppingPage() {
  const { user, profile, company } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id || user?.company_id;
  // SHOP-B: finance-vis gate. SHOPPING_STAFF needs unit cost per row
  // to know what to buy, but doesn't need the aggregate Estimated PO
  // total (that's planning-side finance). Hide the aggregate from
  // shoppers; keep per-row cost.
  const financeRole = String(profile?.active_role || profile?.role || "").toLowerCase();
  const canSeeFinanceAggregate =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "admin" || financeRole === "super_admin";
  const { toast } = useToast();
  const router = useRouter();
  // Honour ?tab= so the "Manage receipts" CTA on /admin/tax-purchases
  // can deep-link straight to the receipts tab.
  const queryTab = typeof router.query.tab === "string" ? router.query.tab : null;
  const initialTab = queryTab && VALID_TABS.has(queryTab) ? queryTab : "buy_now";

  const [outlook, setOutlook] = useState<OutlookRow[]>([]);
  const [details, setDetails] = useState<Record<string, InvDetail>>({});
  const [demand, setDemand] = useState<DemandLine[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  // SHOP-C: multi-supplier links + per-supplier price-creep
  // signals from the data shipped in SUP-C / SUP-D.
  const [supplierLinks, setSupplierLinks] = useState<Record<string, ItemSupplierLink[]>>({});
  const [creep, setCreep] = useState<Record<string, CreepRow>>({});
  // Snooze + ordered busy flags so a click can't double-fire.
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const todayISO = toLocalISO(new Date());
      const [outlookRes, invRes, demandRes, supRes, linksRes, creepRes] = await Promise.all([
        supabase
          .from("inventory_demand_outlook")
          .select("*")
          .eq("company_id", companyId),
        supabase
          .from("inventory_items")
          .select("id, is_perishable, shelf_life_days, cost_per_unit, preferred_supplier_id, snooze_until, ordered_qty, ordered_at, ordered_until")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        supabase
          .from("order_ingredient_demand")
          .select("inventory_item_id, order_number, event_name, event_date, menu_item_name, quantity_required, unit, order_status")
          .eq("company_id", companyId)
          .gte("event_date", todayISO)
          .in("order_status", ["confirmed", "preparing", "ready"]),
        supabase
          .from("suppliers")
          .select("id, supplier_name, email, phone, contact_person")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        // SHOP-C: multi-supplier links for swap suggestions.
        (supabase as any)
          .from("inventory_item_suppliers")
          .select("inventory_item_id, supplier_id, unit_price, pack_size, is_preferred")
          .eq("company_id", companyId),
        // SHOP-C: per-supplier price-creep summary (shipped in SUP-D).
        // Tolerant if the RPC is missing on older project clones.
        supabase.rpc("supplier_price_creep_summary", { p_company_id: companyId }).then(
          (r) => r,
          () => ({ data: [], error: null } as { data: CreepRow[]; error: null }),
        ),
      ]);
      if (cancelled) return;
      setOutlook((outlookRes.data || []) as OutlookRow[]);
      const dMap: Record<string, InvDetail> = {};
      (invRes.data || []).forEach((r: any) => { dMap[r.id] = r as InvDetail; });
      setDetails(dMap);
      setDemand((demandRes.data || []) as DemandLine[]);
      const sMap: Record<string, Supplier> = {};
      (supRes.data || []).forEach((s: any) => { sMap[s.id] = s as Supplier; });
      setSuppliers(sMap);
      const linkMap: Record<string, ItemSupplierLink[]> = {};
      ((linksRes.data || []) as Array<{ inventory_item_id: string; supplier_id: string; unit_price: number | null; pack_size: string | null; is_preferred: boolean }>).forEach((l) => {
        if (!linkMap[l.inventory_item_id]) linkMap[l.inventory_item_id] = [];
        linkMap[l.inventory_item_id].push({
          supplier_id: l.supplier_id,
          unit_price: l.unit_price,
          pack_size: l.pack_size,
          is_preferred: l.is_preferred,
        });
      });
      setSupplierLinks(linkMap);
      const creepMap: Record<string, CreepRow> = {};
      ((creepRes.data || []) as CreepRow[]).forEach((r) => { creepMap[r.supplier_id] = r; });
      setCreep(creepMap);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Earliest event_date per inventory item - drives buy-by date
  const earliestEvent: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    demand.forEach((d) => {
      if (!d.inventory_item_id) return;
      if (!m[d.inventory_item_id] || d.event_date < m[d.inventory_item_id]) {
        m[d.inventory_item_id] = d.event_date;
      }
    });
    return m;
  }, [demand]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayISO = toLocalISO(today);

  // Decorate every outlook row with derived fields
  const enriched = useMemo(() => {
    return outlook.map((r) => {
      const det = details[r.inventory_item_id];
      const earliest = earliestEvent[r.inventory_item_id] || null;
      const earliestDate = earliest ? new Date(earliest + "T00:00:00") : null;
      // Buy-by date: for perishables, event - shelf_life_days; for non-perishables, "any time" (null)
      let buyBy: Date | null = null;
      if (det?.is_perishable && det.shelf_life_days && earliestDate) {
        buyBy = new Date(earliestDate);
        buyBy.setDate(buyBy.getDate() - Math.max(0, det.shelf_life_days - 1));
        if (buyBy < today) buyBy = today; // already overdue, get it today
      }
      const buyByDays = buyBy ? Math.ceil((buyBy.getTime() - today.getTime()) / 86400000) : null;
      const reorderQty = Number(r.reorder_quantity) || Math.max(
        Number(r.minimum_stock) - Number(r.current_stock),
        Number(r.demand_next_14_days) - Number(r.current_stock),
        0,
      );
      const cost = Number(det?.cost_per_unit ?? 0) * reorderQty;
      const supplier = det?.preferred_supplier_id ? suppliers[det.preferred_supplier_id] : null;
      const isUrgent = buyByDays !== null && buyByDays <= 2;
      // SHOP-C: snooze + ordered state. Both suppress the Buy-now
      // flag when the date is in the future. Cheap inline check.
      const isSnoozed = det?.snooze_until ? new Date(det.snooze_until + "T00:00:00") >= today : false;
      const orderedActive =
        (det?.ordered_qty ?? 0) > 0 &&
        (det?.ordered_until ? new Date(det.ordered_until + "T00:00:00") >= today : true);
      return {
        ...r,
        is_perishable: !!det?.is_perishable,
        shelf_life_days: det?.shelf_life_days ?? null,
        cost_per_unit: Number(det?.cost_per_unit ?? 0),
        preferred_supplier_id: det?.preferred_supplier_id ?? null,
        supplier,
        earliestEvent: earliest,
        buyBy,
        buyByDays,
        reorderQty,
        cost,
        isUrgent,
        // SHOP-C state passthrough
        snooze_until: det?.snooze_until ?? null,
        ordered_qty: det?.ordered_qty ?? null,
        ordered_at: det?.ordered_at ?? null,
        ordered_until: det?.ordered_until ?? null,
        isSnoozed,
        orderedActive,
      };
    });
  }, [outlook, details, suppliers, earliestEvent, today]);

  // - Buy-now list: shortfalls + below_minimum, urgency-sorted ---------
  // SHOP-C: filter out snoozed + ordered items so they stop firing as
  // shortfall the operator already actioned.
  const buyNow = useMemo(() => {
    return enriched
      .filter((r) => (r.status === "shortfall" || r.status === "below_minimum") && !r.isSnoozed && !r.orderedActive)
      .sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
        const sa = STATUS_META[a.status]?.rank ?? 9;
        const sb = STATUS_META[b.status]?.rank ?? 9;
        if (sa !== sb) return sa - sb;
        return Number(b.shortfall_next_7_days) - Number(a.shortfall_next_7_days);
      });
  }, [enriched]);

  // - Plan-ahead list: anything with demand in next 14 days that isn't OK
  const planAhead = useMemo(() => {
    return enriched
      .filter((r) => r.upcoming_order_count > 0 && Number(r.demand_next_14_days) > 0)
      .sort((a, b) => {
        if (!a.buyBy && !b.buyBy) return Number(b.demand_next_14_days) - Number(a.demand_next_14_days);
        if (!a.buyBy) return 1;
        if (!b.buyBy) return -1;
        return a.buyBy.getTime() - b.buyBy.getTime();
      });
  }, [enriched]);

  // - By-supplier rollup
  const bySupplier = useMemo(() => {
    const groups: Record<string, {
      supplier: Supplier | null;
      items: typeof enriched;
      totalCost: number;
      totalShortfallCount: number;
    }> = {};
    enriched
      .filter((r) => r.status !== "ok")
      .forEach((r) => {
        const k = r.preferred_supplier_id || "_unassigned";
        if (!groups[k]) {
          groups[k] = {
            supplier: r.supplier ?? null,
            items: [],
            totalCost: 0,
            totalShortfallCount: 0,
          };
        }
        groups[k].items.push(r);
        groups[k].totalCost += r.cost;
        if (r.status === "shortfall") groups[k].totalShortfallCount += 1;
      });
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.totalShortfallCount - a.totalShortfallCount)
      .map(([id, g]) => ({ id, ...g }));
  }, [enriched]);

  // - Cart maths
  const pickedTotal = useMemo(() => {
    return enriched
      .filter((r) => picked[r.inventory_item_id])
      .reduce((sum, r) => sum + r.cost, 0);
  }, [enriched, picked]);
  const pickedCount = Object.values(picked).filter(Boolean).length;

  const togglePick = (id: string) =>
    setPicked((p) => ({ ...p, [id]: !p[id] }));

  // SHOP-D: bulk-tick helpers. allByIds toggles every id in the
  // passed list; pickAll / clearAll bind to the Buy-now list. The
  // operator clicks once to add the whole list to the cart.
  const setManyPicked = (ids: string[], on: boolean) => {
    setPicked((p) => {
      const next = { ...p };
      for (const id of ids) next[id] = on;
      return next;
    });
  };
  const pickAllBuyNow = () => setManyPicked(buyNow.map((r) => r.inventory_item_id), true);
  const clearAllPicks = () => setPicked({});

  // SHOP-E (Bobby's "2-step dialogue + intelligent UX" ask, 2026-
  // 05-24): clicking "Email order" no longer fires Gmail compose
  // straight away. It opens a rich dialog that previews the
  // composed subject + body, lets the operator deselect individual
  // lines, edit any wording, then pick a channel (Gmail / Outlook /
  // default mail / clipboard / WhatsApp). Optional "Also mark
  // these items as ordered" toggle to wire the cart action into
  // the send so the operator doesn't have to repeat themselves.

  // Snapshot type stored in dialog state - decoupled from enriched
  // so the dialog can edit lines without mutating the live list.
  interface OrderDialogLine {
    inventory_item_id: string;
    item_name: string;
    unit_of_measure: string | null;
    reorderQty: number;
    buyBy: Date | null;
    included: boolean;
  }

  const [orderDialog, setOrderDialog] = useState<{
    supplier: Supplier | null;
    supplierName: string;
    supplierEmail: string | null;
    supplierPhone: string | null;
    contactPerson: string | null;
    lines: OrderDialogLine[];
    subject: string;
    body: string;
    alsoMarkOrdered: boolean;
    bodyManuallyEdited: boolean;
  } | null>(null);

  // Rebuild the body from the current line selections + supplier
  // info. Called on dialog open and every time the operator toggles
  // a line. Operators can override the body manually - once edited
  // we stop re-templating to respect their changes.
  const renderOrderBody = (
    supplierName: string,
    contactPerson: string | null,
    lines: OrderDialogLine[],
  ): string => {
    const greeting = contactPerson || supplierName || "there";
    const included = lines.filter((l) => l.included);
    const lineText = included
      .map((l) => `- ${l.reorderQty} ${l.unit_of_measure || ""} ${l.item_name}${l.buyBy ? ` (needed by ${l.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })})` : ""}`.replace(/\s+/g, " ").trim())
      .join("\n");
    return `Hi ${greeting},\n\nCould you put the following on order for us?\n\n${lineText}\n\nLet me know an ETA and the total when you're ready.\n\nThanks,\n${company?.company_name || "The team"}`;
  };

  // Pre-existing buildOrderRequest is kept for the "Email all"
  // master button which sends straight without opening the dialog
  // (one-click bulk path). Per-supplier path now uses the dialog.
  const buildOrderRequest = (group: { supplier: Supplier | null; items: typeof enriched }) => {
    const linesInScope = group.items.filter((r) => picked[r.inventory_item_id]);
    const lines = linesInScope.length > 0 ? linesInScope : group.items;
    const subject = `Order request from ${company?.company_name || "us"}`;
    const lineText = lines
      .map((r) => `- ${r.reorderQty} ${r.unit_of_measure} ${r.item_name}${r.buyBy ? ` (needed by ${r.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })})` : ""}`)
      .join("\n");
    const body = `Hi ${group.supplier?.contact_person || group.supplier?.supplier_name || "there"},\n\nCould you put the following on order for us?\n\n${lineText}\n\nLet me know an ETA and the total when you're ready.\n\nThanks,\n${company?.company_name || "The team"}`;
    return { subject, body, count: lines.length };
  };

  // Open the rich dialog with a snapshot of the supplier group.
  const openOrderDialog = (group: { supplier: Supplier | null; items: typeof enriched }) => {
    const supplierName = group.supplier?.supplier_name || "supplier";
    // Default to picked lines if any of the group's items are in
    // the cart; otherwise include all.
    const anyPickedInGroup = group.items.some((r) => picked[r.inventory_item_id]);
    const lines: OrderDialogLine[] = group.items.map((r) => ({
      inventory_item_id: r.inventory_item_id,
      item_name: r.item_name,
      unit_of_measure: r.unit_of_measure,
      reorderQty: r.reorderQty,
      buyBy: r.buyBy,
      included: anyPickedInGroup ? !!picked[r.inventory_item_id] : true,
    }));
    setOrderDialog({
      supplier: group.supplier,
      supplierName,
      supplierEmail: group.supplier?.email || null,
      supplierPhone: group.supplier?.phone || null,
      contactPerson: group.supplier?.contact_person || null,
      lines,
      subject: `Order request from ${company?.company_name || "us"}`,
      body: renderOrderBody(supplierName, group.supplier?.contact_person || null, lines),
      alsoMarkOrdered: false,
      bodyManuallyEdited: false,
    });
  };

  const toggleOrderLine = (itemId: string) => {
    setOrderDialog((d) => {
      if (!d) return d;
      const nextLines = d.lines.map((l) =>
        l.inventory_item_id === itemId ? { ...l, included: !l.included } : l,
      );
      return {
        ...d,
        lines: nextLines,
        body: d.bodyManuallyEdited ? d.body : renderOrderBody(d.supplierName, d.contactPerson, nextLines),
      };
    });
  };

  // After a channel fires, optionally mark each included line as
  // ordered (PO sent, hide from Buy-now for 7d) so the action is
  // cohesive.
  const finaliseOrderDialog = async (channel: string) => {
    const d = orderDialog;
    if (!d) return;
    if (d.alsoMarkOrdered) {
      const includedIds = d.lines.filter((l) => l.included).map((l) => l.inventory_item_id);
      for (const id of includedIds) {
        const row = enriched.find((r) => r.inventory_item_id === id);
        if (row) await markOrdered(id, row.reorderQty, 7);
      }
    }
    toast({
      title: `Order opened in ${channel}`,
      description: d.alsoMarkOrdered
        ? `${d.lines.filter((l) => l.included).length} item${d.lines.filter((l) => l.included).length === 1 ? "" : "s"} marked as ordered.`
        : undefined,
    });
    setOrderDialog(null);
  };

  const sendOrderVia = async (channel: "gmail" | "outlook" | "mailto" | "clipboard" | "whatsapp") => {
    const d = orderDialog;
    if (!d) return;
    const payload = { to: d.supplierEmail || "", subject: d.subject, body: d.body };
    if (channel === "whatsapp") {
      const num = (d.supplierPhone || "").replace(/[\s()-]/g, "");
      if (!num) {
        toast({ title: "No phone on file", description: `Add a phone for ${d.supplierName} on /admin/suppliers.`, variant: "destructive" });
        return;
      }
      const intl = num.startsWith("+") ? num.slice(1) : num.startsWith("0") ? `27${num.slice(1)}` : num;
      window.open(`https://wa.me/${intl}?text=${encodeURIComponent(d.body)}`, "_blank", "noopener");
      await finaliseOrderDialog("WhatsApp");
      return;
    }
    if (channel !== "clipboard" && !d.supplierEmail) {
      toast({ title: "No email on file", description: `Add an email for ${d.supplierName} or use Copy / WhatsApp.`, variant: "destructive" });
      return;
    }
    if (channel === "gmail") {
      window.open(composeEmail.gmailUrl(payload), "_blank", "noopener");
      await finaliseOrderDialog("Gmail");
    } else if (channel === "outlook") {
      window.open(composeEmail.outlookUrl(payload), "_blank", "noopener");
      await finaliseOrderDialog("Outlook");
    } else if (channel === "mailto") {
      window.location.href = composeEmail.mailto(payload);
      await finaliseOrderDialog("default mail");
    } else if (channel === "clipboard") {
      const ok = await composeEmail.copyToClipboard(payload);
      if (ok) {
        await finaliseOrderDialog("clipboard");
      } else {
        toast({ title: "Could not copy", description: "Clipboard access blocked - try Gmail / Outlook / mailto.", variant: "destructive" });
      }
    }
  };

  // SHOP-D: master "Email all suppliers" - fan out one mailto per
  // group in one click. Only groups with an email on file get a
  // window; ones without surface as a toast tally so the operator
  // sees what to chase up manually.
  const emailAllSuppliers = () => {
    const groupsWithEmail = bySupplier.filter((g) => g.supplier?.email);
    const skipped = bySupplier.length - groupsWithEmail.length;
    if (groupsWithEmail.length === 0) {
      toast({ title: "No suppliers with email", description: "Add supplier emails on /admin/suppliers first.", variant: "destructive" });
      return;
    }
    // Stagger so the popup blocker treats each as a separate user
    // gesture chain.
    groupsWithEmail.forEach((g, i) => {
      const { subject, body } = buildOrderRequest(g);
      setTimeout(() => {
        if (!g.supplier?.email) return;
        window.open(composeEmail.gmailUrl({ to: g.supplier.email, subject, body }), "_blank", "noopener");
      }, i * 200);
    });
    toast({
      title: `Opening ${groupsWithEmail.length} email${groupsWithEmail.length === 1 ? "" : "s"}`,
      description: skipped > 0 ? `${skipped} supplier${skipped === 1 ? "" : "s"} skipped (no email on file).` : undefined,
    });
  };

  // SHOP-C: snooze an item from the Buy-now flag until a chosen
  // date. Operator picks "Til Mon" / "Til next week". Cheap server
  // write; row disappears from Buy-now on next render.
  const snoozeItem = async (itemId: string, daysFromNow: number) => {
    if (!companyId) return;
    setRowBusy((m) => ({ ...m, [itemId]: true }));
    const until = new Date();
    until.setDate(until.getDate() + daysFromNow);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({ snooze_until: toLocalISO(until), updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
      setDetails((m) => ({ ...m, [itemId]: { ...m[itemId], snooze_until: toLocalISO(until) } }));
      toast({
        title: "Snoozed",
        description: `Hidden until ${until.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}.`,
        action: (
          <ToastAction altText="Undo snooze" onClick={() => clearSnooze(itemId)}>
            Undo
          </ToastAction>
        ),
      });
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/shopping", area: "snooze", tenant: companyId } });
      toast({ title: "Could not snooze", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setRowBusy((m) => ({ ...m, [itemId]: false }));
    }
  };

  const clearSnooze = async (itemId: string) => {
    if (!companyId) return;
    setRowBusy((m) => ({ ...m, [itemId]: true }));
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({ snooze_until: null, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
      setDetails((m) => ({ ...m, [itemId]: { ...m[itemId], snooze_until: null } }));
      toast({ title: "Snooze cleared" });
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/shopping", area: "unsnooze", tenant: companyId } });
    } finally {
      setRowBusy((m) => ({ ...m, [itemId]: false }));
    }
  };

  // SHOP-C: mark an item as ordered (PO sent to supplier, not yet
  // physically received). Suppresses the Buy-now flag for an ETA
  // window. Mark purchased remains the real receive path; it clears
  // ordered_* + writes inventory_transactions via receiveStock.
  // SHOP-H: clearOrdered - undo path for an accidentally-clicked
  // Mark ordered. Resets the three ordered_* columns so the item
  // pops back into Buy-now on next render. Used by both the toast
  // Undo action and the "ordered" side-panel chip.
  const clearOrdered = async (itemId: string, opts: { silent?: boolean } = {}) => {
    if (!companyId) return;
    setRowBusy((m) => ({ ...m, [itemId]: true }));
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({
          ordered_qty: null,
          ordered_at: null,
          ordered_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      if (error) throw error;
      setDetails((m) => ({
        ...m,
        [itemId]: { ...m[itemId], ordered_qty: null, ordered_at: null, ordered_until: null },
      }));
      if (!opts.silent) toast({ title: "Order flag cleared", description: "Item back on Buy-now." });
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/shopping", area: "clear-ordered", tenant: companyId } });
      if (!opts.silent) {
        toast({ title: "Could not clear", description: e instanceof Error ? e.message : "", variant: "destructive" });
      }
    } finally {
      setRowBusy((m) => ({ ...m, [itemId]: false }));
    }
  };

  // SHOP-I: single-item Mark received. The cart pill's Mark purchased
  // path requires ticking rows first, which works when the operator
  // is consciously building a PO list. The mistake-click path from
  // Mark ordered hides the row from Buy-now, so the operator can't
  // tick it to receive it later - they were stuck. This is the
  // direct path: click "Mark received" inline on the ordered side
  // panel, goods land in stock with a proper inventory_transactions
  // row + batch, ordered_* clears.
  const markReceivedSingle = async (itemId: string) => {
    if (!companyId || !user?.id) return;
    const row = enriched.find((r) => r.inventory_item_id === itemId);
    if (!row) return;
    const qty = Number(row.ordered_qty || row.reorderQty || 0);
    if (qty <= 0) {
      toast({ title: "Nothing to receive", description: "Ordered quantity is zero.", variant: "destructive" });
      return;
    }
    setRowBusy((m) => ({ ...m, [itemId]: true }));
    try {
      const today = toLocalISO(new Date());
      const supplierId = row.preferred_supplier_id || null;
      const result = await inventoryService.receiveStock({
        companyId,
        supplierId,
        invoiceNumber: `SHOP-RCV-${today}-${itemId.slice(0, 6)}`,
        receivedDate: today,
        performedBy: user.id,
        notes: "Received via /admin/shopping ordered panel",
        lines: [{
          itemId,
          qty,
          unitCost: row.cost_per_unit > 0 ? row.cost_per_unit : null,
        }],
      });
      if (result.errors.length > 0) {
        captureException(new Error(result.errors[0]), { tags: { surface: "admin/shopping", area: "mark-received-single", tenant: companyId } });
        toast({ title: "Could not receive", description: result.errors[0], variant: "destructive" });
        return;
      }
      // Clear ordered_* silently - we already toast about the receive.
      await clearOrdered(itemId, { silent: true });
      toast({
        title: "Received",
        description: `${qty} ${row.unit_of_measure || ""} ${row.item_name} added to stock.`,
      });
      // Refresh outlook so the row's new stock is reflected.
      const { data } = await supabase
        .from("inventory_demand_outlook")
        .select("*")
        .eq("company_id", companyId);
      setOutlook((data || []) as OutlookRow[]);
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/shopping", area: "mark-received-single", tenant: companyId } });
      toast({ title: "Could not receive", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setRowBusy((m) => ({ ...m, [itemId]: false }));
    }
  };

  const markOrdered = async (itemId: string, qty: number, etaDaysFromNow: number) => {
    if (!companyId) return;
    setRowBusy((m) => ({ ...m, [itemId]: true }));
    const until = new Date();
    until.setDate(until.getDate() + etaDaysFromNow);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .update({
          ordered_qty: qty,
          ordered_at: new Date().toISOString(),
          ordered_until: toLocalISO(until),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      if (error) throw error;
      setDetails((m) => ({
        ...m,
        [itemId]: {
          ...m[itemId],
          ordered_qty: qty,
          ordered_at: new Date().toISOString(),
          ordered_until: toLocalISO(until),
        },
      }));
      // SHOP-H + SHOP-I: undo on the toast PLUS guide the operator
      // to the inline panel that survives the toast dismiss. The
      // previous "Click Mark purchased once it arrives" hint was
      // misleading - Mark purchased is the cart-pill action that
      // only appears when items are TICKED, but a mistake-clicked
      // Mark ordered doesn't tick anything. The fix: the toast
      // points to the always-visible "awaiting delivery" panel
      // below Buy-now, which has both Undo and Mark received
      // inline on every row.
      toast({
        title: "Marked as ordered",
        description: `Hidden from Buy-now until ${until.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}. Find it in the "Awaiting delivery" panel below to Mark received or Undo.`,
        action: (
          <ToastAction altText="Undo mark as ordered" onClick={() => clearOrdered(itemId)}>
            Undo
          </ToastAction>
        ),
      });
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/shopping", area: "mark-ordered", tenant: companyId } });
      toast({ title: "Could not mark ordered", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setRowBusy((m) => ({ ...m, [itemId]: false }));
    }
  };

  // SHOP-B (audit fix, 2026-05-24): the previous implementation
  // UPDATEd inventory_items.current_stock directly with no
  // inventory_transactions row and no batch. The stock ledger silently
  // diverged from the cart action - every "Mark purchased" click
  // bumped stock without an audit trail, missed the FIFO batch layer,
  // and never linked to a supplier. Now routes through
  // inventoryService.receiveStock which writes (inventory_items.
  // current_stock += qty) + (inventory_transactions insert) +
  // (inventory_batches insert) atomically per line.
  const markPurchased = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (ids.length === 0) return;
    if (!companyId || !user?.id) return;
    if (!confirm(`Mark ${ids.length} item${ids.length === 1 ? "" : "s"} as purchased? Writes a stock-in transaction per line.`)) return;

    // Group picked rows by preferred supplier so the receiveStock call
    // can stamp the right supplier_id on each transaction. Rows
    // without a preferred supplier go through the "no supplier" group.
    const groups = new Map<string | null, Array<{ itemId: string; qty: number; unitCost?: number | null }>>();
    for (const id of ids) {
      const row = enriched.find((r) => r.inventory_item_id === id);
      if (!row) continue;
      const supplierId = row.preferred_supplier_id || null;
      const list = groups.get(supplierId) || [];
      list.push({
        itemId: id,
        qty: row.reorderQty,
        unitCost: row.cost_per_unit > 0 ? row.cost_per_unit : null,
      });
      groups.set(supplierId, list);
    }

    let received = 0;
    const allErrors: string[] = [];
    const today = toLocalISO(new Date());
    try {
      for (const [supplierId, lines] of groups.entries()) {
        const result = await inventoryService.receiveStock({
          companyId,
          supplierId,
          invoiceNumber: `SHOP-${today}-${supplierId?.slice(0, 6) || "no-sup"}`,
          receivedDate: today,
          performedBy: user.id,
          notes: "Marked purchased from /admin/shopping cart",
          lines,
        });
        received += result.received;
        allErrors.push(...result.errors);
      }
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/shopping", area: "mark-purchased", tenant: companyId } });
      toast({
        title: "Mark purchased failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
      return;
    }

    if (allErrors.length > 0) {
      toast({
        title: `Received ${received}, ${allErrors.length} error${allErrors.length === 1 ? "" : "s"}`,
        description: allErrors.slice(0, 2).join(" · "),
        variant: "destructive",
      });
    } else {
      toast({
        title: "Stock received",
        description: `${received} line${received === 1 ? "" : "s"} written to the ledger.`,
      });
    }
    // SHOP-C: clear ordered_* state for any picked rows that had it.
    // The receive event completes the order, so the in-flight flag
    // should drop. Best-effort - any failure stays silent.
    const orderedIds = ids.filter((id) => (enriched.find((r) => r.inventory_item_id === id)?.orderedActive));
    if (orderedIds.length > 0) {
      await supabase
        .from("inventory_items")
        .update({ ordered_qty: null, ordered_at: null, ordered_until: null })
        .in("id", orderedIds);
      setDetails((m) => {
        const next = { ...m };
        orderedIds.forEach((id) => {
          if (next[id]) next[id] = { ...next[id], ordered_qty: null, ordered_at: null, ordered_until: null };
        });
        return next;
      });
    }
    setPicked({});
    // refresh outlook
    const { data } = await supabase
      .from("inventory_demand_outlook")
      .select("*")
      .eq("company_id", companyId);
    setOutlook((data || []) as OutlookRow[]);
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Smart Shopping - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          {/* Header + cart pill */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-2 flex-wrap">
                  Smart Shopping
                  <InfoTooltip content={"Looks at your stock, your confirmed orders for the week ahead, and your suppliers, then tells you exactly what to buy and when."} />
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Live procurement brain. Knows what to buy, when to buy it, and which supplier handles it.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {/* Phase 20 #1: shopping CSV export. Procurement
                  brains the buy-now list nicely on screen, but the
                  shopper out in the field wants a printable list
                  on their phone or a CSV they can paste into the
                  supplier's order form. Walks buyNow (the urgency-
                  sorted shortfall + below-min set) so what you see
                  on the Buy now tab is what you get. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (buyNow.length === 0) {
                    toast({ title: "Nothing to export", description: "Buy now list is empty - stock looks healthy." });
                    return;
                  }
                  const esc = (v) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = [
                    "Item", "Category", "Status", "Current", "Minimum",
                    "Reorder qty", "Unit", "Cost per unit", "Estimated cost",
                    "Supplier", "Buy by", "Urgent",
                  ];
                  const lines = [headers.join(",")];
                  for (const r of buyNow) {
                    lines.push([
                      esc(r.item_name),
                      esc(r.category || ""),
                      esc(r.status),
                      esc(r.current_stock),
                      esc(r.minimum_stock),
                      esc(r.reorderQty),
                      esc(r.unit_of_measure || ""),
                      esc(Number(r.cost_per_unit || 0).toFixed(2)),
                      esc(Number(r.cost || 0).toFixed(2)),
                      esc(r.supplier?.supplier_name || ""),
                      esc(r.buyBy ? toLocalISO(r.buyBy) : ""),
                      esc(r.isUrgent ? "yes" : "no"),
                    ].join(","));
                  }
                  // SHOP-B: UTF-8 BOM for Excel-ZA parity with calendar /
                  // contacts CSV exports.
                  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `shopping-buy-now-${toLocalISO(new Date())}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Export buy-now
              </Button>
              {/* AD-2 (admin-dashboard audit): print-friendly Today's
                  shopping list. Bobby's brief: "if a user needs to go
                  shopping today, there should be an easy list to
                  print." The hidden #print-shopping-list div below
                  renders a clean paper-friendly table; the print CSS
                  hides everything else. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (buyNow.length === 0) {
                    toast({ title: "Nothing to print", description: "Buy now list is empty - stock looks healthy." });
                    return;
                  }
                  // Tiny delay so the button gets to finish its click
                  // animation before the browser print dialog steals focus.
                  setTimeout(() => window.print(), 100);
                }}
                className="gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Print today
              </Button>
              {pickedCount > 0 && (
                <Card className="border-0 shadow bg-emerald-50 px-4 py-2 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-xs text-emerald-700">In your PO list</p>
                    <p className="font-bold text-slate-900">
                      {pickedCount} item{pickedCount === 1 ? "" : "s"}
                      {canSeeFinanceAggregate ? ` - ${fmtMoney.format(pickedTotal)}` : ""}
                    </p>
                  </div>
                  <Button size="sm" onClick={markPurchased} className="ml-2 gap-1">
                    <Truck className="w-3.5 h-3.5" /> Mark purchased
                  </Button>
                </Card>
              )}
            </div>
          </div>

          {/* Top stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <SummaryTile
              label="Shortfalls"
              value={enriched.filter((r) => r.status === "shortfall").length}
              accent="text-red-600"
              icon={AlertTriangle}
              hint="Below 7-day demand"
              tooltip={"Items where you don't have enough stock to cover the next 7 days of confirmed orders."}
            />
            <SummaryTile
              label="Below par"
              value={enriched.filter((r) => r.status === "below_minimum").length}
              accent="text-amber-600"
              icon={TrendingDown}
              hint="Below minimum_stock"
              tooltip={"Stock has slipped below your minimum threshold but you can still cover upcoming orders.\n\nGood time to top up before it becomes urgent."}
            />
            <SummaryTile
              label="Urgent (≤2 days)"
              value={enriched.filter((r) => r.isUrgent && r.status !== "ok").length}
              accent="text-orange-600"
              icon={Flame}
              hint="Perishables expiring soon"
              tooltip={"Perishables you need to buy in the next two days, taking shelf life into account."}
            />
            {canSeeFinanceAggregate ? (
              <SummaryTile
                label="Estimated PO total"
                value={fmtMoney.format(buyNow.reduce((s, r) => s + r.cost, 0))}
                accent="text-emerald-600"
                icon={Receipt}
                hint="Buy-now items at supplier prices"
                isMoney
                tooltip={"What you'll spend if you place a purchase order for everything currently flagged as short or below par.\n\nUses your supplier pricing and reorder quantities."}
              />
            ) : (
              <SummaryTile
                label="Items to buy"
                value={String(buyNow.length)}
                accent="text-emerald-600"
                icon={Receipt}
                hint="Total lines on the buy-now list"
                tooltip={"How many distinct items need topping up. Rand total is gated to owner / admin."}
              />
            )}
          </div>

          {/* Slip scanner - shared with /admin/tax-purchases. Snap a
              supplier till slip after a shop run; the same scan tags
              tax-deductibility AND can feed inventory in the
              reconciliation step. */}
          <Card className="border-0 shadow mb-6">
            <button
              type="button"
              onClick={() => setScannerOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 rounded-t-lg"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Just back from the shops?</p>
                  <p className="text-xs text-slate-500">Scan the till slip. One upload tags it for tax and feeds your inventory.</p>
                </div>
              </div>
              {scannerOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {scannerOpen && (
              <CardContent className="border-t border-slate-100 pt-4 space-y-3">
                <ReceiptScanner accent="emerald" />
                <div className="flex items-center justify-center pt-2 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualOpen(true)}
                    className="text-slate-700 gap-1.5"
                  >
                    <Receipt className="w-4 h-4" />
                    Or capture a slip by hand
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Manual-entry drawer - same Reconcile component as the
              scanner, just primed with empty data and exposing the
              vendor + description typeaheads from past receipts. */}
          <ReconcileSlipDrawer
            open={manualOpen}
            onClose={() => setManualOpen(false)}
            onSaved={() => setManualOpen(false)}
            mappedData={null}
            sourceData={null}
            companyId={companyId || ""}
            userId={user?.id || ""}
            manualMode
          />

          {loading ? (
            <Card className="border-0 shadow"><CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading procurement brain...
            </CardContent></Card>
          ) : outlook.length === 0 ? (
            <Card className="border-0 shadow"><CardContent className="py-16 text-center text-slate-500">
              <Package className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No inventory configured yet</p>
              <p className="text-sm">Add items in <Link href={withSlug("/admin/inventory")} className="text-emerald-600">Inventory</Link>, link them to recipes, and this page lights up.</p>
            </CardContent></Card>
          ) : (
            <Tabs defaultValue={initialTab} key={initialTab}>
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-3xl mb-4">
                <TabsTrigger value="buy_now" className="gap-1.5">
                  <Flame className="w-3.5 h-3.5" /> Buy now
                  {buyNow.length > 0 && <Badge className="ml-1 bg-red-100 text-red-700 text-[10px]">{buyNow.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="plan" className="gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Plan ahead
                </TabsTrigger>
                <TabsTrigger value="supplier" className="gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> By supplier
                </TabsTrigger>
                <TabsTrigger value="receipts" className="gap-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Receipts
                </TabsTrigger>
              </TabsList>

              {/* BUY NOW */}
              <TabsContent value="buy_now">
                {/* SHOP-I: expanded "Awaiting delivery" + "Snoozed"
                    panels. Audit caught the previous <details>
                    collapse hid the mistake-clicked rows behind a
                    chip the operator didn't know to expand, with a
                    toast hint that pointed at Mark purchased (cart
                    pill) which isn't visible when nothing's ticked.
                    Now: rows always visible when present, each
                    carries Undo + Mark received inline so the
                    operator can act without hunting. */}
                {(() => {
                  const snoozedRows = enriched.filter((r) => r.isSnoozed);
                  const orderedRows = enriched.filter((r) => r.orderedActive);
                  if (snoozedRows.length === 0 && orderedRows.length === 0) return null;
                  return (
                    <div className="mb-4 space-y-3">
                      {orderedRows.length > 0 && (
                        <Card className="border-0 shadow-sm bg-blue-50">
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Truck className="w-4 h-4 text-blue-700" />
                              <p className="text-xs font-semibold text-blue-900">
                                Awaiting delivery ({orderedRows.length})
                              </p>
                            </div>
                            <ul className="space-y-1.5">
                              {orderedRows.map((r) => (
                                <li
                                  key={r.inventory_item_id}
                                  className="flex items-center gap-2 flex-wrap text-xs bg-white border border-blue-100 rounded-md px-2 py-1.5"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-slate-900">{r.item_name}</span>
                                    <span className="text-slate-500 ml-1">
                                      {r.ordered_qty != null ? ` · ${r.ordered_qty} ${r.unit_of_measure}` : ""}
                                      {r.ordered_until ? ` · ETA ${new Date(r.ordered_until + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => markReceivedSingle(r.inventory_item_id)}
                                    disabled={!!rowBusy[r.inventory_item_id]}
                                    title="Goods arrived - add to stock and clear the flag"
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 min-h-[28px]"
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Mark received
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => clearOrdered(r.inventory_item_id)}
                                    disabled={!!rowBusy[r.inventory_item_id]}
                                    title="Didn't actually order this - clear the flag without receiving"
                                    className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 min-h-[28px]"
                                  >
                                    Undo
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[10px] text-blue-700">
                              Items hidden from Buy-now until delivery. Mark received once the goods arrive (writes a stock-in transaction) or Undo if it was a mistake.
                            </p>
                          </CardContent>
                        </Card>
                      )}
                      {snoozedRows.length > 0 && (
                        <Card className="border-0 shadow-sm bg-slate-50">
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-xs font-semibold text-slate-700">
                                Snoozed ({snoozedRows.length})
                              </p>
                            </div>
                            <ul className="space-y-1.5">
                              {snoozedRows.map((r) => (
                                <li
                                  key={r.inventory_item_id}
                                  className="flex items-center gap-2 flex-wrap text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-slate-900">{r.item_name}</span>
                                    <span className="text-slate-400 ml-1">
                                      til {r.snooze_until ? new Date(r.snooze_until + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : ""}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => clearSnooze(r.inventory_item_id)}
                                    disabled={!!rowBusy[r.inventory_item_id]}
                                    className="text-[11px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 min-h-[28px]"
                                  >
                                    Unsnooze
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  );
                })()}
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <ListChecks className="w-5 h-5 text-emerald-600" />
                          Buy now
                        </CardTitle>
                        <CardDescription>
                          Items below minimum stock or already short for the next 7 days. Tick to add to your PO list.
                        </CardDescription>
                      </div>
                      {/* SHOP-D: bulk-tick. One click adds the whole
                          Buy-now list to the cart for a Mark purchased
                          / Email all sweep. */}
                      {buyNow.length > 0 && (
                        <div className="flex items-center gap-1 text-xs">
                          <button
                            type="button"
                            onClick={pickAllBuyNow}
                            className="px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            Tick all ({buyNow.length})
                          </button>
                          {pickedCount > 0 && (
                            <button
                              type="button"
                              onClick={clearAllPicks}
                              className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                            >
                              Clear ({pickedCount})
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {buyNow.length === 0 ? (
                      <div className="py-12 text-center">
                        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                        <p className="font-semibold text-slate-700">All stocked up</p>
                        <p className="text-xs text-slate-500">Nothing to buy right now. Check back tomorrow.</p>
                      </div>
                    ) : (
                      <ItemTable
                        rows={buyNow}
                        picked={picked} togglePick={togglePick}
                        expandedItem={expandedItem} setExpandedItem={setExpandedItem}
                        demand={demand}
                        showBuyBy
                        supplierLinks={supplierLinks}
                        creep={creep}
                        suppliersById={suppliers}
                        onSnooze={snoozeItem}
                        onMarkOrdered={markOrdered}
                        rowBusy={rowBusy}
                        canSeeFinance={canSeeFinanceAggregate}
                        withSlug={withSlug}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PLAN AHEAD */}
              <TabsContent value="plan">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      Plan ahead (next 14 days)
                    </CardTitle>
                    <CardDescription>
                      Sorted by buy-by date. Perishables surface earliest, non-perishables can wait. Urgent items pulse amber.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {planAhead.length === 0 ? (
                      <div className="py-12 text-center text-slate-500">
                        <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        No upcoming demand on inventory.
                      </div>
                    ) : (
                      <ItemTable
                        rows={planAhead}
                        picked={picked} togglePick={togglePick}
                        expandedItem={expandedItem} setExpandedItem={setExpandedItem}
                        demand={demand}
                        showBuyBy
                        showShelfLife
                        supplierLinks={supplierLinks}
                        creep={creep}
                        suppliersById={suppliers}
                        onSnooze={snoozeItem}
                        rowBusy={rowBusy}
                        canSeeFinance={canSeeFinanceAggregate}
                        withSlug={withSlug}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* BY SUPPLIER */}
              <TabsContent value="supplier">
                {/* SHOP-D: master Email-all button. Fans out one
                    compose window per supplier with an email on
                    file. Stagger 200ms so popup blockers don't
                    treat them as a burst. */}
                {bySupplier.length > 1 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <Button size="sm" variant="outline" onClick={emailAllSuppliers} className="gap-1.5">
                      <Mail className="w-3.5 h-3.5" /> Email all suppliers
                    </Button>
                    <span className="text-slate-500">
                      Opens one compose window per supplier with an email on file.
                    </span>
                  </div>
                )}
                <div className="space-y-3">
                  {bySupplier.length === 0 ? (
                    <Card className="border-0 shadow"><CardContent className="py-12 text-center text-slate-500">
                      <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      Nothing to order right now.
                    </CardContent></Card>
                  ) : (
                    bySupplier.map((g) => {
                      const isOpen = openSupplier === g.id;
                      return (
                        <Card key={g.id} className="border-0 shadow-lg">
                          <button
                            onClick={() => setOpenSupplier(isOpen ? null : g.id)}
                            className="w-full text-left"
                          >
                            <CardHeader className="hover:bg-slate-50 transition-colors">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
                                    <Building2 className="w-5 h-5 text-emerald-600" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">
                                      {g.supplier?.supplier_name || "No preferred supplier"}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {g.items.length} item{g.items.length === 1 ? "" : "s"} to order
                                      {g.totalShortfallCount > 0 && (
                                        <span className="ml-2 text-red-600 font-medium">
                                          - {g.totalShortfallCount} shortfall{g.totalShortfallCount === 1 ? "" : "s"}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className="font-bold tabular-nums text-slate-900">
                                    {fmtMoney.format(g.totalCost)}
                                  </span>
                                  {/* SHOP-E: single Email order button
                                      opens the rich 2-step dialog
                                      with channel choice (Gmail /
                                      Outlook / default mail /
                                      clipboard / WhatsApp). Old
                                      standalone WhatsApp button
                                      replaced - WA is now a channel
                                      inside the dialog. */}
                                  {(g.supplier?.email || g.supplier?.phone) && (
                                    <Button
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); openOrderDialog(g); }}
                                      className="gap-1.5"
                                      title="Compose and send this supplier's order - preview before sending"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      Email order
                                    </Button>
                                  )}
                                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>
                              </div>
                            </CardHeader>
                          </button>
                          {isOpen && (
                            <CardContent className="p-0">
                              <ItemTable
                                rows={g.items}
                                picked={picked} togglePick={togglePick}
                                expandedItem={expandedItem} setExpandedItem={setExpandedItem}
                                demand={demand}
                                hideSupplier
                                showBuyBy
                              />
                            </CardContent>
                          )}
                        </Card>
                      );
                    })
                  )}
                </div>
              </TabsContent>

              {/* RECEIPTS - slip log + tax-deductible editor (used to live
                  on its own /admin/tax-purchases page; merged in here so
                  shopping is the single place an admin acts). The
                  read-only mirror at /admin/tax-purchases is kept as an
                  accountant-facing overview. */}
              <TabsContent value="receipts">
                <ReceiptsTab companyId={companyId || ""} userId={user?.id || ""} />
              </TabsContent>
            </Tabs>
          )}

          <p className="text-[11px] text-slate-500 text-center mt-6">
            Procurement maths derived from <code className="bg-slate-100 px-1 rounded">inventory_demand_outlook</code> +{" "}
            <code className="bg-slate-100 px-1 rounded">order_ingredient_demand</code> views.
            Updates the moment a stock change or new order lands.
          </p>
        </div>
      </div>

      {/* AD-2: print-only view of today's shopping list. Hidden on
          screen via the print CSS below; only renders to paper.
          One row per buy-now item with a checkbox column so the
          shopper can tick off in the field. Supplier-grouped so a
          single shopping run can fan out to multiple suppliers. */}
      {/* SHOP-E: Order request dialog. Replaces the one-shot Gmail
          compose. Click "Email order" -> dialog opens with editable
          subject + body + per-line tick list + channel choice. Two
          steps: review/edit then pick a channel. */}
      <Dialog open={!!orderDialog} onOpenChange={(o) => { if (!o) setOrderDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Order from {orderDialog?.supplierName || "supplier"}
            </DialogTitle>
            <DialogDescription>
              Preview and tweak the message, then pick how to send it. Nothing fires until you click a channel.
            </DialogDescription>
          </DialogHeader>
          {orderDialog && (
            <div className="space-y-4">
              {/* Recipient strip */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span><span className="text-slate-500">Supplier:</span> <strong>{orderDialog.supplierName}</strong></span>
                  {orderDialog.contactPerson && (
                    <span><span className="text-slate-500">Contact:</span> {orderDialog.contactPerson}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {orderDialog.supplierEmail ? (
                    <span><span className="text-slate-500">Email:</span> {orderDialog.supplierEmail}</span>
                  ) : (
                    <span className="text-amber-700">No email on file</span>
                  )}
                  {orderDialog.supplierPhone ? (
                    <span><span className="text-slate-500">Phone:</span> {orderDialog.supplierPhone}</span>
                  ) : (
                    <span className="text-amber-700">No phone on file</span>
                  )}
                </div>
              </div>

              {/* Per-line toggle. Untick to drop a line from the
                  outgoing order without losing its place in the
                  cart. */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                  Items ({orderDialog.lines.filter((l) => l.included).length} of {orderDialog.lines.length})
                </p>
                <div className="rounded-md border border-slate-200 divide-y divide-slate-100 max-h-44 overflow-y-auto">
                  {orderDialog.lines.map((l) => (
                    <label
                      key={l.inventory_item_id}
                      className={`flex items-center gap-2 p-2 text-sm cursor-pointer ${l.included ? "bg-white" : "bg-slate-50 opacity-60"}`}
                    >
                      <input
                        type="checkbox"
                        checked={l.included}
                        onChange={() => toggleOrderLine(l.inventory_item_id)}
                      />
                      <span className="flex-1">
                        <strong>{l.reorderQty} {l.unit_of_measure}</strong> {l.item_name}
                      </span>
                      {l.buyBy && (
                        <span className="text-[11px] text-slate-500">
                          by {l.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Editable subject. Operator can rename "Order request
                  from us" to anything that helps the supplier triage. */}
              <div>
                <label htmlFor="order-subject" className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Subject
                </label>
                <Input
                  id="order-subject"
                  value={orderDialog.subject}
                  onChange={(e) => setOrderDialog((d) => d ? { ...d, subject: e.target.value } : d)}
                  className="mt-1"
                />
              </div>

              {/* Editable body. Auto-re-renders when lines toggle
                  UNLESS the operator has typed in here - then we
                  respect their edits. */}
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="order-body" className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Message
                  </label>
                  {orderDialog.bodyManuallyEdited && (
                    <button
                      type="button"
                      onClick={() => setOrderDialog((d) => d ? {
                        ...d,
                        body: renderOrderBody(d.supplierName, d.contactPerson, d.lines),
                        bodyManuallyEdited: false,
                      } : d)}
                      className="text-[11px] text-blue-700 hover:underline"
                    >
                      Reset to template
                    </button>
                  )}
                </div>
                <Textarea
                  id="order-body"
                  rows={10}
                  value={orderDialog.body}
                  onChange={(e) => setOrderDialog((d) => d ? { ...d, body: e.target.value, bodyManuallyEdited: true } : d)}
                  className="mt-1 font-mono text-xs"
                />
              </div>

              {/* "Also mark as ordered" toggle. Wires the cart
                  action into the send so the operator doesn't have
                  to click both. Defaults off because some operators
                  treat the email as exploratory. */}
              <label className="flex items-start gap-2 cursor-pointer rounded-md border border-slate-200 p-2.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={orderDialog.alsoMarkOrdered}
                  onChange={(e) => setOrderDialog((d) => d ? { ...d, alsoMarkOrdered: e.target.checked } : d)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Also mark these items as ordered
                  </span>
                  <span className="text-xs text-slate-600 block mt-0.5">
                    Hides them from Buy-now for 7 days. Clear when Mark purchased writes the receive.
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex flex-wrap gap-2 w-full">
              <Button
                onClick={() => sendOrderVia("gmail")}
                disabled={!orderDialog?.supplierEmail || orderDialog?.lines.every((l) => !l.included)}
                className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                title="Opens Gmail compose in a new tab"
              >
                <Mail className="w-4 h-4" /> Gmail
              </Button>
              <Button
                onClick={() => sendOrderVia("outlook")}
                disabled={!orderDialog?.supplierEmail || orderDialog?.lines.every((l) => !l.included)}
                variant="outline"
                className="gap-1.5"
                title="Opens Outlook compose in a new tab"
              >
                <Mail className="w-4 h-4" /> Outlook
              </Button>
              <Button
                onClick={() => sendOrderVia("mailto")}
                disabled={!orderDialog?.supplierEmail || orderDialog?.lines.every((l) => !l.included)}
                variant="outline"
                className="gap-1.5"
                title="Opens your default mail app via mailto:"
              >
                <Mail className="w-4 h-4" /> Default mail
              </Button>
              <Button
                onClick={() => sendOrderVia("whatsapp")}
                disabled={!orderDialog?.supplierPhone || orderDialog?.lines.every((l) => !l.included)}
                variant="outline"
                className="gap-1.5 text-green-700 hover:bg-green-50 border-green-200"
                title="Opens WhatsApp Web / app with the message pre-filled"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </Button>
              <Button
                onClick={() => sendOrderVia("clipboard")}
                disabled={orderDialog?.lines.every((l) => !l.included)}
                variant="ghost"
                className="gap-1.5"
                title="Copy subject + body to clipboard"
              >
                Copy
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOrderDialog(null)}
                className="ml-auto"
              >
                Cancel
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div id="print-shopping-list" className="print-only">
        <h1 style={{ fontSize: "18pt", marginBottom: "6pt", fontFamily: "sans-serif" }}>
          Shopping list
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          {" - "}
          {buyNow.length} item{buyNow.length === 1 ? "" : "s"} to buy
        </p>
        {/* SHOP-D: aisle-grouped print mode. Items grouped by
            category (proxy for supermarket aisle) so the shopper
            walks the store once. Each group has its own subtotal
            line for cash reconciliation in-store. */}
        {(() => {
          const byCategory = new Map<string, typeof buyNow>();
          buyNow.forEach((r) => {
            const cat = r.category || "Uncategorised";
            const list = byCategory.get(cat) || [];
            list.push(r);
            byCategory.set(cat, list);
          });
          const groups = Array.from(byCategory.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          return (
            <>
              {groups.map(([cat, items]) => {
                const groupCost = items.reduce((s, r) => s + Number(r.cost || 0), 0);
                return (
                  <div key={cat} style={{ marginBottom: "14pt", pageBreakInside: "avoid" }}>
                    <h2 style={{ fontSize: "12pt", margin: "8pt 0 4pt", fontFamily: "sans-serif", borderBottom: "1.5pt solid #0f172a", paddingBottom: "2pt" }}>
                      {cat} <span style={{ fontSize: "9pt", color: "#64748b", fontWeight: 400 }}>({items.length} item{items.length === 1 ? "" : "s"}{canSeeFinanceAggregate ? ` - ${fmtMoney.format(groupCost)}` : ""})</span>
                    </h2>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt", fontFamily: "sans-serif" }}>
                      <thead>
                        <tr style={{ borderBottom: "1pt solid #94a3b8" }}>
                          <th style={{ width: "24pt", textAlign: "left", padding: "3pt" }}> </th>
                          <th style={{ textAlign: "left", padding: "3pt" }}>Item</th>
                          <th style={{ textAlign: "right", padding: "3pt" }}>Qty</th>
                          <th style={{ textAlign: "left", padding: "3pt" }}>Supplier</th>
                          <th style={{ textAlign: "right", padding: "3pt" }}>Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((r) => (
                          <tr key={r.inventory_item_id} style={{ borderBottom: "1px solid #cbd5e1" }}>
                            <td style={{ padding: "6pt 3pt" }}>
                              <span style={{ display: "inline-block", width: "14pt", height: "14pt", border: "1.5pt solid #0f172a", verticalAlign: "middle" }} />
                            </td>
                            <td style={{ padding: "6pt 3pt" }}>
                              <strong>{r.item_name}</strong>
                              {r.isUrgent ? <span style={{ marginLeft: "6pt", padding: "1pt 4pt", border: "1pt solid #dc2626", color: "#dc2626", fontSize: "8pt", fontWeight: 700 }}>URGENT</span> : null}
                            </td>
                            <td style={{ padding: "6pt 3pt", textAlign: "right" }}>{r.reorderQty} {r.unit_of_measure || ""}</td>
                            <td style={{ padding: "6pt 3pt" }}>{r.supplier?.supplier_name || ""}</td>
                            <td style={{ padding: "6pt 3pt", textAlign: "right", borderBottom: "0.75pt dashed #cbd5e1", minWidth: "60pt" }}>R _____</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {/* SHOP-D: signoff row so the shopper can reconcile
                  cash in store. */}
              <div style={{ marginTop: "18pt", borderTop: "2pt solid #0f172a", paddingTop: "8pt", fontSize: "10pt", fontFamily: "sans-serif", display: "flex", justifyContent: "space-between", gap: "24pt" }}>
                <div>
                  <p style={{ margin: "0 0 4pt" }}>Total spent: <strong>R _________</strong></p>
                  <p style={{ margin: 0 }}>Change / receipt #: _________________</p>
                </div>
                <div>
                  <p style={{ margin: "0 0 4pt" }}>Shopper signature:</p>
                  <p style={{ margin: 0, borderBottom: "1pt solid #0f172a", width: "180pt", height: "20pt" }}>&nbsp;</p>
                </div>
              </div>
            </>
          );
        })()}
        <p style={{ marginTop: "18pt", fontSize: "9pt", color: "#64748b", fontFamily: "sans-serif" }}>
          Generated {new Date().toLocaleString("en-ZA")} from CateringMS Smart Shopping
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 14mm; }
          body * { visibility: hidden !important; }
          #print-shopping-list, #print-shopping-list * { visibility: visible !important; }
          #print-shopping-list {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
        }
        @media not print {
          .print-only { display: none !important; }
        }
      `}</style>
    </>
  );
}

function SummaryTile({ label, value, accent, icon: Icon, hint, isMoney, tooltip }: any) {
  return (
    <Card className="border-0 shadow">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">{label}{tooltip && <InfoTooltip content={tooltip} />}</p>
          <p className={`text-2xl md:text-3xl font-bold mt-1 ${accent} ${isMoney ? "" : "tabular-nums"}`}>{value}</p>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        <Icon className={`w-8 h-8 ${accent} opacity-30`} />
      </CardContent>
    </Card>
  );
}

function ItemTable({
  rows, picked, togglePick, expandedItem, setExpandedItem, demand,
  hideSupplier, showBuyBy, showShelfLife,
  // SHOP-C: intel + action handlers passed in from the Buy-now /
  // Plan-ahead use. supplierLinks + creep drive the chips. onSnooze
  // + onMarkOrdered drive the per-row buttons. Optional - older
  // call sites (Receipts tab etc.) just don't render the bits.
  supplierLinks, creep, suppliersById, onSnooze, onMarkOrdered, rowBusy,
  canSeeFinance, withSlug,
}: any) {
  return (
    <>
      {/* SHOP-G: desktop table - hidden under sm, swapped for the
          card layout below so the 9-column row doesn't horizontal-
          scroll off-screen on a phone. */}
      <div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="w-8 py-2"></th>
            <th className="text-left py-2 pr-3">Item</th>
            <th className="text-right py-2 px-3">On hand</th>
            <th className="text-right py-2 px-3">Need 7d</th>
            <th className="text-right py-2 px-3">Reorder</th>
            <th className="text-right py-2 px-3">Cost</th>
            {showBuyBy && <th className="text-left py-2 px-3">Buy by</th>}
            {!hideSupplier && <th className="text-left py-2 px-3">Supplier</th>}
            <th className="text-left py-2 pl-3">Status</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => {
            const meta = STATUS_META[r.status] || STATUS_META.ok;
            const isOpen = expandedItem === r.inventory_item_id;
            const lines = demand.filter((d: any) => d.inventory_item_id === r.inventory_item_id);
            return (
              <>
                <tr
                  key={r.inventory_item_id}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${r.isUrgent ? "bg-amber-50/40" : ""}`}
                >
                  <td className="py-3 pl-3">
                    <input
                      type="checkbox"
                      checked={!!picked[r.inventory_item_id]}
                      onChange={() => togglePick(r.inventory_item_id)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 flex items-center gap-1.5 flex-wrap">
                          {r.item_name}
                          {r.is_perishable && <span title="Perishable"><Snowflake className="w-3 h-3 text-cyan-500" /></span>}
                          {/* SHOP-C: price-creep chip. Spar prices on
                              Green Pepper rose 8% in 90d - flag it
                              before the operator places the PO. */}
                          {canSeeFinance && r.preferred_supplier_id && creep?.[r.preferred_supplier_id]?.median_pct_change != null && Math.abs(creep[r.preferred_supplier_id].median_pct_change) >= 5 && creep[r.preferred_supplier_id].items_compared >= 2 && (() => {
                            const pct = creep[r.preferred_supplier_id].median_pct_change as number;
                            const up = pct > 0;
                            return (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${up ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                                title={`Median per-item price change for ${r.supplier?.supplier_name || "this supplier"} vs 60-120d ago`}
                              >
                                {up ? "+" : ""}{pct.toFixed(0)}% supplier
                              </Badge>
                            );
                          })()}
                          {/* SHOP-C: cheaper-alternative chip. When
                              another linked supplier offers the same
                              item at a lower unit_price, surface it
                              so the operator can swap before buying. */}
                          {(() => {
                            const links = supplierLinks?.[r.inventory_item_id] || [];
                            const myUnit = Number(r.cost_per_unit || 0);
                            if (myUnit <= 0 || links.length < 2) return null;
                            const cheaper = links
                              .filter((l: ItemSupplierLink) => l.supplier_id !== r.preferred_supplier_id && l.unit_price != null && l.unit_price > 0 && l.unit_price < myUnit)
                              .sort((a: ItemSupplierLink, b: ItemSupplierLink) => Number(a.unit_price) - Number(b.unit_price))[0];
                            if (!cheaper) return null;
                            const pct = Math.round((1 - Number(cheaper.unit_price) / myUnit) * 100);
                            const cheaperName = suppliersById?.[cheaper.supplier_id]?.supplier_name || "Another supplier";
                            return (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                                title={`${cheaperName} ${canSeeFinance ? `: ${fmtMoney.format(Number(cheaper.unit_price))} per unit` : ""} - ${pct}% cheaper`}
                              >
                                {cheaperName} -{pct}%
                              </Badge>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.category || "Uncategorised"}{showShelfLife && r.shelf_life_days ? ` - ${r.shelf_life_days}d shelf life` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    {Number(r.current_stock).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                    {Number(r.demand_next_7_days).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-slate-900">
                    {Number(r.reorderQty).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-700">
                    {fmtMoney.format(r.cost)}
                  </td>
                  {showBuyBy && (
                    <td className="py-3 px-3 text-xs">
                      {r.buyBy ? (
                        <span className={`flex items-center gap-1 ${r.isUrgent ? "text-orange-600 font-semibold" : "text-slate-600"}`}>
                          {r.isUrgent && (
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                            </span>
                          )}
                          {r.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          {r.buyByDays !== null && (
                            <span className="text-slate-400 ml-1">({r.buyByDays}d)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">Any time</span>
                      )}
                    </td>
                  )}
                  {!hideSupplier && (
                    <td className="py-3 px-3 text-xs text-slate-600 truncate max-w-[180px]">
                      {r.supplier?.supplier_name || <span className="text-slate-400">—</span>}
                    </td>
                  )}
                  <td className="py-3 pl-3">
                    <Badge variant="outline" className={`${meta.tone} border`}>{meta.label}</Badge>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-1 justify-end">
                      {/* SHOP-C: Mark-as-ordered + Snooze. Both are
                          guarded by onMarkOrdered / onSnooze so call
                          sites that don't pass them (Plan ahead /
                          Receipts) just don't render. */}
                      {onMarkOrdered && (
                        <button
                          type="button"
                          onClick={() => onMarkOrdered(r.inventory_item_id, r.reorderQty, 7)}
                          disabled={!!rowBusy?.[r.inventory_item_id]}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                          title="Already ordered this from your supplier? Marks the line as in-flight so it stops flagging as shortfall. 7-day ETA, undo available."
                        >
                          <Truck className="w-3 h-3" />
                          Mark ordered
                        </button>
                      )}
                      {onSnooze && (
                        <button
                          type="button"
                          onClick={() => onSnooze(r.inventory_item_id, 7)}
                          disabled={!!rowBusy?.[r.inventory_item_id]}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          title="Snooze - hides this item from Buy-now for 7 days"
                        >
                          Snooze 7d
                        </button>
                      )}
                      {lines.length > 0 && (
                        <button
                          onClick={() => setExpandedItem(isOpen ? null : r.inventory_item_id)}
                          className="text-slate-400 hover:text-slate-700"
                          title={`${lines.length} order${lines.length === 1 ? "" : "s"} pulling on this`}
                        >
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && lines.length > 0 && (
                  <tr key={`${r.inventory_item_id}-d`} className="bg-slate-50">
                    <td colSpan={showBuyBy ? (hideSupplier ? 9 : 10) : (hideSupplier ? 8 : 9)} className="px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Pulled by upcoming orders
                      </div>
                      <div className="space-y-1">
                        {lines.map((l: any, i: number) => (
                          <div key={`${l.order_number}-${i}`} className="flex items-center justify-between text-xs py-1">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* SHOP-C: deep-link to the order. Lets
                                  the shopper jump straight to the
                                  wedding/event that's pulling on the
                                  item rather than searching for it. */}
                              {withSlug ? (
                                <Link href={withSlug(`/admin/orders?q=${encodeURIComponent(l.order_number)}`)} className="hover:underline">
                                  <Badge variant="outline" className="text-[10px] hover:bg-slate-100">{l.order_number}</Badge>
                                </Link>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">{l.order_number}</Badge>
                              )}
                              <span className="text-slate-700 truncate">{l.event_name}</span>
                              <span className="text-slate-500 hidden sm:inline">via {l.menu_item_name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-600">
                              <span className="tabular-nums">{Number(l.quantity_required).toLocaleString()} {l.unit}</span>
                              <span className="text-slate-500">{new Date(l.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* SHOP-G: mobile card fallback. Same data, vertical stack
          per row. Below sm only - desktop keeps the table. */}
      <div className="sm:hidden divide-y divide-slate-100">
        {rows.map((r: any) => {
          const meta = STATUS_META[r.status] || STATUS_META.ok;
          const isOpen = expandedItem === r.inventory_item_id;
          const lines = demand.filter((d: any) => d.inventory_item_id === r.inventory_item_id);
          const myUnit = Number(r.cost_per_unit || 0);
          const links = supplierLinks?.[r.inventory_item_id] || [];
          const cheaperLink = myUnit > 0 && links.length >= 2
            ? [...links]
                .filter((l: ItemSupplierLink) => l.supplier_id !== r.preferred_supplier_id && l.unit_price != null && l.unit_price > 0 && l.unit_price < myUnit)
                .sort((a: ItemSupplierLink, b: ItemSupplierLink) => Number(a.unit_price) - Number(b.unit_price))[0]
            : null;
          return (
            <div key={r.inventory_item_id} className={`p-3 ${r.isUrgent ? "bg-amber-50/40" : ""}`}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={!!picked[r.inventory_item_id]}
                  onChange={() => togglePick(r.inventory_item_id)}
                  className="w-5 h-5 rounded border-slate-300 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-slate-900">{r.item_name}</span>
                    {r.is_perishable && <Snowflake className="w-3 h-3 text-cyan-500 shrink-0" />}
                    <Badge variant="outline" className={`${meta.tone} border text-[10px]`}>{meta.label}</Badge>
                    {canSeeFinance && r.preferred_supplier_id && creep?.[r.preferred_supplier_id]?.median_pct_change != null && Math.abs(creep[r.preferred_supplier_id].median_pct_change) >= 5 && creep[r.preferred_supplier_id].items_compared >= 2 && (() => {
                      const pct = creep[r.preferred_supplier_id].median_pct_change as number;
                      return (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${pct > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                        >
                          {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
                        </Badge>
                      );
                    })()}
                    {cheaperLink && (() => {
                      const pct = Math.round((1 - Number(cheaperLink.unit_price) / myUnit) * 100);
                      const cheaperName = suppliersById?.[cheaperLink.supplier_id]?.supplier_name || "Other";
                      return (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          {cheaperName} -{pct}%
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {r.category || "Uncategorised"}{showShelfLife && r.shelf_life_days ? ` · ${r.shelf_life_days}d shelf` : ""}
                  </div>

                  {/* 2-col data grid. Each cell has label + value. */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-xs">
                    <div>
                      <span className="text-slate-500">On hand: </span>
                      <span className="font-medium text-slate-900 tabular-nums">
                        {Number(r.current_stock).toLocaleString()} {r.unit_of_measure}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Need 7d: </span>
                      <span className="font-medium text-slate-900 tabular-nums">
                        {Number(r.demand_next_7_days).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Reorder: </span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {Number(r.reorderQty).toLocaleString()} {r.unit_of_measure}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Cost: </span>
                      <span className="font-medium text-slate-900 tabular-nums">
                        {fmtMoney.format(r.cost)}
                      </span>
                    </div>
                    {showBuyBy && (
                      <div className="col-span-2">
                        <span className="text-slate-500">Buy by: </span>
                        {r.buyBy ? (
                          <span className={`inline-flex items-center gap-1 ${r.isUrgent ? "text-orange-600 font-semibold" : "text-slate-700"}`}>
                            {r.isUrgent && (
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                              </span>
                            )}
                            {r.buyBy.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                            {r.buyByDays !== null && (
                              <span className="text-slate-400 ml-1">({r.buyByDays}d)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">Any time</span>
                        )}
                      </div>
                    )}
                    {!hideSupplier && (
                      <div className="col-span-2">
                        <span className="text-slate-500">Supplier: </span>
                        <span className="text-slate-700">{r.supplier?.supplier_name || "-"}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions row */}
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {onMarkOrdered && (
                      <button
                        type="button"
                        onClick={() => onMarkOrdered(r.inventory_item_id, r.reorderQty, 7)}
                        disabled={!!rowBusy?.[r.inventory_item_id]}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 min-h-[32px]"
                        title="Marks the line as in-flight - hides it from Buy-now for 7 days. Undo available."
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Mark ordered
                      </button>
                    )}
                    {onSnooze && (
                      <button
                        type="button"
                        onClick={() => onSnooze(r.inventory_item_id, 7)}
                        disabled={!!rowBusy?.[r.inventory_item_id]}
                        className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[32px]"
                      >
                        Snooze 7d
                      </button>
                    )}
                    {lines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedItem(isOpen ? null : r.inventory_item_id)}
                        className="ml-auto text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 min-h-[32px] px-1"
                      >
                        {lines.length} pull{lines.length === 1 ? "" : "s"}
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isOpen && lines.length > 0 && (
                <div className="mt-3 ml-7 pl-2 border-l border-slate-200 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Pulled by upcoming orders
                  </div>
                  {lines.map((l: any, i: number) => (
                    <div key={`${l.order_number}-${i}`} className="text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        {withSlug ? (
                          <Link href={withSlug(`/admin/orders?q=${encodeURIComponent(l.order_number)}`)}>
                            <Badge variant="outline" className="text-[10px] hover:bg-slate-100">{l.order_number}</Badge>
                          </Link>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{l.order_number}</Badge>
                        )}
                        <span className="text-slate-700 truncate">{l.event_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {Number(l.quantity_required).toLocaleString()} {l.unit} · {new Date(l.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} · via {l.menu_item_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// SHP-B (shopping audit, SHP-3): admit shopping_staff (own the
// buy-now flow + receipts) + region_admin (regional read). RLS
// narrows per-region writes.
export default function ProtectedShopping() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SHOPPING_STAFF, UserRole.REGION_ADMIN]}>
      <SmartShoppingPage />
    </ProtectedRoute>
  );
}
