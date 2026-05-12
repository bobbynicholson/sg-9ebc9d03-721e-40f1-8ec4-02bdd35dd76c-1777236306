/**
 * LogDriverShiftModal -- admin manual shift entry for a driver.
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
import { AlertCircle, Clock, Loader2, Check } from "lucide-react";
import { driverPayService } from "@/services/driverPayService";

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
}

function isoLocalNow(offsetMinutes = 0): string {
  // datetime-local input wants YYYY-MM-DDThh:mm in local time, no zone.
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
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
}: Props) {
  const { toast } = useToast();
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

  useEffect(() => {
    if (open) {
      setStart(isoLocalNow(-60 * 4));
      setEnd(isoLocalNow());
      setNotes("");
      setMultiplier("1");
      setBusy(false);
      setError(null);
      setDone(false);
    }
  }, [open]);

  // Hours preview, computed off the inputs so the operator sees what
  // they're about to log before they hit save.
  const previewHours = (() => {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null;
    const h = (e.getTime() - s.getTime()) / 1000 / 3600;
    return Math.round(h * 100) / 100;
  })();

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
            Log shift -- {driverName}
          </DialogTitle>
          <DialogDescription>
            Manually record hours worked. Used for hourly-rate pay
            calculation.
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
            <AlertDescription className="text-emerald-800 text-sm">
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
              <option value="1">1x -- standard hours</option>
              <option value="1.5">1.5x -- overtime</option>
              <option value="2">2x -- Sunday / public holiday (BCEA)</option>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {conflict ? (
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
