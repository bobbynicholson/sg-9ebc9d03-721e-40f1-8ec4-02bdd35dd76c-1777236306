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
import { AlertCircle, CalendarClock, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
}: Props) {
  const { toast } = useToast();
  const [shiftDate, setShiftDate] = useState(defaultDate);
  const [plannedStart, setPlannedStart] = useState("08:00");
  const [plannedEnd, setPlannedEnd] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [multiplier, setMultiplier] = useState<"1" | "1.5" | "2">("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setShiftDate(defaultDate);
      setPlannedStart("08:00");
      setPlannedEnd("17:00");
      setNotes("");
      setMultiplier("1");
      setBusy(false);
      setError(null);
      setDone(false);
    }
  }, [open, defaultDate]);

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
      const { error: insErr } = await (supabase as any)
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
          rate_multiplier: multiplier === "1" ? null : Number(multiplier),
          notes: notes.trim() || null,
          created_by_user_id: actorUserId ?? null,
        });
      if (insErr) {
        // Unique-constraint violation = there's already a shift for
        // this chef on this day. Surface a useful message instead of
        // the raw 23505 message PostgREST surfaces.
        if (insErr.code === "23505") {
          setError(`${staffName} is already rostered for ${shiftDate}. Edit the existing row instead.`);
          return;
        }
        throw new Error(insErr.message);
      }
      setDone(true);
      if (onCreated) onCreated();
      toast({ title: "Shift rostered", description: `${staffName} - ${plannedStart} to ${plannedEnd}` });
      setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      setError(e?.message || "Failed to roster shift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-orange-600" />
            Roster shift - {staffName}
          </DialogTitle>
          <DialogDescription>
            Plan upcoming hours. The actual clock-in time gets stamped automatically
            when the chef opens the kitchen duty page and clicks Clock in.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <AlertDescription className="text-rose-800 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {done && (
          <Alert className="border-emerald-200 bg-emerald-50">
            <Check className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800 text-sm">Shift rostered.</AlertDescription>
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
            />
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
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              <strong>{previewHours} hours</strong> rostered at the {multiplier}x multiplier.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || previewHours === null}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Roster shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
