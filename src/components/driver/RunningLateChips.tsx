/**
 * RunningLateChips - DRV-G (driver deep audit, DRV-33)
 *
 * Driver stuck in traffic hits one of three preset chips. Each tap
 * fires POST /api/orders/[id]/eta-change with delay_minutes set to
 * the chip's value. The endpoint notifies admin + the client.
 *
 * Surface lives on every active job card on the driver dashboard
 * (mounted from the deliveries-list block). Chips are big enough
 * for gloved hands (min-h-11 = 44px).
 *
 * Confirmation flow: tap a chip → confirm toast appears → second tap
 * inside 5s commits. This is the equivalent of hold-to-confirm for
 * a phone screen the driver might bump against the steering wheel.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PRESETS = [15, 30, 60] as const;

interface Props {
  orderId: string;
  /** Optional - called after a successful POST so the parent can
   *  reload jobs / emit cross-tab signal. */
  onBroadcast?: (delayMinutes: number) => void;
}

export function RunningLateChips({ orderId, onBroadcast }: Props) {
  const { toast } = useToast();
  const [busyMinutes, setBusyMinutes] = useState<number | null>(null);
  const [armedMinutes, setArmedMinutes] = useState<number | null>(null);

  const handleTap = async (minutes: number) => {
    // Two-tap confirm pattern - first tap arms, second tap commits.
    if (armedMinutes !== minutes) {
      setArmedMinutes(minutes);
      toast({
        title: `Tap again to broadcast ${minutes}m delay`,
        description: "Admin + the client get a notification.",
      });
      window.setTimeout(() => {
        setArmedMinutes((current) => (current === minutes ? null : current));
      }, 5000);
      return;
    }

    setArmedMinutes(null);
    setBusyMinutes(minutes);
    try {
      const r = await fetch(`/api/orders/${orderId}/eta-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ delay_minutes: minutes }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({
          title: "Couldn't broadcast",
          description: data?.error || "Server rejected the update. Try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Broadcast ${minutes}m delay`,
        description: data.notified_client
          ? "Admin + client both notified."
          : "Admin notified.",
      });
      onBroadcast?.(minutes);
    } catch (e: any) {
      toast({
        title: "Network error",
        description: e?.message || "Check your signal and try again.",
        variant: "destructive",
      });
    } finally {
      setBusyMinutes(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-amber-700 inline-flex items-center gap-1 mr-1">
        <Clock className="w-3.5 h-3.5" />
        Late?
      </span>
      {PRESETS.map((mins) => {
        const isBusy = busyMinutes === mins;
        const isArmed = armedMinutes === mins;
        return (
          <Button
            key={mins}
            size="sm"
            variant={isArmed ? "default" : "outline"}
            disabled={busyMinutes !== null && busyMinutes !== mins}
            onClick={() => handleTap(mins)}
            className={`min-h-11 px-3 text-sm ${
              isArmed
                ? "bg-brand-primary hover:bg-brand-primary/90 text-white"
                : "border-amber-300 text-amber-800 hover:bg-amber-50"
            }`}
            title={
              isArmed
                ? `Tap again to confirm ${mins}m delay broadcast`
                : `Broadcast a ${mins}-minute delay to admin + client`
            }
          >
            {isBusy ? "…" : `+${mins}m`}
          </Button>
        );
      })}
    </div>
  );
}
