
import { useState, useEffect } from "react";
import { Clock, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { timeClockService } from "@/services/timeClockService";
import { useAuth } from "@/contexts/AuthContext";

export function TimeClockWidget() {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (user) {
      loadCurrentSession();
      getLocation();
    }
  }, [user]);

  const loadCurrentSession = async () => {
    if (!user) return;
    try {
      const session = await timeClockService.getCurrentSession(user.id);
      setCurrentSession(session);
    } catch (error) {
      console.error("Error loading session:", error);
    }
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => console.error("Location error:", error)
      );
    }
  };

  const handleClockIn = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await timeClockService.clockIn(user.id, notes, location || undefined);
      setNotes("");
      await loadCurrentSession();
    } catch (error) {
      console.error("Error clocking in:", error);
      alert("Failed to clock in");
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await timeClockService.clockOut(user.id, notes, location || undefined);
      setNotes("");
      await loadCurrentSession();
    } catch (error) {
      console.error("Error clocking out:", error);
      alert("Failed to clock out");
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Clock
        </CardTitle>
        <CardDescription>
          {currentSession ? "You are currently clocked in" : "Clock in to start your shift"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentSession && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Started at</span>
              <span className="text-sm">
                {new Date(currentSession.clock_in_time).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Duration</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatDuration(currentSession.clock_in_time)}
              </span>
            </div>
          </div>
        )}

        {location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Location tracking enabled</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Textarea
            placeholder="Add any notes about your shift..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {currentSession ? (
          <Button
            onClick={handleClockOut}
            disabled={loading}
            className="w-full"
            variant="destructive"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Clocking Out...
              </>
            ) : (
              "Clock Out"
            )}
          </Button>
        ) : (
          <Button onClick={handleClockIn} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Clocking In...
              </>
            ) : (
              "Clock In"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
