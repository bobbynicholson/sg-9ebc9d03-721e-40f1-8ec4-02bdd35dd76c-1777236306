import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle, Clock, Truck, MapPinned, Package } from "lucide-react";
import { driverConfirmationService } from "@/services/driverConfirmationService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatLocalTime } from "@/lib/localFormat";

interface DriverConfirmationPanelProps {
  orderId: string;
  orderNumber: string;
  eventTime: string;
  venueAddress: string;
}

export function DriverConfirmationPanel({ orderId, orderNumber, eventTime, venueAddress }: DriverConfirmationPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [confirmations, setConfirmations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Wave 11 #11: collection trip is a separate driver_assignment row
  // scheduled at event end. Surface it here as a third stage block
  // so the driver has one button to start the collection (autoClockIn
  // + flips assignment to in_progress) and one to mark it complete
  // (returns equipment + autoClockOut). Only renders when there's an
  // active collection assignment for this driver on this order.
  const [collectionAssignment, setCollectionAssignment] = useState<any | null>(null);

  useEffect(() => {
    loadConfirmations();
    getCurrentLocation();
    loadCollectionAssignment();
  }, [orderId]);

  const loadCollectionAssignment = async () => {
    if (!user?.id) return;
    try {
      const { data } = await (supabase as any)
        .from("driver_assignments")
        .select("id, status, scheduled_for, driver_id, en_route_at, completed_at")
        .eq("order_id", orderId)
        .eq("assignment_type", "collection")
        .eq("driver_id", user.id)
        .maybeSingle();
      setCollectionAssignment(data || null);
    } catch (e) {
      console.warn("[DriverConfirmationPanel] collection assignment lookup failed:", e);
    }
  };

  const loadConfirmations = async () => {
    try {
      const data = await driverConfirmationService.getOrderConfirmations(orderId);
      setConfirmations(data);
    } catch (error) {
      console.error('Error loading confirmations:', error);
    }
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  };

  const handleConfirm = async (
    type:
      | 'en_route_to_kitchen'
      | 'at_kitchen'
      | 'departed_kitchen'
      | 'at_venue'
      | 'setup_started'
      | 'service_started'
      | 'departed_venue',
  ) => {
    if (!user) return;

    setLoading(true);
    try {
      let result;
      switch (type) {
        case 'en_route_to_kitchen':
          result = await driverConfirmationService.confirmEnRouteToKitchen(orderId, user.id, geoLocation || undefined);
          break;
        case 'at_kitchen':
          result = await driverConfirmationService.confirmAtKitchen(orderId, user.id, geoLocation || undefined);
          break;
        case 'departed_kitchen':
          result = await driverConfirmationService.confirmDepartedKitchen(orderId, user.id, geoLocation || undefined);
          break;
        case 'at_venue':
          result = await driverConfirmationService.confirmAtVenue(orderId, user.id, geoLocation || undefined);
          break;
        case 'setup_started':
          result = await (driverConfirmationService as any).markSetupStarted(orderId, user.id, geoLocation || undefined);
          break;
        case 'service_started':
          result = await (driverConfirmationService as any).markServiceStarted(orderId, user.id, geoLocation || undefined);
          break;
        case 'departed_venue':
          result = await (driverConfirmationService as any).markDepartedVenue(orderId, user.id, geoLocation || undefined);
          break;
      }

      toast({
        title: "✅ Confirmed!",
        description: "Your status has been updated successfully.",
      });

      await loadConfirmations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isConfirmed = (type: string) => {
    return confirmations.some(c => c.confirmation_type === type);
  };

  const getConfirmationTime = (type: string) => {
    const confirmation = confirmations.find(c => c.confirmation_type === type);
    return confirmation ? formatLocalTime(confirmation.confirmed_at) : null;
  };

  return (
    <Card className="border-2 border-brand-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-brand-primary" />
          Delivery Checklist - Order #{orderNumber}
        </CardTitle>
        <CardDescription>
          Event Time: {eventTime} | Venue: {venueAddress}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* En-Route to Kitchen */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <MapPin className={`h-5 w-5 ${isConfirmed('en_route_to_kitchen') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">En-Route to Kitchen</p>
              {isConfirmed('en_route_to_kitchen') && (
                <p className="text-sm text-muted-foreground">Confirmed at {getConfirmationTime('en_route_to_kitchen')}</p>
              )}
            </div>
          </div>
          {isConfirmed('en_route_to_kitchen') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('en_route_to_kitchen')}
              disabled={loading}
              size="sm"
            >
              Confirm
            </Button>
          )}
        </div>

        {/* At Kitchen */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <MapPinned className={`h-5 w-5 ${isConfirmed('at_kitchen') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">Arrived at Kitchen</p>
              {isConfirmed('at_kitchen') && (
                <p className="text-sm text-muted-foreground">Confirmed at {getConfirmationTime('at_kitchen')}</p>
              )}
            </div>
          </div>
          {isConfirmed('at_kitchen') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('at_kitchen')}
              disabled={loading || !isConfirmed('en_route_to_kitchen')}
              size="sm"
            >
              Confirm
            </Button>
          )}
        </div>

        {/* Departed Kitchen */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Truck className={`h-5 w-5 ${isConfirmed('departed_kitchen') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">Departed Kitchen</p>
              {isConfirmed('departed_kitchen') && (
                <p className="text-sm text-muted-foreground">Confirmed at {getConfirmationTime('departed_kitchen')}</p>
              )}
            </div>
          </div>
          {isConfirmed('departed_kitchen') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('departed_kitchen')}
              disabled={loading || !isConfirmed('at_kitchen')}
              size="sm"
            >
              Confirm
            </Button>
          )}
        </div>

        {/* At Venue */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Clock className={`h-5 w-5 ${isConfirmed('at_venue') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">Arrived at Venue</p>
              {isConfirmed('at_venue') && (
                <p className="text-sm text-muted-foreground">Confirmed at {getConfirmationTime('at_venue')}</p>
              )}
            </div>
          </div>
          {isConfirmed('at_venue') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('at_venue')}
              disabled={loading || !isConfirmed('departed_kitchen')}
              size="sm"
            >
              Confirm
            </Button>
          )}
        </div>

        {/* Wave 49 B2 - new post-arrival stamps. Setup -> service ->
            depart. Each writes orders.<column>_at and a
            driver_confirmations audit row, fires a dispatch ping.
            Pre-Wave-49 these moments were invisible to the system. */}

        {/* Setup started */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Package className={`h-5 w-5 ${isConfirmed('setup_started') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">Setup started</p>
              {isConfirmed('setup_started') && (
                <p className="text-sm text-muted-foreground">Tapped at {getConfirmationTime('setup_started')}</p>
              )}
            </div>
          </div>
          {isConfirmed('setup_started') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Done
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('setup_started')}
              disabled={loading || !isConfirmed('at_venue')}
              size="sm"
            >
              Tap when rigging begins
            </Button>
          )}
        </div>

        {/* Service started */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <CheckCircle className={`h-5 w-5 ${isConfirmed('service_started') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">Service started</p>
              {isConfirmed('service_started') && (
                <p className="text-sm text-muted-foreground">Tapped at {getConfirmationTime('service_started')}</p>
              )}
            </div>
          </div>
          {isConfirmed('service_started') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Done
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('service_started')}
              disabled={loading || !isConfirmed('setup_started')}
              size="sm"
            >
              Tap when food service begins
            </Button>
          )}
        </div>

        {/* Departed venue */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Truck className={`h-5 w-5 ${isConfirmed('departed_venue') ? 'text-green-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium">Departed venue</p>
              {isConfirmed('departed_venue') && (
                <p className="text-sm text-muted-foreground">Tapped at {getConfirmationTime('departed_venue')}</p>
              )}
            </div>
          </div>
          {isConfirmed('departed_venue') ? (
            <Badge variant="default" className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Done
            </Badge>
          ) : (
            <Button
              onClick={() => handleConfirm('departed_venue')}
              disabled={loading || !isConfirmed('service_started')}
              size="sm"
            >
              Tap when truck rolls home
            </Button>
          )}
        </div>

        {/* Collection trip controls. Only render when this driver has
            a collection assignment for the order. The two buttons
            mirror the delivery-leg pattern so the UX is familiar.
            Wave 11 #11. */}
        {collectionAssignment && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-600" />
              <p className="font-semibold text-slate-900">Collection trip</p>
              {collectionAssignment.scheduled_for && (
                <span className="text-xs text-slate-500">
                  Scheduled: {new Date(collectionAssignment.scheduled_for).toLocaleString("en-ZA")}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">On my way to collect</p>
                {collectionAssignment.en_route_at && (
                  <p className="text-xs text-muted-foreground">
                    Started: {new Date(collectionAssignment.en_route_at).toLocaleTimeString("en-ZA")}
                  </p>
                )}
              </div>
              {collectionAssignment.en_route_at || collectionAssignment.status === "in_progress" || collectionAssignment.status === "completed" ? (
                <Badge variant="default" className="bg-amber-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Started
                </Badge>
              ) : (
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={async () => {
                    if (!user) return;
                    setLoading(true);
                    try {
                      await (driverConfirmationService as any).startCollection(orderId, user.id);
                      toast({ title: "Clock-in recorded", description: "Drive safely. We'll close the shift when you mark it done." });
                      await loadCollectionAssignment();
                    } catch (e: any) {
                      toast({ title: "Could not start collection", description: e?.message || "Try again", variant: "destructive" });
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Start
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Equipment back at base</p>
                {collectionAssignment.completed_at && (
                  <p className="text-xs text-muted-foreground">
                    Done: {new Date(collectionAssignment.completed_at).toLocaleTimeString("en-ZA")}
                  </p>
                )}
              </div>
              {collectionAssignment.status === "completed" ? (
                <Badge variant="default" className="bg-emerald-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Done
                </Badge>
              ) : (
                <Button
                  size="sm"
                  disabled={loading || (!collectionAssignment.en_route_at && collectionAssignment.status !== "in_progress")}
                  onClick={async () => {
                    if (!user) return;
                    setLoading(true);
                    try {
                      await (driverConfirmationService as any).completeCollection(orderId, user.id);
                      toast({ title: "Collection complete", description: "Equipment returned. Cleaning queue updated." });
                      await loadCollectionAssignment();
                    } catch (e: any) {
                      toast({ title: "Could not complete collection", description: e?.message || "Try again", variant: "destructive" });
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Mark complete
                </Button>
              )}
            </div>
          </div>
        )}

        {geoLocation && (
          <p className="text-xs text-muted-foreground text-center">
            📍 GPS tracking active
          </p>
        )}
      </CardContent>
    </Card>
  );
}
