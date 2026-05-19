import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Clock, CheckCircle, Package } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DriverNav } from "@/components/navigation/DriverNav";
import { UserRole } from "@/types/app";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { openNavigation as openMapsNavigation } from "@/lib/driverNavigation";
import { useKitchenOrigin } from "@/hooks/useKitchenOrigin";

interface ActiveDelivery {
  assignmentId: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  clientPhone: string | null;
  venueAddress: string;
  venueLat: number | null;
  venueLng: number | null;
  guestCount: number;
  eventDate: string;
  eventTime: string | null;
  status: string;
  picked_up_at: string | null;
  arrived_at_venue_at: string | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  assigned: { label: "Assigned", tone: "bg-blue-100 text-blue-800" },
  accepted: { label: "Accepted", tone: "bg-blue-100 text-blue-800" },
  en_route: { label: "En Route", tone: "bg-amber-100 text-amber-800" },
  picked_up: { label: "Picked Up", tone: "bg-purple-100 text-purple-800" },
};

function DriverTrackingInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [delivery, setDelivery] = useState<ActiveDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // Kitchen origin: driver's region kitchen if set, otherwise company HQ
  const { origin: kitchenOrigin } = useKitchenOrigin(user?.id, user?.company_id);

  const loadActiveDelivery = async () => {
    if (!user?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("driver_assignments")
      .select(`
        id,
        order_id,
        status,
        picked_up_at,
        arrived_at_venue_at,
        orders (
          order_number,
          client_name,
          client_phone,
          venue_address,
          venue_lat,
          venue_lng,
          guest_count,
          event_date,
          event_time
        )
      `)
      .eq("driver_id", user.id)
      .in("status", ["assigned", "accepted", "en_route", "picked_up", "at_venue"])
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error loading active delivery:", error);
      setDelivery(null);
      setLoading(false);
      return;
    }

    if (!data || !data.orders) {
      setDelivery(null);
      setLoading(false);
      return;
    }

    const order: any = data.orders;
    setDelivery({
      assignmentId: data.id,
      orderId: data.order_id,
      orderNumber: order.order_number,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      venueAddress: order.venue_address,
      venueLat: order.venue_lat ?? null,
      venueLng: order.venue_lng ?? null,
      guestCount: order.guest_count,
      eventDate: order.event_date,
      eventTime: order.event_time,
      status: data.status,
      picked_up_at: data.picked_up_at,
      arrived_at_venue_at: data.arrived_at_venue_at,
    });
    setLoading(false);
  };

  useEffect(() => {
    loadActiveDelivery();
  }, [user?.id]);

  const markArrived = async () => {
    if (!delivery) return;
    setUpdating(true);
    // `at_venue` is the canonical "driver has reached the delivery
    // venue" state in assignment_status. Prior code wrote `picked_up`
    // here, which is the earlier lifecycle moment (driver collected
    // food from the kitchen) - so "Mark arrived" was writing the wrong
    // state and the toast copy ("Status updated to picked up") was
    // misleading.
    const { error } = await supabase
      .from("driver_assignments")
      .update({
        status: "at_venue",
        arrived_at_venue_at: new Date().toISOString(),
      })
      .eq("id", delivery.assignmentId);

    setUpdating(false);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marked as arrived", description: "Status updated to at venue." });
    loadActiveDelivery();
  };

  const openNavigation = () => {
    if (!delivery) return;
    openMapsNavigation(
      { lat: delivery.venueLat, lng: delivery.venueLng, address: delivery.venueAddress },
      kitchenOrigin ?? undefined,
    );
  };

  const statusMeta = delivery ? STATUS_LABELS[delivery.status] || { label: delivery.status, tone: "bg-slate-100 text-slate-800" } : null;

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Delivery Tracking - Driver Portal</title>
      </Head>

      <DriverNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                Current Delivery
                <InfoTooltip content="The delivery you're working on right now.\n\nShows whichever job is in progress, from assigned all the way through to picked up." />
              </h1>
              <p className="text-slate-600">Track your active delivery</p>
            </div>
          </div>

          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center text-slate-600">Loading...</CardContent>
            </Card>
          ) : !delivery ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-600">No active delivery</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{delivery.clientName}</span>
                    <Badge className={statusMeta!.tone}>
                      <Navigation className="w-4 h-4 mr-1" />
                      {statusMeta!.label}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-2 flex items-center gap-1">
                      Order
                      <InfoTooltip content="The order reference you can use when chatting with dispatch or the client." />
                    </p>
                    <p className="font-medium">{delivery.orderNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 mb-2 flex items-center gap-1">
                      Destination
                      <InfoTooltip content="The venue address for this delivery.\n\nTap the navigate button below to open it in Google Maps." />
                    </p>
                    <p className="font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-blue-600" />
                      {delivery.venueAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <span>
                        {new Date(delivery.eventDate).toLocaleDateString()}
                        {delivery.eventTime ? ` • ${delivery.eventTime}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-600" />
                      <span>{delivery.guestCount} guests</span>
                    </div>
                  </div>
                  <div className="pt-4 space-y-2">
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => openNavigation()}
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Open in Navigation App
                    </Button>
                    {delivery.status !== "at_venue" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        size="lg"
                        onClick={markArrived}
                        disabled={updating}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {updating ? "Updating..." : "Mark as Arrived"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {delivery.clientPhone && (
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Client Contact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.open(`tel:${delivery.clientPhone}`, "_self")}
                    >
                      Call Client: {delivery.clientPhone}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="driver" companyId={user?.company_id} />
    </>
  );
}

// DRV-A (driver deep audit, DRV-1 / DRV-2 / DRV-21): defense-in-depth.
// Matches the dashboard wrapper.
export default function DriverTracking() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.DRIVER, UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DriverTrackingInner />
    </ProtectedRoute>
  );
}
