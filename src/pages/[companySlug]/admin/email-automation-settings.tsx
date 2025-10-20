
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, RefreshCw } from "lucide-react";

export default function EmailAutomationSettingsPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  const automationSettings = [
    {
      id: "quote_sent",
      name: "Quote Sent",
      description: "Send confirmation email when quote is sent to client",
      enabled: true,
      delay: "Immediate"
    },
    {
      id: "order_confirmed",
      name: "Order Confirmed",
      description: "Send confirmation email when order is confirmed",
      enabled: true,
      delay: "Immediate"
    },
    {
      id: "payment_received",
      name: "Payment Received",
      description: "Send receipt email when payment is processed",
      enabled: true,
      delay: "Immediate"
    },
    {
      id: "order_in_progress",
      name: "Order In Progress",
      description: "Notify client when order preparation begins",
      enabled: true,
      delay: "Immediate"
    },
    {
      id: "driver_departed",
      name: "Driver Departed",
      description: "Notify client when driver leaves kitchen",
      enabled: true,
      delay: "Immediate"
    },
    {
      id: "review_request",
      name: "Review Request",
      description: "Request review after event completion",
      enabled: true,
      delay: "24 hours after event"
    }
  ];

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Email Automation Settings</h1>
              <p className="text-slate-600">Configure automated email triggers and timing</p>
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
              <CardTitle>Global Settings</CardTitle>
              <CardDescription>Configure global email automation preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-semibold text-slate-900">Enable Email Automation</h4>
                    <p className="text-sm text-slate-500">Master switch for all automated emails</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-semibold text-slate-900">Send Test Emails</h4>
                    <p className="text-sm text-slate-500">Include yourself in BCC for testing</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automation Triggers</CardTitle>
              <CardDescription>Enable or disable specific email automations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {automationSettings.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:border-purple-200 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-semibold text-slate-900">{setting.name}</h4>
                        <Badge variant="outline" className="text-xs">{setting.delay}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{setting.description}</p>
                    </div>
                    <Switch defaultChecked={setting.enabled} />
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
