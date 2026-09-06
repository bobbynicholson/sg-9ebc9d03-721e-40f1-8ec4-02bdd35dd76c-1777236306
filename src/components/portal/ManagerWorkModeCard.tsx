// "Working / Managing only" toggle for kitchen_manager / cleaning_manager.
//
// Default is Managing only (oversight): the manager does not receive the crew
// task notifications staff get. Flipping to Working opts them into their
// department's crew - same task pings, treated like staff - until they clock
// out or the day rolls over (managerWorkModeService staleness guard).
//
// Renders NOTHING for non-manager roles, so it is safe to mount on any shared
// manager page.
import { useCallback, useEffect, useState } from "react";
import { Loader2, UserCheck, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  managerWorkModeService,
  isManagerRole,
  crewRoleForManager,
  isManagerWorkingNow,
} from "@/services/managerWorkModeService";
import { notificationService } from "@/services/notificationService";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForRoleHandoffNote,
  promptForWorkNote,
  saveRoleHandoffNote,
  type WorkRole,
} from "@/services/roleClockService";

function managerClockRole(role: string): WorkRole | null {
  if (role === "kitchen_manager" || role === "cleaning_manager") return role;
  return null;
}

export function ManagerWorkModeCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const activeRole = String(user?.active_role || user?.role || "");
  const userId = user?.id || "";
  const companyId = user?.company_id || "";
  const isManager = isManagerRole(activeRole);
  const workRole = managerClockRole(activeRole);

  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const state = await managerWorkModeService.getWorkMode(userId);
    setWorking(state.working);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!isManager || !userId) return;
    load();
    // Live-sync: an admin or auto clock-out can flip the flag underneath us.
    const channel = supabase
      .channel(`mgr-work-mode:${userId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => setWorking(isManagerWorkingNow(payload.new as any)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isManager, userId, load]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (!userId || saving) return;
      setSaving(true);
      const prev = working;
      setWorking(next); // optimistic
      let clockError: unknown = null;
      if (next && workRole) {
        try {
          const roleClock = await beginRoleClock({ companyId, userId, role: workRole });
          if (roleClock.closed.length > 0) {
            const note = await promptForRoleHandoffNote(roleClock.closed, workRole);
            await saveRoleHandoffNote(roleClock.closed, note);
          }
        } catch (error) {
          clockError = error;
        }
      } else if (!next && workRole) {
        try {
          const roleLabel = workRole.replace("_", " ");
          const note = await promptForWorkNote(
            `What did you complete as ${roleLabel} before clocking out?`,
            `Manual ${roleLabel} clock-out; no additional note supplied.`,
          );
          await endCurrentRoleClock({ companyId, userId, role: workRole, note, reason: "manual" });
        } catch (error) {
          clockError = error;
        }
      }
      if (clockError) {
        setWorking(prev);
        toast({ title: "Could not update work clock", description: clockError instanceof Error ? clockError.message : "Try again.", variant: "destructive" });
        setSaving(false);
        return;
      }
      const ok = await managerWorkModeService.setWorkMode(userId, next);
      if (!ok) {
        setWorking(prev);
        toast({ title: "Could not update", description: "Work mode change failed. Try again.", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({
        title: next ? "You are now Working" : "Managing only",
        description: next
          ? "You'll get the same task alerts as the crew until you clock out."
          : "You'll only see manager updates, not crew task alerts.",
      });
      // When a manager joins the floor, let the crew know (best-effort). Reuses
      // the crew broadcast so it lands in the same bell staff already watch.
      if (next && companyId) {
        const crewRole = crewRoleForManager(activeRole);
        if (crewRole) {
          try {
            await notificationService.broadcastNotification({
              companyId,
              type: "info",
              title: "Manager on the floor",
              message: `${user?.full_name || "A manager"} is now working with the crew.`,
              targetRoles: [activeRole as any, crewRole as any],
              priority: "low",
            });
          } catch {
            /* non-blocking */
          }
        }
      }
      setSaving(false);
    },
    [userId, saving, working, companyId, activeRole, user?.full_name, toast, workRole],
  );

  if (!isManager) return null;

  return (
    <PortalCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-2 ${working ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {working ? <UserCheck className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {working ? `Clocked in as ${workRole ? workRole.replace("_", " ") : "manager"}` : "Manager work clock is off"}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground max-w-md">
              {working
                ? "You receive the same task alerts as staff. Turn this off when you finish; your work note will be saved."
                : `Turn this on to clock in as ${workRole ? workRole.replace("_", " ") : "manager"} and work with the crew.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch checked={working} disabled={loading || saving} onCheckedChange={onToggle} aria-label="Toggle working mode" />
        </div>
      </div>
    </PortalCard>
  );
}

export default ManagerWorkModeCard;
