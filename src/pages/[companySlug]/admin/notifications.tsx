
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function NotificationsPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const { user } = useAuth();

  const mockNotifications = [
    {
      id: "1",
      title: "New Order Received",
      message: "Order #12345 for wedding event has been placed",
      type: "success",
      read: false,
      time: "2 hours ago"
    },
    {
      id: "2",
      title: "Payment Confirmed",
      message: "Deposit payment received for Order #12344",
      type: "success",
      read: false,
      time: "5 hours ago"
    },
    {
      id: "3",
      title: "Driver Assigned",
      message: "John Smith has been assigned to Order #12343",
      type: "info",
      read: true,
      time: "1 day ago"
    }
  ];

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Notifications</h1>
            <p className="text-slate-600">Stay updated with your business activities</p>
          </div>

          <div className="flex gap-3 mb-6">
            <Button variant="outline" className="gap-2">
              <Check className="w-4 h-4" />
              Mark All Read
            </Button>
            <Button variant="outline" className="gap-2">
              <Trash2 className="w-4 h-4" />
              Clear All
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Recent Notifications
              </CardTitle>
              <CardDescription>Your latest updates and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      notification.read ? "bg-slate-50" : "bg-white border-purple-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{notification.title}</h3>
                          {!notification.read && (
                            <Badge className="bg-purple-100 text-purple-700">New</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">{notification.message}</p>
                        <p className="text-xs text-slate-400 mt-2">{notification.time}</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
