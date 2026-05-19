/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/fixed-costs - recurring tenant costs (rent, software,
 * vehicles).
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Repeat } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import {
  fixedCostsService, type FixedCost, type Cadence,
} from "@/services/fixedCostsService";
import * as currencyUtils from "@/lib/currencyUtils";

export default function ProtectedFixedCostsPage() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN,
    ]}>
      <FixedCostsPage />
    </ProtectedRoute>
  );
}

function FixedCostsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const companyId = (user as any)?.company_id || (profile as any)?.company_id;
  const userId = (user as any)?.id || null;
  const currency = (user as any)?.currency || "ZAR";
  const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;

  const [rows, setRows] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    label: "",
    amount: "",
    cadence: "monthly" as Cadence,
    next_due_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const data = await fixedCostsService.list(companyId);
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleCreate = async () => {
    if (!companyId) return;
    if (!draft.label.trim()) {
      toast({ title: "Label required", variant: "destructive" }); return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Amount required", variant: "destructive" }); return;
    }
    if (!draft.next_due_date) {
      toast({ title: "Next due date required", variant: "destructive" }); return;
    }
    setSaving(true);
    const row = await fixedCostsService.create({
      company_id: companyId,
      label: draft.label.trim(),
      amount_cents: Math.round(amount * 100),
      cadence: draft.cadence,
      next_due_date: draft.next_due_date,
      notes: draft.notes || null,
      created_by: userId,
    });
    setSaving(false);
    if (row) {
      toast({ title: "Fixed cost added", description: `Next due ${draft.next_due_date}` });
      setDialogOpen(false);
      setDraft({ label: "", amount: "", cadence: "monthly", next_due_date: "", notes: "" });
      void load();
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const row = await fixedCostsService.update(id, { active });
    if (row) void load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this fixed cost?")) return;
    const ok = await fixedCostsService.softDelete(id);
    if (ok) {
      toast({ title: "Removed" });
      void load();
    }
  };

  const activeCount = rows.filter((r) => r.active).length;
  const monthlyEquivalent = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      if (!r.active) continue;
      const monthly = r.cadence === "weekly" ? r.amount_cents * 52 / 12
        : r.cadence === "monthly" ? r.amount_cents
        : r.cadence === "quarterly" ? r.amount_cents / 3
        : r.amount_cents / 12;
      sum += monthly;
    }
    return sum / 100;
  }, [rows]);

  return (
    <>
      <Head>
        <title>Fixed costs - Admin</title>
      </Head>
      <NoIndexMeta />
      <AdminNav />
      {/* Match the standard admin layout (AdminNav is a fixed sidebar
          at lg+). Without lg:ml-64 xl:ml-72 the cards sit behind it. */}
      <div className="min-h-screen bg-slate-50 lg:ml-64 xl:ml-72">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
          <div className="flex items-start justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Fixed costs</h1>
              <p className="text-sm text-slate-600 mt-1">
                Recurring rent, software, vehicles, anything that hits the bank account on a schedule.
                Drives the cashflow forecast on{" "}
                <Link href="/admin/financial-dashboard" className="text-blue-600 hover:underline">
                  Financial dashboard
                </Link>
                .
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1.5" />
              Add fixed cost
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-slate-900">{activeCount}</div>
                <p className="text-xs text-slate-500 mt-1">Of {rows.length} total</p>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Monthly equivalent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-slate-900">
                  {fmt(monthlyEquivalent, currency)}
                </div>
                <p className="text-xs text-slate-500 mt-1">All active costs normalised to monthly</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading...</div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  No fixed costs yet. Add rent, software subscriptions, or vehicles.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${r.active ? "text-slate-900" : "text-slate-400"}`}>
                            {r.label}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            <Repeat className="w-2.5 h-2.5 mr-0.5" />
                            {r.cadence}
                          </Badge>
                          {!r.active && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">paused</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Next due {r.next_due_date}{r.notes ? ` - ${r.notes}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold tabular-nums ${r.active ? "text-slate-900" : "text-slate-400"}`}>
                          {fmt(r.amount_cents / 100, currency)}
                        </div>
                      </div>
                      <Switch
                        checked={r.active}
                        onCheckedChange={(v) => handleToggleActive(r.id, !!v)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add fixed cost</DialogTitle>
            <DialogDescription>
              Recurring spend - rent, software, insurance, vehicles. Picked up by the cashflow forecast on every refresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Office rent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount ({currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  placeholder="12000.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cadence</Label>
                <Select value={draft.cadence} onValueChange={(v) => setDraft({ ...draft, cadence: v as Cadence })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Next due date</Label>
              <Input
                type="date"
                value={draft.next_due_date}
                onChange={(e) => setDraft({ ...draft, next_due_date: e.target.value })}
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
              {saving ? "Saving..." : "Add fixed cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
