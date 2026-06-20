
import { useState, useEffect } from "react";
import { Plus, MapPin, Clock, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { routeStopService } from "@/services/routeStopService";
import { formatLocalTime } from "@/lib/localFormat";

interface RouteStopManagerProps {
  orderId: string;
  driverId: string;
  isAdmin?: boolean;
}

export function RouteStopManager({ orderId, driverId, isAdmin = false }: RouteStopManagerProps) {
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [newStop, setNewStop] = useState({
    stop_type: "last_minute_purchase" as "emergency" | "last_minute_purchase" | "fuel" | "other",
    stop_name: "",
    stop_address: "",
    reason: "",
    amount_spent: "",
  });

  useEffect(() => {
    loadStops();
  }, [orderId]);

  const loadStops = async () => {
    try {
      const data = await routeStopService.getOrderStops(orderId);
      setStops(data);
    } catch (error) {
      console.error("Error loading stops:", error);
    }
  };

  const handleAddStop = async () => {
    if (!newStop.stop_name || !newStop.stop_address) {
      alert("Please fill in stop name and address");
      return;
    }

    setLoading(true);
    try {
      await routeStopService.addStop(orderId, driverId, {
        ...newStop,
        amount_spent: newStop.amount_spent ? parseFloat(newStop.amount_spent) : undefined,
        added_by_admin: isAdmin,
      });

      setNewStop({
        stop_type: "last_minute_purchase",
        stop_name: "",
        stop_address: "",
        reason: "",
        amount_spent: "",
      });
      setIsAddingStop(false);
      await loadStops();
    } catch (error) {
      console.error("Error adding stop:", error);
      alert("Failed to add stop");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkArrival = async (stopId: string) => {
    try {
      await routeStopService.updateStopArrival(stopId);
      await loadStops();
    } catch (error) {
      console.error("Error marking arrival:", error);
      alert("Failed to mark arrival");
    }
  };

  const handleMarkDeparture = async (stopId: string) => {
    try {
      await routeStopService.updateStopDeparture(stopId);
      await loadStops();
    } catch (error) {
      console.error("Error marking departure:", error);
      alert("Failed to mark departure");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Route Stops
            </CardTitle>
            <CardDescription>Manage additional stops on this delivery route</CardDescription>
          </div>
          <Dialog open={isAddingStop} onOpenChange={setIsAddingStop}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Stop
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Route Stop</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Stop Type</Label>
                  <Select
                    value={newStop.stop_type}
                    onValueChange={(value: any) => setNewStop({ ...newStop, stop_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_minute_purchase">Last Minute Purchase</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="fuel">Fuel</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Stop Name</Label>
                  <Input
                    placeholder="e.g., Pick n Pay, Shell Garage"
                    value={newStop.stop_name}
                    onChange={(e) => setNewStop({ ...newStop, stop_name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    placeholder="Full address"
                    value={newStop.stop_address}
                    onChange={(e) => setNewStop({ ...newStop, stop_address: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea
                    placeholder="Why is this stop needed?"
                    value={newStop.reason}
                    onChange={(e) => setNewStop({ ...newStop, reason: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Amount Spent (optional)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={newStop.amount_spent}
                    onChange={(e) => setNewStop({ ...newStop, amount_spent: e.target.value })}
                  />
                </div>

                <Button onClick={handleAddStop} disabled={loading} className="w-full">
                  {loading ? "Adding..." : "Add Stop"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {stops.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No additional stops on this route</p>
          </div>
        ) : (
          <div className="space-y-3">
            {stops.map((stop) => (
              <div
                key={stop.id}
                className="border rounded-lg p-4 space-y-3 bg-card hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{stop.stop_name}</span>
                      <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                        {stop.stop_type.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{stop.stop_address}</p>
                    {stop.reason && (
                      <p className="text-sm mt-2 text-muted-foreground italic">{stop.reason}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  {stop.arrival_time && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Arrived: {formatLocalTime(stop.arrival_time)}
                    </div>
                  )}
                  {stop.departure_time && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Left: {formatLocalTime(stop.departure_time)}
                    </div>
                  )}
                  {stop.amount_spent && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Banknote className="h-4 w-4" />
                      R {stop.amount_spent}
                    </div>
                  )}
                </div>

                {!stop.departure_time && (
                  <div className="flex gap-2">
                    {!stop.arrival_time ? (
                      <Button size="sm" onClick={() => handleMarkArrival(stop.id)} variant="outline">
                        Mark Arrival
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleMarkDeparture(stop.id)}>
                        Mark Departure
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
