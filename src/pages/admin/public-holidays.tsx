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
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Globe, Building2, Download, RefreshCw } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
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

function PublicHolidaysAdmin() {
  const { profile } = useAuth() as any;
  const companyId = profile?.company_id as string | undefined;
  const { toast } = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Holiday | null>(null);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    // Pull globals + this tenant's customs in one fetch.
    const { data } = await supabase
      .from("public_holidays")
      .select("*")
      .or(`company_id.is.null,company_id.eq.${companyId}`)
      .order("date", { ascending: true });
    setHolidays((data || []) as Holiday[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const filtered = useMemo(() => {
    return holidays.filter((h) => {
      const d = new Date(h.date);
      return d.getFullYear() === year;
    });
  }, [holidays, year]);

  const years = useMemo(() => {
    const set = new Set<number>();
    holidays.forEach((h) => {
      const y = new Date(h.date).getFullYear();
      if (!isNaN(y)) set.add(y);
    });
    set.add(new Date().getFullYear());
    set.add(new Date().getFullYear() + 1);
    return Array.from(set).sort();
  }, [holidays]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Public holidays - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Public holidays</h1>
                <p className="text-sm text-slate-600 mt-1">
                  SA gazetted dates plus any extras you observe. Shifts that land on these dates get paid at 2x per BCEA.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
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
                  const headers = ["Date", "Day", "Holiday", "Source", "Recurring", "Notes"];
                  const lines = [headers.join(",")];
                  for (const h of filtered) {
                    const d = new Date(h.date);
                    lines.push([
                      esc(h.date),
                      esc(d.toLocaleDateString("en-ZA", { weekday: "long" })),
                      esc(h.name || ""),
                      esc(h.company_id ? "company" : "gazetted"),
                      esc(h.is_recurring ? "yes" : "no"),
                      esc(h.notes || ""),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
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
              <Button onClick={() => setAdding(true)} className="bg-gradient-to-r from-rose-500 to-orange-500 text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Add company holiday
              </Button>
            </div>
          </div>

          <Card className="border-0 shadow-sm mb-4">
            <CardContent className="py-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Year</span>
              <div className="flex flex-wrap gap-1">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYear(y)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      year === y
                        ? "bg-rose-100 text-rose-700 border-rose-200"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "holiday" : "holidays"} in {year}</CardTitle>
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
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="text-left py-2 pl-4">Date</th>
                      <th className="text-left py-2 px-2">Holiday</th>
                      <th className="text-left py-2 px-2">Source</th>
                      <th className="text-right py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((h) => {
                      const d = new Date(h.date);
                      const isCustom = h.company_id != null;
                      return (
                        <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 pl-4 text-slate-700 tabular-nums">
                            {d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-2 px-2 text-slate-900 font-medium">{h.name}</td>
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
                            {h.notes && <p className="text-[11px] text-slate-500 mt-0.5">{h.notes}</p>}
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddHolidayDialog
        open={adding}
        companyId={companyId}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); reload(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this company holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} on {confirmDelete && new Date(confirmDelete.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}.
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

function AddHolidayDialog({
  open, companyId, onClose, onSaved,
}: {
  open: boolean;
  companyId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState<string>(toLocalISO(new Date()));
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(toLocalISO(new Date()));
      setName("");
      setNotes("");
    }
  }, [open]);

  const save = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    // PHO-A (PHO-6): date sanity check. The form silently accepted
    // dates in any year, so "27 Dec 2024" entered in 2026 would
    // persist as a historical record that the wage system would
    // never apply. Require the date to be parseable, not in the
    // distant past (>30 days back), and not too far in the future
    // (>3 years ahead). is_recurring is hardcoded false so true
    // historical entries can't auto-replay.
    const parsed = new Date(date);
    if (!Number.isFinite(parsed.getTime())) {
      toast({ title: "Date invalid", description: "Pick a calendar date.", variant: "destructive" });
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ms = parsed.getTime() - today.getTime();
    const days = Math.round(ms / (1000 * 60 * 60 * 24));
    if (days < -30) {
      toast({ title: "Date too far in the past", description: "Pick a date within the last month or in the future.", variant: "destructive" });
      return;
    }
    if (days > 365 * 3) {
      toast({ title: "Date too far ahead", description: "Pick a date within the next 3 years.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("public_holidays")
        .insert({
          company_id: companyId,
          date,
          name: name.trim(),
          is_recurring: false,
          notes: notes.trim() || null,
        });
      if (error) throw error;
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-rose-500 to-orange-500 text-white">
            {saving ? "Saving..." : "Add holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PublicHolidaysPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <PublicHolidaysAdmin />
    </ProtectedRoute>
  );
}
