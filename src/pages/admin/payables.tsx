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
import { Plus, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import Head_ from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
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

export default function ProtectedPayablesPage() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN,
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
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((r) => r.status === "pending" && r.due_date < today).length;
  }, [rows]);

  return (
    <>
      <Head>
        <title>Payables - Admin</title>
      </Head>
      <NoIndexMeta />
      <AdminNav />
      {/* Match the standard admin layout (AdminNav is a fixed sidebar
          at lg+). Without lg:ml-64 xl:ml-72 the page contents render
          under the sidebar and the cards sit behind the menu. */}
      <div className="min-h-screen bg-slate-50 lg:ml-64 xl:ml-72">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
          <div className="flex items-start justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Payables</h1>
              <p className="text-sm text-slate-600 mt-1">
                Outstanding supplier invoices. Drives the cashflow forecast on{" "}
                <Link href="/admin/financial-dashboard" className="text-blue-600 hover:underline">
                  Financial dashboard
                </Link>
                .
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1.5" />
              Add payable
            </Button>
          </div>

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
                    const today = new Date().toISOString().slice(0, 10);
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
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border border-emerald-200">
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
        </div>
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
            <Button onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving..." : "Add payable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
