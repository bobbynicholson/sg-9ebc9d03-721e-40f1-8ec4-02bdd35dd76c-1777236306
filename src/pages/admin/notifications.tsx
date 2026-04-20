import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Bell, 
  Mail, 
  MessageSquare,
  Smartphone,
  Check,
  Settings
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

const notificationChannels = [
  {
    id: "email",
    name: "Email Notifications",
    description: "Receive updates via email",
    icon: Mail,
    enabled: true
  },
  {
    id: "whatsapp",
    name: "WhatsApp Notifications",
    description: "Get instant WhatsApp messages",
    icon: MessageSquare,
    enabled: true
  },
  {
    id: "push",
    name: "Push Notifications",
    description: "Browser and mobile push notifications",
    icon: Smartphone,
    enabled: false
  },
  {
    id: "in-app",
    name: "In-App Notifications",
    description: "Notification bell in the app",
    icon: Bell,
    enabled: true
  }
];

const notificationTypes = [
  {
    id: "new-order",
    name: "New Orders",
    description: "When a new order is received",
    category: "Orders"
  },
  {
    id: "order-update",
    name: "Order Updates",
    description: "Changes to existing orders",
    category: "Orders"
  },
  {
    id: "driver-assignment",
    name: "Driver Assignments",
    description: "When drivers are assigned to orders",
    category: "Drivers"
  },
  {
    id: "driver-location",
    name: "Driver Location Updates",
    description: "Real-time driver location changes",
    category: "Drivers"
  },
  {
    id: "low-stock",
    name: "Low Stock Alerts",
    description: "When inventory items are running low",
    category: "Inventory"
  },
  {
    id: "equipment-damage",
    name: "Equipment Damage",
    description: "Reports of damaged equipment",
    category: "Equipment"
  },
  {
    id: "staff-clock",
    name: "Staff Clock In/Out",
    description: "When staff clock in or out",
    category: "Staff"
  },
  {
    id: "payment-received",
    name: "Payment Received",
    description: "When payments are processed",
    category: "Payments"
  }
];

export default function AdminNotifications() {
  const { user } = useAuth();
  const [channels, setChannels] = useState(notificationChannels);
  const [types, setTypes] = useState(
    notificationTypes.reduce((acc, type) => ({
      ...acc,
      [type.id]: true
    }), {} as Record<string, boolean>)
  );

  const toggleChannel = (id: string) => {
    setChannels(prev =>
      prev.map(ch => ch.id === id ? { ...ch, enabled: !ch.enabled } : ch)
    );
  };

  const toggleType = (id: string) => {
    setTypes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Notification Settings - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Notification Settings</h1>
              <p className="text-slate-600">Configure how you receive updates</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Notification Channels</CardTitle>
                <p className="text-sm text-slate-600">Choose how you want to be notified</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {channels.map((channel) => {
                    const Icon = channel.icon;
                    return (
                      <div key={channel.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                        <div className={`p-3 rounded-lg ${
                          channel.enabled ? "bg-orange-100" : "bg-slate-100"
                        }`}>
                          <Icon className={`w-5 h-5 ${
                            channel.enabled ? "text-orange-600" : "text-slate-400"
                          }`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold text-slate-900">{channel.name}</h4>
                            <Switch
                              checked={channel.enabled}
                              onCheckedChange={() => toggleChannel(channel.id)}
                            />
                          </div>
                          <p className="text-sm text-slate-600">{channel.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <p className="text-sm text-slate-600">Manage notification preferences</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button className="w-full" variant="outline">
                    <Settings className="w-4 h-4 mr-2" />
                    Advanced Settings
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Check className="w-4 h-4 mr-2" />
                    Enable All
                  </Button>
                  <Button className="w-full" variant="outline">
                    Disable All
                  </Button>
                </div>

                <div className="mt-6 p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg">
                  <h4 className="font-semibold text-slate-900 mb-2">Do Not Disturb</h4>
                  <p className="text-sm text-slate-600 mb-3">
                    Mute all notifications during specific hours
                  </p>
                  <div className="flex items-center gap-2">
                    <Switch />
                    <span className="text-sm text-slate-600">10:00 PM - 7:00 AM</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Notification Types</CardTitle>
              <p className="text-sm text-slate-600">Choose which updates you want to receive</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notificationTypes.map((type) => (
                  <div key={type.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                    <Switch
                      checked={types[type.id]}
                      onCheckedChange={() => toggleType(type.id)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-900">{type.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {type.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">{type.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}