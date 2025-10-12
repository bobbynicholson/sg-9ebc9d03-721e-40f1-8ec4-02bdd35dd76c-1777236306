import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  MapPin,
  Bell,
  Star,
  MessageSquare
} from "lucide-react";
import { ClientTrackingMap } from "@/components/tracking/ClientTrackingMap";
import { Notification } from "@/types/tracking";
import { Footer } from "@/components/Footer";

export default function ClientTrackingPage() {
  const router = useRouter();
  const { orderId } = router.query;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    if (!orderId) return;

    const mockNotifications: Notification[] = [
      {
        id: "not-001",
        orderId: String(orderId),
        type: "driver_logged_in",
        message: "Driver has logged in and is preparing to collect your order",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        recipientEmail: "client@example.com",
        recipientName: "Valued Client",
        read: false
      },
      {
        id: "not-002",
        orderId: String(orderId),
        type: "food_collected",
        message: "Food has been collected from the kitchen and is on the way",
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        recipientEmail: "client@example.com",
        recipientName: "Valued Client",
        read: false
      },
      {
        id: "not-003",
        orderId: String(orderId),
        type: "driver_arrived",
        message: "Driver has arrived at your location",
        timestamp: new Date(Date.now() - 600000).toISOString(),
        recipientEmail: "client@example.com",
        recipientName: "Valued Client",
        read: false
      }
    ];
    setNotifications(mockNotifications);
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Card className="border-0 shadow-lg max-w-md">
          <CardContent className="py-12 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-4">No order selected for tracking</p>
            <p className="text-sm text-slate-400 mb-6">
              Try one of these test orders:
            </p>
            <div className="space-y-2">
              <Link href="/tracking/client?orderId=ORD-001">
                <Button variant="outline" className="w-full">
                  Track Order ORD-001 (In Transit)
                </Button>
              </Link>
              <Link href="/tracking/client?orderId=ORD-002">
                <Button variant="outline" className="w-full">
                  Track Order ORD-002 (Delivered)
                </Button>
              </Link>
              <Link href="/tracking/client?orderId=ORD-003">
                <Button variant="outline" className="w-full">
                  Track Order ORD-003 (Scheduled)
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_transit":
        return (
          <Badge className="px-4 py-2 bg-blue-100 text-blue-700 border-blue-200">
            <Bell className="w-4 h-4 mr-2" />
            In Transit
          </Badge>
        );
      case "delivered":
        return (
          <Badge className="px-4 py-2 bg-green-100 text-green-700 border-green-200">
            <Bell className="w-4 h-4 mr-2" />
            Delivered
          </Badge>
        );
      case "confirmed":
        return (
          <Badge className="px-4 py-2 bg-amber-100 text-amber-700 border-amber-200">
            <Bell className="w-4 h-4 mr-2" />
            Confirmed
          </Badge>
        );
      default:
        return (
          <Badge className="px-4 py-2 bg-slate-100 text-slate-700 border-slate-200">
            <Bell className="w-4 h-4 mr-2" />
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  Track Your Delivery
                </h1>
                <p className="text-slate-600 mt-1">Order #{orderId}</p>
              </div>
            </div>
            {orderDetails && getStatusBadge(orderDetails.status)}
          </div>

          {orderDetails && (
            <Card className="border-0 shadow-lg mt-6">
              <CardContent className="py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Client</p>
                    <p className="font-semibold text-slate-900">{orderDetails.client}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Venue</p>
                    <p className="font-semibold text-slate-900">{orderDetails.venue}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Event Date</p>
                    <p className="font-semibold text-slate-900">
                      {new Date(orderDetails.eventDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Guest Count</p>
                    <p className="font-semibold text-slate-900">{orderDetails.guestCount} guests</p>
                  </div>
                </div>
                {orderDetails.driverName && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <p className="text-sm text-slate-500 mb-2">Assigned Driver</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold">
                          {orderDetails.driverName.split(' ').map((n: string) => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{orderDetails.driverName}</p>
                        <p className="text-sm text-slate-600">{orderDetails.driverPhone}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ClientTrackingMap orderId={orderId as string} />
          </div>

          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Delivery Updates
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">No updates yet</p>
                    <p className="text-slate-400 text-xs mt-2">
                      We'll notify you when your order status changes
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {notifications.map((notification, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-4 rounded-lg transition-all ${
                          notification.type === "driver_arrived" || notification.type === "delivery_complete"
                            ? "bg-green-50 border-green-200"
                            : notification.type === "food_collected"
                            ? "bg-blue-50 border-blue-200"
                            : "bg-slate-50 border-slate-200"
                        } border`}
                      >
                        <Badge
                          className={
                            notification.type === "driver_arrived" || notification.type === "delivery_complete"
                              ? "bg-green-500"
                              : notification.type === "food_collected"
                              ? "bg-blue-500"
                              : "bg-slate-500"
                          }
                        >
                          <Bell className="w-3 h-3 mr-1" />
                          {notification.type.replace(/_/g, " ")}
                        </Badge>
                        <div className="flex-1">
                          <p className="text-sm text-slate-700">{notification.message}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(notification.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
              <CardHeader>
                <CardTitle className="text-lg">Need Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-700">
                  If you have any questions or concerns about your delivery, please don't hesitate to contact us.
                </p>
                <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Contact Support
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" />
                  Rate Your Experience
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 mb-4">
                  After your delivery is complete, we'll send you a review request to help us improve our service.
                </p>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className="w-10 h-10 rounded-full bg-white hover:bg-amber-50 transition-colors flex items-center justify-center shadow-sm hover:shadow-md"
                    >
                      <Star className="w-5 h-5 text-amber-500" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
