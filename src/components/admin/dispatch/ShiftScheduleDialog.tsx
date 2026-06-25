/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trash2, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shiftService, type DriverShift } from "@/services/shiftService";
import { toLocalISO } from "@/lib/localDate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string | null;
  driverName: string;
  companyId: string | null;
}

function dateToISO(d: Date): string {
  return toLocalISO(d);
}

/**
 * Two-week schedule editor for one driver. Each row is a date with a planned
 * start / end time. Save commits all changes in one round trip via individual
 * upserts (the table doesn't have a unique index for true upsert).
 */
export function ShiftScheduleDialog({ open, onOpenChange, driverId, driverName, companyId }: Props) {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<DriverShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Local edit state per shift_date keyed for fast lookup.
  // Stored as { id, plannedStart, plannedEnd, status, notes, dirty }
  const [edits, setEdits] = useState<Record<string, any>>({});

  const startDate = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(dateToISO(d));
  }

  useEffect(() => {
    if (!open || !driverId) return;
    const from = dates[0];
    const to = dates[dates.length - 1];
    setLoading(true);
    setError("");
    shiftService.getShiftsForDriver(driverId, from, to).then(rows => {
      setShifts(rows);
      const map: Record<string, any> = {};
      for (const date of dates) {
        const row = rows.find(r => r.shift_date === date);
        map[date] = {
          id: row?.id ?? null,
          plannedStart: row?.planned_start ?? "",
          plannedEnd: row?.planned_end ?? "",
          status: row?.status ?? "scheduled",
          dirty: false,
        };
      }
      setEdits(map);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driverId]);

  const update = (date: string, patch: Partial<{ plannedStart: string; plannedEnd: string }>) => {
    setEdits(e => ({
      ...e,
      [date]: { ...e[date], ...patch, dirty: true },
    }));
  };

  const clear = (date: string) => {
    setEdits(e => ({
      ...e,
      [date]: { ...e[date], plannedStart: "", plannedEnd: "", dirty: true },
    }));
  };

  const handleSave = async () => {
    if (!driverId || !companyId) { setError("Missing driver or company."); return; }
    setSaving(true);
    setError("");
    try {
      let saved = 0;
      for (const date of dates) {
        const e = edits[date];
        if (!e?.dirty) continue;
        const hasTimes = e.plannedStart && e.plannedEnd;
        if (!hasTimes && !e.id) continue; // nothing to do
        if (!hasTimes && e.id) {
          // user cleared a previously scheduled shift -> soft delete
          await shiftService.deleteShift(e.id);
          saved += 1;
          continue;
        }
        await shiftService.upsertShift({
          id: e.id ?? undefined,
          companyId,
          driverId,
          shiftDate: date,
          plannedStart: e.plannedStart,
          plannedEnd: e.plannedEnd,
        });
        saved += 1;
      }
      toast({ title: `Schedule saved`, description: `${saved} shift change${saved === 1 ? "" : "s"} applied.` });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save schedule.");
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = (iso: string): { label: string; isToday: boolean; isWeekend: boolean } => {
    const d = new Date(iso);
    const today = dateToISO(new Date());
    const dow = d.getDay();
    const formatter = new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short" });
    return { label: formatter.format(d), isToday: iso === today, isWeekend: dow === 0 || dow === 6 };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Shift schedule · {driverName}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Next 14 days. Set start and end times for each day the driver should be available.
            Empty rows mean off-duty. Used by the dispatch capacity gate and the "Drivers on shift" KPI.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
            Loading schedule...
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
            {dates.map(date => {
              const e = edits[date] || {};
              const { label, isToday, isWeekend } = dayLabel(date);
              return (
                <div
                  key={date}
                  className={`grid grid-cols-12 gap-2 items-center px-3 py-2 ${
                    isToday ? "bg-blue-50/40" : isWeekend ? "bg-slate-50/40" : ""
                  }`}
                >
                  <div className="col-span-4">
                    <p className={`text-sm font-medium ${isToday ? "text-blue-700" : "text-slate-900"}`}>
                      {label}
                      {isToday && <Badge className="ml-1.5 bg-blue-100 text-blue-800 border-0 text-[9px]">Today</Badge>}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="time"
                      value={e.plannedStart || ""}
                      onChange={ev => update(date, { plannedStart: ev.target.value })}
                      className="h-9 text-sm"
                      placeholder="Off"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="time"
                      value={e.plannedEnd || ""}
                      onChange={ev => update(date, { plannedEnd: ev.target.value })}
                      className="h-9 text-sm"
                      placeholder="Off"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    {(e.plannedStart || e.plannedEnd) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => clear(date)}
                        title="Clear this day"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {e.status === "active" && (
                      <Badge className="bg-brand-primary/15 text-brand-primary border-0 text-[10px] gap-1">
                        <Clock className="w-3 h-3" />
                        Active
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving || loading} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving..." : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
