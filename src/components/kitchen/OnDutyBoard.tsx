
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Clock } from "lucide-react";
import { kitchenDutyService } from "@/services/kitchenDutyService";
import { useAuth } from "@/contexts/AuthContext";

interface StaffMember {
  id: string;
  full_name: string;
  avatar_url?: string;
  email: string;
}

interface DutyShift {
  id: string;
  shift_start: string;
  is_active: boolean;
  staff: StaffMember;
}

export function OnDutyBoard() {
  const { user } = useAuth();
  const [activeShifts, setActiveShifts] = useState<DutyShift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.company_id) return;
    loadActiveShifts();
    // Refresh every 30 seconds
    const interval = setInterval(loadActiveShifts, 30000);
    return () => clearInterval(interval);
  }, [user?.company_id]);

  const loadActiveShifts = async () => {
    if (!user?.company_id) return;
    try {
      const shifts = await kitchenDutyService.getActiveDutyShifts(user.company_id);
      setActiveShifts(shifts as any);
    } catch (error) {
      console.error("Error loading active shifts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getElapsedTime = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            On Duty Staff
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          On Duty Staff
          {activeShifts.length > 0 && (
            <Badge variant="default" className="ml-auto bg-brand-primary">
              {activeShifts.length} on duty
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeShifts.length === 0 ? (
          <div className="text-center py-6">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No staff currently on duty
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeShifts.map((shift) => (
              <div
                key={shift.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-brand-primary/10 border-brand-primary/20"
              >
                <Avatar className="h-10 w-10 border-2 border-brand-primary">
                  <AvatarImage src={shift.staff?.avatar_url} />
                  <AvatarFallback className="bg-brand-primary/15 text-brand-primary">
                    {getInitials(shift.staff?.full_name || "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {shift.staff?.full_name}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Started {getElapsedTime(shift.shift_start)} ago
                  </div>
                </div>
                <Badge variant="default" className="bg-brand-primary">
                  Active
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
