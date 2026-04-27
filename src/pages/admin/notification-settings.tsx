import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Mail,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Save,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";

interface NotificationSettings {
  email: {
    orderConfirmation: boolean;
    orderUpdates: boolean;
    paymentReceived: boolean;
    dailySummary: boolean;
  };
  push: {
    urgentAlerts: boolean;
    newOrders: boolean;
    staffUpdates: boolean;
    inventoryAlerts: boolean;
  };
  sms: {
    criticalAlerts: boolean;
    paymentReminders: boolean;
  };
}

export default function NotificationSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>({
    email: {
      orderConfirmation: true,
      orderUpdates: true,
      paymentReceived: true,
      dailySummary: false,
    },
    push: {
      urgentAlerts: true,
      newOrders: true,
      staffUpdates: false,
      inventoryAlerts: true,
    },
    sms: {
      criticalAlerts: true,
      paymentReminders: false,
    },
  });

  const handleSave = () => {
    localStorage.setItem('notification_settings', JSON.stringify(settings));
    toast({
      title: "Settings Saved",
      description: "Your notification preferences have been updated.",
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem('notification_settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const updateSetting = (category: keyof NotificationSettings, key: string, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Notification Settings | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Notification Settings</h1>
            <p className="text-slate-600">Manage how you receive updates and alerts</p>
          </div>

          <div className="space-y-6">
            {/* Email Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  Email Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="orderConfirmation" className="flex flex-col gap-1">
                    <span className="font-medium">Order Confirmations</span>
                    <span className="text-sm text-slate-600">Get notified when new orders are placed</span>
                  </Label>
                  <Switch
                    id="orderConfirmation"
                    checked={settings.email.orderConfirmation}
                    onCheckedChange={(checked) => updateSetting('email', 'orderConfirmation', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="orderUpdates" className="flex flex-col gap-1">
                    <span className="font-medium">Order Updates</span>
                    <span className="text-sm text-slate-600">Status changes and modifications</span>
                  </Label>
                  <Switch
                    id="orderUpdates"
                    checked={settings.email.orderUpdates}
                    onCheckedChange={(checked) => updateSetting('email', 'orderUpdates', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="paymentReceived" className="flex flex-col gap-1">
                    <span className="font-medium">Payment Confirmations</span>
                    <span className="text-sm text-slate-600">When payments are received</span>
                  </Label>
                  <Switch
                    id="paymentReceived"
                    checked={settings.email.paymentReceived}
                    onCheckedChange={(checked) => updateSetting('email', 'paymentReceived', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="dailySummary" className="flex flex-col gap-1">
                    <span className="font-medium">Daily Summary</span>
                    <span className="text-sm text-slate-600">End of day business summary</span>
                  </Label>
                  <Switch
                    id="dailySummary"
                    checked={settings.email.dailySummary}
                    onCheckedChange={(checked) => updateSetting('email', 'dailySummary', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Push Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-600" />
                  Push Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="urgentAlerts" className="flex flex-col gap-1">
                    <span className="font-medium">Urgent Alerts</span>
                    <span className="text-sm text-slate-600">Critical issues requiring immediate attention</span>
                  </Label>
                  <Switch
                    id="urgentAlerts"
                    checked={settings.push.urgentAlerts}
                    onCheckedChange={(checked) => updateSetting('push', 'urgentAlerts', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="newOrders" className="flex flex-col gap-1">
                    <span className="font-medium">New Orders</span>
                    <span className="text-sm text-slate-600">Real-time order notifications</span>
                  </Label>
                  <Switch
                    id="newOrders"
                    checked={settings.push.newOrders}
                    onCheckedChange={(checked) => updateSetting('push', 'newOrders', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="staffUpdates" className="flex flex-col gap-1">
                    <span className="font-medium">Staff Updates</span>
                    <span className="text-sm text-slate-600">Time clock and assignment changes</span>
                  </Label>
                  <Switch
                    id="staffUpdates"
                    checked={settings.push.staffUpdates}
                    onCheckedChange={(checked) => updateSetting('push', 'staffUpdates', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="inventoryAlerts" className="flex flex-col gap-1">
                    <span className="font-medium">Inventory Alerts</span>
                    <span className="text-sm text-slate-600">Low stock notifications</span>
                  </Label>
                  <Switch
                    id="inventoryAlerts"
                    checked={settings.push.inventoryAlerts}
                    onCheckedChange={(checked) => updateSetting('push', 'inventoryAlerts', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* SMS Notifications */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  SMS Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="criticalAlerts" className="flex flex-col gap-1">
                    <span className="font-medium">Critical Alerts</span>
                    <span className="text-sm text-slate-600">Emergency notifications via SMS</span>
                  </Label>
                  <Switch
                    id="criticalAlerts"
                    checked={settings.sms.criticalAlerts}
                    onCheckedChange={(checked) => updateSetting('sms', 'criticalAlerts', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="paymentReminders" className="flex flex-col gap-1">
                    <span className="font-medium">Payment Reminders</span>
                    <span className="text-sm text-slate-600">Overdue payment notifications</span>
                  </Label>
                  <Switch
                    id="paymentReminders"
                    checked={settings.sms.paymentReminders}
                    onCheckedChange={(checked) => updateSetting('sms', 'paymentReminders', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-purple-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                    <p className="text-sm text-slate-700">
                      Changes will take effect immediately after saving
                    </p>
                  </div>
                  <Button onClick={handleSave} size="lg">
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}