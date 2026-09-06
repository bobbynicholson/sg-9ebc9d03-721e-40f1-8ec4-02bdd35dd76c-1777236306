import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, Square, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForRoleHandoffNote,
  promptForWorkNote,
  saveRoleHandoffNote,
} from "@/services/roleClockService";

interface WaiterClockButtonProps {
  userId: string | null | undefined;
  companyId: string | null | undefined;
}

interface ActiveWaiterClock {
  id: string;
  started_at: string;
}

const elapsed = (startedAt: string): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

/**
 * Waiter's own shared role clock. This must not use DriverClockButton:
 * waiter and driver are separate work roles even when the same person has
 * both assignments.
 */
export function WaiterClockButton({ userId, companyId }: WaiterClockButtonProps) {
  const { toast } = useToast();
  const [active, setActive] = useState<ActiveWaiterClock | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const refresh = async () => {
    if (!userId || !companyId) {
      setActive(null);
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("role_work_sessions")
      .select("id, started_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("role", "waiter")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) {
      toast({ title: "Could not load waiter clock", description: error.message, variant: "destructive" });
      setActive(null);
    } else {
      setActive((data?.[0] as ActiveWaiterClock | undefined) || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
    // refresh uses stable props only; the interval is deliberately local to
    // this small clock card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId]);

  const clockIn = async () => {
    if (!userId || !companyId || busy) return;
    setBusy(true);
    try {
      const result = await beginRoleClock({
        companyId,
        userId,
        role: "waiter",
      });
      if (result.closed.length > 0) {
        const note = await promptForRoleHandoffNote(result.closed, "waiter");
        await saveRoleHandoffNote(result.closed, note);
      }
      await refresh();
      toast({ title: "Waiter clock started", description: "Your shared Waiter timer is running." });
    } catch (error) {
      toast({ title: "Could not start waiter clock", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!userId || !companyId || !active || busy) return;
    setBusy(true);
    try {
      const note = await promptForWorkNote(
        "What did you complete during this Waiter shift?",
        "Waiter shift completed; no additional note supplied.",
      );
      await endCurrentRoleClock({
        companyId,
        userId,
        role: "waiter",
        note,
      });
      await refresh();
      toast({ title: "Waiter clock stopped", description: "Your Waiter hours and note were saved." });
    } catch (error) {
      toast({ title: "Could not stop waiter clock", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-3 text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking Waiter clock...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={active ? "border-brand-primary/20 bg-brand-primary/5" : "border-slate-200"}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-brand-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {active ? "On Waiter shift" : "Off duty"}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {active ? `${elapsed(active.started_at)} since clock in` : "Start your shared Waiter timer before service."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => void (active ? clockOut() : clockIn())}
          disabled={busy}
          className="shrink-0 bg-brand-primary text-white hover:bg-brand-primary/90"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : active ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
          {active ? "Clock out" : "Clock in"}
        </Button>
      </CardContent>
    </Card>
  );
}
