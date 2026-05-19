/**
 * CleaningDutyWidget - live clock-in/out + on-duty roster for the
 * cleaning team.
 *
 * Wave 39 rebuild. Original shipped with 4 stacked bugs:
 *   1. Passed user.id where the service expected company_id
 *      (so getOnDutyCleaningStaff returned an empty list every
 *      time - nobody's company_id ever matches a user.id).
 *   2. Same bug on startCleaningDuty - the duty row was inserted
 *      with company_id = user.id, breaking RLS lookups + the
 *      "currently on duty" join.
 *   3. Read duty_started_at off the row but the column didn't
 *      exist in the DB (added in 20260515160000 migration).
 *   4. Component imported into the cleaning dashboard but never
 *      actually rendered in JSX - so even if 1-3 were fixed, no
 *      user could see it.
 *
 * Wave 39 also Silicon-Valley-polishes the UI to match the kitchen
 * duty roster (Wave 35): gradient avatar with initials, live pulse
 * dot when on duty, sentence-case h2 heading, illustrated empty
 * state.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, CheckCircle2, Activity, Play, Square, Sparkles, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface DutyRow {
  id: string;
  user_id: string;
  duty_started_at: string | null;
  equipment_verified: boolean | null;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

const initialsOf = (name: string | null | undefined, fallback: string | null | undefined): string => {
  const seed = (name || fallback || "?").trim();
  return seed
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
};

const formatDuration = (startTime: string | null): string => {
  if (!startTime) return "just now";
  const start = new Date(startTime).getTime();
  if (Number.isNaN(start)) return "—";
  const diffMs = Math.max(0, Date.now() - start);
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

export function CleaningDutyWidget() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [onDutyStaff, setOnDutyStaff] = useState<DutyRow[]>([]);
  const [myCurrentDuty, setMyCurrentDuty] = useState<DutyRow | null>(null);

  // Wave 40.4: today's planned cleaning shift for the current
  // user. Shows "Rostered 13:00-17:00 today" + lateness chip --
  // mirror of what Wave 36.1 added on /team-portal/kitchen/duty.
  interface RosteredShift {
    id: string;
    planned_start: string | null;
    planned_end: string | null;
    actual_start: string | null;
    shift_type: string;
  }
  const [myRoster, setMyRoster] = useState<RosteredShift | null>(null);

  const companyId: string | null = user?.company_id || null;

  const loadOnDutyStaff = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const staff = await equipmentTrackingService.getOnDutyCleaningStaff(companyId);
      // Cast through unknown - the DB types haven't been regenerated
      // since the Wave 39 migration added duty_started_at +
      // equipment_verified columns to cleaning_duty_logs.
      const rows = (staff || []) as unknown as DutyRow[];
      setOnDutyStaff(rows);
      const myDuty = rows.find((s) => s.user_id === user?.id);
      setMyCurrentDuty(myDuty || null);

      // Wave 40.4: pull today's planned cleaning shift if any.
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        const { data: rosterRow } = await (supabase as any)
          .from("kitchen_shifts")
          .select("id, planned_start, planned_end, actual_start, shift_type")
          .eq("company_id", companyId)
          .eq("staff_id", user?.id)
          .eq("shift_date", todayIso)
          .in("shift_type", ["cleaning", "kitchen_and_cleaning"])
          .is("deleted_at", null)
          .maybeSingle();
        setMyRoster(rosterRow || null);
      } catch (rosterErr) {
        console.warn("[CleaningDutyWidget] roster lookup failed:", rosterErr);
      }
    } catch (e: any) {
      console.warn("[CleaningDutyWidget] load failed:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [companyId, user?.id]);

  useEffect(() => {
    void loadOnDutyStaff();
    // 30s tick so durations stay roughly current.
    const t = setInterval(loadOnDutyStaff, 30_000);
    return () => clearInterval(t);
  }, [loadOnDutyStaff]);

  // CLN2-H (CLN2-68): best-effort GPS capture at clock-in. Resolves
  // with NULL coords on denial / unsupported / timeout so we still
  // let the cleaner start their shift. 8-second timeout matches the
  // driver geofence path so the device doesn't sit on the spinner.
  const captureGeolocation = (): Promise<{
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
  }> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve({ lat: null, lng: null, accuracyM: null });
        return;
      }
      let settled = false;
      const failsafe = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ lat: null, lng: null, accuracyM: null });
        }
      }, 8000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true;
          clearTimeout(failsafe);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? null,
          });
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(failsafe);
          resolve({ lat: null, lng: null, accuracyM: null });
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 30_000 },
      );
    });
  };

  const handleStartDuty = async () => {
    if (!user?.id || !companyId) return;
    setBusy(true);
    try {
      const { lat, lng, accuracyM } = await captureGeolocation();
      await equipmentTrackingService.startCleaningDuty({
        userId: user.id,
        companyId,
        clockInLat: lat,
        clockInLng: lng,
        clockInAccuracyM: accuracyM,
      });
      toast({
        title: "Clocked in",
        description: lat != null
          ? "Welcome to your cleaning shift."
          : "Welcome - GPS unavailable, admin may follow up.",
      });
      await loadOnDutyStaff();
    } catch (e: any) {
      toast({
        title: "Could not clock in",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleEndDuty = async () => {
    if (!myCurrentDuty) return;
    setBusy(true);
    try {
      await equipmentTrackingService.endCleaningDuty(myCurrentDuty.id);
      toast({ title: "Clocked out", description: "Shift saved. Don't forget the equipment check." });
      await loadOnDutyStaff();
    } catch (e: any) {
      toast({
        title: "Could not clock out",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onShift = !!myCurrentDuty;
  const otherStaff = onDutyStaff.filter((s) => s.user_id !== user?.id);

  return (
    <Card
      className={`border-2 ${
        onShift
          ? "border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50"
          : "border-slate-200 bg-white"
      } shadow-sm mb-6`}
    >
      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Status row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold shadow-sm ${
                onShift
                  ? "bg-gradient-to-br from-cyan-500 to-blue-600"
                  : "bg-slate-300"
              }`}>
                {initialsOf(user?.full_name, user?.email)}
              </div>
              {onShift && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" title="Live - on shift" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-600 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Your status
              </p>
              <p className="text-base font-semibold text-slate-900 truncate">
                {onShift ? `On duty · ${formatDuration(myCurrentDuty?.duty_started_at)}` : "Off duty"}
              </p>
              {/* Wave 40.4: rostered cleaning shift line + lateness
                  chip. Mirror of Wave 36.1 kitchen pattern. */}
              {myRoster && myRoster.planned_start && myRoster.planned_end && (() => {
                const [sh, sm] = (myRoster.planned_start || "0:0").split(":").map(Number);
                const startedToday = new Date();
                startedToday.setHours(sh || 0, sm || 0, 0, 0);
                const lateMin = !onShift && !myRoster.actual_start
                  ? Math.floor((Date.now() - startedToday.getTime()) / 60000)
                  : 0;
                return (
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 flex-wrap">
                    <CalendarIcon className="w-3 h-3 text-slate-500" />
                    Rostered <strong className="text-slate-900">{myRoster.planned_start.slice(0,5)}-{myRoster.planned_end.slice(0,5)}</strong>
                    {lateMin > 0 && lateMin < 240 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {lateMin}m late
                      </span>
                    )}
                    {onShift && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                        Linked to shift
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
          </div>
          <div className="flex-shrink-0">
            {onShift ? (
              <Button
                onClick={handleEndDuty}
                disabled={busy}
                className="bg-rose-600 hover:bg-rose-700 gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                Clock out
              </Button>
            ) : (
              <Button
                onClick={handleStartDuty}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Clock in
              </Button>
            )}
          </div>
        </div>

        {/* Live floor */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-cyan-600" />
            Live floor
            <span className="text-xs font-normal text-slate-500 tabular-nums">
              · {onDutyStaff.length} on duty
            </span>
          </h3>
          {loading && onDutyStaff.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
            </div>
          ) : onDutyStaff.length === 0 ? (
            <div className="text-center py-6 px-4 bg-white/60 rounded-lg border border-dashed border-slate-200">
              <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <Clock className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-700">Quiet floor</p>
              <p className="text-xs text-slate-500 mt-0.5">When the team clocks in, they'll show up here in real time.</p>
            </div>
          ) : otherStaff.length === 0 ? (
            <p className="text-xs text-slate-500 px-1">It's just you on the floor right now.</p>
          ) : (
            <ul className="space-y-2">
              {otherStaff.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                      {initialsOf(s.profile?.full_name, s.profile?.email)}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {s.profile?.full_name || s.profile?.email || "Team member"}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      On for {formatDuration(s.duty_started_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {s.equipment_verified && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Verified
                      </Badge>
                    )}
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] tabular-nums">
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      Live
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
