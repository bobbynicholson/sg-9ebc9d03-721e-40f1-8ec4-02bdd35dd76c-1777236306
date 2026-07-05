/**
 * LogKitchenShiftModal - admin shift planner for a kitchen staffer.
 *
 * Wave 36.1. Mirrors LogDriverShiftModal in shape but with planning
 * semantics, not actual-hours logging:
 *   - shift_date + planned_start (time) + planned_end (time)
 *   - Inserts into kitchen_shifts with status='scheduled'
 *   - actual_start / actual_end stay NULL until the chef clocks in
 *     via the existing /team-portal/kitchen/duty surface (which a
 *     follow-on hook stamps onto the matching kitchen_shifts row by
 *     staff_id + shift_date proximity).
 *
 * Idempotent on (staff_id, shift_date) - the unique partial index
 * means a re-roster of the same chef on the same day surfaces a
 * UNIQUE violation; we catch it and tell the operator to edit the
 * existing row.
 *
 * Audit fix (2026-07-05): the schedule page previously had NO way to
 * edit or remove a rostered shift (the 23505 message literally said
 * "edit the existing row instead" with no such UI). This modal now
 * doubles as the edit surface: pass `existingShift` to switch it into
 * edit mode (update-in-place + soft-delete). It also now notifies the
 * rostered staffer on create / update / remove (was silent before).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CalendarClock, Loader2, Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Existing shift to edit. When present the modal switches to edit mode. */
export interface EditableShift {
  id: string;
  planned_start: string | null;
  planned_end: string | null;
  rate_multiplier: number | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  staffId: string;
  staffName: string;
  /** Pre-fill the date when the operator clicks a specific cell. ISO YYYY-MM-DD. */
  defaultDate: string;
  /** Optional callback after a successful write so the parent can refresh. */
  onCreated?: () => void;
  actorUserId?: string | null;
  /**
   * Wave 40.4: which team this shift is for. Defaults to 'kitchen'
   * for back-compat with every existing call site. The cleaning
   * schedule page passes 'cleaning'. Combined-role staff who do
   * kitchen + cleaning in one shift use 'kitchen_and_cleaning'.
   */
  shiftType?: "kitchen" | "cleaning" | "kitchen_and_cleaning" | "general";
  /**
   * When set, the modal edits this existing shift (update + remove)
   * instead of creating a new one. Date is locked in edit mode to
   * avoid colliding with the (staff_id, shift_date) unique index.
   */
  existingShift?: EditableShift | null;
}

export function LogKitchenShiftModal({
  open,
  onOpenChange,
  companyId,
  staffId,
  staffName,
  defaultDate,
  onCreated,
  actorUserId,
  shiftType = "kitchen",
  existingShift = null,
}: Props) {
  const { toast } = useToast();
  const isEdit = !!existingShift;
  const [shiftDate, setShiftDate] = useState(defaultDate);
  const [plannedStart, setPlannedStart] = useState("08:00");
  const [plannedEnd, setPlannedEnd] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [multiplier, setMultiplier] = useState<"1" | "1.5" | "2">("1");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setShiftDate(defaultDate);
      setPlannedStart(existingShift?.planned_start ?? "08:00");
      setPlannedEnd(existingShift?.planned_end ?? "17:00");
      setNotes(existingShift?.notes ?? "");
      const m = existingShift?.rate_multiplier;
      setMultiplier(m === 1.5 ? "1.5" : m === 2 ? "2" : "1");
      setBusy(false);
      setDeleting(false);
      setError(null);
      setDone(false);
    }
  }, [open, defaultDate, existingShift]);

  const teamLabel = shiftType === "cleaning" ? "cleaning" : "kitchen";

  // Best-effort notify of the rostered staffer. A notify failure must
  // never fail the write. Skip self-roster (operator managing their own
  // shift doesn't need a ping). staffId is the profile/user id (the
  // roster reads profiles), so it's a valid notification recipient.
  const notifyStaffer = async (
    action: "rostered" | "updated" | "removed",
    shiftId?: string,
  ) => {
    if (!staffId || staffId === actorUserId) return;
    try {
      const { notificationService } = await import("@/services/notificationService");
      const copy = {
        rostered: {
          title: "You've been rostered",
          message: `You're on the ${teamLabel} roster for ${shiftDate}, ${plannedStart} to ${plannedEnd}.`,
        },
        updated: {
          title: "Your shift was updated",
          message: `Your ${teamLabel} shift on ${shiftDate} is now ${plannedStart} to ${plannedEnd}.`,
        },
        removed: {
          title: "A shift was removed",
          message: `Your ${teamLabel} shift on ${shiftDate} has been removed.`,
        },
      }[action];
      await notificationService.createNotification({
        company_id: companyId,
        recipient_id: staffId,
        type: `shift_${action}`,
        title: copy.title,
        message: copy.message,
        priority: "normal",
        related_entity_type: "kitchen_shift",
        related_entity_id: shiftId ?? existingShift?.id ?? undefined,
        dedup: true,
      }, supabase);
    } catch (notifyErr) {
      console.warn(`[LogKitchenShiftModal] ${action} notify failed:`, notifyErr);
    }
  };

  // Preview hours so the operator sees the rostered length before save.
  const previewHours = (() => {
    if (!plannedStart || !plannedEnd) return null;
    const [sh, sm] = plannedStart.split(":").map(Number);
    const [eh, em] = plannedEnd.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) return null;
    return Math.round(((endMin - startMin) / 60) * 100) / 100;
  })();

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const rateMultiplier = multiplier === "1" ? null : Number(multiplier);
      if (isEdit && existingShift) {
        // Edit mode: update the planned window / multiplier / notes in
        // place. Date + staff are locked so the unique index can't be
        // violated. Actual clock-in stamps stay untouched.
        const { error: updErr } = await (supabase as any)
          .from("kitchen_shifts")
          .update({
            planned_start: plannedStart,
            planned_end: plannedEnd,
            rate_multiplier: rateMultiplier,
            notes: notes.trim() || null,
          })
          .eq("id", existingShift.id)
          .eq("company_id", companyId);
        if (updErr) throw new Error(updErr.message);
        await notifyStaffer("updated", existingShift.id);
        setDone(true);
        if (onCreated) onCreated();
        toast({ title: "Shift updated", description: `${staffName} - ${plannedStart} to ${plannedEnd}` });
        setTimeout(() => onOpenChange(false), 700);
        return;
      }

      const { data: inserted, error: insErr } = await (supabase as any)
        .from("kitchen_shifts")
        .insert({
          company_id: companyId,
          staff_id: staffId,
          shift_date: shiftDate,
          shift_type: shiftType,
          planned_start: plannedStart,
          planned_end: plannedEnd,
          status: "scheduled",
          source: "manual",
          rate_multiplier: rateMultiplier,
          notes: notes.trim() || null,
          created_by_user_id: actorUserId ?? null,
        })
        .select("id")
        .single();
      if (insErr) {
        // Unique-constraint violation = there's already a shift for
        // this chef on this day. Surface a useful message instead of
        // the raw 23505 message PostgREST surfaces.
        if (insErr.code === "23505") {
          setError(`${staffName} is already rostered for ${shiftDate}. Click that shift to edit it instead.`);
          return;
        }
        throw new Error(insErr.message);
      }
      await notifyStaffer("rostered", (inserted as any)?.id);
      setDone(true);
      if (onCreated) onCreated();
      toast({ title: "Shift rostered", description: `${staffName} - ${plannedStart} to ${plannedEnd}` });
      setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      setError(e?.message || "Failed to save shift");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existingShift) return;
    if (!window.confirm(`Remove ${staffName}'s shift on ${shiftDate}? This can't be undone.`)) return;
    setError(null);
    setDeleting(true);
    try {
      // Soft-delete: the schedule query filters `deleted_at IS NULL`,
      // so stamping deleted_at drops the row from the roster while
      // keeping it for any pay/audit history that references it.
      const { error: delErr } = await (supabase as any)
        .from("kitchen_shifts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", existingShift.id)
        .eq("company_id", companyId);
      if (delErr) throw new Error(delErr.message);
      await notifyStaffer("removed", existingShift.id);
      if (onCreated) onCreated();
      toast({ title: "Shift removed", description: `${staffName} - ${shiftDate}` });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Failed to remove shift");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-brand-primary" />
            {isEdit ? "Edit shift" : "Roster shift"} - {staffName}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Adjust the planned window, pay multiplier or notes. Any clocked-in actual time is kept."
              : "Plan upcoming hours. The actual clock-in time gets stamped automatically when the chef opens the kitchen duty page and clicks Clock in."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <AlertDescription className="text-rose-800 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {done && (
          <Alert className="border-brand-primary/20 bg-brand-primary/10">
            <Check className="h-4 w-4 text-brand-primary" />
            <AlertDescription className="text-brand-primary text-sm">
              {isEdit ? "Shift updated." : "Shift rostered."}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="shift_date">Date</Label>
            <Input
              id="shift_date"
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="mt-1"
              disabled={isEdit}
            />
            {isEdit && (
              <p className="text-[11px] text-slate-500 mt-1">
                To move this shift to another day, remove it and roster a new one.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="planned_start">Planned start</Label>
              <Input
                id="planned_start"
                type="time"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="planned_end">Planned end</Label>
              <Input
                id="planned_end"
                type="time"
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="multiplier">Pay multiplier</Label>
            <select
              id="multiplier"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value as "1" | "1.5" | "2")}
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="1">1x - standard hours</option>
              <option value="1.5">1.5x - overtime</option>
              <option value="2">2x - Sunday / public holiday (BCEA)</option>
            </select>
          </div>

          <div>
            <Label htmlFor="shift_notes">Notes (optional)</Label>
            <Input
              id="shift_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. spit-braai prep + service"
              className="mt-1"
            />
          </div>

          {previewHours !== null && (
            <div className="rounded-md border border-brand-primary/20 bg-brand-primary/10 px-3 py-2 text-sm text-slate-800">
              <strong>{previewHours} hours</strong> rostered at the {multiplier}x multiplier.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button
              variant="outline"
              onClick={remove}
              disabled={busy || deleting}
              className="border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Remove
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy || deleting}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={busy || deleting || previewHours === null}
              className="bg-brand-primary hover:bg-brand-primary/90"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {isEdit ? "Save changes" : "Roster shift"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
