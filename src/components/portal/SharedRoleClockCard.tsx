import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, Square, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForRoleHandoffNote,
  promptForWorkNote,
  saveRoleHandoffNote,
  type WorkRole,
} from "@/services/roleClockService";

const ROLE_LABELS: Record<WorkRole, string> = {
  driver: "Driver",
  waiter: "Waiter",
  kitchen: "Kitchen",
  cleaning: "Cleaning",
  shopping: "Shopping",
  kitchen_manager: "Kitchen manager",
  cleaning_manager: "Cleaning manager",
};

const elapsed = (startedAt: string): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

export function SharedRoleClockCard({ role }: { role: WorkRole }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id || "";
  const companyId = user?.company_id || "";
  const label = ROLE_LABELS[role];
  const [active, setActive] = useState<{ id: string; started_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
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
      .eq("role", role)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) {
      toast({ title: `Could not load ${label.toLowerCase()} clock`, description: error.message, variant: "destructive" });
      setActive(null);
    } else {
      setActive((data?.[0] as { id: string; started_at: string } | undefined) || null);
    }
    setLoading(false);
  }, [companyId, label, role, toast, userId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      setTick((value) => value + 1);
      void refresh();
    }, 15_000);
    const channel = supabase
      .channel(`role-clock-card-${role}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "role_work_sessions", filter: `user_id=eq.${userId}` }, () => { void refresh(); })
      .subscribe();
    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh, role, userId]);

  const clockIn = async () => {
    if (!userId || !companyId || busy) return;
    setBusy(true);
    try {
      const result = await beginRoleClock({ companyId, userId, role });
      if (result.closed.length > 0) {
        await saveRoleHandoffNote(result.closed, await promptForRoleHandoffNote(result.closed, role));
      }
      await refresh();
      toast({ title: `${label} clock started`, description: `Your shared ${label} timer is running.` });
    } catch (error) {
      toast({ title: `Could not start ${label.toLowerCase()} clock`, description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clockOut = async () => {
    if (!userId || !companyId || !active || busy) return;
    setBusy(true);
    try {
      const note = await promptForWorkNote(
        `What did you complete during this ${label} shift?`,
        `${label} shift completed; no additional note supplied.`,
      );
      await endCurrentRoleClock({ companyId, userId, role, note, reason: "manual" });
      await refresh();
      toast({ title: `${label} clock stopped`, description: `${label} hours and note were saved.` });
    } catch (error) {
      toast({ title: `Could not stop ${label.toLowerCase()} clock`, description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Card><CardContent className="flex items-center gap-2 p-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking {label.toLowerCase()} clock...</CardContent></Card>;

  return (
    <Card className={active ? "border-brand-primary/20 bg-brand-primary/5" : "border-slate-200"}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10"><Clock className="h-5 w-5 text-brand-primary" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{active ? `On ${label} shift` : "Off duty"}</p>
          <p className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{active ? `${elapsed(active.started_at)} since clock in` : `Start your shared ${label} timer before work.`}</p>
        </div>
        <Button size="sm" onClick={() => void (active ? clockOut() : clockIn())} disabled={busy} className="shrink-0 bg-brand-primary text-white hover:bg-brand-primary/90">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : active ? <Square className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
          {active ? "Clock out" : "Clock in"}
        </Button>
      </CardContent>
    </Card>
  );
}
