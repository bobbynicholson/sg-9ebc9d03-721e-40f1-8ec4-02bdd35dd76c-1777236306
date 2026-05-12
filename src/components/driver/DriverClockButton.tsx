/**
 * DriverClockButton -- one-tap clock-in / clock-out for the driver
 * dashboard.
 *
 * Phase 10 #10. Drivers had no in-app way to start a shift -- shifts
 * were either logged manually by admins via /admin/driver-management
 * after the fact, or back-dated by the driver via the settlement
 * page. Both broke the 'real-time clock' promise the BCEA fatigue
 * checks (Phase 7 #2) depend on.
 *
 * Behaviour:
 *   - On mount, query the driver's open shift (deleted_at IS NULL,
 *     actual_end IS NULL) to figure out what state to render.
 *   - If no open shift: big green 'Clock in' button. On click, INSERT
 *     a new driver_shifts row with actual_start = now, status =
 *     'active'.
 *   - If an open shift exists: amber 'Clock out (Xh Ym)' button + an
 *     auto-ticking elapsed counter. On click, UPDATE actual_end = now,
 *     status = 'completed'.
 *
 * No multiplier picker, no notes -- those belong on the admin
 * LogDriverShiftModal. The driver-side experience is intentionally
 * a single tap so it gets used in the moment.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, Play, Square, Loader2 } from "lucide-react";

interface OpenShift {
  id: string;
  actual_start: string;
}

const fmtElapsed = (startIso: string): string => {
  const ms = Date.now() - new Date(startIso).getTime();
  if (ms < 0 || isNaN(ms)) return "0m";
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export function DriverClockButton({
  driverId,
  companyId,
}: {
  driverId: string | null | undefined;
  companyId: string | null | undefined;
}) {
  const { toast } = useToast();
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // Tick once a minute so the elapsed label stays roughly current.
  useEffect(() => {
    if (!openShift) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [openShift]);
  // Use tick so the eslint check stays happy + the render re-runs.
  void tick;

  const refresh = async () => {
    if (!driverId) return;
    try {
      const { data } = await (supabase as any)
        .from("driver_shifts")
        .select("id, actual_start")
        .eq("driver_id", driverId)
        .is("deleted_at", null)
        .is("actual_end", null)
        .not("actual_start", "is", null)
        .order("actual_start", { ascending: false })
        .limit(1);
      const row = (data && data[0]) as OpenShift | undefined;
      setOpenShift(row || null);
    } catch {
      setOpenShift(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  const clockIn = async () => {
    if (!driverId || !companyId) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("driver_shifts")
        .insert({
          driver_id: driverId,
          company_id: companyId,
          actual_start: nowIso,
          shift_date: nowIso.slice(0, 10),
          status: "active",
        });
      if (error) throw error;
      toast({ title: "Clocked in", description: "Shift started." });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not clock in", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!openShift) return;
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("driver_shifts")
        .update({ actual_end: nowIso, status: "completed" })
        .eq("id", openShift.id);
      if (error) throw error;
      toast({ title: "Clocked out", description: "Shift saved." });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not clock out", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-3 text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking shift...
        </CardContent>
      </Card>
    );
  }

  if (openShift) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-700 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">On shift</p>
            <p className="text-xs text-amber-800/80 tabular-nums">
              {fmtElapsed(openShift.actual_start)} since clock in
            </p>
          </div>
          <Button
            size="sm"
            onClick={clockOut}
            disabled={busy}
            className="bg-amber-600 hover:bg-amber-700 shrink-0"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Square className="w-4 h-4 mr-1" />}
            Clock out
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-900">Off shift</p>
          <p className="text-xs text-emerald-800/80">Tap clock in when you start work.</p>
        </div>
        <Button
          size="sm"
          onClick={clockIn}
          disabled={busy}
          className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
          Clock in
        </Button>
      </CardContent>
    </Card>
  );
}
