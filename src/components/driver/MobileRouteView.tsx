import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, MapPin, Clock, CheckCircle, Circle, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/localFormat";

interface RouteStop {
  id: string;
  order_number: string;
  client_name: string;
  venue_address: string;
  delivery_time: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  distance_from_previous: number;
  estimated_duration: number;
  priority: "high" | "medium" | "low";
}

interface MobileRouteViewProps {
  stops: RouteStop[];
  currentStopIndex: number;
  onStopChange: (index: number) => void;
  onNavigate: (stop: RouteStop) => void;
  onUpdateStatus: (stopId: string, status: RouteStop["status"]) => void;
}

export function MobileRouteView({
  stops,
  currentStopIndex,
  onStopChange,
  onNavigate,
  onUpdateStatus,
}: MobileRouteViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(currentStopIndex);
  const currentStop = stops[selectedIndex];

  const handlePrevious = () => {
    if (selectedIndex > 0) {
      const newIndex = selectedIndex - 1;
      setSelectedIndex(newIndex);
      onStopChange(newIndex);
    }
  };

  const handleNext = () => {
    if (selectedIndex < stops.length - 1) {
      const newIndex = selectedIndex + 1;
      setSelectedIndex(newIndex);
      onStopChange(newIndex);
    }
  };

  const getStatusIcon = (status: RouteStop["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "in_progress":
        return <Circle className="w-5 h-5 text-blue-500 fill-blue-500" />;
      case "failed":
        return <Circle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (!currentStop) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No stops assigned</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          Stop {selectedIndex + 1} of {stops.length}
        </span>
        <Badge variant={getPriorityColor(currentStop.priority)}>
          {currentStop.priority}
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary rounded-full h-2 transition-all duration-300"
          style={{ width: `${((selectedIndex + 1) / stops.length) * 100}%` }}
        />
      </div>

      {/* Main Stop Card */}
      <Card className="p-6 space-y-6">
        {/* Stop Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(currentStop.status)}
              <h3 className="text-lg font-semibold">{currentStop.client_name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Order #{currentStop.order_number}
            </p>
          </div>
        </div>

        {/* Location Info */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Delivery Address</p>
              <p className="text-sm text-muted-foreground">{currentStop.venue_address}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">Delivery Time</p>
              <p className="text-sm text-muted-foreground">
                {formatLocalDateTime(currentStop.delivery_time)}
              </p>
            </div>
          </div>
        </div>

        {/* Distance & Duration */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Distance</p>
            <p className="text-lg font-semibold">{currentStop.distance_from_previous.toFixed(1)} km</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Est. Time</p>
            <p className="text-lg font-semibold">{currentStop.estimated_duration} min</p>
          </div>
        </div>

        {/* Navigation Button */}
        <Button
          onClick={() => onNavigate(currentStop)}
          className="w-full h-14 text-base"
          size="lg"
        >
          <Navigation className="w-5 h-5 mr-2" />
          Start Navigation
        </Button>

        {/* Status Update Buttons */}
        {currentStop.status !== "completed" && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onUpdateStatus(currentStop.id, "in_progress")}
              disabled={currentStop.status === "in_progress"}
              className="h-12"
            >
              Start Delivery
            </Button>
            <Button
              variant="default"
              onClick={() => onUpdateStatus(currentStop.id, "completed")}
              disabled={currentStop.status === "pending"}
              className="h-12"
            >
              Mark Complete
            </Button>
          </div>
        )}

        {currentStop.status === "completed" && (
          <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Delivery Completed
            </span>
          </div>
        )}
      </Card>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between gap-4 mt-2">
        <Button
          variant="outline"
          size="lg"
          onClick={handlePrevious}
          disabled={selectedIndex === 0}
          className="flex-1 h-14"
        >
          <ChevronLeft className="w-5 h-5 mr-2" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handleNext}
          disabled={selectedIndex === stops.length - 1}
          className="flex-1 h-14"
        >
          Next
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>

      {/* Stop List Overview */}
      <div className="mt-4">
        <h4 className="text-sm font-medium mb-3">All Stops</h4>
        <div className="space-y-2">
          {stops.map((stop, index) => (
            <button
              key={stop.id}
              onClick={() => {
                setSelectedIndex(index);
                onStopChange(index);
              }}
              className={cn(
                "w-full p-4 rounded-lg border-2 transition-all text-left",
                selectedIndex === index
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {getStatusIcon(stop.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{stop.client_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {stop.venue_address}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(stop.delivery_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}