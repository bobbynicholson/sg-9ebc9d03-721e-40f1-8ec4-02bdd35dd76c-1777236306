/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/payables - the supplier-payables ledger.
 *
 * Owner / admin types in each supplier invoice they owe with the
 * supplier, amount and due-date. Marking paid flips the status and
 * writes an audit_logs row. The cashflow forecast on
 * /admin/cashflow-dashboard reads from this table (PR-E) so every
 * scheduled cash-out appears on the day-by-day chart.
 *
 * Owner / company_admin / super_admin only per the Skylight
 * finance-visibility rule (canAccessFinance; plain admin is
 * deliberately excluded). Gated via ProtectedRoute below.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, CheckCircle2, AlertTriangle, Trash2, Upload, Wallet, Search, CalendarClock } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader, PortalCard,
  PageWorkbench,
} from "@/components/portal/ui";
import { CashflowContextBanner } from "@/components/admin/financial/CashflowContextBanner";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  supplierPayablesService,
  type SupplierPayable,
  type PayableStatus,
} from "@/services/supplierPayablesService";
import { formatZAR } from "@/lib/formatters";
import { DEFAULT_TENANT_TIMEZONE, parseLocalDay, toLocalISO, toZonedISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

/**
 * Bulk-import row shape. One entry per CSV line after parsing /
 * validation. `error` is set when the row can't be saved (missing
 * supplier match, bad amount, bad date). Rows with errors are skipped
 * on import - the rest still go through, and the result panel reports
 * the split.
 */
interface BulkRow {
  line: number;
  supplier_name: string;
  supplier_id: string | null;
  amount_cents: number;
  due_date: string;
  invoice_ref: string | null;
  notes: string | null;
  error: string | null;
  /** Non-blocking caution (e.g. looks like a duplicate of an existing
   *  payable). The row still imports; the operator just gets told. */
  warning: string | null;
}

/**
 * Split a CSV line on commas, honouring double-quoted fields so
 * something like `"Acme, Ltd",1500,2026-06-01` parses as 3 fields
 * not 4. Good enough for hand-typed and Excel-exported CSVs;
 * doesn't try to be a full RFC 4180 parser.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse a money cell. Strips currency symbols (R, $, £, €), spaces,
 * and thousands-separator commas. Returns NaN if the result isn't a
 * positive number so the row can be flagged.
 */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[R$£€\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * Parse a date cell. Accepts ISO (YYYY-MM-DD), DD/MM/YYYY, or
 * YYYY/MM/DD. Returns ISO string or null on failure. We default to
 * day-first because the tenant base is SA/UK; if the input is
 * ambiguous (e.g. 03/04/2026) day-first is what users expect.
 */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/);
  if (slash) {
    const [, a, b, c] = slash;
    // YYYY/MM/DD
    if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    // DD/MM/YYYY (SA / UK convention)
    if (c.length === 4) return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  // Last-ditch attempt via Date - catches "1 June 2026" etc.
  // Audit fix (2026-07-02): format from LOCAL date components, not
  // toISOString(). The native parser returns local midnight for
  // "1 June 2026", and toISOString() converts to UTC - for any
  // browser east of UTC (SA is UTC+2) that lands on 22:00 of the
  // PREVIOUS day, so the slice imported every such row one day early.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  return null;
}

/**
 * Build the bulk preview. Header row auto-detected if first line
 * contains the word "supplier" or "amount" - that line gets skipped.
 * Required columns: supplier_name, amount, due_date. Optional:
 * invoice_ref, notes.
 */
function parseBulkCsv(
  csv: string,
  suppliers: Array<{ id: string; supplier_name: string }>,
  existing: SupplierPayable[],
): BulkRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const supLookup = new Map(suppliers.map((s) => [s.supplier_name.trim().toLowerCase(), s.id]));
  // Audit fix (2026-07-02): duplicate detection. Re-pasting last
  // week's CSV used to silently double every payable (and double the
  // forecast outflow). Match against existing NON-deleted pending
  // rows by invoice_ref, or by supplier + amount + due date; also
  // catch repeats inside the paste itself. Non-blocking - a supplier
  // can genuinely invoice the same amount twice - but flagged loudly.
  const existingRefs = new Set(
    existing
      .filter((p) => p.status === "pending" && p.invoice_ref)
      .map((p) => String(p.invoice_ref).trim().toLowerCase()),
  );
  const existingKeys = new Set(
    existing
      .filter((p) => p.status === "pending")
      .map((p) => `${p.supplier_id || ""}|${p.amount_cents}|${p.due_date}`),
  );
  const seenInPaste = new Set<string>();
  const out: BulkRow[] = [];
  const startsWithHeader = /supplier|amount/i.test(lines[0]);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && startsWithHeader) continue;
    const cols = splitCsvLine(lines[i]);
    const supplierName = cols[0] || "";
    const amountRaw = cols[1] || "";
    const dueRaw = cols[2] || "";
    const invoiceRef = (cols[3] || "").trim() || null;
    const notes = (cols[4] || "").trim() || null;
    const errs: string[] = [];
    if (!supplierName) errs.push("supplier name missing");
    const supId = supLookup.get(supplierName.trim().toLowerCase()) || null;
    if (supplierName && !supId) errs.push(`no supplier matched "${supplierName}"`);
    const amt = parseAmount(amountRaw);
    if (!Number.isFinite(amt)) errs.push(`bad amount "${amountRaw}"`);
    const due = parseDate(dueRaw);
    if (!due) errs.push(`bad date "${dueRaw}"`);
    const amountCents = Number.isFinite(amt) ? Math.round(amt * 100) : 0;
    const warns: string[] = [];
    if (errs.length === 0) {
      const key = `${supId || ""}|${amountCents}|${due}`;
      if (invoiceRef && existingRefs.has(invoiceRef.toLowerCase())) {
        warns.push(`a pending payable already carries ref "${invoiceRef}"`);
      } else if (existingKeys.has(key)) {
        warns.push("a pending payable with the same supplier, amount and due date already exists");
      }
      if (seenInPaste.has(key)) warns.push("repeated inside this paste");
      seenInPaste.add(key);
    }
    out.push({
      line: i + 1,
      supplier_name: supplierName,
      supplier_id: supId,
      amount_cents: amountCents,
      due_date: due || "",
      invoice_ref: invoiceRef,
      notes,
      error: errs.length ? errs.join("; ") : null,
      warning: warns.length ? warns.join("; ") : null,
    });
  }
  return out;
}

export default function ProtectedPayablesPage() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN,
    ]}>
      <PayablesPage />
    </ProtectedRoute>
  );
}

function PayablesPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const companyId = (user as any)?.company_id || (profile as any)?.company_id;
  const userId = (user as any)?.id || null;
  const currency = (user as any)?.currency || "ZAR";
  // Money display goes through formatZAR (the platform-wide money
  // formatter) so payables reads "R 12 500.00" like every other
  // finance surface, not the old toFixed "R12500.00".
  const fmt = (a: number, c: string) => formatZAR(a, { currency: c });

  const [rows, setRows] = useState<SupplierPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PayableStatus | "all">("pending");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplier_name: string }>>([]);
  // Overdue is judged against the TENANT's calendar day, not the
  // operator's browser clock - a payable shouldn't flip overdue early
  // or late because the bookkeeper is travelling in another timezone.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", companyId)
        .maybeSingle();
      if (!cancelled) setTenantTimezone((data as any)?.timezone || DEFAULT_TENANT_TIMEZONE);
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  const todayISO = toZonedISO(new Date(), tenantTimezone || DEFAULT_TENANT_TIMEZONE);

  const [dialogOpen, setDialogOpen] = useState(false);
  // Text search across supplier / ref / notes. Lives in the toolbar
  // card next to the status filter.
  const [search, setSearch] = useState("");
  // AlertDialog-confirmed delete target.
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    supplier_id: "" as string,
    amount: "",
    due_date: "",
    invoice_ref: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Bulk-import state. Lets admin paste a CSV of payables instead of typing
  // each row in the single-row dialog. Common case: opening a new month
  // with 20+ supplier invoices from the prior week's deliveries.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkRow[] | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Always pull ALL statuses and slice client-side. Pre-audit the
      // status filter was applied server-side, so with the "Paid"
      // filter active the "Pending total" tile summed over paid rows
      // only and reported a fake R 0.00 pending. The ledger is small
      // (tens of rows), one full pull is cheaper than a refetch per
      // filter flip anyway.
      const [data, sups] = await Promise.all([
        supplierPayablesService.list(companyId, { status: "all", throwOnError: true }),
        (supabase as any)
          .from("suppliers")
          .select("id, supplier_name")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("supplier_name", { ascending: true }),
      ]);
      // Suppliers feed the Add dialog + bulk-import matching; a
      // silent failure there means every bulk row "fails to match"
      // with no explanation. Surface it with the same error state.
      if (sups?.error) throw sups.error;
      setRows(data);
      setSuppliers((sups?.data || []) as Array<{ id: string; supplier_name: string }>);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load payables. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Client-side status slice + text search for the list. Tiles + hero
  // chips always compute off the full set so they stay truthful under
  // any filter.
  const visibleRows = useMemo(() => {
    const byStatus = filter === "all" ? rows : rows.filter((r) => r.status === filter);
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((r) =>
      (r.supplier?.supplier_name || "").toLowerCase().includes(q)
      || (r.invoice_ref || "").toLowerCase().includes(q)
      || (r.notes || "").toLowerCase().includes(q));
  }, [rows, filter, search]);

  const handleCreate = async () => {
    if (!companyId) return;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Amount required", description: "Enter a positive amount", variant: "destructive" });
      return;
    }
    if (!draft.due_date) {
      toast({ title: "Due date required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const row = await supplierPayablesService.create({
      company_id: companyId,
      supplier_id: draft.supplier_id || null,
      amount_cents: Math.round(amount * 100),
      due_date: draft.due_date,
      invoice_ref: draft.invoice_ref || null,
      notes: draft.notes || null,
      created_by: userId,
    });
    setSaving(false);
    if (row) {
      toast({ title: "Payable added", description: `Due ${draft.due_date}` });
      setDialogOpen(false);
      setDraft({ supplier_id: "", amount: "", due_date: "", invoice_ref: "", notes: "" });
      void load();
    } else {
      toast({ title: "Couldn't save", variant: "destructive" });
    }
  };

  const handleMarkPaid = async (id: string) => {
    const row = await supplierPayablesService.markPaid(id, userId);
    if (row) {
      toast({ title: "Marked paid", description: "Forecast refreshed next page load." });
      void load();
    } else {
      // Pre-audit this failed in silence - the button did nothing and
      // the operator assumed the payable was settled.
      toast({ title: "Couldn't mark paid", description: "The update didn't save. Try again.", variant: "destructive" });
    }
  };

  const openBulk = () => {
    setBulkCsv("");
    setBulkPreview(null);
    setBulkResult(null);
    setBulkOpen(true);
  };

  const handleBulkPreview = () => {
    setBulkPreview(parseBulkCsv(bulkCsv, suppliers, rows));
    setBulkResult(null);
  };

  const handleBulkImport = async () => {
    if (!companyId || !bulkPreview) return;
    const valid = bulkPreview.filter((r) => !r.error);
    if (valid.length === 0) {
      toast({ title: "Nothing to import", description: "All rows have errors. Fix them first.", variant: "destructive" });
      return;
    }
    setBulkImporting(true);
    // Sequential to keep RLS-friendly error capture per row. Cost is
    // 20-50ms per row; for the usual 20-50 row import that's <2s.
    let ok = 0;
    let failed = 0;
    for (const r of valid) {
      const row = await supplierPayablesService.create({
        company_id: companyId,
        supplier_id: r.supplier_id,
        amount_cents: r.amount_cents,
        due_date: r.due_date,
        invoice_ref: r.invoice_ref,
        notes: r.notes,
        created_by: userId,
      });
      if (row) ok++; else failed++;
    }
    setBulkImporting(false);
    setBulkResult({ ok, failed });
    if (ok > 0) {
      toast({
        title: `Imported ${ok} payable${ok === 1 ? "" : "s"}`,
        description: failed > 0 ? `${failed} failed - check the report below.` : "Cashflow forecast picks them up on next load.",
      });
      void load();
    } else {
      toast({ title: "Import failed", description: "No rows saved. Check supplier names and amounts.", variant: "destructive" });
    }
  };

  // Audit fix (2026-07-02): delete confirm moved from window.confirm
  // to the same AlertDialog pattern Fixed costs uses - consistent
  // look, works with keyboard / screen readers, and can't be blocked
  // by a browser's suppress-dialogs setting.
  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const ok = await supplierPayablesService.softDelete(deleteId);
    setDeleteId(null);
    if (ok) {
      toast({ title: "Removed" });
      void load();
    } else {
      toast({ title: "Couldn't remove", description: "The delete didn't save. Try again.", variant: "destructive" });
    }
  };

  // Money math stays in integer cents; the /100 happens only at the
  // fmt() display boundary.
  const pendingRows = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const totalPendingCents = useMemo(
    () => pendingRows.reduce((s, r) => s + r.amount_cents, 0),
    [pendingRows],
  );
  const overdueCount = useMemo(
    () => pendingRows.filter((r) => r.due_date < todayISO).length,
    [pendingRows, todayISO],
  );
  // Pending amount falling due inside the next 30 days - the exact
  // slice the cashflow forecast subtracts, so this tile matches the
  // "Supplier payables (next 30d)" row on the two dashboards.
  const dueNext30Cents = useMemo(() => {
    const anchor = parseLocalDay(todayISO);
    if (!anchor) return 0;
    const horizon = new Date(anchor);
    horizon.setDate(horizon.getDate() + 30);
    const horizonISO = toLocalISO(horizon);
    return pendingRows
      .filter((r) => r.due_date >= todayISO && r.due_date <= horizonISO)
      .reduce((s, r) => s + r.amount_cents, 0);
  }, [pendingRows, todayISO]);

  return (
    <>
      <Head>
        <title>Payables - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Payables"
            icon={Wallet}
            subtitle={
              <>
                {/* Audit fix (2026-07-02): the forecast moved off the
                    financial dashboard to the dedicated cashflow page;
                    the link still pointed at the old home. */}
                Outstanding supplier invoices. Drives the cashflow forecast on{" "}
                <Link
                  href={withSlug("/admin/cashflow-dashboard")}
                  className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                >
                  Cashflow dashboard
                </Link>
                .
              </>
            }
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {pendingRows.length} pending invoice{pendingRows.length === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {fmt(totalPendingCents / 100, currency)} owed
                  </span>
                  {overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {overdueCount} overdue
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <>
                <Button onClick={openBulk} variant="outline">
                  <Upload className="w-4 h-4 mr-1.5" />
                  Bulk import
                </Button>
                <Button onClick={() => setDialogOpen(true)} className="bg-brand-primary hover:bg-brand-primary/90">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add payable
                </Button>
              </>
            }
          />
          <PageWorkbench />
          <CashflowContextBanner message="Payables here feed the 30-day forecast outflow. Add a missing one to sharpen the projection." />

          {/* Load failure: loud recovery card instead of tiles full of
              fake zeros over an empty list. */}
          {loadError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-rose-900 mb-1">Couldn&apos;t load payables</h2>
              <p className="text-sm text-slate-600 mb-3">{loadError}</p>
              <Button onClick={load} size="sm" className="bg-brand-primary hover:bg-brand-primary/90" disabled={loading}>
                Retry
              </Button>
            </div>
          )}

          {!loadError && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Pending total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-slate-900">
                  {fmt(totalPendingCents / 100, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Across {pendingRows.length} invoice{pendingRows.length === 1 ? "" : "s"}</p>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600 flex items-center gap-1">
                  Overdue {overdueCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold tabular-nums ${overdueCount > 0 ? "text-amber-700" : "text-slate-900"}`}>
                  {overdueCount}
                </div>
                <p className="text-xs text-slate-500 mt-1">Past their due date</p>
              </CardContent>
            </Card>
            {/* Restructure (2026-07-02): the third tile used to hold
                the status filter, which belongs in the toolbar below.
                It now shows the 30-day due slice - the exact number
                the cashflow forecast subtracts for payables. */}
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                  Due in next 30 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-slate-900">
                  {fmt(dueNext30Cents / 100, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Feeds the cashflow forecast outflow</p>
              </CardContent>
            </Card>
          </div>

          {/* Toolbar: search + status filter in one card, per the
              command-centre standard. */}
          <PortalCard className="mb-6 !p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search supplier, invoice ref or notes..."
                  className="pl-9"
                  aria-label="Search payables"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as PayableStatus | "all")}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                  <SelectItem value="written_off">Written off</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </PortalCard>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading...</div>
              ) : visibleRows.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-sm text-slate-500">
                    {search.trim()
                      ? `No payables match "${search.trim()}".`
                      : `No ${filter === "all" ? "" : filter.replace("_", " ") + " "}payables${rows.length > 0 && filter !== "all" ? ` (${rows.length} in All)` : ""}.`}
                  </p>
                  {search.trim() && (
                    <Button onClick={() => setSearch("")} variant="outline" size="sm" className="mt-3">
                      Clear search
                    </Button>
                  )}
                  {rows.length === 0 && (
                    <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm" className="mt-3">
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add your first payable
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {visibleRows.map((r) => {
                    const isOverdue = r.status === "pending" && r.due_date < todayISO;
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50 sm:flex-nowrap sm:gap-4">
                        <div className="flex-1 min-w-[10rem]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900">
                              {r.supplier?.supplier_name || "Unknown supplier"}
                            </span>
                            {r.invoice_ref && (
                              <span className="text-xs text-slate-500">{r.invoice_ref}</span>
                            )}
                            {isOverdue && (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-200">
                                Overdue
                              </Badge>
                            )}
                            {r.status === "paid" && (
                              <Badge variant="secondary" className="bg-brand-primary/15 text-brand-primary border border-brand-primary/20">
                                Paid
                              </Badge>
                            )}
                            {r.status === "disputed" && (
                              <Badge variant="secondary" className="bg-rose-100 text-rose-800 border border-rose-200">
                                Disputed
                              </Badge>
                            )}
                            {/* Audit fix (2026-07-02): written_off had
                                no badge, so in the All view those rows
                                were indistinguishable from pending. */}
                            {r.status === "written_off" && (
                              <Badge variant="secondary" className="bg-slate-100 text-slate-600 border border-slate-200">
                                Written off
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Due {r.due_date}{r.notes ? ` - ${r.notes}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums text-slate-900">
                            {fmt(r.amount_cents / 100, currency)}
                          </div>
                        </div>
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkPaid(r.id)}
                            title="Mark this payable as paid"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Mark paid
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(r.id)}
                          title="Remove this payable"
                          aria-label={`Remove payable from ${r.supplier?.supplier_name || "unknown supplier"}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          </>
          )}
        </PortalShell>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add payable</DialogTitle>
            <DialogDescription>Record an invoice you owe a supplier so the cashflow forecast picks it up.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={draft.supplier_id} onValueChange={(v) => setDraft({ ...draft, supplier_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* First-day tenant edge: with no suppliers the picker is
                  an empty dropdown with no explanation. Saving without
                  one still works, the row just reads "Unknown supplier". */}
              {suppliers.length === 0 && (
                <p className="text-xs text-slate-500">
                  No suppliers on file yet. You can save without one, or{" "}
                  <Link href={withSlug("/admin/suppliers")} className="font-medium text-brand-primary underline underline-offset-2">
                    add suppliers
                  </Link>{" "}
                  first so payables stay matched.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Amount ({currency})</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="12500.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice reference (optional)</Label>
              <Input
                value={draft.invoice_ref}
                onChange={(e) => setDraft({ ...draft, invoice_ref: e.target.value })}
                placeholder="INV-1234"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
              {saving ? "Saving..." : "Add payable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this payable?</AlertDialogTitle>
            <AlertDialogDescription>
              The row will be soft-deleted and drops out of the cashflow forecast immediately. Support can restore it if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-rose-600 hover:bg-rose-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk import payables</DialogTitle>
            <DialogDescription>
              Paste CSV rows. Format: <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supplier_name, amount, due_date, invoice_ref, notes</code>.
              Header row optional. Dates: <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">YYYY-MM-DD</code> or <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">DD/MM/YYYY</code>. Amounts can include the currency symbol and commas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              rows={8}
              value={bulkCsv}
              onChange={(e) => { setBulkCsv(e.target.value); setBulkPreview(null); setBulkResult(null); }}
              placeholder={`supplier_name, amount, due_date, invoice_ref, notes\nFresh Produce Co, R 2,450.00, 2026-06-15, INV-8821, Weekly veg drop\nKwik Meats, 8900, 15/06/2026, INV-553, `}
              className="font-mono text-xs"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-slate-500">
                {bulkPreview === null
                  ? `${suppliers.length} suppliers available for matching.`
                  : `${bulkPreview.filter((r) => !r.error).length} ready, ${bulkPreview.filter((r) => r.error).length} need fixing.`}
              </p>
              <Button variant="outline" size="sm" onClick={handleBulkPreview} disabled={!bulkCsv.trim()}>
                Preview rows
              </Button>
            </div>

            {bulkPreview && bulkPreview.length > 0 && (
              <div className="border rounded-md max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-slate-600">
                      <th className="px-2 py-1.5 font-medium">#</th>
                      <th className="px-2 py-1.5 font-medium">Supplier</th>
                      <th className="px-2 py-1.5 font-medium text-right">Amount</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 font-medium">Ref</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.map((r) => (
                      <tr key={r.line} className={r.error ? "bg-rose-50" : r.warning ? "bg-amber-50" : ""}>
                        <td className="px-2 py-1.5 tabular-nums text-slate-400">{r.line}</td>
                        <td className="px-2 py-1.5">
                          <div className="font-medium text-slate-900">{r.supplier_name || <span className="text-slate-400 italic">missing</span>}</div>
                          {r.supplier_id && <div className="text-[10px] text-brand-primary">matched</div>}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-right">
                          {r.amount_cents > 0 ? fmt(r.amount_cents / 100, currency) : <span className="text-rose-600">-</span>}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {r.due_date || <span className="text-rose-600">-</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{r.invoice_ref || ""}</td>
                        <td className="px-2 py-1.5">
                          {r.error
                            ? <span className="text-rose-700 text-[11px]">{r.error}</span>
                            : r.warning
                              ? <span className="text-amber-700 text-[11px]">Ready, but {r.warning}</span>
                              : <span className="text-brand-primary text-[11px]">Ready</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {bulkResult && (
              <div className={`rounded-md border px-3 py-2 text-sm ${bulkResult.failed === 0 ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                Imported <strong>{bulkResult.ok}</strong> payable{bulkResult.ok === 1 ? "" : "s"}.
                {bulkResult.failed > 0 && <> {bulkResult.failed} failed - check the rows still flagged above.</>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkImporting}>Close</Button>
            <Button
              onClick={handleBulkImport}
              disabled={bulkImporting || !bulkPreview || bulkPreview.filter((r) => !r.error).length === 0}
              className="bg-brand-primary hover:bg-brand-primary/90"
            >
              {bulkImporting
                ? "Importing..."
                : bulkPreview
                  ? `Import ${bulkPreview.filter((r) => !r.error).length} ready row${bulkPreview.filter((r) => !r.error).length === 1 ? "" : "s"}`
                  : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
