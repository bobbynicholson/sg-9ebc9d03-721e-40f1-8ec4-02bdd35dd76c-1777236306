import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Users, Clock, Loader2, Play, Square, ChefHat } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface Shift {
  id: string;
  staff_id: string | null;
  user_id: string | null;
  order_id: string | null;
  shift_start: string | null;
  shift_end: string | null;
  shift_type: string | null;
  is_active: boolean | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

export default function KitchenDutyRosterPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [active, setActive] = useState<Shift[]>([]);
  const [recent, setRecent] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [endingShift, setEndingShift] = useState<Shift | null>(null);
  const [handoffNotes, setHandoffNotes] = useState("");

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data: activeShifts } = await supabase
        .from("kitchen_duty_shifts")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("is_active", true)
        .order("shift_start", { ascending: false })
        .returns<Shift[]>();

      const { data: recentShifts } = await supabase
        .from("kitchen_duty_shifts")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("is_active", false)
        .order("shift_end", { ascending: false })
        .limit(20)
        .returns<Shift[]>();

      setActive(activeShifts || []);
      setRecent(recentShifts || []);

      const ids = new Set<string>();
      [...(activeShifts || []), ...(recentShifts || [])].forEach((s) => {
        if (s.staff_id) ids.add(s.staff_id);
      });
      if (ids.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("id", Array.from(ids))
          .returns<Profile[]>();
        const map: Record<string, Profile> = {};
        (profiles || []).forEach((p) => { map[p.id] = p; });
        setStaff(map);
      }
    } catch (e) {
      toast({ title: "Could not load duty roster", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const myActiveShift = useMemo(
    () => active.find((s) => s.staff_id === user?.id) ?? null,
    [active, user?.id],
  );

  const startShift = async () => {
    if (!user?.id || !user?.company_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("kitchen_duty_shifts").insert([{
        company_id: user.company_id,
        staff_id: user.id,
        user_id: user.id,
        shift_start: new Date().toISOString(),
        is_active: true,
        shift_type: "kitchen",
      }] as never);
      if (error) throw error;
      toast({ title: "Clocked in", description: "Welcome to your shift" });
      load();
    } catch (e: any) {
      toast({ title: "Could not clock in", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEndShift = (shift: Shift) => {
    setEndingShift(shift);
    setHandoffNotes("");
  };

  const confirmEndShift = async () => {
    if (!endingShift) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("kitchen_duty_shifts")
        .update({
          is_active: false,
          shift_end: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", endingShift.id);
      if (error) throw error;

      // Phase 1: hand-off notes ALWAYS save now. The previous flow silently
      // dropped them when the shift had no order_id (the common case). They
      // go to kitchen_handoffs so anyone starting the next shift sees them.
      if (handoffNotes.trim() && user?.id && user.company_id) {
        try {
          await supabase.from("kitchen_handoffs").insert([{
            company_id: user.company_id,
            author_id: user.id,
            shift_id: endingShift.id,
            body: handoffNotes.trim(),
          }] as never);

          // Also keep a per-order task_completions row when an order_id exists
          // (preserves the existing audit trail surface that admin views)
          if (endingShift.order_id) {
            await supabase.from("kitchen_task_completions").insert([{
              order_id: endingShift.order_id,
              completed_by: user.id,
              user_id: user.id,
              staff_id: user.id,
              task_type: "handoff",
              notes: handoffNotes.trim(),
              completed_at: new Date().toISOString(),
            }] as never);
          }
        } catch (handoffErr) {
          console.warn("Could not save hand-off note:", handoffErr);
        }
      }
      toast({ title: "Clocked out", description: "Hand-off note saved." });
      setEndingShift(null);
      setHandoffNotes("");
      load();
    } catch (e: any) {
      toast({ title: "Could not end shift", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fmtDuration = (start?: string | null, end?: string | null) => {
    if (!start) return "--";
    const a = new Date(start).getTime();
    const b = end ? new Date(end).getTime() : Date.now();
    const mins = Math.max(0, Math.floor((b - a) / 60000));
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <>
      <Head><title>Kitchen Duty Roster - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-3">
              <Users className="h-7 w-7 text-orange-600" />
              Kitchen Duty Roster
            </h1>
            <p className="text-sm text-slate-600 mt-1">Who is in the kitchen right now and recent shift history</p>
          </div>

          <Card className="mb-6 border-orange-200 bg-gradient-to-r from-orange-50 to-red-50">
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                  <ChefHat className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-600 flex items-center gap-1">
                    Your status
                    <InfoTooltip content="Whether you're clocked in for a shift right now." />
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {myActiveShift
                      ? `On shift -- ${fmtDuration(myActiveShift.shift_start)}`
                      : "Not clocked in"}
                  </p>
                </div>
              </div>
              {myActiveShift ? (
                <Button onClick={() => openEndShift(myActiveShift)} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
                  <Square className="h-4 w-4 mr-2" />Clock out
                </Button>
              ) : (
                <Button onClick={startShift} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Clocking in</> : <><Play className="h-4 w-4 mr-2" />Clock in</>}
                </Button>
              )}
            </CardContent>
          </Card>

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            On duty now -- {active.length}
            <InfoTooltip content="Everyone currently clocked in for a kitchen shift." />
          </h2>
          <Card className="mb-6">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : active.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No-one is currently on duty</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {active.map((s) => {
                    const p = s.staff_id ? staff[s.staff_id] : null;
                    return (
                      <li key={s.id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <ChefHat className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{p?.full_name ?? p?.email ?? "Unknown staff"}</div>
                          <div className="text-xs text-slate-500">{s.shift_type ?? "kitchen"} -- started {s.shift_start ? formatDistanceToNow(new Date(s.shift_start), { addSuffix: true }) : "--"}</div>
                        </div>
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 tabular-nums">
                          <Clock className="h-3 w-3 mr-1" />{fmtDuration(s.shift_start)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            Recent shifts
            <InfoTooltip content="The last 20 shifts that have ended, newest first." />
          </h2>
          <Card>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No completed shifts yet</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recent.map((s) => {
                    const p = s.staff_id ? staff[s.staff_id] : null;
                    return (
                      <li key={s.id} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <ChefHat className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{p?.full_name ?? p?.email ?? "Unknown staff"}</div>
                          <div className="text-xs text-slate-500">
                            {s.shift_end ? `Ended ${formatDistanceToNow(new Date(s.shift_end), { addSuffix: true })}` : "--"} -- {fmtDuration(s.shift_start, s.shift_end)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!endingShift} onOpenChange={(o) => { if (!o) { setEndingShift(null); setHandoffNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End shift</DialogTitle>
            <DialogDescription>
              Optional hand-off note for the next person on duty -- e.g. "starter prep done, mains in the walk-in, oven on 180 for 20 more min".
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={handoffNotes}
            onChange={(e) => setHandoffNotes(e.target.value)}
            rows={4}
            placeholder="Hand-off notes (optional)"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndingShift(null)} disabled={saving}>Cancel</Button>
            <Button onClick={confirmEndShift} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ending</> : "Clock out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
