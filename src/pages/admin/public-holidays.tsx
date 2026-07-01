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
import { toLocalISO } from "@/lib/localDate";

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
  const [selectedDate, setSelectedDate] = useState<string | null>(toLocalISO(new Date()));

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
        .select("*")
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

  // PHO-A (public-holidays audit, PHO-2): supabase realtime sub on
  // public_holidays. Catches a concurrent admin's add / delete so the
  // list stays current without a manual refresh. Filter is just
  // company-scope; gazetted (company_id IS NULL) changes are rare.
  useEffect(() => {
    if (!companyId) return;
    const sub = supabase
      .channel(`public-holidays-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "public_holidays", filter: `company_id=eq.${companyId}` }, () => { reload(); })
      .subscribe();
    return () => { sub.unsubscribe(); };
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
            title="Public holidays"
            icon={CalendarIcon}
            subtitle="SA gazetted dates plus any extras you observe. Shifts that land on these dates get paid at 2x per BCEA."
            actions={
            <>
              {/* Phase 28 #7: manual refresh. Year switching already
                  triggers a reload but a manual button covers the
                  case where another admin has just added a company
                  custom holiday from a different tab. */}
              <Button
                variant="outline"
                onClick={reload}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 22 #4: holidays CSV. Payroll and ops planning
                  cross-reference these against shift rosters, public-
                  holiday surcharges and venue closures. */}
              <Button
                variant="outline"
                disabled={filtered.length === 0}
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
                <Download className="w-4 h-4 mr-1.5" /> Export CSV
              </Button>
              <Button onClick={() => setAdding(true)} className="bg-brand-primary text-white hover:opacity-90">
                <Plus className="w-4 h-4 mr-1.5" /> Add company holiday
              </Button>
            </>
            }
          />
          <PageWorkbench />

          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="py-3 flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-normal text-slate-500 font-semibold">Year</span>
                <div className="flex flex-wrap gap-1">
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setYear(y)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                        year === y
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
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
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-slate-600" />
                  Calendar view
                </CardTitle>
                <CardDescription>
                  Holiday dates highlighted for {year}. Company custom days sit on top of the shared gazetted calendar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading calendar...
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
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

            <Card className="border border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {selectedDate ? dateLabel(selectedDate) : "Selected date"}
                </CardTitle>
                <CardDescription>
                  {selectedHolidays.length > 0
                    ? `${selectedHolidays.length} holiday${selectedHolidays.length === 1 ? "" : "s"} on this date`
                    : "No holiday on the selected date"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedHolidays.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
                    Select a highlighted date in the calendar to inspect its payroll source.
                  </div>
                ) : (
                  selectedHolidays.map((h) => {
                    const isCustom = h.company_id != null;
                    return (
                      <div key={`${h.id}-${h.display_date}`} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{h.name}</p>
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
                        {h.notes && <p className="text-xs text-slate-500">{h.notes}</p>}
                        {isCustom && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDelete(h)}
                            className="mt-3 h-8 text-rose-600 hover:bg-rose-50"
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
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "holiday" : "holidays"} in {year}</CardTitle>
              <CardDescription>Source list used for payroll checks and CSV export.</CardDescription>
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-[11px] uppercase tracking-normal text-slate-500 border-b border-slate-200 bg-slate-50">
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
                          <tr key={`${h.id}-${h.display_date}`} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 pl-4 text-slate-700 tabular-nums">
                              {dateLabel(h.display_date)}
                            </td>
                            <td className="py-2 px-2 text-slate-900 font-medium">
                              {h.name}
                              {h.notes && <p className="text-[11px] font-normal text-slate-500 mt-0.5">{h.notes}</p>}
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
                            <td className="py-2 px-2 text-xs text-slate-600">
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
              Future shifts on this date will no longer be paid at 2x.
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
      <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-950">{value}</p>
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
  const today = toLocalISO(new Date());
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{monthName}</h3>
        <span className="text-xs text-slate-500 tabular-nums">
          {Array.from(holidaysByDate.keys()).filter((d) => isoParts(d).month === monthIndex + 1).length}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1 text-[10px] font-semibold uppercase text-slate-400">
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
              onClick={() => onSelectDate(key)}
              className={`relative flex aspect-square min-h-8 items-center justify-center rounded-md border text-xs font-medium transition ${
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
  const [date, setDate] = useState<string>(toLocalISO(new Date()));
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(toLocalISO(new Date()));
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add company holiday</DialogTitle>
          <DialogDescription>
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
