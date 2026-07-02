/**
 * /admin/fixed-costs - recurring tenant costs (rent, software,
 * vehicles).
 *
 * Owner / company_admin / super_admin only per the Skylight
 * finance-visibility rule (canAccessFinance; plain admin is
 * deliberately excluded). Gated via ProtectedRoute below.
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
import { Plus, Trash2, Repeat, Pencil, AlertCircle, ChevronDown, ChevronRight, TrendingUp, Calendar, Upload, Tag, RefreshCw } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { CashflowContextBanner } from "@/components/admin/financial/CashflowContextBanner";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import {
  fixedCostsService, type FixedCost, type Cadence, type FixedCostCategory,
  FIXED_COST_CATEGORIES,
} from "@/services/fixedCostsService";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { formatZAR } from "@/lib/formatters";
import { DEFAULT_TENANT_TIMEZONE, parseLocalDay, tenantToday, toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

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
 * daily cron at /api/cron/advance-fixed-cost-next-due does this
 * server-side (shipped FXC-B, 2026-05-23); this client-side walk is
 * the backstop so the operator never sees a stale date even if the
 * cron misses a run. Cheap - max ~52 iterations on a year-old weekly
 * row. `today` is the TENANT's calendar day.
 *
 * Audit fix (2026-07-02): parse next_due_date via parseLocalDay so
 * the compare lives in the same local-midnight space as the
 * tenantToday anchor. `new Date("YYYY-MM-DD")` parses as UTC
 * midnight, which for a browser west of UTC sits BEFORE today's
 * local midnight - a cost due today was walked one cadence forward
 * and its "Due in Nd" badge lied by a month.
 */
function nextFutureOccurrence(row: FixedCost, today: Date): Date | null {
  const cur = parseLocalDay(row.next_due_date);
  if (!cur) return null;
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
      UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN,
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
  category: FixedCostCategory | "";
}

const EMPTY_DRAFT: DraftState = {
  label: "",
  amount: "",
  cadence: "monthly",
  next_due_date: "",
  notes: "",
  category: "",
};

// FXC-B: bulk CSV import row shape - same shape Payables uses so
// the parser logic mirrors that one. Required: label, amount,
// cadence, next_due_date. Optional: category, notes.
interface BulkRow {
  line: number;
  label: string;
  amount_cents: number;
  cadence: Cadence;
  next_due_date: string;
  category: FixedCostCategory | null;
  notes: string | null;
  error: string | null;
  /** Non-blocking caution (e.g. an active cost with the same label
   *  already exists). The row still imports; the operator is told. */
  warning: string | null;
}

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

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[R$£€\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/);
  if (slash) {
    const [, a, b, c] = slash;
    if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    if (c.length === 4) return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  // Audit fix (2026-07-02): format from LOCAL components, not
  // toISOString() - the UTC conversion imported rows a day early for
  // any browser east of UTC (SA is UTC+2). Same fix as Payables.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  return null;
}

const VALID_CADENCES: Cadence[] = ["weekly", "monthly", "quarterly", "annual"];
const VALID_CATEGORIES = new Set(FIXED_COST_CATEGORIES.map((c) => c.value));

function parseBulkCsv(csv: string, existing: FixedCost[]): BulkRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  // Audit fix (2026-07-02): duplicate detection. Re-pasting the same
  // CSV used to silently double every recurring cost (and double the
  // forecast outflow). Warn (non-blocking) when an ACTIVE cost with
  // the same label already exists, or the label repeats in the paste.
  const existingLabels = new Set(
    existing.filter((r) => r.active).map((r) => r.label.trim().toLowerCase()),
  );
  const seenInPaste = new Set<string>();
  const out: BulkRow[] = [];
  const startsWithHeader = /label|amount/i.test(lines[0]);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && startsWithHeader) continue;
    const cols = splitCsvLine(lines[i]);
    const label = cols[0] || "";
    const amountRaw = cols[1] || "";
    const cadenceRaw = (cols[2] || "monthly").toLowerCase().trim();
    const dueRaw = cols[3] || "";
    const categoryRaw = (cols[4] || "").toLowerCase().trim();
    const notes = (cols[5] || "").trim() || null;
    const errs: string[] = [];
    if (!label) errs.push("label missing");
    const amt = parseAmount(amountRaw);
    if (!Number.isFinite(amt)) errs.push(`bad amount "${amountRaw}"`);
    const cadence = VALID_CADENCES.includes(cadenceRaw as Cadence) ? (cadenceRaw as Cadence) : null;
    if (!cadence) errs.push(`bad cadence "${cadenceRaw}" (expected weekly / monthly / quarterly / annual)`);
    const due = parseDate(dueRaw);
    if (!due) errs.push(`bad date "${dueRaw}"`);
    const category = categoryRaw && VALID_CATEGORIES.has(categoryRaw as FixedCostCategory)
      ? (categoryRaw as FixedCostCategory)
      : null;
    if (categoryRaw && !category) errs.push(`unknown category "${categoryRaw}"`);
    const warns: string[] = [];
    if (errs.length === 0 && label) {
      const key = label.trim().toLowerCase();
      if (existingLabels.has(key)) warns.push(`an active cost named "${label}" already exists`);
      if (seenInPaste.has(key)) warns.push("repeated inside this paste");
      seenInPaste.add(key);
    }
    out.push({
      line: i + 1,
      label,
      amount_cents: Number.isFinite(amt) ? Math.round(amt * 100) : 0,
      cadence: cadence || "monthly",
      next_due_date: due || "",
      category,
      notes,
      error: errs.length ? errs.join("; ") : null,
      warning: warns.length ? warns.join("; ") : null,
    });
  }
  return out;
}

function categoryLabel(c: FixedCostCategory | null): string {
  if (!c) return "Uncategorised";
  return FIXED_COST_CATEGORIES.find((x) => x.value === c)?.label || c;
}

function FixedCostsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const companyId = user?.company_id || profile?.company_id || null;
  const userId = user?.id || null;
  const currency = user?.currency || "ZAR";
  // Money display goes through formatZAR (the platform-wide money
  // formatter) so amounts read "R 12 500.00" like every other finance
  // surface, not the old toFixed "R12500.00".
  const fmt = (a: number, c: string) => formatZAR(a, { currency: c });

  const [rows, setRows] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "Due in Nd" / overdue maths anchors on the TENANT's calendar day
  // so badges don't drift for an operator in another timezone.
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
  const todayAnchor = useMemo(
    () => tenantToday(tenantTimezone || DEFAULT_TENANT_TIMEZONE),
    [tenantTimezone],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pausedExpanded, setPausedExpanded] = useState(false);
  // FXC-B: group-by-category view (off by default - flat list is
  // the long-standing shape; toggle on when the cost set is large
  // enough to want grouping).
  const [groupByCategory, setGroupByCategory] = useState(false);
  // FXC-B: bulk CSV import dialog state. Mirrors the payables
  // pattern (PR-95) - paste / type CSV, hit Preview, see per-row
  // validation, then Import.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkRow[] | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fixedCostsService.list(companyId, { throwOnError: true });
      setRows(data);
    } catch (e: any) {
      // Pre-audit a failed list rendered as "No fixed costs yet" -
      // indistinguishable from a genuinely empty ledger.
      setLoadError(e?.message || "Could not load fixed costs. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
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
      category: row.category || "",
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
          category: draft.category || null,
        });
        if (row) {
          toast({ title: "Fixed cost updated" });
          setDialogOpen(false);
          setEditingId(null);
          setDraft(EMPTY_DRAFT);
          void load();
        } else {
          // Pre-audit a failed save closed nothing and said nothing.
          toast({ title: "Couldn't save changes", description: "The update didn't save. Try again.", variant: "destructive" });
        }
      } else {
        const row = await fixedCostsService.create({
          company_id: companyId,
          label: draft.label.trim(),
          amount_cents: Math.round(amount * 100),
          cadence: draft.cadence,
          next_due_date: draft.next_due_date,
          notes: draft.notes || null,
          category: draft.category || null,
          created_by: userId,
        });
        if (row) {
          toast({ title: "Fixed cost added", description: `Next due ${draft.next_due_date}` });
          setDialogOpen(false);
          setDraft(EMPTY_DRAFT);
          void load();
        } else {
          toast({ title: "Couldn't add fixed cost", description: "The insert didn't save. Try again.", variant: "destructive" });
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
    else toast({ title: `Couldn't ${active ? "resume" : "pause"} the cost`, description: "The update didn't save. Try again.", variant: "destructive" });
  };

  // FXC-B: bulk CSV import handlers, mirroring payables.
  const openBulk = () => {
    setBulkCsv("");
    setBulkPreview(null);
    setBulkResult(null);
    setBulkOpen(true);
  };

  const handleBulkPreview = () => {
    setBulkPreview(parseBulkCsv(bulkCsv, rows));
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
    let ok = 0;
    let failed = 0;
    for (const r of valid) {
      const row = await fixedCostsService.create({
        company_id: companyId,
        label: r.label,
        amount_cents: r.amount_cents,
        cadence: r.cadence,
        next_due_date: r.next_due_date,
        notes: r.notes,
        category: r.category,
        created_by: userId,
      });
      if (row) ok++; else failed++;
    }
    setBulkImporting(false);
    setBulkResult({ ok, failed });
    if (ok > 0) {
      toast({
        title: `Imported ${ok} fixed cost${ok === 1 ? "" : "s"}`,
        description: failed > 0 ? `${failed} failed - check the report below.` : "Cashflow forecast picks them up on next load.",
      });
      void load();
    } else {
      toast({ title: "Import failed", description: "No rows saved.", variant: "destructive" });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    const ok = await fixedCostsService.softDelete(deleteId);
    setDeleteId(null);
    if (ok) {
      toast({ title: "Removed" });
      void load();
    } else {
      toast({ title: "Couldn't remove", description: "The delete didn't save. Try again.", variant: "destructive" });
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
    const today = todayAnchor;
    const b: { d30: number; d60: number; d90: number } = { d30: 0, d60: 0, d90: 0 };
    for (const o of occ) {
      // parseLocalDay pins the bare occurrence date to local midnight
      // so the day-diff against the local todayAnchor is exact; the
      // UTC-midnight parse pushed boundary occurrences into the wrong
      // bucket for timezones far from UTC.
      const occDay = parseLocalDay(o.date);
      if (!occDay) continue;
      const days = daysBetween(today, occDay);
      if (days < 0 || days > 90) continue;
      if (days <= 30) b.d30 += o.amount_cents;
      else if (days <= 60) b.d60 += o.amount_cents;
      else b.d90 += o.amount_cents;
    }
    return { d30: b.d30 / 100, d60: b.d60 / 100, d90: b.d90 / 100 };
  }, [activeRows, todayAnchor]);

  // FXC-B intel: group active rows by category for the toggle view.
  // Categories with NULL fall under "Uncategorised". Sorts groups
  // by total monthly spend desc so the biggest cost buckets are
  // top of the list.
  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, { category: FixedCostCategory | null; rows: FixedCost[]; monthlyCents: number }>();
    for (const r of activeRows) {
      const key = r.category || "__none__";
      const existing = groups.get(key) || { category: r.category, rows: [], monthlyCents: 0 };
      existing.rows.push(r);
      existing.monthlyCents += toMonthlyCents(r.amount_cents, r.cadence);
      groups.set(key, existing);
    }
    return Array.from(groups.values()).sort((a, b) => b.monthlyCents - a.monthlyCents);
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
        <title>Fixed costs - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Fixed costs"
            icon={Repeat}
            subtitle={
              <>
                Recurring rent, software, vehicles, anything that hits the bank account on a schedule.
                Drives the cashflow forecast on{" "}
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
                    {activeRows.length} active cost{activeRows.length === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {fmt(monthlyEquivalent, currency)} / month
                  </span>
                  {pausedRows.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                      {pausedRows.length} paused
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
              <Button onClick={openCreate} className="bg-brand-primary hover:bg-brand-primary/90">
                <Plus className="w-4 h-4 mr-1.5" />
                Add fixed cost
              </Button>
            </>
            }
          />
          <PageWorkbench />
          <CashflowContextBanner message="Each fixed cost expands into 30-day occurrences on the forecast. Edit one here to see the chart redraw." />

          {/* Load failure: loud recovery card instead of tiles full of
              fake zeros over an "empty" list. */}
          {loadError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-rose-900 mb-1">Couldn&apos;t load fixed costs</h2>
              <p className="text-sm text-slate-600 mb-3">{loadError}</p>
              <Button onClick={() => void load()} size="sm" className="bg-brand-primary hover:bg-brand-primary/90" disabled={loading}>
                Retry
              </Button>
            </div>
          )}

          {!loadError && (
          <>
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

          {/* FXC-B: group-by-category toggle. Off by default - flat
              list is the long-standing shape. Toggle on when the
              cost set has enough variety to want grouping. */}
          {activeRows.length > 1 && (
            <div className="mb-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setGroupByCategory((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                title="Group active rows by category"
              >
                <Tag className="w-3.5 h-3.5" />
                {groupByCategory ? "Flat list" : "Group by category"}
              </button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading...</div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-sm text-slate-500">No fixed costs yet. Add rent, software subscriptions, or vehicles.</p>
                  <Button onClick={openCreate} variant="outline" size="sm" className="mt-3">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add your first fixed cost
                  </Button>
                </div>
              ) : groupByCategory && activeRows.length > 0 ? (
                <div className="divide-y divide-slate-200">
                  {groupedByCategory.map((g) => (
                    <div key={g.category || "__none__"}>
                      <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          {categoryLabel(g.category)}
                        </span>
                        <span className="text-xs tabular-nums text-slate-600">
                          {fmt(g.monthlyCents / 100, currency)} / mo . {g.rows.length} line{g.rows.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {g.rows.map((r) => (
                          <CostRow
                            key={r.id}
                            row={r}
                            currency={currency}
                            fmt={fmt}
                            today={todayAnchor}
                            isLargest={r.id === largestLineId}
                            onEdit={() => openEdit(r)}
                            onToggle={(v) => handleToggleActive(r.id, v)}
                            onDelete={() => setDeleteId(r.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeRows.map((r) => (
                    <CostRow
                      key={r.id}
                      row={r}
                      currency={currency}
                      fmt={fmt}
                      today={todayAnchor}
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
                          today={todayAnchor}
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
          </>
          )}
        </PortalShell>
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
              <Label>Category (optional)</Label>
              <Select
                value={draft.category || "__none__"}
                onValueChange={(v) => setDraft({ ...draft, category: v === "__none__" ? "" : (v as FixedCostCategory) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorised</SelectItem>
                  {FIXED_COST_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
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
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-rose-600 hover:bg-rose-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* FXC-B: bulk CSV import dialog. Same paste-CSV +
          preview + import pattern Payables uses. CSV columns:
          label, amount, cadence, next_due_date, category, notes.
          Header row auto-detected. */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk import fixed costs</DialogTitle>
            <DialogDescription>
              Paste a CSV with these columns: <code className="text-xs">label, amount, cadence, next_due_date, category (optional), notes (optional)</code>.
              Cadence is one of: weekly / monthly / quarterly / annual.
              Dates accept YYYY-MM-DD or DD/MM/YYYY.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>CSV</Label>
              <Textarea
                rows={6}
                value={bulkCsv}
                onChange={(e) => setBulkCsv(e.target.value)}
                placeholder={"label,amount,cadence,next_due_date,category,notes\nOffice rent,12000,monthly,2026-07-01,rent,Main premises\nVodacom,1800,monthly,2026-07-01,telecoms,3 x cell contracts"}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBulkPreview} disabled={!bulkCsv.trim() || bulkImporting}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Preview
              </Button>
              {bulkPreview && bulkPreview.some((r) => !r.error) && (
                <Button onClick={handleBulkImport} disabled={bulkImporting} className="bg-brand-primary hover:bg-brand-primary/90">
                  {bulkImporting ? "Importing..." : `Import ${bulkPreview.filter((r) => !r.error).length} row${bulkPreview.filter((r) => !r.error).length === 1 ? "" : "s"}`}
                </Button>
              )}
            </div>
            {bulkPreview && (
              <div className="border rounded-md overflow-hidden text-xs">
                <div className="bg-slate-50 px-3 py-2 grid grid-cols-12 gap-2 font-semibold text-slate-700">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Label</div>
                  <div className="col-span-2">Amount</div>
                  <div className="col-span-2">Cadence</div>
                  <div className="col-span-2">Next due</div>
                  <div className="col-span-2">Category</div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {bulkPreview.map((r) => (
                    <div
                      key={r.line}
                      className={`px-3 py-2 grid grid-cols-12 gap-2 ${r.error ? "bg-rose-50" : r.warning ? "bg-amber-50" : "bg-white"}`}
                    >
                      <div className="col-span-1 text-slate-500">{r.line}</div>
                      <div className="col-span-3 truncate" title={r.label}>{r.label || <span className="text-slate-400">-</span>}</div>
                      <div className="col-span-2 tabular-nums">{r.amount_cents > 0 ? fmt(r.amount_cents / 100, currency) : <span className="text-slate-400">-</span>}</div>
                      <div className="col-span-2">{r.cadence}</div>
                      <div className="col-span-2 tabular-nums">{r.next_due_date || <span className="text-slate-400">-</span>}</div>
                      <div className="col-span-2 text-slate-600">{r.category ? categoryLabel(r.category) : <span className="text-slate-400">-</span>}</div>
                      {r.error && (
                        <div className="col-span-12 text-rose-700 mt-1">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          {r.error}
                        </div>
                      )}
                      {!r.error && r.warning && (
                        <div className="col-span-12 text-amber-700 mt-1">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          Imports anyway, but {r.warning}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bulkResult && (
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                <span className="font-semibold text-brand-primary">{bulkResult.ok} imported</span>
                {bulkResult.failed > 0 && (
                  <span className="ml-3 text-rose-700">{bulkResult.failed} failed</span>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkImporting}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  /** Tenant-timezone "today" anchor from the page. */
  today: Date;
  isLargest: boolean;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}

function CostRow({ row, currency, fmt, today, isLargest, onEdit, onToggle, onDelete }: CostRowProps) {
  const nextOcc = nextFutureOccurrence(row, today);
  const daysToNext = nextOcc ? daysBetween(today, nextOcc) : null;
  // Audit fix (2026-07-02): local-midnight parse, same class as
  // nextFutureOccurrence - the UTC-midnight parse flagged "Date
  // drifted" a day early or late depending on the browser timezone.
  const wasStored = parseLocalDay(row.next_due_date);
  const storedIsPast = !!wasStored && wasStored < today;
  const annualised = (row.amount_cents / 100) * 12 * CADENCE_MULTIPLIER[row.cadence];
  // FXC-A intel: annual cadence + due in <=14d = big lumpy hit
  // incoming. Worth a chip so the operator can pre-fund.
  const isAnnualSoon = row.cadence === "annual" && row.active && daysToNext != null && daysToNext <= 14 && daysToNext >= 0;
  // FXC-B intel: renegotiation chip. The amount-change trigger in
  // migration 20260523180000 stamps last_amount_change_at on every
  // amount edit. NULL last_amount_change_at means "never edited" -
  // we use created_at as the proxy in that case so an ancient row
  // that was right the first time still flags. >= 365 days at the
  // same amount earns the chip.
  const lastChange = row.last_amount_change_at
    ? new Date(row.last_amount_change_at)
    : (row.created_at ? new Date(row.created_at) : null);
  const monthsAtAmount = lastChange && !isNaN(lastChange.getTime())
    ? Math.floor((today.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0;
  const isStaleAmount = row.active && monthsAtAmount >= 12;
  // FXC-B: previous_amount_cents is stamped by the same trigger so
  // we can render "was R 1,500" under the current amount. Only show
  // when the change happened in the last 18 months - older context
  // is noise.
  const showPreviousAmount = row.previous_amount_cents != null
    && row.last_amount_change_at
    && monthsAtAmount <= 18
    && row.previous_amount_cents !== row.amount_cents;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50 sm:flex-nowrap sm:gap-4">
      <div className="flex-1 min-w-[10rem]">
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
            <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-700 bg-slate-50">
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
              title="The stored next_due_date is in the past. The forecast walks forward client-side, and the nightly cron should be catching up. Edit the row to set a fresh date if this persists."
            >
              <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
              Date drifted
            </Badge>
          )}
          {isStaleAmount && (
            <Badge
              variant="outline"
              className="text-[10px] border-blue-300 text-blue-800 bg-blue-50"
              title={`Same amount for ${monthsAtAmount} months. Most fixed costs renegotiate annually - worth a check.`}
            >
              Renegotiate? {monthsAtAmount}mo unchanged
            </Badge>
          )}
          {row.category && (
            <Badge variant="outline" className="text-[10px] text-slate-600 border-slate-200">
              <Tag className="w-2.5 h-2.5 mr-0.5" />
              {categoryLabel(row.category)}
            </Badge>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {/* toLocalISO, not toISOString: nextOcc is a local-midnight
              Date, and the UTC slice shifted the shown date back a day
              for any timezone east of UTC (including SA). */}
          Next due {nextOcc ? toLocalISO(nextOcc) : row.next_due_date}
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
        {/* FXC-B: previous amount annotation. Stamped by the
            amount-change trigger so we can show "was R X, N mo ago"
            without an audit_logs query. Helps the operator place
            the most recent renegotiation. */}
        {showPreviousAmount && row.previous_amount_cents != null && (
          <div className="text-[10px] text-slate-500 tabular-nums">
            was {fmt(row.previous_amount_cents / 100, currency)}
            {monthsAtAmount > 0 ? `, ${monthsAtAmount}mo ago` : ""}
          </div>
        )}
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
