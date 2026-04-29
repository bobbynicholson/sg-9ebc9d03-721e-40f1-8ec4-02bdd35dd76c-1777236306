import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
import { 
  Settings, 
  Bell, 
  Mail, 
  DollarSign, 
  Clock, 
  Truck,
  ChefHat,
  Save,
  CheckCircle,
  Globe,
  Building2,
  ArrowRight,
  Palette,
  Sparkles
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { GetServerSideProps } from "next";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";
import { InventorySettingsTab } from "@/components/admin/inventory/InventorySettingsTab";

export default function ProtectedSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <SettingsPage />
    </ProtectedRoute>
  );
}

function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    company: {
      name: "Your Catering Company",
      email: "info@yourcatering.com",
      phone: "+27 12 345 6789",
      address: "123 Main Street, Johannesburg",
      logo: "",
      kitchenAddress: "123 Main Street, Johannesburg",
      kitchenLat: -26.2041,
      kitchenLng: 28.0473,
    },
    notifications: {
      emailNewLead: true,
      emailQuoteAccepted: true,
      emailPaymentReceived: true,
      smsDriverAssigned: true,
      smsDeliveryUpdate: true,
      emailComplaint: true,
      emailDailyReport: true,
    },
    automation: {
      autoFollowUpDays: 3,
      secondFollowUpDays: 7,
      reminderDays: [14, 7, 3, 1],
      autoDiscountPercent: 10,
      reviewRequestDays: 1,
      complaintResponseHours: 24,
    },
    pricing: {
      weekendPremium: 15,
      lastMinuteSurcharge: 25,
      earlyBirdDiscount: 10,
      bulkDiscountThreshold: 100,
      bulkDiscountPercent: 15,
      minimumOrderValue: 5000,
    },
    operations: {
      equipmentCleaningHours: 4,
      kitchenPrepHours: 48,
      deliveryBufferMinutes: 30,
      maxConcurrentEvents: 5,
      driverRadius: 50,
      deliveryCostPerKm: 8.50,
    },
    financial: {
      currency: "ZAR",
      taxRate: 15,
      depositPercent: 30,
      balanceDueDays: 7,
      finalOrderChangeDays: 7,
      cancellationFeePercent: 25,
      refundProcessDays: 7,
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // Load non-company settings from user_metadata or localStorage first.
      const stored = (user?.user_metadata as any)?.admin_settings;
      if (stored && !cancelled) {
        setSettings((prev) => ({ ...prev, ...stored }));
      } else {
        const local = localStorage.getItem("admin_settings");
        if (local && !cancelled) {
          try { setSettings((prev) => ({ ...prev, ...JSON.parse(local) })); } catch {}
        }
      }

      // Load real company data from the companies table.
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      if (!profile?.company_id || cancelled) return;

      const { data: company } = await supabase
        .from("companies")
        .select("company_name, email, phone, address_line1, logo_url, headquarters_lat, headquarters_lng")
        .eq("id", profile.company_id)
        .single();
      if (!company || cancelled) return;

      setSettings((prev) => ({
        ...prev,
        company: {
          ...prev.company,
          name: company.company_name ?? prev.company.name,
          email: company.email ?? prev.company.email,
          phone: company.phone ?? prev.company.phone,
          address: company.address_line1 ?? prev.company.address,
          logo: company.logo_url ?? prev.company.logo,
          kitchenAddress: company.address_line1 ?? prev.company.kitchenAddress,
          kitchenLat: company.headquarters_lat ?? prev.company.kitchenLat,
          kitchenLng: company.headquarters_lng ?? prev.company.kitchenLng,
        },
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    localStorage.setItem("admin_settings", JSON.stringify(settings));
    try {
      await supabase.auth.updateUser({ data: { admin_settings: settings } });
    } catch (e) {
      console.error("Failed to persist settings to auth metadata:", e);
    }

    // Write company fields back to the companies table.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();
        if (profile?.company_id) {
          await supabase
            .from("companies")
            .update({
              company_name: settings.company.name,
              email: settings.company.email,
              phone: settings.company.phone || null,
              address_line1: settings.company.address || null,
              logo_url: settings.company.logo || null,
              headquarters_lat: settings.company.kitchenLat || null,
              headquarters_lng: settings.company.kitchenLng || null,
            })
            .eq("id", profile.company_id);
        }
      }
    } catch (e) {
      console.error("Failed to persist company settings to DB:", e);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const updateSetting = (category: string, key: string, value: any) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category as keyof typeof settings],
        [key]: value,
      },
    });
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>System Settings - CateringMS Admin</title>
      </Head>
      
      <AdminNav />
      
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 md:p-6 lg:pl-72 xl:pl-80">
        <div className="max-w-full space-y-4 md:space-y-6">
          {/* Header - Mobile Optimized */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg flex-shrink-0">
                <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">System Settings <InfoTooltip content={"Every operational setting in one place: company info, notifications, automation, pricing, operations, finance, and email.\n\nWork through the tabs and hit Save All when you are done."} /></h1>
                <p className="text-sm md:text-base text-slate-600">Configure platform preferences</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <InfoTooltip 
                content={"Saves changes across every tab in one go.\n\nYour preferences apply straight away."}
                side="left"
              />
              <Button onClick={handleSave} className="bg-slate-600 hover:bg-slate-700 w-full sm:w-auto" size="sm">
                <Save className="w-4 h-4 mr-2" />
                Save All
              </Button>
            </div>
          </div>

          {saved && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-l-green-500">
              <CardContent className="py-3 md:py-4 px-4 md:px-6">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                  <p className="font-semibold text-sm md:text-base text-green-900">Settings saved successfully!</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Call-to-Action Cards - Mobile Optimized Stack */}
          <div className="space-y-4">
            <Card className="border-0 shadow-xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 text-white">
              <CardContent className="pt-4 md:pt-6 pb-4 md:pb-6 px-4 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <Palette className="w-6 h-6 md:w-8 md:h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg md:text-2xl font-bold mb-1">White Label Branding</h3>
                      <p className="text-sm md:text-base text-pink-100 mb-2 md:mb-0">
                        Customize your platform with your own logo and color palette. Create a seamless branded experience for your clients.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-3">
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Custom Logo</span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <Palette className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Brand Colors</span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <Globe className="w-3 h-3 md:w-4 md:h-4" />
                          <span>CateringMS Powered</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <InfoTooltip 
                      content={"Set your logo, colour palette, and visual identity so client-facing pages match your brand."}
                      side="left"
                      className="text-white hover:text-white/80"
                    />
                    <Link href="/admin/white-label" className="w-full md:w-auto">
                      <Button size="sm" className="bg-white text-purple-600 hover:bg-purple-50 w-full">
                        Customize Branding
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white">
              <CardContent className="pt-4 md:pt-6 pb-4 md:pb-6 px-4 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <Globe className="w-6 h-6 md:w-8 md:h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg md:text-2xl font-bold mb-1">Scale Across Regions</h3>
                      <p className="text-sm md:text-base text-purple-100 mb-2 md:mb-0">
                        Launch franchises and regional operations in new provinces. Head office manages sales while regions handle fulfillment.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-3">
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <Building2 className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Independent Kitchens</span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <Truck className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Regional Drivers</span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <ChefHat className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Local Teams</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:gap-3">
                    <div className="flex items-center gap-2">
                      <InfoTooltip 
                        content={"Run multiple regions with their own teams, kitchens, and drivers, all under one head office."}
                        side="left"
                        className="text-white hover:text-white/80"
                      />
                      <Link href="/admin/regions" className="w-full">
                        <Button size="sm" className="bg-white text-purple-600 hover:bg-purple-50 w-full">
                          Manage Regions
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                    <Link href="/admin/order-assignments" className="w-full">
                      <Button size="sm" variant="outline" className="bg-white/80 hover:bg-white w-full border-white">
                        Assign Orders
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-xl bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 text-white">
              <CardContent className="pt-4 md:pt-6 pb-4 md:pb-6 px-4 md:px-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg md:text-2xl font-bold mb-1">Payment Processing</h3>
                      <p className="text-sm md:text-base text-green-100 mb-2 md:mb-0">
                        Connect multiple payment gateways for South African and international transactions.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-3">
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                          <span>PayFast, Yoco, Peach</span>
                        </div>
                        <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                          <Globe className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Stripe, PayPal, Square</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <InfoTooltip 
                      content={"Connect a payment gateway so clients can pay online -- local and international options supported."}
                      side="left"
                      className="text-white hover:text-white/80"
                    />
                    <Link href="/admin/payment-gateways">
                      <Button size="sm" className="bg-white text-green-600 hover:bg-green-50 w-full md:w-auto">
                        Configure
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs - Mobile Optimized with Scrollable Tab List */}
          <Tabs defaultValue="company" className="space-y-4 md:space-y-6">
            <div className="overflow-x-auto">
              <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-7 gap-1">
                <TabsTrigger value="company" className="text-xs md:text-sm whitespace-nowrap">Company</TabsTrigger>
                <TabsTrigger value="notifications" className="text-xs md:text-sm whitespace-nowrap">Notifications</TabsTrigger>
                <TabsTrigger value="automation" className="text-xs md:text-sm whitespace-nowrap">Automation</TabsTrigger>
                <TabsTrigger value="pricing" className="text-xs md:text-sm whitespace-nowrap">Pricing</TabsTrigger>
                <TabsTrigger value="operations" className="text-xs md:text-sm whitespace-nowrap">Operations</TabsTrigger>
                <TabsTrigger value="inventory" className="text-xs md:text-sm whitespace-nowrap">Inventory</TabsTrigger>
                <TabsTrigger value="financial" className="text-xs md:text-sm whitespace-nowrap">Financial</TabsTrigger>
                <TabsTrigger value="email-automation" className="text-xs md:text-sm whitespace-nowrap">Email Auto</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="company">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <Settings className="w-4 h-4 md:w-5 md:h-5" />
                    Company Information
                    <InfoTooltip content={"Your display name, contact details, and kitchen location used in quotes and route planning.\n\nNote: there is a separate Company Profile page that holds the master record -- those values take priority."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Company Name</Label>
                    <Input
                      value={settings.company.name}
                      onChange={(e) => updateSetting("company", "name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Email Address</Label>
                    <Input
                      type="email"
                      value={settings.company.email}
                      onChange={(e) => updateSetting("company", "email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Phone Number</Label>
                    <Input
                      value={settings.company.phone}
                      onChange={(e) => updateSetting("company", "phone", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Physical Address</Label>
                    <Input
                      value={settings.company.address}
                      onChange={(e) => updateSetting("company", "address", e.target.value)}
                    />
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Kitchen Location for Delivery Calculations
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-sm md:text-base">Kitchen Address</Label>
                        <Input
                          value={settings.company.kitchenAddress}
                          onChange={(e) => updateSetting("company", "kitchenAddress", e.target.value)}
                          placeholder="Full kitchen address for delivery distance calculations"
                        />
                        <p className="text-xs text-slate-600">This address will be used to calculate delivery distances and fees</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm">Latitude (optional)</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={settings.company.kitchenLat}
                            onChange={(e) => updateSetting("company", "kitchenLat", parseFloat(e.target.value))}
                            placeholder="-26.2041"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Longitude (optional)</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={settings.company.kitchenLng}
                            onChange={(e) => updateSetting("company", "kitchenLng", parseFloat(e.target.value))}
                            placeholder="28.0473"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <Bell className="w-4 h-4 md:w-5 md:h-5" />
                    Notification Preferences
                    <InfoTooltip content={"Toggle email and SMS alerts on a per-event basis -- new bookings, status changes, payments and so on."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 md:space-y-4 px-4 md:px-6">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <Mail className="w-4 h-4 md:w-5 md:h-5 text-blue-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">New Lead Notification</p>
                        <p className="text-xs md:text-sm text-slate-600 truncate">Get notified when a new lead is captured</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications.emailNewLead}
                      onCheckedChange={(checked) =>
                        updateSetting("notifications", "emailNewLead", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Quote Accepted</p>
                        <p className="text-xs md:text-sm text-slate-600 truncate">Notification when client accepts quote</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications.emailQuoteAccepted}
                      onCheckedChange={(checked) =>
                        updateSetting("notifications", "emailQuoteAccepted", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Payment Received</p>
                        <p className="text-xs md:text-sm text-slate-600 truncate">Alert when payment is processed</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications.emailPaymentReceived}
                      onCheckedChange={(checked) =>
                        updateSetting("notifications", "emailPaymentReceived", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <Truck className="w-4 h-4 md:w-5 md:h-5 text-purple-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Driver Assignment (SMS)</p>
                        <p className="text-xs md:text-sm text-slate-600 truncate">SMS to driver when assigned</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications.smsDriverAssigned}
                      onCheckedChange={(checked) =>
                        updateSetting("notifications", "smsDriverAssigned", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <Bell className="w-4 h-4 md:w-5 md:h-5 text-red-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Complaint Submitted</p>
                        <p className="text-xs md:text-sm text-slate-600 truncate">Immediate alert for new complaints</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications.emailComplaint}
                      onCheckedChange={(checked) =>
                        updateSetting("notifications", "emailComplaint", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-2">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      <Mail className="w-4 h-4 md:w-5 md:h-5 text-slate-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Daily Summary Report</p>
                        <p className="text-xs md:text-sm text-slate-600 truncate">Daily email with key metrics</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notifications.emailDailyReport}
                      onCheckedChange={(checked) =>
                        updateSetting("notifications", "emailDailyReport", checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="automation">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <Clock className="w-4 h-4 md:w-5 md:h-5" />
                    Automation Rules
                    <InfoTooltip content={"Set how often follow-ups, reminders, and review requests go out.\n\nThe live email engine needs to be connected before any of this actually fires."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">First Follow-up (days)</Label>
                      <Input
                        type="number"
                        value={settings.automation.autoFollowUpDays}
                        onChange={(e) =>
                          updateSetting("automation", "autoFollowUpDays", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Second Follow-up (days)</Label>
                      <Input
                        type="number"
                        value={settings.automation.secondFollowUpDays}
                        onChange={(e) =>
                          updateSetting("automation", "secondFollowUpDays", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Follow-up Discount (%)</Label>
                    <Input
                      type="number"
                      value={settings.automation.autoDiscountPercent}
                      onChange={(e) =>
                        updateSetting("automation", "autoDiscountPercent", parseInt(e.target.value))
                      }
                    />
                    <p className="text-xs md:text-sm text-slate-600">Discount offered in second follow-up email</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Event Reminder Days</Label>
                    <Input
                      value={settings.automation.reminderDays.join(", ")}
                      onChange={(e) =>
                        updateSetting(
                          "automation",
                          "reminderDays",
                          e.target.value.split(",").map((d) => parseInt(d.trim()))
                        )
                      }
                    />
                    <p className="text-xs md:text-sm text-slate-600">Comma-separated (e.g., 14, 7, 3, 1)</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Review Request (days after)</Label>
                    <Input
                      type="number"
                      value={settings.automation.reviewRequestDays}
                      onChange={(e) =>
                        updateSetting("automation", "reviewRequestDays", parseInt(e.target.value))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base">Complaint Response SLA (hours)</Label>
                    <Input
                      type="number"
                      value={settings.automation.complaintResponseHours}
                      onChange={(e) =>
                        updateSetting("automation", "complaintResponseHours", parseInt(e.target.value))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                    Pricing Rules
                    <InfoTooltip content={"Premium uplifts and discount rules the quote builder applies automatically."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Weekend Premium (%)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.weekendPremium}
                        onChange={(e) =>
                          updateSetting("pricing", "weekendPremium", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Last Minute Surcharge (%)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.lastMinuteSurcharge}
                        onChange={(e) =>
                          updateSetting("pricing", "lastMinuteSurcharge", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Early Bird Discount (%)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.earlyBirdDiscount}
                        onChange={(e) =>
                          updateSetting("pricing", "earlyBirdDiscount", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Bulk Discount Threshold</Label>
                      <Input
                        type="number"
                        value={settings.pricing.bulkDiscountThreshold}
                        onChange={(e) =>
                          updateSetting("pricing", "bulkDiscountThreshold", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Bulk Discount (%)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.bulkDiscountPercent}
                        onChange={(e) =>
                          updateSetting("pricing", "bulkDiscountPercent", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Minimum Order Value (R)</Label>
                      <Input
                        type="number"
                        value={settings.pricing.minimumOrderValue}
                        onChange={(e) =>
                          updateSetting("pricing", "minimumOrderValue", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="operations">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <ChefHat className="w-4 h-4 md:w-5 md:h-5" />
                    Operational Settings
                    <InfoTooltip content={"Lead times, prep buffers, driver radius and per-kilometre rate.\n\nThese feed the delivery fee calculation on every quote."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Equipment Cleaning (hours)</Label>
                      <Input
                        type="number"
                        value={settings.operations.equipmentCleaningHours}
                        onChange={(e) =>
                          updateSetting("operations", "equipmentCleaningHours", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Kitchen Prep Lead Time (hours)</Label>
                      <Input
                        type="number"
                        value={settings.operations.kitchenPrepHours}
                        onChange={(e) =>
                          updateSetting("operations", "kitchenPrepHours", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Delivery Buffer (minutes)</Label>
                      <Input
                        type="number"
                        value={settings.operations.deliveryBufferMinutes}
                        onChange={(e) =>
                          updateSetting("operations", "deliveryBufferMinutes", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Max Concurrent Events</Label>
                      <Input
                        type="number"
                        value={settings.operations.maxConcurrentEvents}
                        onChange={(e) =>
                          updateSetting("operations", "maxConcurrentEvents", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Driver Service Radius (km)</Label>
                      <Input
                        type="number"
                        value={settings.operations.driverRadius}
                        onChange={(e) =>
                          updateSetting("operations", "driverRadius", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base">Delivery Cost Per Kilometer (R)</Label>
                      <Input
                        type="number"
                        step="0.50"
                        value={settings.operations.deliveryCostPerKm}
                        onChange={(e) =>
                          updateSetting("operations", "deliveryCostPerKm", parseFloat(e.target.value))
                        }
                      />
                      <p className="text-xs text-slate-600">This rate will be used to automatically calculate delivery fees in quotes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory">
              <InventorySettingsTab />
            </TabsContent>

            <TabsContent value="financial">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                    Financial Settings
                    <InfoTooltip content={"Currency, VAT, deposit percentage, balance due rules, and cancellation fees.\n\nThis drives every invoice and the deposit/balance flow on the booking side."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm md:text-base">Currency</Label>
                      <Select
                        value={settings.financial.currency}
                        onValueChange={(value) => updateSetting("financial", "currency", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                          <SelectItem value="USD">USD (US Dollar)</SelectItem>
                          <SelectItem value="EUR">EUR (Euro)</SelectItem>
                          <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm md:text-base">VAT/Tax Rate (%)</Label>
                      <Input
                        type="number"
                        value={settings.financial.taxRate}
                        onChange={(e) =>
                          updateSetting("financial", "taxRate", parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Deposit & Balance Payment Settings
                    </h3>
                    <p className="text-xs md:text-sm text-slate-600 mb-4">
                      Configure how clients pay for their events - deposit to confirm booking, balance before the event
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm md:text-base">Required Deposit (%)</Label>
                        <Input
                          type="number"
                          value={settings.financial.depositPercent}
                          onChange={(e) =>
                            updateSetting("financial", "depositPercent", parseInt(e.target.value))
                          }
                          min="10"
                          max="100"
                        />
                        <p className="text-xs text-slate-600 mt-1">Percentage of total to confirm booking (10-100%)</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm md:text-base">Balance Due Days Before Event</Label>
                        <Input
                          type="number"
                          value={settings.financial.balanceDueDays || 7}
                          onChange={(e) =>
                            updateSetting("financial", "balanceDueDays", parseInt(e.target.value))
                          }
                          min="1"
                          max="30"
                        />
                        <p className="text-xs text-slate-600 mt-1">When clients must pay remaining balance</p>
                      </div>

                      <div>
                        <Label className="text-sm md:text-base">Final Order Changes (days before event)</Label>
                        <Input
                          type="number"
                          value={settings.financial.finalOrderChangeDays || 7}
                          onChange={(e) =>
                            updateSetting("financial", "finalOrderChangeDays", parseInt(e.target.value))
                          }
                          min="1"
                          max="30"
                        />
                        <p className="text-xs text-slate-600 mt-1">Last day clients can modify guest count/address</p>
                      </div>

                      <div>
                        <Label className="text-sm md:text-base">Cancellation Fee (%)</Label>
                        <Input
                          type="number"
                          value={settings.financial.cancellationFeePercent}
                          onChange={(e) =>
                            updateSetting("financial", "cancellationFeePercent", parseInt(e.target.value))
                          }
                        />
                        <p className="text-xs text-slate-600 mt-1">Fee charged for cancellations</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 md:p-4 rounded-lg mt-4">
                      <h4 className="font-semibold text-sm text-blue-900 mb-2">How Deposit & Balance Works:</h4>
                      <ul className="space-y-1 text-xs md:text-sm text-blue-800">
                        <li>1. Client accepts quote → Pays {settings.financial.depositPercent}% deposit to confirm booking</li>
                        <li>2. {settings.financial.balanceDueDays || 7} days before event → Email reminder to pay balance</li>
                        <li>3. Clients can modify order until {settings.financial.finalOrderChangeDays || 7} days before event</li>
                        <li>4. After deadline → Order locked, balance must be settled</li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <Label className="text-sm md:text-base">Refund Processing Time (days)</Label>
                    <Input
                      type="number"
                      value={settings.financial.refundProcessDays}
                      onChange={(e) =>
                        updateSetting("financial", "refundProcessDays", parseInt(e.target.value))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="email-automation">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <Mail className="w-4 h-4 md:w-5 md:h-5" />
                    After-Sales Email Automation
                    <InfoTooltip content={"Quick summary of the 12-month, six-email post-event journey.\n\nEdit the actual wording over on the After-Sales Emails page."} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 md:p-6 border border-blue-200">
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-base md:text-lg mb-2">Intelligent Follow-Up System</h3>
                        <p className="text-sm md:text-base text-slate-700 mb-3 md:mb-4">
                          Automatically nurture client relationships with 6 strategic emails sent over 12 months after each event.
                        </p>
                        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3 md:mb-4">
                          <div className="bg-white rounded-lg p-2 md:p-3 text-center">
                            <div className="text-xl md:text-2xl font-bold text-blue-600">6</div>
                            <div className="text-xs text-slate-600">Strategic Emails</div>
                          </div>
                          <div className="bg-white rounded-lg p-2 md:p-3 text-center">
                            <div className="text-xl md:text-2xl font-bold text-green-600">12</div>
                            <div className="text-xs text-slate-600">Month Journey</div>
                          </div>
                          <div className="bg-white rounded-lg p-2 md:p-3 text-center">
                            <div className="text-xl md:text-2xl font-bold text-purple-600">Auto</div>
                            <div className="text-xs text-slate-600">Fully Automated</div>
                          </div>
                        </div>
                        <Link href="/admin/after-sales-emails">
                          <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                            Manage Email Templates
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Email Journey Timeline:</h4>
                    <div className="space-y-2">
                      {[
                        { months: 2, title: "Initial Feedback Request", desc: "How was your event?" },
                        { months: 4, title: "New Services Introduction", desc: "Share menu updates & special offers" },
                        { months: 6, title: "Seasonal Check-in", desc: "Perfect timing for celebrations" },
                        { months: 8, title: "VIP Benefits Reminder", desc: "Exclusive discounts & priority booking" },
                        { months: 10, title: "Year-End Planning", desc: "Holiday events & new year bookings" },
                        { months: 12, title: "Anniversary Celebration", desc: "Special thank you & biggest discount" },
                      ].map((email, index) => (
                        <div key={index} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white rounded-lg border">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {email.months}mo
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs md:text-sm">{email.title}</p>
                            <p className="text-xs text-slate-600 truncate">{email.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};
