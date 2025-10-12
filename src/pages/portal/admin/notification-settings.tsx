import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import {
  Bell,
  CreditCard,
  CheckCircle,
  Navigation,
  MapPin,
  Clock,
  Save,
  Settings,
  Mail,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface NotificationSetting {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  category: "payment" | "order" | "delivery" | "gps";
  requiresGPS?: boolean;
}

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSetting[]>([
    {
      id: "payment_received",
      name: "Payment Received",
      description: "Notify client when deposit or balance payment is confirmed",
      icon: CreditCard,
      enabled: true,
      category: "payment",
    },
    {
      id: "order_confirmed",
      name: "Order Confirmed",
      description: "Notify client when order is officially confirmed and locked in",
      icon: CheckCircle,
      enabled: true,
      category: "order",
    },
    {
      id: "driver_assigned",
      name: "Driver Assigned",
      description: "Notify client when delivery driver has been assigned to their order",
      icon: Navigation,
      enabled: false,
      category: "delivery",
    },
    {
      id: "driver_on_way",
      name: "Driver On Their Way",
      description: "Notify client on event day when driver starts journey to kitchen",
      icon: Navigation,
      enabled: true,
      category: "delivery",
      requiresGPS: true,
    },
    {
      id: "driver_10_minutes",
      name: "Driver 10 Minutes Away",
      description: "Notify client when driver is approximately 10 minutes from venue",
      icon: Clock,
      enabled: true,
      category: "gps",
      requiresGPS: true,
    },
    {
      id: "driver_arrived",
      name: "Driver Has Arrived",
      description: "Notify client when driver arrives at venue (measured by GPS)",
      icon: MapPin,
      enabled: true,
      category: "gps",
      requiresGPS: true,
    },
    {
      id: "food_collected",
      name: "Food Collected from Kitchen",
      description: "Notify client when driver collects food and equipment",
      icon: CheckCircle,
      enabled: false,
      category: "delivery",
    },
    {
      id: "in_transit",
      name: "En Route to Venue",
      description: "Notify client when driver departs kitchen heading to venue",
      icon: Navigation,
      enabled: false,
      category: "delivery",
      requiresGPS: true,
    },
  ]);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  useEffect(() => {
    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem("admin_notification_settings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed.notifications || settings);
        setEmailEnabled(parsed.emailEnabled ?? true);
        setSmsEnabled(parsed.smsEnabled ?? false);
        setInAppEnabled(parsed.inAppEnabled ?? true);
      } catch (error) {
        console.error("Error loading notification settings:", error);
      }
    }
  }, []);

  const handleToggle = (id: string) => {
    setSettings((prev) =>
      prev.map((setting) =>
        setting.id === id ? { ...setting, enabled: !setting.enabled } : setting
      )
    );
  };

  const handleSave = () => {
    const settingsData = {
      notifications: settings,
      emailEnabled,
      smsEnabled,
      inAppEnabled,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("admin_notification_settings", JSON.stringify(settingsData));

    toast({
      title: "Settings Saved",
      description: "Your notification preferences have been updated successfully.",
      duration: 3000,
    });
  };

  const getEnabledCount = (category: string) => {
    return settings.filter((s) => s.category === category && s.enabled).length;
  };

  const categories = [
    { id: "payment", name: "Payment Notifications", icon: CreditCard },
    { id: "order", name: "Order Status", icon: CheckCircle },
    { id: "delivery", name: "Delivery Updates", icon: Navigation },
    { id: "gps", name: "GPS-Based Notifications", icon: MapPin },
  ];

  return (
    <>
      <Head>
        <title>Notification Settings | CateringMS Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Client Notification Settings
                </h1>
                <p className="text-gray-600">
                  Configure which notifications your clients receive throughout the order process
                </p>
              </div>
              <Button
                onClick={handleSave}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90"
                size="lg"
              >
                <Save className="w-5 h-5 mr-2" />
                Save Settings
              </Button>
            </div>
          </div>

          {/* Notification Channels */}
          <Card className="mb-6 border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Channels
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-semibold text-gray-900">Email Notifications</p>
                      <p className="text-sm text-gray-600">
                        Send updates via email to client's registered address
                      </p>
                    </div>
                  </div>
                  <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-semibold text-gray-900">SMS Notifications</p>
                      <p className="text-sm text-gray-600">
                        Send text messages for urgent updates (requires SMS gateway)
                      </p>
                    </div>
                  </div>
                  <Switch checked={smsEnabled} onCheckedChange={setSmsEnabled} />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="font-semibold text-gray-900">In-App Notifications</p>
                      <p className="text-sm text-gray-600">
                        Show notifications in client portal when they log in
                      </p>
                    </div>
                  </div>
                  <Switch checked={inAppEnabled} onCheckedChange={setInAppEnabled} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings by Category */}
          {categories.map((category) => {
            const categorySettings = settings.filter((s) => s.category === category.id);
            const Icon = category.icon;
            const enabledCount = getEnabledCount(category.id);

            return (
              <Card key={category.id} className="mb-6 border-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="w-5 h-5" />
                      {category.name}
                    </CardTitle>
                    <Badge variant="outline">
                      {enabledCount} of {categorySettings.length} enabled
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {categorySettings.map((setting) => {
                      const SettingIcon = setting.icon;
                      return (
                        <div
                          key={setting.id}
                          className={`flex items-start justify-between p-4 rounded-lg border-2 transition-all ${
                            setting.enabled
                              ? "bg-green-50 border-green-200"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex items-start gap-3 flex-1">
                            <SettingIcon
                              className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                                setting.enabled ? "text-green-600" : "text-gray-400"
                              }`}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label className="font-semibold text-gray-900 cursor-pointer">
                                  {setting.name}
                                </Label>
                                {setting.requiresGPS && (
                                  <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                                    GPS Required
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">{setting.description}</p>
                              {setting.enabled && (
                                <p className="text-xs text-green-700 mt-2 font-medium">
                                  ✓ Active - Clients will receive this notification
                                </p>
                              )}
                            </div>
                          </div>
                          <Switch
                            checked={setting.enabled}
                            onCheckedChange={() => handleToggle(setting.id)}
                            className="flex-shrink-0"
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* GPS-Based Notifications Info */}
          <Card className="border-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                How GPS-Based Notifications Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  <strong>Driver 10 Minutes Away:</strong> Calculated based on current GPS location,
                  average speed, and distance to venue. Client receives notification when ETA is
                  approximately 10 minutes.
                </p>
                <p>
                  <strong>Driver Has Arrived:</strong> Triggered when driver's GPS location is within
                  50 meters of the venue address. Client receives immediate notification.
                </p>
                <p className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-200">
                  <strong>Note:</strong> GPS tracking is automatically activated when driver confirms
                  departure from kitchen. Location updates are sent every 30 seconds for accurate
                  proximity detection.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save Button Bottom */}
          <div className="mt-8 flex justify-end">
            <Button
              onClick={handleSave}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              Save All Settings
            </Button>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}