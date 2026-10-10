/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kitchen Staff Tile Board (Phase 5C).
 *
 * Replaces the single "Start Duty / End Duty" panel with a grid of staff
 * tiles. The tablet on the wall is one login - the chef on duty taps each
 * person's tile to clock them in or out.
 *
 * Tile states:
 *   - Off-shift  - slate, "Tap to clock in"
 *   - On-shift   - emerald, live timer in big tabular numbers
 *   - On break   - amber, "Break: 12m" timer, primary tap = end break
 *
 * Long-press (or the small pencil) opens the manual-override dialog so the
 * chef can fix a missed clock-out, back-date a clock-in, or add a missed
 * shift. Override always requires a reason - audit trail stays clean.
 *
 * No rates anywhere. The board reads `listStaffPublic` which omits the
 * rate columns at the SQL level.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChefHat, Clock, Coffee, Pencil, Loader2, Users, AlertTriangle, ChevronRight, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { canManageCleaningTeam, canManageKitchenTeam } from "@/lib/authGuards";
import { toLocalISO } from "@/lib/localDate";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import {
  kitchenStaffService,
  liveWorkedMinutes,
  type KitchenStaffPublic,
  type KitchenShift,
} from "@/services/kitchenStaffService";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForRoleHandoffNote,
  saveRoleHandoffNote,
} from "@/services/roleClockService";

function fmtMins(mins: number): string {
  if (!Number.isFinite(mins)) return "--";
  const m = Math.max(0, Math.floor(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

interface OverrideDraft {
  shift_start: string;          // datetime-local string
  shift_end: string;            // datetime-local string ("" = leave open)
  total_break_min: string;
  reason: string;
  notes: string;
  closeImmediately: boolean;    // when staff is already on shift, "fix end time"
}

const EMPTY_OVERRIDE: OverrideDraft = {
  shift_start: "",
  shift_end: "",
  total_break_min: "0",
  reason: "",
  notes: "",
  closeImmediately: false,
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // datetime-local format: YYYY-MM-DDTHH:MM (no seconds, local TZ)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// The tablet clock is the primary attendance flow, whereas the roster uses
// kitchen_shifts. Mirror the attendance marker into the matching planned
// kitchen shift as a best effort. A roster gap must never prevent a valid
// clock-in/out, so callers deliberately do not await an error as a failure.
async function syncKitchenRosterAttendance({
  companyId,
  profileId,
  staffMemberId,
  at,
  action,
}: {
  companyId: string;
  profileId: string | null;
  staffMemberId: string;
  at: Date;
  action: "start" | "end";
}): Promise<void> {
  try {
    const shiftDate = toLocalISO(at);
    let query = (supabase as any)
      .from("kitchen_shifts")
      .select("id")
      .eq("company_id", companyId)
      .eq("shift_date", shiftDate)
      .in("shift_type", ["kitchen", "kitchen_and_cleaning"])
      .is("deleted_at", null)
      .order("planned_start", { ascending: true })
      .limit(1);

    // A roster may be for a login-backed profile or a tablet-only staff
    // directory member. Match either identity so both clock-in styles are
    // reflected on the schedule.
    query = profileId
      ? query.or(`staff_id.eq.${profileId},staff_member_id.eq.${staffMemberId}`)
      : query.eq("staff_member_id", staffMemberId);

    query = action === "start"
      ? query.is("actual_start", null)
      : query.not("actual_start", "is", null).is("actual_end", null);
    const { data, error } = await query;
    if (error) {
      console.warn("Could not find matching kitchen roster shift (non-blocking):", error);
      return;
    }
    const rosterShift = data?.[0];
    if (!rosterShift?.id) return;

    const update = action === "start"
      ? { actual_start: at.toISOString(), status: "active" }
      : { actual_end: at.toISOString(), status: "completed" };
    const { error: updateError } = await (supabase as any)
      .from("kitchen_shifts")
      .update(update)
      .eq("id", rosterShift.id)
      .eq("company_id", companyId);
    if (updateError) console.warn("Could not sync kitchen roster attendance (non-blocking):", updateError);
  } catch (error) {
    console.warn("Could not sync kitchen roster attendance (non-blocking):", error);
  }
}

export function KitchenStaffTileBoard({
  department = "kitchen",
}: {
  /** Which duty board this is. Drives staff filtering (only people whose
   *  departments[] includes this) + which department gets stamped on
   *  every shift this board creates. Default 'kitchen' so existing
   *  callers don't need to change anything. */
  department?: string;
} = {}) {
  const { user, profile, userRoles, activeRole } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  // Wave 45 follow-up - fall back to profile.company_id when
  // user.company_id is undefined. AuthContext populates user.company_id
  // from userProfile.company_id but there's a brief window during
  // profile load where user is set without the join completing. The
  // silent `if (!companyId) return` in click handlers below was making
  // tap-to-clock-in look broken with zero feedback.
  const companyId = ((user as any)?.company_id || (profile as any)?.company_id) as string | undefined;
  const roleSet = useMemo(() => {
    return [
      ...(Array.isArray(userRoles) ? userRoles : []),
      activeRole,
      (user as any)?.role,
      (user as any)?.active_role,
      (profile as any)?.role,
      (profile as any)?.active_role,
    ].filter(Boolean) as UserRole[];
  }, [user, profile, userRoles, activeRole]);

  const [staff, setStaff] = useState<KitchenStaffPublic[]>([]);
  const [openShifts, setOpenShifts] = useState<KitchenShift[]>([]);
  const [loading, setLoading] = useState(true);
  // Command-centre restructure (2026-07-02): a failed staff load used
  // to toast once and then render the "No staff yet" empty state - the
  // chef would go chase the owner to "add staff" that already exist.
  // Failures now render a recovery card with a Retry instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(new Date());
  const [isExpanded, setIsExpanded] = useState(false);

  // Manual override dialog state
  const [overrideTarget, setOverrideTarget] = useState<{
    staff: KitchenStaffPublic;
    existingShift: KitchenShift | null;
  } | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>(EMPTY_OVERRIDE);
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Confirm dialog used when clocking out - gives the chef one last
  // glance at the worked-time summary before the shift is closed.
  const [closingTarget, setClosingTarget] = useState<{
    staff: KitchenStaffPublic;
    shift: KitchenShift;
  } | null>(null);
  const [closeNote, setCloseNote] = useState("");
  // Wave 45 follow-up - clock-in confirmation. Captures the moment
  // the operator tapped the tile so the dialog can show the exact
  // start time we'd record. Lets misclicks bail out without locking
  // anyone into a wrong shift start.
  const [openingTarget, setOpeningTarget] = useState<{
    staff: KitchenStaffPublic;
    capturedAt: Date;
  } | null>(null);

  // Long-press handling - used to surface the override dialog from a tile
  // tap-and-hold without stealing the regular click.
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef<boolean>(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [s, sh] = await Promise.all([
        kitchenStaffService.listStaffPublic(companyId, { department }),
        kitchenStaffService.listOpenShifts(companyId, { department }),
      ]);
      setStaff(s);
      setOpenShifts(sh);
    } catch (e: any) {
      setLoadError(e?.message || "We couldn't load the team board.");
      toast({ title: "Could not load staff", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId, department]);

  // Live tick every 30s so the on-shift / on-break timers move without us
  // re-fetching the whole shifts list.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Index open shifts by staff_member_id so each tile renders in O(1)
  const shiftByStaff = useMemo(() => {
    const m = new Map<string, KitchenShift>();
    for (const sh of openShifts) m.set(sh.staff_member_id, sh);
    return m;
  }, [openShifts]);

  const onDutyCount = openShifts.length;
  const availableCount = Math.max(0, staff.length - onDutyCount);
  const canManageThisBoard = department === "cleaning"
    ? canManageCleaningTeam(roleSet)
    : canManageKitchenTeam(roleSet);
  const currentRole = String(activeRole || (user as any)?.active_role || (profile as any)?.active_role || "").toLowerCase();
  const managerRoleForBoard = department === "cleaning" ? "cleaning_manager" : "kitchen_manager";
  const hasOwnLinkedTile = useMemo(
    () => !!user?.id && staff.some((s) => s.linked_profile_id === user.id),
    [staff, user?.id],
  );
  const isLegacySharedTeamLogin =
    !hasOwnLinkedTile &&
    (
      (department === "cleaning" && roleSet.includes(UserRole.CLEANING_STAFF)) ||
      (department !== "cleaning" && roleSet.includes(UserRole.KITCHEN_STAFF))
    );
  const isOwnManagerTile = (s: KitchenStaffPublic) =>
    currentRole === managerRoleForBoard && !!user?.id && (
      s.linked_profile_id === user.id ||
      (!!s.email && !!user?.email && s.email.toLowerCase() === user.email.toLowerCase())
    );
  const canControlStaff = (s: KitchenStaffPublic) =>
    !isOwnManagerTile(s) && (canManageThisBoard || isLegacySharedTeamLogin || (!!user?.id && s.linked_profile_id === user.id));

  // ── Click handlers ───────────────────────────────────────────────────────

  const setBusyFor = (id: string, on: boolean) => {
    setBusy(prev => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Wave 45 follow-up - the tap captures the moment + opens the
  // confirmation dialog. Bobby's note: shift accuracy matters
  // (every minute = pay), AND misclicks happen, so we surface a
  // friendly "yes, start shift now" check before committing.
  // Also avoids the surveillance-vibe by framing it positively.
  const promptClockIn = (s: KitchenStaffPublic) => {
    if (!companyId) {
      console.error("[KitchenStaffTileBoard] promptClockIn: companyId missing", { user, profile });
      toast({
        title: "Couldn't open clock-in",
        description: "Your session is still loading. Refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }
    setOpeningTarget({ staff: s, capturedAt: new Date() });
  };

  // The actual write - runs after the dialog confirm. Uses the
  // capturedAt time from the original tap so we don't drift if the
  // operator stares at the dialog for a few seconds before confirming.
  const handleConfirmClockIn = async () => {
    if (!openingTarget || !companyId) return;
    const { staff: s, capturedAt } = openingTarget;
    // Double-tap guard: the dialog action can be hammered before the
    // close animation lands, which would insert two open shifts.
    if (busy.has(s.id)) return;
    setBusyFor(s.id, true);
    try {
      // A linked staff tile represents the authenticated person. Keep its
      // shared role timer in sync so starting kitchen work closes an active
      // waiter/driver/cleaning timer for that same person. Do not do this
      // when a manager is clocking in somebody else from the shared tablet.
      // The linked profile is the actual person, so use it even when a
      // manager is operating the shared tablet on that person's behalf.
      const sharedUserId = s.linked_profile_id ||
        ((s.email && user?.email && s.email.toLowerCase() === user.email.toLowerCase()) ? user?.id : null) ||
        ((!s.linked_profile_id && isLegacySharedTeamLogin) ? user?.id : null);
      if (sharedUserId) {
        const workRole = department === "cleaning" ? "cleaning" : "kitchen";
        const roleClock = await beginRoleClock({
          companyId,
          userId: sharedUserId,
          role: workRole,
          startedAt: capturedAt.toISOString(),
        });
        if (roleClock.closed.length > 0) {
          await saveRoleHandoffNote(
            roleClock.closed,
            await promptForRoleHandoffNote(roleClock.closed, workRole),
          );
        }
      }
      // Open the department row only after the shared lock and any handoff
      // note have completed. This prevents a brief second active timer and
      // ensures a failed lock never creates an unprotected legacy shift.
      await kitchenStaffService.clockIn({
        companyId,
        staffMemberId: s.id,
        clockedInBy: user?.id || null,
        department,
        overrideStartAt: capturedAt.toISOString(),
      });
      if (department === "kitchen") {
        await syncKitchenRosterAttendance({
          companyId,
          profileId: s.linked_profile_id,
          staffMemberId: s.id,
          at: capturedAt,
          action: "start",
        });
      }
      setOpeningTarget(null);
      toast({
        title: `${s.full_name} is on shift`,
        description: "Their hours are tracking now - nice one.",
      });
      load();
    } catch (e: any) {
      console.error("[KitchenStaffTileBoard] clockIn failed:", e);
      toast({ title: "Could not clock in", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setBusyFor(s.id, false);
    }
  };

  const confirmClockOut = (s: KitchenStaffPublic, sh: KitchenShift) => {
    setCloseNote("");
    setClosingTarget({ staff: s, shift: sh });
  };

  const handleClockOut = async () => {
    if (!closingTarget) return;
    const { staff: s, shift: sh } = closingTarget;
    if (busy.has(s.id)) return;
    setBusyFor(s.id, true);
    try {
      const note = closeNote.trim() || "Manual kitchen staff clock-out; no additional note supplied.";
      await kitchenStaffService.clockOut({
        shiftId: sh.id,
        clockedOutBy: user?.id || null,
        notes: note,
      });
      if (department === "kitchen" && companyId) {
        await syncKitchenRosterAttendance({
          companyId,
          profileId: s.linked_profile_id,
          staffMemberId: s.id,
          at: new Date(),
          action: "end",
        });
      }
      const sharedUserId = s.linked_profile_id ||
        ((s.email && user?.email && s.email.toLowerCase() === user.email.toLowerCase()) ? user?.id : null) ||
        ((!s.linked_profile_id && isLegacySharedTeamLogin) ? user?.id : null);
      if (sharedUserId && companyId) {
        await endCurrentRoleClock({
          companyId,
          userId: sharedUserId,
          role: department === "cleaning" ? "cleaning" : "kitchen",
          reason: "manual",
          note,
        });
      }
      toast({ title: "Clocked out", description: s.full_name });
      setCloseNote("");
      setClosingTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Could not clock out", description: e?.message, variant: "destructive" });
    } finally {
      setBusyFor(s.id, false);
    }
  };

  const handleToggleBreak = async (s: KitchenStaffPublic, sh: KitchenShift) => {
    setBusyFor(s.id, true);
    try {
      await kitchenStaffService.toggleBreak(sh.id);
      toast({
        title: sh.break_started_at ? "Break ended" : "Break started",
        description: s.full_name,
      });
      load();
    } catch (e: any) {
      toast({ title: "Could not toggle break", description: e?.message, variant: "destructive" });
    } finally {
      setBusyFor(s.id, false);
    }
  };

  // ── Long press to open override ──────────────────────────────────────────

  const startLongPress = (s: KitchenStaffPublic) => {
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      openOverride(s);
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openOverride = (s: KitchenStaffPublic) => {
    const existing = shiftByStaff.get(s.id) || null;
    setOverrideTarget({ staff: s, existingShift: existing });
    if (existing) {
      setOverrideDraft({
        shift_start: toLocalInput(existing.shift_start),
        shift_end: toLocalInput(existing.shift_end),
        total_break_min: String(existing.total_break_min || 0),
        reason: "",
        notes: existing.notes || "",
        closeImmediately: false,
      });
    } else {
      // New back-dated shift - pre-fill start = an hour ago, leave end blank
      const oneHourAgo = new Date(Date.now() - 60 * 60_000);
      setOverrideDraft({
        ...EMPTY_OVERRIDE,
        shift_start: toLocalInput(oneHourAgo.toISOString()),
      });
    }
  };

  const handleSaveOverride = async () => {
    if (!overrideTarget || !companyId) return;
    if (!overrideDraft.reason.trim()) {
      toast({ title: "Reason required", description: "Tell us why you're editing the shift.", variant: "destructive" });
      return;
    }
    const startIso = fromLocalInput(overrideDraft.shift_start);
    if (!startIso) {
      toast({ title: "Start time invalid", variant: "destructive" });
      return;
    }
    const endIso = overrideDraft.shift_end ? fromLocalInput(overrideDraft.shift_end) : null;
    if (overrideDraft.shift_end && !endIso) {
      toast({ title: "End time invalid", variant: "destructive" });
      return;
    }
    const breakMin = Number(overrideDraft.total_break_min || 0);
    if (isNaN(breakMin) || breakMin < 0) {
      toast({ title: "Break minutes invalid", variant: "destructive" });
      return;
    }

    setOverrideSaving(true);
    try {
      if (overrideTarget.existingShift) {
        await kitchenStaffService.manualEditShift({
          shiftId: overrideTarget.existingShift.id,
          shift_start: startIso,
          shift_end: endIso,
          total_break_min: breakMin,
          notes: overrideDraft.notes || undefined,
          override_reason: overrideDraft.reason.trim(),
          edited_by: user?.id || null,
        });
        toast({ title: "Shift updated", description: overrideTarget.staff.full_name });
      } else {
        // New back-dated shift - create it open, then close immediately if
        // an end time was provided.
        if (!endIso && overrideTarget.staff.linked_profile_id) {
          const roleClock = await beginRoleClock({
            companyId,
            userId: overrideTarget.staff.linked_profile_id,
            role: department === "cleaning" ? "cleaning" : "kitchen",
            startedAt: startIso,
          });
          if (roleClock.closed.length > 0) {
            await saveRoleHandoffNote(
              roleClock.closed,
              await promptForRoleHandoffNote(
                roleClock.closed,
                department === "cleaning" ? "cleaning" : "kitchen",
              ),
            );
          }
        }
        const created = await kitchenStaffService.clockIn({
          companyId,
          staffMemberId: overrideTarget.staff.id,
          clockedInBy: user?.id || null,
          overrideStartAt: startIso,
          manualOverride: true,
          overrideReason: overrideDraft.reason.trim(),
          department,
        });
        if (endIso) {
          await kitchenStaffService.clockOut({
            shiftId: created.id,
            clockedOutBy: user?.id || null,
            overrideEndAt: endIso,
            extraBreakMin: breakMin,
            manualOverride: true,
            overrideReason: overrideDraft.reason.trim(),
            notes: overrideDraft.notes || undefined,
          });
        }
        toast({ title: "Shift logged", description: overrideTarget.staff.full_name });
      }
      setOverrideTarget(null);
      setOverrideDraft(EMPTY_OVERRIDE);
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally {
      setOverrideSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  // Departmenty strings - kept here so a future shopping/service board
  // doesn't need a fork. Simple lookup, not a registry.
  const deptLabel =
    department === "cleaning" ? "Cleaning team"
    : department === "shopping" ? "Shopping team"
    : department === "service" ? "Service team"
    : "Kitchen team";
  // withSlug so a tenant user lands on /{slug}/admin/staff (Bobby's
  // rule: every tenant page keeps the slug in the URL). Bare /admin
  // links dropped the tenant prefix.
  const manageHref = withSlug(`/admin/staff?department=${department}`);

  return (
    <Card className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
      <CardHeader className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-brand-primary/5 p-4 sm:p-6 dark:from-slate-900 dark:via-slate-900 dark:to-brand-primary/10">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand-primary/10 blur-2xl" />
        <CardTitle className="relative flex items-center justify-between gap-3 text-base sm:text-lg">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-md shadow-brand-primary/20">
              <Users className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold tracking-tight">{deptLabel}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                Live staffing and shift control
              </span>
            </span>
            <InfoTooltip content={canManageThisBoard
              ? "Managers can clock the whole team in or out and fix missed shifts.\n\nLong-press (or tap the pencil) to back-date a clock-in or fix a missed clock-out. A reason is required and gets stamped on the shift."
              : "Staff can clock their own linked tile in or out. Managers can clock the whole team and fix missed shifts."
            } />
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {isExpanded && staff.length > 0 && canManageThisBoard && (
              <Link
                href={manageHref}
                className="hidden items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-white/80 hover:text-brand-primary sm:inline-flex dark:hover:bg-slate-800"
              >
                Manage <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${deptLabel}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {isExpanded ? "Close" : "Open team"}
              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>
          </span>
        </CardTitle>
        <CardDescription className="relative mt-4 text-xs text-slate-600 dark:text-slate-300">
          {isExpanded ? "Tap a person to update their shift, start a break, or correct a missed clock-out." : "A quick view of who is working now. Open the team to manage shifts."}
        </CardDescription>

        {isExpanded && <div className="relative mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-brand-primary/15 bg-white/80 px-3 py-3 dark:border-brand-primary/25 dark:bg-slate-900/70">
            <p className="text-2xl font-bold tabular-nums text-brand-primary">{onDutyCount}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">On duty</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-2xl font-bold tabular-nums text-slate-800 dark:text-white">{availableCount}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Available</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-2xl font-bold tabular-nums text-slate-800 dark:text-white">{staff.length}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Team size</p>
          </div>
        </div>}
      </CardHeader>

      {isExpanded && <CardContent className="border-t border-slate-100 p-4 dark:border-slate-800 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3 py-2.5 text-xs text-slate-600 dark:border-brand-primary/25 dark:bg-brand-primary/10 dark:text-slate-300">
          <span className="font-medium text-slate-700 dark:text-slate-200">Live team board</span>
          <span>Tap a tile to clock in/out · pencil for a manual correction</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading team...
          </div>
        ) : loadError ? (
          // Never show "No staff yet" for a failed load - that copy
          // sends the chef off to add staff who already exist.
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 text-center dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">Couldn&apos;t load the team board</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{loadError}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-8">
            <ChefHat className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-700 dark:text-slate-200 font-medium">No staff yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              The owner needs to add {department === "cleaning" ? "cleaning" : department === "shopping" ? "shopping" : "kitchen"} staff before anyone can clock in.
            </p>
            {canManageThisBoard && (
              <Link
                href={manageHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:opacity-80 mt-3"
              >
                Open Staff settings <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {staff.map((s) => {
              const sh = shiftByStaff.get(s.id);
              const isOnShift = !!sh;
              const isOnBreak = !!sh?.break_started_at;
              const canControl = canControlStaff(s);
              const workedMin = sh ? liveWorkedMinutes(sh, now) : 0;
              const breakMin = sh?.break_started_at
                ? Math.max(0, Math.floor((now.getTime() - new Date(sh.break_started_at).getTime()) / 60_000))
                : 0;
              const isBusy = busy.has(s.id);
              const tone = isBusy ? "opacity-70 cursor-wait" :
                isOnBreak ? "bg-amber-50 border-amber-300 hover:bg-amber-100" :
                isOnShift ? "bg-brand-primary/10 border-brand-primary/30 hover:bg-brand-primary/15" :
                            "bg-slate-50 border-slate-200 hover:bg-slate-100";
              const statusLabel = isOnBreak ? "On break" : isOnShift ? "On duty" : "Off duty";
              const statusClass = isOnBreak
                ? "bg-amber-100 text-amber-800"
                : isOnShift
                ? "bg-brand-primary/15 text-brand-primary"
                : "bg-slate-200 text-slate-600";

              return (
                <div
                  key={s.id}
                  className={`relative rounded-xl border-2 p-3 transition-all select-none ${tone}`}
                >
                  {canControl && (
                    <button
                      type="button"
                      aria-label="Manual override"
                      onClick={(e) => { e.stopPropagation(); openOverride(s); }}
                      className="absolute top-1.5 right-1.5 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white/60"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}

                  {/* Main tap target */}
                  <button
                    type="button"
                    disabled={isBusy || !canControl}
                    className="w-full text-left disabled:cursor-not-allowed"
                    onClick={() => {
                      // The long-press will set longPressFired = true; if so,
                      // the click handler that fires after the press should
                      // be ignored.
                      if (longPressFired.current) {
                        longPressFired.current = false;
                        return;
                      }
                      if (isOnShift) {
                        if (sh && isOnBreak) handleToggleBreak(s, sh);
                        else if (sh) confirmClockOut(s, sh);
                      } else {
                        promptClockIn(s);
                      }
                    }}
                    onMouseDown={() => { if (canControl) startLongPress(s); }}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => { if (canControl) startLongPress(s); }}
                    onTouchEnd={cancelLongPress}
                    onTouchCancel={cancelLongPress}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        isOnBreak ? "bg-amber-200" :
                        isOnShift ? "bg-brand-primary/20" : "bg-slate-200"
                      }`}>
                        <ChefHat className={`w-4 h-4 ${
                          isOnBreak ? "text-amber-700" :
                          isOnShift ? "text-brand-primary" : "text-slate-500"
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">{s.full_name}</div>
                        {s.role_title && (
                          <div className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{s.role_title}</div>
                        )}
                      </div>
                    </div>
                    <div className={`mb-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}>
                      {statusLabel}
                    </div>

                    {!isOnShift && (
                      <div className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {canControl ? "Tap to clock in" : "Available"}
                      </div>
                    )}
                    {isOnShift && !isOnBreak && (
                      <div className="space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wider text-brand-primary">On shift</div>
                        <div className="text-base font-bold text-slate-900 tabular-nums">{fmtMins(workedMin)}</div>
                        <div className="text-[10px] text-slate-500">{canControl ? "Tap to clock out" : "Manager controlled"}</div>
                      </div>
                    )}
                    {isOnShift && isOnBreak && (
                      <div className="space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wider text-amber-700 inline-flex items-center gap-1">
                          <Coffee className="w-3 h-3" />On break
                        </div>
                        <div className="text-base font-bold text-slate-900 tabular-nums">{fmtMins(breakMin)}</div>
                        <div className="text-[10px] text-slate-500">{canControl ? "Tap to end break" : "Manager controlled"}</div>
                      </div>
                    )}
                  </button>

                  {/* On-shift secondary actions: small bar at bottom for break + clock out */}
                  {isOnShift && sh && !isOnBreak && canControl && (
                    <div className="mt-2 pt-2 border-t border-brand-primary/20 flex gap-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => { e.stopPropagation(); handleToggleBreak(s, sh); }}
                        className="flex-1 text-[10px] font-medium text-brand-primary hover:bg-brand-primary/10 rounded px-1.5 py-1 inline-flex items-center justify-center gap-1"
                      >
                        <Coffee className="w-3 h-3" />Break
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>}

      {/* ── Clock-in confirm (Wave 45 follow-up) ────────────────────────
          Friendly two-tap pattern - the first tap on the tile captures
          the moment, opens this dialog. The dialog frames the moment
          positively ("we want every minute to count") so it doesn't read
          as surveillance. Bail-out is a soft "Wait, not yet" so a
          mistap doesn't lock anyone into a wrong start. */}
      <AlertDialog open={!!openingTarget} onOpenChange={(open) => { if (!open) setOpeningTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">👋</span>
              Start shift for {openingTarget?.staff.full_name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 px-3 py-2 text-brand-primary">
                  Starting at <span className="font-bold tabular-nums">
                    {openingTarget ? openingTarget.capturedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span> - every minute from now counts toward their hours.
                </div>
                <div className="text-slate-600">
                  Quick check before you tap in - if the time looks right and they're ready to go, hit start. If you tapped by mistake or they're not quite here yet, give it a sec.
                </div>
                <div className="text-xs text-slate-500">
                  Hours are tracked accurately so payroll is fair on both sides.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Wait, not yet</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClockIn} className="bg-brand-primary hover:bg-brand-primary/90">
              Yes, start the shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Clock-out confirm ─────────────────────────────────────────────
          Wave 45 follow-up - warmed up the copy. Same friendly-but-
          accurate vibe as clock-in: celebrate the worked time, frame
          the split as fairness, soft bail-out. */}
      <AlertDialog open={!!closingTarget} onOpenChange={(open) => { if (!open) setClosingTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🎉</span>
              Wrap up {closingTarget?.staff.full_name}'s shift?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 px-3 py-2 text-brand-primary">
                  Worked today: <span className="font-bold tabular-nums">
                    {fmtMins(closingTarget ? liveWorkedMinutes(closingTarget.shift, now) : 0)}
                  </span>
                  {closingTarget && closingTarget.shift.total_break_min > 0 && (
                    <span className="text-brand-primary"> · break {closingTarget.shift.total_break_min}m</span>
                  )}
                </div>
                <div className="text-slate-600">
                  If they're done, lock it in. If they're stepping out for a few minutes, hit "Take a break" instead so the time keeps counting toward their day.
                </div>
                <div className="text-xs text-slate-500">
                  Standard and overtime split happens automatically using their daily threshold - payroll stays honest both ways.
                </div>
                <div className="space-y-2 pt-1">
                  <Label htmlFor="kitchen-staff-close-note">Work note (optional)</Label>
                  <Textarea
                    id="kitchen-staff-close-note"
                    rows={2}
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder="What was completed? Leave blank to use the default note."
                  />
                  <div className="flex flex-wrap gap-2">
                    {["Completed kitchen prep and service tasks.", "Cleaned and reset the kitchen work area.", "Finished the shift; no additional work to report.", "Started the clock by mistake; no work completed."].map((suggestion) => (
                      <Button key={suggestion} type="button" variant="outline" size="sm" onClick={() => setCloseNote(suggestion)} className="text-left text-xs">
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={handleClockOut} className="bg-rose-600 hover:bg-rose-700">
              Yes, end the shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Manual override dialog ──────────────────────────────────────── */}
      <Dialog open={!!overrideTarget} onOpenChange={(open) => { if (!open) setOverrideTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              {overrideTarget?.existingShift ? "Edit shift" : "Add missed shift"}
            </DialogTitle>
            <DialogDescription>
              {overrideTarget?.existingShift
                ? "Fix the times if someone forgot to clock out or the wrong time was logged."
                : "Log a shift that wasn't clocked in at the time. The owner sees this as a manual override."}
              <span className="block mt-1">
                <strong>{overrideTarget?.staff.full_name}</strong>
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Shift start</Label>
              <Input
                type="datetime-local"
                value={overrideDraft.shift_start}
                onChange={(e) => setOverrideDraft({ ...overrideDraft, shift_start: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shift end (leave blank to keep open)</Label>
              <Input
                type="datetime-local"
                value={overrideDraft.shift_end}
                onChange={(e) => setOverrideDraft({ ...overrideDraft, shift_end: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Break minutes total</Label>
              <Input
                type="number"
                min="0"
                value={overrideDraft.total_break_min}
                onChange={(e) => setOverrideDraft({ ...overrideDraft, total_break_min: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (required)</Label>
              <Input
                value={overrideDraft.reason}
                onChange={(e) => setOverrideDraft({ ...overrideDraft, reason: e.target.value })}
                placeholder="e.g. Forgot to clock out at end of shift"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                rows={2}
                value={overrideDraft.notes}
                onChange={(e) => setOverrideDraft({ ...overrideDraft, notes: e.target.value })}
                placeholder="Anything to flag for the owner"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)} disabled={overrideSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveOverride} disabled={overrideSaving} className="bg-brand-primary hover:opacity-90">
              {overrideSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
