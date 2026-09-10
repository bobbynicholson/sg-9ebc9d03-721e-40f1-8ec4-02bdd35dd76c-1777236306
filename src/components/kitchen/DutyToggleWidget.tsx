
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, Power, PowerOff } from "lucide-react";
import { kitchenDutyService } from "@/services/kitchenDutyService";
import { useAuth } from "@/contexts/AuthContext";
import { formatLocalTime } from "@/lib/localFormat";
import { useToast } from "@/hooks/use-toast";
import {
  beginRoleClock,
  promptForRoleHandoffNote,
  saveRoleHandoffNote,
} from "@/services/roleClockService";

interface DutyShift {
  id: string;
  shift_start: string;
  is_active: boolean;
}

export function DutyToggleWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentShift, setCurrentShift] = useState<DutyShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("");
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endNote, setEndNote] = useState("");

  useEffect(() => {
    if (user?.id) {
      loadCurrentShift();
    }
  }, [user?.id]);

  useEffect(() => {
    if (currentShift?.is_active) {
      const interval = setInterval(() => {
        const start = new Date(currentShift.shift_start);
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setElapsedTime(`${hours}h ${minutes}m`);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [currentShift]);

  const loadCurrentShift = async () => {
    if (!user?.id) return;
    try {
      const shift = await kitchenDutyService.getCurrentDutyShift(user.id);
      setCurrentShift(shift);
    } catch (error) {
      console.error("Error loading current shift:", error);
    }
  };

  const requestEndDuty = () => {
    if (!loading) {
      setEndNote("");
      setEndDialogOpen(true);
    }
  };

  const confirmEndDuty = async () => {
    if (!user?.id || !currentShift?.is_active) return;
    setLoading(true);
    try {
      const note = endNote.trim() || "Manual kitchen clock-out; no additional note supplied.";
      await kitchenDutyService.endDutyShift(currentShift.id, note);
      setCurrentShift(null);
      setEndDialogOpen(false);
    } catch (error) {
      console.error("Error ending kitchen duty:", error);
      toast({ title: "Duty status not saved", description: error instanceof Error ? error.message : "Try again before continuing kitchen work.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDuty = async () => {
    if (!user?.id) return;
    if (currentShift?.is_active) {
      requestEndDuty();
      return;
    }
    setLoading(true);
    try {
      if (user.company_id) {
        const roleClock = await beginRoleClock({
          companyId: user.company_id,
          userId: user.id,
          role: "kitchen",
        });
        if (roleClock.closed.length > 0) {
          await saveRoleHandoffNote(
            roleClock.closed,
            await promptForRoleHandoffNote(roleClock.closed, "kitchen"),
          );
        }
      }
      const newShift = await kitchenDutyService.startDutyShift(user.id, user.id);
      setCurrentShift(newShift);
    } catch (error) {
      console.error("Error toggling duty:", error);
      toast({
        title: "Duty status not saved",
        description: error instanceof Error ? error.message : "Try again before continuing kitchen work.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isOnDuty = currentShift?.is_active || false;

  return (
    <Card className="border-2 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Duty status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isOnDuty ? (
                <Badge variant="default" className="bg-brand-primary hover:bg-brand-primary">
                  On duty
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Off duty
                </Badge>
              )}
              {isOnDuty && elapsedTime && (
                <span className="text-sm text-muted-foreground">{elapsedTime}</span>
              )}
            </div>
            {isOnDuty && (
              <p className="text-xs text-muted-foreground">
                Started: {formatLocalTime(currentShift!.shift_start)}
              </p>
            )}
          </div>
          <Button
            onClick={handleToggleDuty}
            disabled={loading}
            size="lg"
            variant={isOnDuty ? "destructive" : "default"}
            className="gap-2 font-semibold"
          >
            {isOnDuty ? (
              <>
                <PowerOff className="h-5 w-5" />
                End duty
              </>
            ) : (
              <>
                <Power className="h-5 w-5" />
                Start duty
              </>
            )}
          </Button>
        </div>
        {isOnDuty && (
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              You are responsible for kitchen tasks completed during this shift.
            </p>
          </div>
        )}
      </CardContent>
      <Dialog open={endDialogOpen} onOpenChange={(open) => { if (!loading) setEndDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End kitchen duty</DialogTitle>
            <DialogDescription>Tell us what you completed. Choose a quick answer or write your own note, then click End duty. A blank note will use the default option.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick answers</p><div className="flex flex-wrap gap-2">{["Completed kitchen prep and service tasks.", "Cleaned and reset the kitchen work area.", "Finished the shift; no additional work to report.", "Started the clock by mistake; no work completed."].map((suggestion) => <Button key={suggestion} type="button" variant="outline" size="sm" onClick={() => setEndNote(suggestion)} className="text-left text-xs">{suggestion}</Button>)}</div></div>
          <Textarea value={endNote} onChange={(event) => setEndNote(event.target.value)} rows={4} placeholder="e.g. Prep complete, oven switched off, stock issue handed over" autoFocus />
          <DialogFooter><Button variant="outline" onClick={() => setEndDialogOpen(false)} disabled={loading}>Cancel</Button><Button onClick={() => void confirmEndDuty()} disabled={loading} variant="destructive">{loading ? "Saving..." : "End duty"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
