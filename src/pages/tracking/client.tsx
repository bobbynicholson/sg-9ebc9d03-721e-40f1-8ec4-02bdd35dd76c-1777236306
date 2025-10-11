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

export default function ClientTrackingPage() {
  const router = useRouter();
  const { orderId } = router.query;
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (orderId) {
      const allNotifications = JSON.parse(localStorage.getItem("notifications") || "[]");
      const orderNotifications = allNotifications.filter(
        (n: any) => n.orderId === orderId
      );
      setNotifications(orderNotifications);
    }

    const interval = setInterval(() => {
      if (orderId) {
        const allNotifications = JSON.parse(localStorage.getItem("notifications") || "[]");
        const orderNotifications = allNotifications.filter(
          (n: any) => n.orderId === orderId
        );
        setNotifications(orderNotifications);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Card className="border-0 shadow-lg max-w-md">
          <CardContent className="py-12 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No order selected</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <div className="flex items-center justify-between">
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
            <Badge className="px-4 py-2 bg-blue-100 text-blue-700 border-blue-200">
              <Bell className="w-4 h-4 mr-2" />
              {notifications.length} Updates
            </Badge>
          </div>
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
                  Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">No updates yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.slice().reverse().map((notification, index) => (
                      <div
                        key={index}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <p className="text-sm text-slate-900 mb-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
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
                      className="w-10 h-10 rounded-full bg-white hover:bg-amber-50 transition-colors flex items-center justify-center"
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
    </div>
  );
}
