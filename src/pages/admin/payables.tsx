/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/payables - the supplier-payables ledger.
 *
 * Owner / admin types in each supplier invoice they owe with the
 * supplier, amount and due-date. Marking paid flips the status and
 * writes an audit_logs row. The cashflow forecast on
 * /admin/financial-dashboard reads from this table (PR-E) so every
 * scheduled cash-out appears on the day-by-day chart.
 *
 * Owner / company_admin / admin / super_admin only per the Skylight
 * finance-visibility rule. Gated upstream via ProtectedRoute.
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
import { Plus, CheckCircle2, AlertTriangle, Trash2, Upload, Wallet } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
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
import * as currencyUtils from "@/lib/currencyUtils";
import { toLocalISO } from "@/lib/localDate";

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
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
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
): BulkRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const supLookup = new Map(suppliers.map((s) => [s.supplier_name.trim().toLowerCase(), s.id]));
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
    out.push({
      line: i + 1,
      supplier_name: supplierName,
      supplier_id: supId,
      amount_cents: Number.isFinite(amt) ? Math.round(amt * 100) : 0,
      due_date: due || "",
      invoice_ref: invoiceRef,
      notes,
      error: errs.length ? errs.join("; ") : null,
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
  const companyId = (user as any)?.company_id || (profile as any)?.company_id;
  const userId = (user as any)?.id || null;
  const currency = (user as any)?.currency || "ZAR";
  const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;

  const [rows, setRows] = useState<SupplierPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PayableStatus | "all">("pending");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplier_name: string }>>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
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
    const [data, sups] = await Promise.all([
      supplierPayablesService.list(companyId, { status: filter }),
      (supabase as any)
        .from("suppliers")
        .select("id, supplier_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("supplier_name", { ascending: true }),
    ]);
    setRows(data);
    setSuppliers((sups?.data || []) as Array<{ id: string; supplier_name: string }>);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, filter]);

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
    }
  };

  const openBulk = () => {
    setBulkCsv("");
    setBulkPreview(null);
    setBulkResult(null);
    setBulkOpen(true);
  };

  const handleBulkPreview = () => {
    const rows = parseBulkCsv(bulkCsv, suppliers);
    setBulkPreview(rows);
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

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this payable? Soft-delete - can be restored by support.")) return;
    const ok = await supplierPayablesService.softDelete(id);
    if (ok) {
      toast({ title: "Removed" });
      void load();
    }
  };

  const totalPending = useMemo(
    () => rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount_cents, 0) / 100,
    [rows],
  );
  const overdueCount = useMemo(() => {
    const today = toLocalISO(new Date());
    return rows.filter((r) => r.status === "pending" && r.due_date < today).length;
  }, [rows]);

  return (
    <>
      <Head>
        <title>Payables - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Payables"
            icon={Wallet}
            subtitle={
              <>
                Outstanding supplier invoices. Drives the cashflow forecast on{" "}
                <Link href="/admin/financial-dashboard" className="text-blue-600 hover:underline">
                  Financial dashboard
                </Link>
                .
              </>
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
          <CashflowContextBanner message="Payables here feed the 30-day forecast outflow. Add a missing one to sharpen the projection." />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Pending total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-slate-900">
                  {fmt(totalPending, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Across {rows.filter(r => r.status === "pending").length} invoices</p>
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
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Filter</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={filter} onValueChange={(v) => setFilter(v as PayableStatus | "all")}>
                  <SelectTrigger className="w-full">
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
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading...</div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  No {filter === "all" ? "" : filter} payables.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const today = toLocalISO(new Date());
                    const isOverdue = r.status === "pending" && r.due_date < today;
                    return (
                      <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
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
                          onClick={() => handleDelete(r.id)}
                          title="Remove this payable"
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
                      <tr key={r.line} className={r.error ? "bg-rose-50" : ""}>
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
