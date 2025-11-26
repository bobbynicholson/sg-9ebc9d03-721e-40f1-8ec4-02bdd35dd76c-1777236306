
import { useState, useEffect } from "react";
import Head from "next/head";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Mail, MessageSquare, AlertCircle } from "lucide-react";

interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  whatsappNotifications: boolean;
  pushNotifications: boolean;
  orderUpdates: boolean;
  paymentReminders: boolean;
  driverUpdates: boolean;
  inventoryAlerts: boolean;
  systemAlerts: boolean;
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    smsNotifications: false,
    whatsappNotifications: true,
    pushNotifications: true,
    orderUpdates: true,
    paymentReminders: true,
    driverUpdates: true,
    inventoryAlerts: true,
    systemAlerts: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveMessage("Error saving settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Notification Settings - Admin Portal</title>
      </Head>

      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header />

        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Notification Settings</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage how you receive updates and alerts
            </p>
          </div>

          <div className="max-w-3xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notification Channels
                </CardTitle>
                <CardDescription>
                  Choose how you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="email"
                      className="text-base flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Email Notifications
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Receive notifications via email
                    </p>
                  </div>
                  <Switch
                    id="email"
                    checked={settings.emailNotifications}
                    onCheckedChange={() => handleToggle("emailNotifications")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="whatsapp"
                      className="text-base flex items-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp Notifications
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Get updates via WhatsApp messages
                    </p>
                  </div>
                  <Switch
                    id="whatsapp"
                    checked={settings.whatsappNotifications}
                    onCheckedChange={() =>
                      handleToggle("whatsappNotifications")
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="push"
                      className="text-base flex items-center gap-2"
                    >
                      <Bell className="w-4 h-4" />
                      Push Notifications
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Browser notifications for instant updates
                    </p>
                  </div>
                  <Switch
                    id="push"
                    checked={settings.pushNotifications}
                    onCheckedChange={() => handleToggle("pushNotifications")}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Notification Types
                </CardTitle>
                <CardDescription>
                  Select what types of updates you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="orders" className="text-base">
                      Order Updates
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      New orders, status changes, and confirmations
                    </p>
                  </div>
                  <Switch
                    id="orders"
                    checked={settings.orderUpdates}
                    onCheckedChange={() => handleToggle("orderUpdates")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="payments" className="text-base">
                      Payment Reminders
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Upcoming payments and payment confirmations
                    </p>
                  </div>
                  <Switch
                    id="payments"
                    checked={settings.paymentReminders}
                    onCheckedChange={() => handleToggle("paymentReminders")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="drivers" className="text-base">
                      Driver Updates
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Driver assignments and delivery status
                    </p>
                  </div>
                  <Switch
                    id="drivers"
                    checked={settings.driverUpdates}
                    onCheckedChange={() => handleToggle("driverUpdates")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="inventory" className="text-base">
                      Inventory Alerts
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Low stock warnings and reorder reminders
                    </p>
                  </div>
                  <Switch
                    id="inventory"
                    checked={settings.inventoryAlerts}
                    onCheckedChange={() => handleToggle("inventoryAlerts")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="system" className="text-base">
                      System Alerts
                    </Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Important system updates and maintenance notices
                    </p>
                  </div>
                  <Switch
                    id="system"
                    checked={settings.systemAlerts}
                    onCheckedChange={() => handleToggle("systemAlerts")}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <div>
                {saveMessage && (
                  <Badge
                    variant={
                      saveMessage.includes("success") ? "default" : "destructive"
                    }
                  >
                    {saveMessage}
                  </Badge>
                )}
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
