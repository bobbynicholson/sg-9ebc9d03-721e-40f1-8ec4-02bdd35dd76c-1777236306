import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  MapPin,
  User,
  Calendar,
  Clock,
  Package
} from "lucide-react";
import { DriverGPSTracker } from "@/components/tracking/DriverGPSTracker";
import { DeliveryStatus } from "@/types/tracking";

export default function DriverTrackingPage() {
  const router = useRouter();
  const { orderId } = router.query;
  const [driverId] = useState("driver_001");
  const [driverName] = useState("John Driver");
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    if (orderId) {
      const quotes = JSON.parse(localStorage.getItem("quotes") || "[]");
      const order = quotes.find((q: any) => q.id === orderId);
      setOrderDetails(order);
    }
  }, [orderId]);

  const handleStatusChange = (status: DeliveryStatus) => {
    console.log("Status updated:", status);
  };

  if (!orderId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Card className="border-0 shadow-lg max-w-md">
          <CardContent className="py-12 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No order selected</p>
            <Link href="/drivers">
              <Button className="mt-4">Back to Driver Portal</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/drivers">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Driver Portal
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Active Delivery
              </h1>
              <p className="text-slate-600 mt-1">Order #{orderId}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <DriverGPSTracker
              orderId={orderId as string}
              driverId={driverId}
              driverName={driverName}
              onStatusChange={handleStatusChange}
            />

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Delivery Instructions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Pickup Instructions</h4>
                  <p className="text-sm text-blue-700">
                    Collect food from main kitchen. Ring bell at loading dock entrance.
                    Check all items against order list before departure.
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">Delivery Instructions</h4>
                  <p className="text-sm text-green-700">
                    Deliver to venue main entrance. Contact event coordinator upon arrival.
                    Set up chafing dishes if requested by client.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {orderDetails && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Order Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm text-slate-600">Client</p>
                      <p className="font-medium text-slate-900">{orderDetails.clientName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm text-slate-600">Event Date</p>
                      <p className="font-medium text-slate-900">
                        {new Date(orderDetails.eventDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm text-slate-600">Event Type</p>
                      <p className="font-medium text-slate-900">{orderDetails.eventType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm text-slate-600">Guest Count</p>
                      <p className="font-medium text-slate-900">{orderDetails.guestCount} guests</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
              <CardHeader>
                <CardTitle className="text-lg">Safety Reminders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">1</div>
                  <p>Verify all food items before leaving kitchen</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">2</div>
                  <p>Maintain proper food temperature during transport</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">3</div>
                  <p>Call client 15 minutes before arrival</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">4</div>
                  <p>Update delivery status at each step</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
