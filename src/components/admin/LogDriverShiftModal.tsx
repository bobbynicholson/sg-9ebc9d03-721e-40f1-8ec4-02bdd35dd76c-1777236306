/**
 * LogDriverShiftModal - admin manual shift entry for a driver.
 *
 * Opens from /admin/driver-management. Captures clock-in / clock-out
 * times, plus optional notes and BCEA multiplier (defaults to 1x;
 * Stage 4 will auto-stamp 2x for Sundays / public holidays).
 *
 * Writes via driverPayService.createManualShift. RLS gates the insert
 * to admins of the same company; super_admin allowed too.
 */
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
import { AlertCircle, Clock, Loader2, Check, Trash2 } from "lucide-react";
import { driverPayService } from "@/services/driverPayService";

/**
 * Wave 70.12 - shape of a shift the modal can pre-fill from when
 * opened in EDIT mode. Pass nothing -> CREATE mode (original
 * behaviour, used by the empty cell + button).
 */
export interface ExistingShiftForEdit {
  id: string;
  actual_start: string | null;
  actual_end: string | null;
  notes: string | null;
  rate_multiplier: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  driverId: string;
  driverName: string;
  /** Optional callback after a successful write so the parent can refresh. */
  onCreated?: () => void;
  /** Optional: the user creating the shift (for audit). */
  actorUserId?: string | null;
  /** Wave 70.12 - pass an existing shift to open the modal in
   *  edit mode (pre-fills the inputs, shows Update + Delete
   *  instead of Save). Leave undefined for the original create
   *  flow. */
  existingShift?: ExistingShiftForEdit | null;
}

function isoLocalNow(offsetMinutes = 0): string {
  // datetime-local input wants YYYY-MM-DDThh:mm in local time, no zone.
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert an ISO datetime string -> "YYYY-MM-DDThh:mm" in local
 * time for a datetime-local input. Pre-fills the modal in edit mode.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LogDriverShiftModal({
  open,
  onOpenChange,
  companyId,
  driverId,
  driverName,
  onCreated,
  actorUserId,
  existingShift,
}: Props) {
  const { toast } = useToast();
  const isEdit = !!existingShift;
  const [start, setStart] = useState(isoLocalNow(-60 * 4));
  const [end, setEnd] = useState(isoLocalNow());
  const [notes, setNotes] = useState("");
  const [multiplier, setMultiplier] = useState<"1" | "1.5" | "2">("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Phase 6 #6: separate flag so the modal renders a 'Log anyway'
  // override button when the backend returned a conflict (vs. a
  // generic validation error which should NOT offer the override).
  const [conflict, setConflict] = useState(false);
  // Wave 70.12 - confirm-delete two-step so a rogue click doesn't
  // wipe a logged shift.
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existingShift) {
      // Edit mode: pre-fill from the row.
      setStart(isoToLocalInput(existingShift.actual_start));
      setEnd(isoToLocalInput(existingShift.actual_end));
      setNotes(existingShift.notes || "");
      const m = existingShift.rate_multiplier;
      setMultiplier(m === 1.5 ? "1.5" : m === 2 ? "2" : "1");
    } else {
      // Create mode: original defaults (4h-ago to now).
      setStart(isoLocalNow(-60 * 4));
      setEnd(isoLocalNow());
      setNotes("");
      setMultiplier("1");
    }
    setBusy(false);
    setError(null);
    setDone(false);
    setConflict(false);
    setConfirmDelete(false);
  }, [open, existingShift]);

  // Hours preview, computed off the inputs so the operator sees what
  // they're about to log before they hit save.
  const previewHours = (() => {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
    const h = (e.getTime() - s.getTime()) / 1000 / 3600;
    return Math.round(h * 100) / 100;
  })();

  // Wave 70.12 - update existing shift (edit mode).
  const submitUpdate = async () => {
    if (!existingShift) return;
    setError(null);
    setBusy(true);
    try {
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end).toISOString();
      const result = await driverPayService.updateShift(
        existingShift.id,
        {
          actual_start: startIso,
          actual_end: endIso,
          notes: notes.trim() || null,
          rate_multiplier: multiplier === "1" ? null : Number(multiplier),
        },
        undefined,
        actorUserId ?? null,
      );
      if (!result.ok) throw new Error(result.error || "Failed to update shift");
      setDone(true);
      toast({ title: "Shift updated", description: `${driverName}'s hours adjusted.` });
      if (onCreated) onCreated();
      setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      setError(e?.message || "Failed to update shift");
    } finally {
      setBusy(false);
    }
  };

  // Wave 70.12 - soft delete the shift (edit mode).
  const submitDelete = async () => {
    if (!existingShift) return;
    setError(null);
    setBusy(true);
    try {
      const result = await driverPayService.deleteShift(
        existingShift.id,
        undefined,
        actorUserId ?? null,
      );
      if (!result.ok) throw new Error(result.error || "Failed to delete shift");
      setDone(true);
      toast({ title: "Shift removed", description: `${driverName}'s shift removed from the roster.` });
      if (onCreated) onCreated();
      setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      setError(e?.message || "Failed to delete shift");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (opts: { allowOverlap?: boolean } = {}) => {
    setError(null);
    setBusy(true);
    try {
      // datetime-local is naive local time; convert to ISO with the
      // browser's timezone offset baked in.
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end).toISOString();
      const result = await driverPayService.createManualShift({
        company_id: companyId,
        driver_id: driverId,
        actual_start: startIso,
        actual_end: endIso,
        notes: notes.trim() || null,
        rate_multiplier: multiplier === "1" ? null : Number(multiplier),
        created_by_user_id: actorUserId ?? null,
        allow_overlap: opts.allowOverlap,
      });
      if (!result.ok) {
        // Phase 6 #6: surface a structured conflict back to the
        // operator so they can choose to override rather than just
        // seeing a 'Failed to log shift' toast. The conflict info
        // (existing shift window) is rendered inline in the alert.
        if ((result as any).conflict) {
          const c = (result as any).conflict;
          const startWindow = c.actual_start
            ? new Date(c.actual_start).toLocaleString("en-ZA", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })
            : "?";
          const endWindow = c.actual_end
            ? new Date(c.actual_end).toLocaleString("en-ZA", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })
            : "still open";
          setError(
            `Driver is already on a shift from ${startWindow} to ${endWindow}. Cancel below to revise the times, or use 'Log anyway' to record both.`,
          );
          setConflict(true);
          return;
        }
        throw new Error(result.error);
      }
      setDone(true);
      setConflict(false);
      // Phase 7 #2: surface the BCEA fatigue warning if the
      // service flagged one. Insert already succeeded; this is a
      // post-action heads-up so the operator sees what they just
      // committed to (a 14h shift, or a back-to-back without 12h
      // rest). The toast survives the 700ms close because shadcn
      // toast queues independent of dialog state.
      const fatigue = (result as any).fatigueWarning;
      if (fatigue) {
        toast({
          title: "BCEA fatigue check",
          description: fatigue,
          variant: "destructive",
        });
      }
      if (onCreated) onCreated();
      // Close after a brief flash so the operator sees the confirmation.
      setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      setError(e?.message || "Failed to log shift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : onOpenChange(false))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            {isEdit ? "Edit shift" : "Log shift"} - {driverName}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Adjust this driver's actual hours, change the multiplier, or remove the shift entirely. Edits are audit-logged."
              : "Manually record hours worked. Used for hourly-rate pay calculation."}
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
              Shift logged.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="shift_start">Clock in</Label>
              <Input
                id="shift_start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="shift_end">Clock out</Label>
              <Input
                id="shift_end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
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
            <p className="text-[11px] text-slate-500 mt-1">
              Auto-stamped on Sundays / public holidays once Stage 4 lands. For now, set manually if applicable.
            </p>
          </div>

          <div>
            <Label htmlFor="shift_notes">Notes (optional)</Label>
            <Input
              id="shift_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Spit Braai event in Constantia"
              className="mt-1"
            />
          </div>

          {previewHours !== null && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
              <strong>{previewHours} hours</strong> will be logged at the {multiplier}x multiplier.
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2">
          {/* Delete affordance lives on the LEFT in edit mode so the
              primary action (Update) stays bottom-right where the
              eye lands. Two-step confirm to prevent accidental wipe. */}
          {isEdit && (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-rose-700">Sure?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  No
                </Button>
                <Button
                  size="sm"
                  onClick={() => void submitDelete()}
                  disabled={busy}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                  Delete shift
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete shift
              </Button>
            )
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            {isEdit ? (
              <Button
                onClick={() => void submitUpdate()}
                disabled={busy || previewHours === null}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Update shift
              </Button>
            ) : conflict ? (
              <Button
                onClick={() => submit({ allowOverlap: true })}
                disabled={busy}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Log anyway
              </Button>
            ) : (
              <Button
                onClick={() => submit()}
                disabled={busy || previewHours === null}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Save shift
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
