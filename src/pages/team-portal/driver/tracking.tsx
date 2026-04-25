import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Clock, CheckCircle, Package, AlertCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";

export default function DriverTracking() {
  const { user } = useAuth();
  const [currentDelivery, setCurrentDelivery] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock current delivery
    const mockDelivery = {
      id: "del-001",
      orderId: "ORD-001",
      orderName: "Sarah Johnson Event",
      status: "in_transit",
      destination: {
        lat: -26.2041,
        lng: 28.0473,
        address: "123 Event Venue Rd, Johannesburg"
      },
      items: [
        { name: "Beef", quantity: "30kg" },
        { name: "Chicken", quantity: "25kg" },
        { name: "Boerewors", quantity: "20kg" }
      ],
      estimatedArrival: new Date(Date.now() + 1800000).toISOString(),
      distance: 12.5,
      clientPhone: "+27 82 123 4567"
    };

    setCurrentDelivery(mockDelivery);
    setLoading(false);
  }, []);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Delivery Tracking - Driver Portal</title>
      </Head>

      <DynamicNav userRole={UserRole.DRIVER} />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Navigation className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Current Delivery</h1>
              <p className="text-slate-600">Track your active delivery</p>
            </div>
          </div>

          {!currentDelivery ? (
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
                    <span>{currentDelivery.orderName}</span>
                    <Badge className="bg-blue-100 text-blue-800">
                      <Navigation className="w-4 h-4 mr-1" />
                      In Transit
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Destination</p>
                    <p className="font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-blue-600" />
                      {currentDelivery.destination.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <span>ETA: {new Date(currentDelivery.estimatedArrival).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-blue-600" />
                      <span>{currentDelivery.distance.toFixed(1)} km away</span>
                    </div>
                  </div>
                  <div className="pt-4 space-y-2">
                    <Button className="w-full" size="lg">
                      <Navigation className="w-4 h-4 mr-2" />
                      Open in Navigation App
                    </Button>
                    <Button variant="outline" className="w-full" size="lg">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark as Arrived
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Order Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {currentDelivery.items.map((item: any, idx: number) => (
                      <li key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span>{item.name}</span>
                        <span className="font-semibold">{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Client Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Call Client: {currentDelivery.clientPhone}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="driver" companyId={user?.user_metadata?.company_id} />
    </>
  );
}