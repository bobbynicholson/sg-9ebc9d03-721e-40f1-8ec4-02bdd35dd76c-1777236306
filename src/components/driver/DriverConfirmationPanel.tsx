import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle, Clock, Truck, MapPinned } from "lucide-react";
import { driverConfirmationService } from "@/services/driverConfirmationService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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

  useEffect(() => {
    loadConfirmations();
    getCurrentLocation();
  }, [orderId]);

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

  const handleConfirm = async (type: 'en_route_to_kitchen' | 'at_kitchen' | 'departed_kitchen' | 'at_venue') => {
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
    return confirmation ? new Date(confirmation.confirmed_at).toLocaleTimeString() : null;
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

        {geoLocation && (
          <p className="text-xs text-muted-foreground text-center">
            📍 GPS tracking active
          </p>
        )}
      </CardContent>
    </Card>
  );
}
