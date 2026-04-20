import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Clock, CheckCircle, Package } from "lucide-react";
import { ClientNav } from "@/components/navigation/ClientNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

export default function ClientTracking() {
  const { user } = useAuth();
  const [delivery, setDelivery] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock delivery tracking data
    const mockDelivery = {
      id: "del-001",
      orderId: "ORD-001",
      orderName: "My Event Order",
      status: "in_transit",
      driverName: "John Smith",
      vehicleNumber: "ABC-123-GP",
      currentLocation: {
        address: "Currently at Sandton, Johannesburg"
      },
      destination: {
        address: "123 Event Venue Rd, Johannesburg"
      },
      estimatedArrival: new Date(Date.now() + 1800000).toISOString(),
      distance: 12.5,
      trackingSteps: [
        { status: "confirmed", label: "Order Confirmed", completed: true, time: "09:00 AM" },
        { status: "preparing", label: "Being Prepared", completed: true, time: "10:30 AM" },
        { status: "dispatched", label: "Out for Delivery", completed: true, time: "02:15 PM" },
        { status: "arrived", label: "Arrived", completed: false, time: null },
      ]
    };

    setDelivery(mockDelivery);
    setLoading(false);
  }, []);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Track My Delivery - Client Portal</title>
      </Head>

      <ClientNav />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Track My Delivery</h1>
              <p className="text-slate-600">Real-time delivery status</p>
            </div>
          </div>

          {!delivery ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-600">No active deliveries</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{delivery.orderName}</span>
                    <Badge className="bg-blue-100 text-blue-800">
                      <Truck className="w-4 h-4 mr-1" />
                      In Transit
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                    <div>
                      <p className="text-sm text-slate-600">Estimated Arrival</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {new Date(delivery.estimatedArrival).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Distance</p>
                      <p className="text-xl font-bold">{delivery.distance.toFixed(1)} km</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <Truck className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="font-medium">Driver: {delivery.driverName}</p>
                        <p className="text-sm text-slate-600">Vehicle: {delivery.vehicleNumber}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="font-medium">Current Location</p>
                        <p className="text-sm text-slate-600">{delivery.currentLocation.address}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Delivery Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {delivery.trackingSteps.map((step: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          step.completed ? "bg-green-100" : "bg-slate-100"
                        }`}>
                          {step.completed ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className={`font-medium ${step.completed ? "text-slate-900" : "text-slate-400"}`}>
                            {step.label}
                          </p>
                          {step.time && (
                            <p className="text-sm text-slate-600">{step.time}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="client" companyId={user?.user_metadata?.company_id} />
    </>
  );
}