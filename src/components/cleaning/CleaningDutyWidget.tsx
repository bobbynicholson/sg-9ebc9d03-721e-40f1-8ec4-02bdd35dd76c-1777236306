import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Clock, CheckCircle2, User } from "lucide-react";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { useAuth } from "@/contexts/AuthContext";

export function CleaningDutyWidget() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [onDutyStaff, setOnDutyStaff] = useState<any[]>([]);
  const [myCurrentDuty, setMyCurrentDuty] = useState<any>(null);

  useEffect(() => {
    loadOnDutyStaff();
    const interval = setInterval(loadOnDutyStaff, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [user]);

  const loadOnDutyStaff = async () => {
    if (!user) return;
    
    try {
      const staff = await equipmentTrackingService.getOnDutyCleaningStaff(user.id);
      setOnDutyStaff(staff);
      
      // Check if current user is on duty
      const myDuty = staff.find((s) => s.user_id === user.id);
      setMyCurrentDuty(myDuty || null);
    } catch (error) {
      console.error("Error loading on-duty staff:", error);
    }
  };

  const handleStartDuty = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await equipmentTrackingService.startCleaningDuty({
        userId: user.id,
        companyId: user.id,
      });
      await loadOnDutyStaff();
    } catch (error) {
      console.error("Error starting duty:", error);
      alert("Failed to start duty");
    } finally {
      setLoading(false);
    }
  };

  const handleEndDuty = async () => {
    if (!myCurrentDuty) return;
    
    setLoading(true);
    try {
      await equipmentTrackingService.endCleaningDuty(myCurrentDuty.id);
      await loadOnDutyStaff();
    } catch (error) {
      console.error("Error ending duty:", error);
      alert("Failed to end duty");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Cleaning Team On Duty
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current user duty toggle */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback>
                {user?.full_name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user?.full_name || "You"}</p>
              {myCurrentDuty && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  On duty for {formatDuration(myCurrentDuty.duty_started_at)}
                </p>
              )}
            </div>
          </div>
          
          {myCurrentDuty ? (
            <Button
              variant="outline"
              onClick={handleEndDuty}
              disabled={loading}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              End Shift
            </Button>
          ) : (
            <Button
              onClick={handleStartDuty}
              disabled={loading}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Start Shift
            </Button>
          )}
        </div>

        {/* Other on-duty staff */}
        {onDutyStaff.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Team Members On Duty ({onDutyStaff.length})
            </p>
            <div className="space-y-2">
              {onDutyStaff.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={staff.profile?.avatar_url} />
                      <AvatarFallback>
                        {staff.profile?.full_name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {staff.profile?.full_name || "Team Member"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(staff.duty_started_at)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {staff.equipment_verified && (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </Badge>
                    )}
                    <Badge variant="secondary">Active</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {onDutyStaff.length === 0 && !myCurrentDuty && (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No one is currently on duty</p>
            <p className="text-xs">Start your shift to begin cleaning</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
