
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Save, RefreshCw } from "lucide-react";

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  const notificationTypes = [
    {
      id: "new_order",
      name: "New Orders",
      description: "Get notified when a new order is placed",
      email: true,
      inApp: true,
      sms: false
    },
    {
      id: "payment_received",
      name: "Payment Received",
      description: "Get notified when payments are confirmed",
      email: true,
      inApp: true,
      sms: false
    },
    {
      id: "driver_updates",
      name: "Driver Updates",
      description: "Get notified about driver status changes",
      email: false,
      inApp: true,
      sms: false
    },
    {
      id: "equipment_issues",
      name: "Equipment Issues",
      description: "Get notified about equipment damage or shortages",
      email: true,
      inApp: true,
      sms: true
    },
    {
      id: "staff_clockin",
      name: "Staff Clock-In/Out",
      description: "Get notified when staff clock in or out",
      email: false,
      inApp: true,
      sms: false
    }
  ];

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Notification Settings</h1>
              <p className="text-slate-600">Configure how you receive notifications</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Reset to Default
              </Button>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>Choose how you want to receive different types of notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {notificationTypes.map((notif) => (
                  <div key={notif.id} className="border-b pb-6 last:border-b-0 last:pb-0">
                    <div className="mb-4">
                      <h4 className="font-semibold text-slate-900 mb-1">{notif.name}</h4>
                      <p className="text-sm text-slate-500">{notif.description}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="text-sm font-medium text-slate-700">Email</span>
                        <Switch defaultChecked={notif.email} />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="text-sm font-medium text-slate-700">In-App</span>
                        <Switch defaultChecked={notif.inApp} />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="text-sm font-medium text-slate-700">SMS</span>
                        <Switch defaultChecked={notif.sms} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quiet Hours</CardTitle>
              <CardDescription>Set times when you don't want to receive notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold text-slate-900">Enable Quiet Hours</h4>
                  <p className="text-sm text-slate-500">Pause non-urgent notifications during specific times</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
