/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/public-holidays - holiday calendar driving the BCEA 2x rate.
 *
 * Two layers of rows:
 *   - Global defaults: company_id IS NULL, seeded with SA gazetted
 *     public holidays (New Year, Human Rights, Freedom Day, etc.).
 *     Read-only here.
 *   - Company customs: company_id = the tenant's id, used for things
 *     like a year-end closedown or a religious observance the team
 *     takes off. Owner adds + removes these.
 *
 * The wage clock-out logic looks up either layer at clock-out time;
 * any row matching the shift's date triggers the 2x Sunday/holiday
 * bucket. So if the tenant adds 'Annual shutdown 27 Dec', any shift
 * that lands on 27 Dec gets paid at 2x.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Loader2,
  Globe,
  Building2,
  Download,
  RefreshCw,
  CalendarDays,
  Repeat2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

// "Today" on this page follows the tenant wall clock, not the
// operator's browser. All live tenants run Africa/Johannesburg (see
// formatters.ts); a travelling bookkeeper west of UTC used to see
// the today marker and the add-dialog default a day behind.
const tenantTodayISO = () => toZonedISO(new Date(), DEFAULT_TENANT_TIMEZONE);

interface Holiday {
  id: string;
  company_id: string | null;
  date: string;
  name: string;
  is_recurring: boolean;
  notes: string | null;
}

interface HolidayOccurrence extends Holiday {
  display_date: string;
  original_date: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const isoParts = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-").map((n) => Number(n));
  return { year, month, day };
};

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const dateLabel = (iso: string) => {
  const { year, month, day } = isoParts(iso);
  return new Date(year, month - 1, day).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

function buildOccurrences(holidays: Holiday[], year: number): HolidayOccurrence[] {
  const byKey = new Map<string, HolidayOccurrence>();

  for (const h of holidays) {
    const p = isoParts(h.date);
    if (!p.year || !p.month || !p.day) continue;
    if (!h.is_recurring && p.year !== year) continue;

    const displayDate = h.is_recurring ? dateKey(year, p.month, p.day) : h.date.slice(0, 10);
    const key = `${h.company_id || "gazetted"}:${h.name}:${displayDate}`;
    const next: HolidayOccurrence = {
      ...h,
      display_date: displayDate,
      original_date: h.date.slice(0, 10),
    };
    const existing = byKey.get(key);
    if (!existing || isoParts(existing.original_date).year !== year) {
      byKey.set(key, next);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.display_date.localeCompare(b.display_date));
}

function PublicHolidaysAdmin() {
  const { profile } = useAuth() as any;
  const companyId = profile?.company_id as string | undefined;
  const actorId = profile?.id as string | undefined;
  const { toast } = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<(Holiday | HolidayOccurrence) | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(tenantTodayISO());

  const reload = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      // Pull globals + this tenant's customs in one fetch.
      const { data, error } = await supabase
        .from("public_holidays")
        .select("id, company_id, date, name, is_recurring, notes")
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .order("date", { ascending: true });
      if (error) throw error;
      setHolidays((data || []) as Holiday[]);
    } catch (e: any) {
      const message = e?.message || "Could not load holidays.";
      setLoadError(message);
      toast({ title: "Could not load holiday calendar", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { reload(); }, [reload]);

  // Keep both the tenant's own holidays and shared gazetted rows live.
  // Realtime filters cannot express `company_id is null OR company_id = x`,
  // so subscribe to rows readable under RLS and ignore unrelated payloads.
  // The matching RLS policy also ensures that tenant-custom rows from another
  // company are never delivered to this client.
  useEffect(() => {
    if (!companyId) return;
    // Random suffix so two open tabs never collide on the channel
    // name (recurring realtime bug class).
    const channelSuffix = Math.random().toString(36).slice(2, 10);
    const sub = supabase
      .channel(`public-holidays-${companyId}-${channelSuffix}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "public_holidays" }, (payload: any) => {
        const changedCompanyId = payload.new?.company_id ?? payload.old?.company_id ?? null;
        if (changedCompanyId === null || changedCompanyId === companyId) void reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [companyId, reload]);

  const filtered = useMemo(() => buildOccurrences(holidays, year), [holidays, year]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, HolidayOccurrence[]>();
    for (const h of filtered) {
      const list = map.get(h.display_date) || [];
      list.push(h);
      map.set(h.display_date, list);
    }
    return map;
  }, [filtered]);

  const selectedHolidays = selectedDate ? holidaysByDate.get(selectedDate) || [] : [];

  const summary = useMemo(() => ({
    total: filtered.length,
    gazetted: filtered.filter((h) => h.company_id == null).length,
    custom: filtered.filter((h) => h.company_id != null).length,
    recurring: filtered.filter((h) => h.is_recurring).length,
  }), [filtered]);

  const years = useMemo(() => {
    const set = new Set<number>();
    holidays.forEach((h) => {
      const y = isoParts(h.date).year;
      if (Number.isFinite(y)) set.add(y);
    });
    set.add(new Date().getFullYear());
    set.add(new Date().getFullYear() + 1);
    set.add(new Date().getFullYear() + 2);
    return Array.from(set).sort();
  }, [holidays]);

  useEffect(() => {
    if (selectedDate && isoParts(selectedDate).year === year) return;
    setSelectedDate(filtered[0]?.display_date || dateKey(year, 1, 1));
  }, [filtered, selectedDate, year]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Public holidays - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title="Public holidays"
            icon={CalendarIcon}
            subtitle="Review holiday dates and add company holidays used for shift pay."
            meta={
              !loading && !loadError && (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {summary.total} holiday{summary.total === 1 ? "" : "s"} in {year}
                  </span>
                  {summary.custom > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                      {summary.custom} company custom{summary.custom === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              )
            }
            actions={
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              {/* Phase 22 #4: holidays CSV. Payroll and ops planning
                  cross-reference these against shift rosters, public-
                  holiday surcharges and venue closures. */}
              <Button
                variant="outline"
                size="sm"
                disabled={filtered.length === 0}
                aria-label="Export public holidays as CSV"
                title="Export CSV"
                className="h-10 w-10 justify-center p-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
                onClick={() => {
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = ["Effective date", "Day", "Holiday", "Source", "Recurring", "Saved date", "Notes"];
                  const lines = [headers.join(",")];
                  for (const h of filtered) {
                    const p = isoParts(h.display_date);
                    const d = new Date(p.year, p.month - 1, p.day);
                    lines.push([
                      esc(h.display_date),
                      esc(d.toLocaleDateString("en-ZA", { weekday: "long" })),
                      esc(h.name || ""),
                      esc(h.company_id ? "company" : "gazetted"),
                      esc(h.is_recurring ? "yes" : "no"),
                      esc(h.original_date),
                      esc(h.notes || ""),
                    ].join(","));
                  }
                  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `public-holidays-${year}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-4 w-4" /><span className="sr-only sm:not-sr-only sm:inline">Export CSV</span>
              </Button>
              <Button onClick={() => setAdding(true)} size="sm" aria-label="Add company holiday" title="Add company holiday" className="h-10 w-10 justify-center p-0 text-white sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3">
                <Plus className="h-4 w-4" /><span className="sr-only sm:not-sr-only sm:inline">Add holiday</span>
              </Button>
            </div>
            }
          />
          <PageWorkbench />

          <div className="mb-4 grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-2 p-3 sm:py-3 sm:px-4">
                <label htmlFor="holiday-year" className="text-xs font-semibold text-slate-600">Calendar year</label>
                <select
                  id="holiday-year"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="h-10 min-w-28 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricPill label="Total" value={summary.total} />
              <MetricPill label="Gazetted" value={summary.gazetted} />
              <MetricPill label="Company" value={summary.custom} />
              <MetricPill label="Recurring" value={summary.recurring} />
            </div>
          </div>

          {loadError && (
            <div className="mb-4 flex min-w-0 items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800 sm:text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{loadError}</span>
              <Button size="sm" variant="outline" onClick={reload} disabled={loading} aria-label="Retry loading holidays" className="min-h-10 shrink-0">
                Retry
              </Button>
            </div>
          )}

          <div className="mb-4 grid min-w-0 gap-3 sm:mb-6 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="px-3 pb-3 pt-4 sm:px-5">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <CalendarDays className="h-4 w-4 shrink-0 text-slate-600" />
                  Calendar view
                </CardTitle>
                <CardDescription className="text-xs leading-5 sm:text-sm">
                  Holiday dates highlighted for {year}. Company custom days sit on top of the shared gazetted calendar.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:px-5 sm:pb-5">
                {loading ? (
                  <div className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading calendar...
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-2 sm:gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {Array.from({ length: 12 }, (_, monthIndex) => (
                        <HolidayMonth
                        key={monthIndex}
                        year={year}
                        monthIndex={monthIndex}
                        holidaysByDate={holidaysByDate}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card collapsible defaultOpen={false} collapseLabel="selected holiday details" className="border border-slate-200 shadow-sm">
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-sm leading-5 sm:text-base">
                  {selectedDate ? dateLabel(selectedDate) : "Selected date"}
                </CardTitle>
                <CardDescription className="text-xs leading-5 sm:text-sm">
                  {selectedHolidays.length > 0
                    ? `${selectedHolidays.length} holiday${selectedHolidays.length === 1 ? "" : "s"} on this date`
                    : "No holiday on the selected date"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-3 sm:p-4">
                {selectedHolidays.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-xs leading-5 text-slate-500 sm:py-8 sm:text-sm">
                    Select a highlighted date in the calendar to inspect its payroll source.
                  </div>
                ) : (
                  selectedHolidays.map((h) => {
                    const isCustom = h.company_id != null;
                    return (
                      <div key={`${h.id}-${h.display_date}`} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium text-slate-900">{h.name}</p>
                            <p className="text-xs text-slate-500">
                              {h.is_recurring ? `Repeats yearly from ${h.original_date}` : "Fixed date"}
                            </p>
                          </div>
                          {isCustom ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              Company
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                              Gazetted
                            </Badge>
                          )}
                        </div>
                        {h.notes && <p className="break-words text-xs leading-5 text-slate-500">{h.notes}</p>}
                        {isCustom && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDelete(h)}
                            className="mt-3 min-h-10 text-xs text-rose-600 hover:bg-rose-50 sm:h-9"
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="px-3 pb-2 pt-4 sm:px-5">
              <CardTitle className="text-sm sm:text-base">{filtered.length} {filtered.length === 1 ? "holiday" : "holidays"} in {year}</CardTitle>
              <CardDescription className="text-xs leading-5 sm:text-sm">Source list used for payroll checks and CSV export.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  No holidays on file for this year.
                </div>
              ) : (
                <>
                <div className="space-y-2 px-3 pb-3 md:hidden">
                  {filtered.map((h) => {
                    const isCustom = h.company_id != null;
                    return (
                      <article key={`mobile-${h.id}-${h.display_date}`} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-slate-900">{h.name}</p>
                            <p className="mt-0.5 text-xs tabular-nums text-slate-600">{dateLabel(h.display_date)}</p>
                          </div>
                          {isCustom ? (
                            <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-xs text-amber-700">Company</Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-50 text-xs text-slate-600">Gazetted</Badge>
                          )}
                        </div>
                        <div className="mt-2 flex min-w-0 items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="inline-flex items-center gap-1 text-xs text-slate-600">
                              {h.is_recurring ? <><Repeat2 className="h-3.5 w-3.5 shrink-0" />Repeats yearly</> : "Fixed date"}
                            </p>
                            {h.notes && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{h.notes}</p>}
                          </div>
                          {isCustom && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmDelete(h)}
                              className="h-10 w-10 shrink-0 p-0 text-rose-600 hover:bg-rose-50"
                              aria-label={`Delete ${h.name}`}
                              title={`Delete ${h.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-600">
                      <tr>
                        <th className="text-left py-2 pl-4">Date</th>
                        <th className="text-left py-2 px-2">Holiday</th>
                        <th className="text-left py-2 px-2">Source</th>
                        <th className="text-left py-2 px-2">Rule</th>
                        <th className="text-right py-2 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((h) => {
                        const isCustom = h.company_id != null;
                        return (
                          <tr key={`${h.id}-${h.display_date}`} className="border-b border-slate-100 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="py-2 pl-4 text-slate-700 tabular-nums">
                              {dateLabel(h.display_date)}
                            </td>
                            <td className="py-2 px-2 text-slate-900 font-medium">
                              {h.name}
                              {h.notes && <p className="mt-0.5 text-xs font-normal text-slate-500">{h.notes}</p>}
                            </td>
                            <td className="py-2 px-2">
                              {isCustom ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                                  <Building2 className="w-3 h-3" />Company custom
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 gap-1">
                                  <Globe className="w-3 h-3" />SA gazetted
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-2 text-xs leading-5 text-slate-600">
                              {h.is_recurring ? (
                                <span className="inline-flex items-center gap-1">
                                  <Repeat2 className="h-3.5 w-3.5" />
                                  Repeats yearly from {h.original_date}
                                </span>
                              ) : (
                                "Fixed date"
                              )}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {isCustom && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDelete(h)}
                                  className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                  aria-label={`Delete ${h.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </PortalShell>
      </div>

      <AddHolidayDialog
        open={adding}
        companyId={companyId}
        actorId={actorId}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); reload(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this company holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} on {confirmDelete && dateLabel(("display_date" in confirmDelete ? confirmDelete.display_date : confirmDelete.date))}.
              {/* Edge case: a recurring row shows one occurrence per
                  year, but the delete removes the single underlying
                  row, so EVERY year's occurrence goes with it. Say so. */}
              {confirmDelete?.is_recurring
                ? " This holiday repeats yearly; deleting removes it for every year, not just the one shown."
                : " Future shifts on this date will no longer be paid at 2x."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  const { error } = await supabase
                    .from("public_holidays")
                    .delete()
                    .eq("id", confirmDelete.id);
                  if (error) throw error;
                  if (companyId) {
                    void (supabase as any).from("audit_logs").insert({
                      company_id: companyId,
                      user_id: actorId || null,
                      action: "delete",
                      entity_type: "public_holiday",
                      entity_id: confirmDelete.id,
                      details: {
                        name: confirmDelete.name,
                        date: confirmDelete.date,
                        is_recurring: confirmDelete.is_recurring,
                      },
                    });
                  }
                  toast({ title: "Holiday removed" });
                  // PHO-A (PHO-5): broadcast to any open wage / payroll
                  // tab so cached rates refresh. No shared helper for
                  // this domain - inline CustomEvent is the cheapest
                  // forward-compat hook.
                  if (typeof window !== "undefined") {
                    try {
                      window.dispatchEvent(new CustomEvent("cateringms:holidays-updated", { detail: { id: confirmDelete.id, action: "delete" } }));
                    } catch { /* old browsers without CustomEvent polyfill */ }
                  }
                  setConfirmDelete(null);
                  reload();
                } catch (e: any) {
                  toast({ title: "Couldn't delete", description: e?.message, variant: "destructive" });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="text-base font-semibold tabular-nums text-slate-950 sm:text-lg">{value}</p>
    </div>
  );
}

function HolidayMonth({
  year,
  monthIndex,
  holidaysByDate,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  monthIndex: number;
  holidaysByDate: Map<string, HolidayOccurrence[]>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const monthName = new Date(year, monthIndex, 1).toLocaleDateString("en-ZA", { month: "long" });
  const firstDay = new Date(year, monthIndex, 1);
  const leading = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today = tenantTodayISO();
  const holidayDateCount = Array.from(holidaysByDate.keys()).filter((date) => isoParts(date).month === monthIndex + 1).length;
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <details className="group min-w-0 self-start rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-left [&::-webkit-details-marker]:hidden">
        <h3 className="min-w-0 text-sm font-semibold text-slate-900">{monthName}</h3>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-slate-600">
              {holidayDateCount} date{holidayDateCount === 1 ? "" : "s"}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t border-slate-100 px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1 text-xs font-semibold uppercase text-slate-500">
                {day}
              </div>
            ))}
            {cells.map((day, index) => {
              if (day == null) return <div key={`blank-${index}`} className="aspect-square" />;
              const key = dateKey(year, monthIndex + 1, day);
              const holidays = holidaysByDate.get(key) || [];
              const hasCustom = holidays.some((h) => h.company_id != null);
              const isSelected = selectedDate === key;
              const isToday = today === key;
              const title = holidays.length > 0
                ? holidays.map((h) => h.name).join(", ")
                : `${day} ${monthName}`;
              return (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-label={`${dateLabel(key)}${holidays.length > 0 ? `, ${title}` : ", no holiday"}${isToday ? ", today" : ""}`}
                  onClick={() => onSelectDate(key)}
                  className={`relative flex aspect-square min-h-9 items-center justify-center rounded-md border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : holidays.length > 0
                        ? hasCustom
                          ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                          : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100"
                        : "border-transparent text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span>{day}</span>
                  {isToday && (
                    <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-brand-primary"}`} />
                  )}
                  {holidays.length > 0 && (
                    <span className={`absolute bottom-1 h-1 w-4 rounded-full ${hasCustom ? "bg-amber-500" : "bg-slate-400"}`} />
                  )}
                </button>
              );
            })}
          </div>
      </div>
    </details>
  );
}

function AddHolidayDialog({
  open, companyId, actorId, onClose, onSaved,
}: {
  open: boolean;
  companyId: string | undefined;
  actorId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState<string>(tenantTodayISO());
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(tenantTodayISO());
      setName("");
      setNotes("");
      setRecurring(false);
    }
  }, [open]);

  const save = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    // PHO-A / PHO-B: date sanity check + recurring support. A fixed
    // company holiday should not be saved years in the past by
    // accident. A recurring row intentionally repeats by month/day,
    // so an earlier date is allowed as the anchor.
    const parts = isoParts(date);
    const parsed = new Date(parts.year, parts.month - 1, parts.day);
    if (!parts.year || !parts.month || !parts.day || !Number.isFinite(parsed.getTime())) {
      toast({ title: "Date invalid", description: "Pick a calendar date.", variant: "destructive" });
      return;
    }
    const todayParts = isoParts(tenantTodayISO());
    const today = new Date(todayParts.year, todayParts.month - 1, todayParts.day);
    const ms = parsed.getTime() - today.getTime();
    const days = Math.round(ms / (1000 * 60 * 60 * 24));
    if (!recurring && days < -30) {
      toast({ title: "Date too far in the past", description: "Pick a date within the last month or in the future.", variant: "destructive" });
      return;
    }
    if (!recurring && days > 365 * 3) {
      toast({ title: "Date too far ahead", description: "Pick a date within the next 3 years.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("public_holidays")
        .insert({
          company_id: companyId,
          date,
          name: name.trim(),
          is_recurring: recurring,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      void (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: actorId || null,
        action: "create",
        entity_type: "public_holiday",
        entity_id: data?.id || null,
        details: {
          name: name.trim(),
          date,
          is_recurring: recurring,
          notes: notes.trim() || null,
        },
      });
      toast({ title: "Holiday added" });
      // PHO-A (PHO-5): same broadcast pattern as the delete handler.
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new CustomEvent("cateringms:holidays-updated", { detail: { action: "add" } }));
        } catch { /* old browsers without CustomEvent polyfill */ }
      }
      onSaved();
    } catch (e: any) {
      toast({
        title: e?.code === "23505" ? "Holiday already exists" : "Couldn't save",
        description: e?.code === "23505"
          ? "A company holiday already exists on this date."
          : e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] max-w-md overflow-y-auto p-4 sm:w-[calc(100%-2rem)] sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-8 text-base sm:text-lg">Add company holiday</DialogTitle>
          <DialogDescription className="text-xs leading-5 sm:text-sm">
            Adds a date that triggers the 2x rate for any shift worked. Visible only to your team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual shutdown" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this is a holiday for your team" className="mt-1" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="pr-3">
              <Label htmlFor="holiday-recurring" className="text-sm font-medium text-slate-900">
                Repeat every year
              </Label>
              <p className="text-xs text-slate-500">
                Use this for annual company shutdowns or observances. Variable holidays should stay fixed.
              </p>
            </div>
            <Switch
              id="holiday-recurring"
              checked={recurring}
              onCheckedChange={setRecurring}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-brand-primary text-white hover:opacity-90">
            {saving ? "Saving..." : "Add holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PublicHolidaysPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <PublicHolidaysAdmin />
    </ProtectedRoute>
  );
}
