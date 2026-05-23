/**
 * /admin/fixed-costs - recurring tenant costs (rent, software,
 * vehicles).
 *
 * Owner / company_admin / admin / super_admin only per the Skylight
 * finance-visibility rule. Gated upstream via ProtectedRoute.
 *
 * FXC-A (fixed costs audit, 2026-05-23): intelligence pass.
 * Pre-FXC-A this page was a two-tile + flat-list CRUD: Active count,
 * Monthly equivalent, one row per cost, add / pause / delete. No
 * forward projection, no anomaly hints, no editing - and the cron
 * that was meant to auto-roll next_due_date was never actually
 * shipped, so rows drifted into the past silently.
 *
 * Now: edit flow inline, AlertDialog confirm on delete, realtime
 * channel, paused rows split into a collapsible section, annualised
 * burn tile + cadence-mix strip + 30/60/90 buckets computed via
 * expandOccurrences, per-row annualised micro-hint, "Largest line"
 * + "Annual due in next 14d" anomaly chips. next_due_date is rolled
 * forward client-side until it's >= today so the badge stays
 * honest even without the cron.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Repeat, Pencil, AlertCircle, ChevronDown, ChevronRight, TrendingUp, Calendar } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { CashflowContextBanner } from "@/components/admin/financial/CashflowContextBanner";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import {
  fixedCostsService, type FixedCost, type Cadence,
} from "@/services/fixedCostsService";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import * as currencyUtils from "@/lib/currencyUtils";

const CADENCE_MULTIPLIER: Record<Cadence, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};

function toMonthlyCents(amount_cents: number, cadence: Cadence): number {
  return amount_cents * CADENCE_MULTIPLIER[cadence];
}

/**
 * Walk next_due_date forward by cadence until it's >= today. The
 * cron that was meant to do this server-side never shipped (see
 * fixedCostsService.ts header comment from 2026-05-18). Rather than
 * lying with a stale date in the past, we compute the next live
 * occurrence on every render. Cheap - max ~52 iterations on a year-
 * old weekly row.
 */
function nextFutureOccurrence(row: FixedCost): Date | null {
  const cur = new Date(row.next_due_date);
  if (isNaN(cur.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let safety = 0;
  while (cur < today && safety < 200) {
    if (row.cadence === "weekly") cur.setDate(cur.getDate() + 7);
    else if (row.cadence === "monthly") cur.setMonth(cur.getMonth() + 1);
    else if (row.cadence === "quarterly") cur.setMonth(cur.getMonth() + 3);
    else if (row.cadence === "annual") cur.setFullYear(cur.getFullYear() + 1);
    else break;
    safety += 1;
  }
  return cur;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

export default function ProtectedFixedCostsPage() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN,
    ]}>
      <FixedCostsPage />
    </ProtectedRoute>
  );
}

interface DraftState {
  label: string;
  amount: string;
  cadence: Cadence;
  next_due_date: string;
  notes: string;
}

const EMPTY_DRAFT: DraftState = {
  label: "",
  amount: "",
  cadence: "monthly",
  next_due_date: "",
  notes: "",
};

function FixedCostsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const companyId = user?.company_id || profile?.company_id || null;
  const userId = user?.id || null;
  const currency = user?.currency || "ZAR";
  const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;

  const [rows, setRows] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pausedExpanded, setPausedExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const data = await fixedCostsService.list(companyId);
    setRows(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // FXC-A: realtime channel. Two admins editing simultaneously
  // would previously overwrite each other and never refresh until
  // a manual reload. Now any insert/update/delete on this tenant's
  // fixed_costs triggers a debounced reload.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`fixed-costs:${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fixed_costs", filter: `company_id=eq.${companyId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => { void load(); }, 400);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId, load]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const openEdit = (row: FixedCost) => {
    setEditingId(row.id);
    setDraft({
      label: row.label,
      amount: (row.amount_cents / 100).toFixed(2),
      cadence: row.cadence,
      next_due_date: row.next_due_date,
      notes: row.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
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
    try {
      if (editingId) {
        const row = await fixedCostsService.update(editingId, {
          label: draft.label.trim(),
          amount_cents: Math.round(amount * 100),
          cadence: draft.cadence,
          next_due_date: draft.next_due_date,
          notes: draft.notes || null,
        });
        if (row) {
          toast({ title: "Fixed cost updated" });
          setDialogOpen(false);
          setEditingId(null);
          setDraft(EMPTY_DRAFT);
          void load();
        }
      } else {
        const row = await fixedCostsService.create({
          company_id: companyId,
          label: draft.label.trim(),
          amount_cents: Math.round(amount * 100),
          cadence: draft.cadence,
          next_due_date: draft.next_due_date,
          notes: draft.notes || null,
          created_by: userId,
        });
        if (row) {
          toast({ title: "Fixed cost added", description: `Next due ${draft.next_due_date}` });
          setDialogOpen(false);
          setDraft(EMPTY_DRAFT);
          void load();
        }
      }
    } catch (e) {
      captureException(e, {
        level: "error",
        tags: { companyId, route: "/admin/fixed-costs", step: editingId ? "update" : "create" },
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const row = await fixedCostsService.update(id, { active });
    if (row) void load();
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const ok = await fixedCostsService.softDelete(deleteId);
    setDeleteId(null);
    if (ok) {
      toast({ title: "Removed" });
      void load();
    }
  };

  // FXC-A: split active vs paused. Pre-FXC-A paused rows sat in the
  // same list sorted by next_due_date, so a paused row with an old
  // date floated to the top of the active surface. Active block now
  // owns the headline; paused collapses into a footer reveal.
  const activeRows = useMemo(() => rows.filter((r) => r.active), [rows]);
  const pausedRows = useMemo(() => rows.filter((r) => !r.active), [rows]);

  const monthlyEquivalentCents = useMemo(() => {
    return activeRows.reduce((sum, r) => sum + toMonthlyCents(r.amount_cents, r.cadence), 0);
  }, [activeRows]);
  const monthlyEquivalent = monthlyEquivalentCents / 100;
  const annualEquivalent = monthlyEquivalent * 12;

  // FXC-A intel: cadence mix counts.
  const cadenceMix = useMemo(() => {
    const counts: Record<Cadence, number> = { weekly: 0, monthly: 0, quarterly: 0, annual: 0 };
    for (const r of activeRows) counts[r.cadence] += 1;
    return counts;
  }, [activeRows]);

  // FXC-A intel: 30 / 60 / 90 day buckets. Walks every active row's
  // occurrences via the service helper (the same code the
  // CashflowForecastCard uses for the chart, so the page agrees
  // with the chart on what's actually projected).
  const occurrenceBuckets = useMemo(() => {
    const occ = fixedCostsService.expandOccurrences(activeRows, 90);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const b: { d30: number; d60: number; d90: number } = { d30: 0, d60: 0, d90: 0 };
    for (const o of occ) {
      const days = daysBetween(today, new Date(o.date));
      if (days < 0 || days > 90) continue;
      if (days <= 30) b.d30 += o.amount_cents;
      else if (days <= 60) b.d60 += o.amount_cents;
      else b.d90 += o.amount_cents;
    }
    return { d30: b.d30 / 100, d60: b.d60 / 100, d90: b.d90 / 100 };
  }, [activeRows]);

  // FXC-A intel: largest single line (more than 40% of monthly burn)
  // gets a "Largest line" chip so the operator knows where
  // renegotiation has the most leverage.
  const largestLineId = useMemo(() => {
    if (activeRows.length === 0 || monthlyEquivalentCents === 0) return null;
    let topId: string | null = null;
    let topMonthly = 0;
    for (const r of activeRows) {
      const m = toMonthlyCents(r.amount_cents, r.cadence);
      if (m > topMonthly) {
        topMonthly = m;
        topId = r.id;
      }
    }
    if (topMonthly / monthlyEquivalentCents < 0.4) return null;
    return topId;
  }, [activeRows, monthlyEquivalentCents]);

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
          <CashflowContextBanner message="Each fixed cost expands into 30-day occurrences on the forecast. Edit one here to see the chart redraw." />
          <div className="flex items-start justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Fixed costs</h1>
              <p className="text-sm text-slate-600 mt-1">
                Recurring rent, software, vehicles, anything that hits the bank account on a schedule.
                Drives the cashflow forecast on{" "}
                <Link href="/admin/cashflow-dashboard" className="text-blue-600 hover:underline">
                  Cashflow dashboard
                </Link>
                .
              </p>
            </div>
            <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1.5" />
              Add fixed cost
            </Button>
          </div>

          {/* FXC-A: three summary tiles. Active + Monthly were the
              pre-FXC-A pair; Annual is new. Bobby's prompt called
              out the annualised burn explicitly - R8,600/mo = R103k
              of fixed obligations a year. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-slate-900">{activeRows.length}</div>
                <p className="text-xs text-slate-500 mt-1">
                  Of {rows.length} total{pausedRows.length > 0 ? `, ${pausedRows.length} paused` : ""}
                </p>
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
            <Card className="border-2 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-900 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Annual burn
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-amber-900">
                  {fmt(annualEquivalent, currency)}
                </div>
                <p className="text-xs text-amber-800/80 mt-1">Locked-in obligations over 12 months</p>
              </CardContent>
            </Card>
          </div>

          {/* FXC-A: cadence mix + 30/60/90 strips. Both compute from
              data already loaded so they're cheap. Hidden when the
              page has no active rows so first-run doesn't show a
              wall of zeros. */}
          {activeRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-600 flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5" />
                    Cadence mix
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(["weekly", "monthly", "quarterly", "annual"] as Cadence[]).map((c) => (
                      <span
                        key={c}
                        className={`px-2 py-0.5 rounded-md ${
                          cadenceMix[c] > 0
                            ? "bg-slate-100 text-slate-700"
                            : "bg-slate-50 text-slate-400"
                        }`}
                      >
                        {cadenceMix[c]} {c}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    A high annual count means lumpier cash drains on the renewal months.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-600 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Hitting the bank
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <Bucket label="Next 30d" amount={fmt(occurrenceBuckets.d30, currency)} />
                    <Bucket label="31 to 60d" amount={fmt(occurrenceBuckets.d60, currency)} />
                    <Bucket label="61 to 90d" amount={fmt(occurrenceBuckets.d90, currency)} />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Real occurrences from each row&apos;s next-due date, walked forward by cadence.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

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
                  {activeRows.map((r) => (
                    <CostRow
                      key={r.id}
                      row={r}
                      currency={currency}
                      fmt={fmt}
                      isLargest={r.id === largestLineId}
                      onEdit={() => openEdit(r)}
                      onToggle={(v) => handleToggleActive(r.id, v)}
                      onDelete={() => setDeleteId(r.id)}
                    />
                  ))}
                  {activeRows.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-sm">
                      No active fixed costs. The forecast will assume zero recurring outflow.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* FXC-A: paused section, collapsed by default. Pre-FXC-A
              paused rows sat in the same list and clogged the
              active surface. */}
          {pausedRows.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setPausedExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-2"
              >
                {pausedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Paused ({pausedRows.length})
              </button>
              {pausedExpanded && (
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                      {pausedRows.map((r) => (
                        <CostRow
                          key={r.id}
                          row={r}
                          currency={currency}
                          fmt={fmt}
                          isLargest={false}
                          onEdit={() => openEdit(r)}
                          onToggle={(v) => handleToggleActive(r.id, v)}
                          onDelete={() => setDeleteId(r.id)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditingId(null);
          setDraft(EMPTY_DRAFT);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit fixed cost" : "Add fixed cost"}</DialogTitle>
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
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving..." : editingId ? "Save changes" : "Add fixed cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this fixed cost?</AlertDialogTitle>
            <AlertDialogDescription>
              The row will be soft-deleted and disappears from the forecast immediately. The audit trail still keeps a record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Bucket({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-slate-800">{amount}</p>
    </div>
  );
}

interface CostRowProps {
  row: FixedCost;
  currency: string;
  fmt: (a: number, c: string) => string;
  isLargest: boolean;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}

function CostRow({ row, currency, fmt, isLargest, onEdit, onToggle, onDelete }: CostRowProps) {
  const nextOcc = nextFutureOccurrence(row);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToNext = nextOcc ? daysBetween(today, nextOcc) : null;
  const wasStored = new Date(row.next_due_date);
  const storedIsPast = !isNaN(wasStored.getTime()) && wasStored < today;
  const annualised = (row.amount_cents / 100) * 12 * CADENCE_MULTIPLIER[row.cadence];
  // FXC-A intel: annual cadence + due in <=14d = big lumpy hit
  // incoming. Worth a chip so the operator can pre-fund.
  const isAnnualSoon = row.cadence === "annual" && row.active && daysToNext != null && daysToNext <= 14 && daysToNext >= 0;

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-slate-50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onEdit}
            className={`font-medium text-left ${row.active ? "text-slate-900 hover:underline" : "text-slate-400 hover:underline"}`}
            title="Edit this fixed cost"
          >
            {row.label}
          </button>
          <Badge variant="outline" className="text-[10px]">
            <Repeat className="w-2.5 h-2.5 mr-0.5" />
            {row.cadence}
          </Badge>
          {!row.active && (
            <Badge variant="secondary" className="bg-slate-100 text-slate-600">paused</Badge>
          )}
          {isLargest && row.active && (
            <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 bg-purple-50">
              Largest line
            </Badge>
          )}
          {isAnnualSoon && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50 animate-pulse">
              Annual due in {daysToNext}d
            </Badge>
          )}
          {storedIsPast && row.active && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-300 text-amber-800 bg-amber-50"
              title="The stored next_due_date is in the past. The forecast walks forward client-side, but a daily cron should be advancing this. Edit the row to update."
            >
              <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
              Date drifted
            </Badge>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Next due {nextOcc ? nextOcc.toISOString().slice(0, 10) : row.next_due_date}
          {nextOcc && daysToNext != null && (
            <span className="text-slate-400">
              {" "}
              ({daysToNext === 0 ? "today" : daysToNext === 1 ? "tomorrow" : `in ${daysToNext}d`})
            </span>
          )}
          {row.notes ? ` - ${row.notes}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-semibold tabular-nums ${row.active ? "text-slate-900" : "text-slate-400"}`}>
          {fmt(row.amount_cents / 100, currency)}
        </div>
        {/* FXC-A: per-row annualised hint. R1,800/mo = R21,600/yr.
            Makes the renegotiation conversation concrete. */}
        <div className="text-[10px] text-slate-400 tabular-nums">
          {fmt(annualised, currency)} / yr
        </div>
      </div>
      <Switch
        checked={row.active}
        onCheckedChange={(v) => onToggle(!!v)}
        aria-label={`${row.active ? "Pause" : "Resume"} ${row.label}`}
      />
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${row.label}`}>
        <Pencil className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${row.label}`}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
