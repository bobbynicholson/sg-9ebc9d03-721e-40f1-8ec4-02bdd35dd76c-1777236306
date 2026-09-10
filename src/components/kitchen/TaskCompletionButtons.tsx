import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  UtensilsCrossed, 
  Grape, 
  Package, 
  Truck,
  Clock
} from "lucide-react";
import { kitchenDutyService } from "@/services/kitchenDutyService";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";
import { formatLocalTime } from "@/lib/localFormat";
import { useToast } from "@/hooks/use-toast";

type TaskCompletionWithStaff = Database["public"]["Tables"]["kitchen_task_completions"]["Row"] & {
  staff: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string | null;
  } | null;
};

interface TaskCompletionButtonsProps {
  orderId: string;
  orderNumber: string;
  clientName: string;
}

interface TaskStatus {
  type: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
}

const TASK_TYPES = [
  {
    type: "food_ready",
    label: "Food ready",
    icon: Grape,
    color: "bg-brand-primary",
  },
  {
    type: "cutlery_ready",
    label: "Cutlery ready",
    icon: UtensilsCrossed,
    color: "bg-brand-primary",
  },
  {
    type: "crockery_ready",
    label: "Crockery ready",
    icon: Package,
    color: "bg-brand-primary",
  },
  {
    type: "ready_for_pickup",
    label: "Ready for pickup",
    icon: Truck,
    color: "bg-brand-primary",
  },
];

export function TaskCompletionButtons({ 
  orderId, 
  orderNumber, 
  clientName 
}: TaskCompletionButtonsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [currentShift, setCurrentShift] = useState<any>(null);

  useEffect(() => {
    loadTaskStatus();
    loadCurrentShift();
  }, [orderId, user?.id]);

  const loadCurrentShift = async () => {
    if (!user?.id) return;
    try {
      const shift = await kitchenDutyService.getCurrentDutyShift(user.id);
      setCurrentShift(shift);
    } catch (error) {
      console.error("Error loading current shift:", error);
    }
  };

  const loadTaskStatus = async () => {
    try {
      const completions = await kitchenDutyService.getOrderTaskCompletions(orderId);
      const taskStatuses = TASK_TYPES.map(taskType => {
        const completion = completions.find(c => c.task_type === taskType.type) as TaskCompletionWithStaff | undefined;
        return {
          type: taskType.type,
          completed: !!completion,
          completedAt: completion?.completed_at,
          completedBy: completion?.staff?.full_name,
        };
      });
      setTasks(taskStatuses);
    } catch (error) {
      console.error("Error loading task status:", error);
    }
  };

  const handleCompleteTask = async (taskType: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Sign in again before completing kitchen tasks.",
        variant: "destructive",
      });
      return;
    }

    if (!currentShift?.is_active) {
      toast({
        title: "Start your shift first",
        description: "Clock in before marking kitchen tasks complete.",
        variant: "destructive",
      });
      return;
    }

    setLoading(taskType);
    try {
      await kitchenDutyService.completeTask(
        user.id,
        orderId,
        user.id,
        taskType,
        currentShift.id
      );
      await loadTaskStatus();
    } catch (error) {
      console.error("Error completing task:", error);
      toast({
        title: "Task not saved",
        description: error instanceof Error ? error.message : "Try again before service leaves the kitchen.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const allTasksComplete = tasks.every(t => t.completed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Order #{orderNumber} - {clientName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TASK_TYPES.map((taskType) => {
            const status = tasks.find(t => t.type === taskType.type);
            const Icon = taskType.icon;
            
            return (
              <Button
                key={taskType.type}
                onClick={() => handleCompleteTask(taskType.type)}
                disabled={status?.completed || loading === taskType.type || !currentShift?.is_active}
                variant={status?.completed ? "outline" : "default"}
                className={`h-auto py-4 flex flex-col items-start gap-2 ${
                  status?.completed ? "" : taskType.color + " hover:opacity-90"
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className="h-5 w-5" />
                  <span className="font-semibold">{taskType.label}</span>
                  {status?.completed && (
                    <CheckCircle2 className="h-4 w-4 ml-auto text-brand-primary" />
                  )}
                </div>
                {status?.completed && status.completedAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatLocalTime(status.completedAt)}
                    {status.completedBy && ` by ${status.completedBy}`}
                  </div>
                )}
              </Button>
            );
          })}
        </div>

        {!currentShift?.is_active && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              Start your shift before marking tasks complete.
            </p>
          </div>
        )}

        {allTasksComplete && (
          <div className="p-4 bg-brand-primary/10 border border-brand-primary/20 rounded-lg text-center">
            <CheckCircle2 className="h-8 w-8 text-brand-primary mx-auto mb-2" />
            <p className="font-semibold text-brand-primary">All tasks complete</p>
            <p className="text-sm text-brand-primary">Order is ready for pickup.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
