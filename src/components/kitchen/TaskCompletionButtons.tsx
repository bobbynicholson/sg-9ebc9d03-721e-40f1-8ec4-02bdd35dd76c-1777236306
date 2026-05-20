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
    label: "Food Ready",
    icon: Grape,
    color: "bg-green-500",
  },
  {
    type: "cutlery_ready",
    label: "Cutlery Ready",
    icon: UtensilsCrossed,
    color: "bg-blue-500",
  },
  {
    type: "crockery_ready",
    label: "Crockery Ready",
    icon: Package,
    color: "bg-purple-500",
  },
  {
    type: "ready_for_pickup",
    label: "Ready for Pickup",
    icon: Truck,
    color: "bg-orange-500",
  },
];

export function TaskCompletionButtons({ 
  orderId, 
  orderNumber, 
  clientName 
}: TaskCompletionButtonsProps) {
  const { user } = useAuth();
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
      alert("You must be logged in to complete tasks");
      return;
    }

    if (!currentShift?.is_active) {
      alert("You must be on duty to complete tasks. Click 'Start Duty' first.");
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
      alert("Failed to mark task as complete");
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
                    <CheckCircle2 className="h-4 w-4 ml-auto text-green-500" />
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
              ⚠️ You must be on duty to complete tasks. Click "Start Duty" above.
            </p>
          </div>
        )}

        {allTasksComplete && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="font-semibold text-green-800">All tasks complete!</p>
            <p className="text-sm text-green-700">Order is ready for pickup</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
