import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Droplets,
  Sparkles,
  Wind,
  CheckCircle2,
  Clock,
  ArrowRight,
  Package,
} from "lucide-react";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { useAuth } from "@/contexts/AuthContext";

type CleaningStatus = "pending" | "cleaning" | "drying" | "ready" | "stored";

const statusConfig: Record<CleaningStatus, {
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  progress: number;
}> = {
  pending: {
    label: "Pending Cleaning",
    icon: Clock,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    progress: 0,
  },
  cleaning: {
    label: "Being Cleaned",
    icon: Droplets,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    progress: 33,
  },
  drying: {
    label: "Drying",
    icon: Wind,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    progress: 66,
  },
  ready: {
    label: "Ready for Use",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-100",
    progress: 100,
  },
  stored: {
    label: "Stored",
    icon: Package,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    progress: 100,
  },
};

export function CleaningWorkflowTracker() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<CleaningStatus | "all">("all");

  useEffect(() => {
    loadCleaningEquipment();
    const interval = setInterval(loadCleaningEquipment, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const loadCleaningEquipment = async () => {
    if (!user) return;

    try {
      const equipment = await equipmentTrackingService.getPendingCleaningEquipment(user.id);
      setEquipmentList(equipment);
    } catch (error) {
      console.error("Error loading cleaning equipment:", error);
    }
  };

  const handleStatusUpdate = async (item: any, newStatus: CleaningStatus) => {
    setLoading(true);
    try {
      await equipmentTrackingService.updateCleaningStatus({
        cleaningStatusId: item.id,
        status: newStatus,
        cleanedByUserId: newStatus === "cleaning" ? user?.id : undefined,
        verifiedByUserId: newStatus === "ready" ? user?.id : undefined,
      });
      await loadCleaningEquipment();
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  const getNextStatus = (currentStatus: CleaningStatus): CleaningStatus | null => {
    const workflow: CleaningStatus[] = ["pending", "cleaning", "drying", "ready"];
    const currentIndex = workflow.indexOf(currentStatus);
    return currentIndex < workflow.length - 1 ? workflow[currentIndex + 1] : null;
  };

  const filteredEquipment = selectedFilter === "all" 
    ? equipmentList 
    : equipmentList.filter(item => item.current_status === selectedFilter);

  const statusCounts = equipmentList.reduce((acc, item) => {
    acc[item.current_status] = (acc[item.current_status] || 0) + 1;
    return acc;
  }, {} as Record<CleaningStatus, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Cleaning Workflow</h2>
        <div className="flex gap-2">
          <Button
            variant={selectedFilter === "all" ? "default" : "outline"}
            onClick={() => setSelectedFilter("all")}
            size="sm"
          >
            All ({equipmentList.length})
          </Button>
          {(Object.keys(statusConfig) as CleaningStatus[]).map((status) => (
            <Button
              key={status}
              variant={selectedFilter === status ? "default" : "outline"}
              onClick={() => setSelectedFilter(status)}
              size="sm"
            >
              {statusConfig[status].label} ({statusCounts[status] || 0})
            </Button>
          ))}
        </div>
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Cleaning Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {(["pending", "cleaning", "drying", "ready"] as CleaningStatus[]).map((status) => {
              const config = statusConfig[status];
              const Icon = config.icon;
              const count = statusCounts[status] || 0;
              
              return (
                <div key={status} className="text-center">
                  <div className={`${config.bgColor} rounded-lg p-4 mb-2`}>
                    <Icon className={`h-8 w-8 ${config.color} mx-auto mb-2`} />
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  <p className="text-sm font-medium">{config.label}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Equipment List */}
      {filteredEquipment.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No equipment in this stage</p>
            <p className="text-sm">Everything is clean and ready!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEquipment.map((item) => {
            const config = statusConfig[item.current_status];
            const Icon = config.icon;
            const nextStatus = getNextStatus(item.current_status);

            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{item.equipment?.name}</h4>
                          <Badge variant="outline" className={config.bgColor}>
                            <Icon className={`h-3 w-3 mr-1 ${config.color}`} />
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Order: {item.order?.order_number} • Qty: {item.returned_quantity}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{config.progress}%</span>
                      </div>
                      <Progress value={config.progress} className="h-2" />
                    </div>

                    {/* Timeline */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {item.cleaning_started_at && (
                        <span>Started: {new Date(item.cleaning_started_at).toLocaleTimeString()}</span>
                      )}
                      {item.drying_started_at && (
                        <>
                          <ArrowRight className="h-3 w-3" />
                          <span>Drying: {new Date(item.drying_started_at).toLocaleTimeString()}</span>
                        </>
                      )}
                      {item.ready_for_use_at && (
                        <>
                          <ArrowRight className="h-3 w-3" />
                          <span>Ready: {new Date(item.ready_for_use_at).toLocaleTimeString()}</span>
                        </>
                      )}
                    </div>

                    {/* Staff Info */}
                    {item.cleaned_by && (
                      <div className="flex items-center gap-2 text-sm">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{item.cleaned_by.full_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-muted-foreground">
                          Cleaned by {item.cleaned_by.full_name}
                        </span>
                      </div>
                    )}

                    {/* Action Button */}
                    {nextStatus && (
                      <Button
                        onClick={() => handleStatusUpdate(item, nextStatus)}
                        disabled={loading}
                        className="w-full gap-2"
                      >
                        {statusConfig[nextStatus].icon && (
                          <Icon className="h-4 w-4" />
                        )}
                        Move to {statusConfig[nextStatus].label}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
