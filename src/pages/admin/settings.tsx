import { useState, useEffect, useMemo } from "react";
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
import { DispatchSettingsTab } from "@/components/admin/dispatch/DispatchSettingsTab";
import { CancellationPolicyTab } from "@/components/admin/policy/CancellationPolicyTab";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";

export default function ProtectedSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <SettingsPage />
    </ProtectedRoute>
  );
}

function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Snapshot of the last persisted settings, used to derive a clean
  // 'unsaved changes' state. Updated after a successful save.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
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

      setSettings((prev) => {
        const next = {
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
        };
        // Take the snapshot AFTER the company fields land so the
        // dirty-tracker doesn't flag them as user edits.
        setSavedSnapshot(JSON.stringify(next));
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, []);

  // Derive whether the user has any unsaved edits. Cheap JSON compare,
  // settings is a small object.
  const hasUnsavedChanges = useMemo(() => {
    if (!savedSnapshot) return false;
    return savedSnapshot !== JSON.stringify(settings);
  }, [savedSnapshot, settings]);

  const handleSave = async () => {
    setSaving(true);
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

    // Update the snapshot so the dirty-tracker shows clean again.
    setSavedSnapshot(JSON.stringify(settings));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Beforeunload guard: warn the operator if they try to leave the page
  // while there are unsaved edits. Standard browser confirm dialog --
  // text is browser-controlled, the actual prompt just relies on us
  // calling preventDefault.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

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
              {hasUnsavedChanges && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
              <InfoTooltip
                content={"Saves changes across every tab in one go.\n\nYour preferences apply straight away. The bar at the bottom of the page mirrors this button so you can save without scrolling back up."}
                side="left"
              />
              <Button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || saving}
                className={hasUnsavedChanges
                  ? "bg-amber-600 hover:bg-amber-700 w-full sm:w-auto"
                  : "bg-slate-600 hover:bg-slate-700 w-full sm:w-auto"}
                size="sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : (hasUnsavedChanges ? "Save changes" : "Saved")}
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
                      content={"Connect a payment gateway so clients can pay online, local and international options supported."}
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
              <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-10 gap-1">
                <TabsTrigger value="company" className="text-xs md:text-sm whitespace-nowrap">Company</TabsTrigger>
                <TabsTrigger value="notifications" className="text-xs md:text-sm whitespace-nowrap">Notifications</TabsTrigger>
                <TabsTrigger value="automation" className="text-xs md:text-sm whitespace-nowrap">Automation</TabsTrigger>
                <TabsTrigger value="pricing" className="text-xs md:text-sm whitespace-nowrap">Pricing</TabsTrigger>
                <TabsTrigger value="operations" className="text-xs md:text-sm whitespace-nowrap">Operations</TabsTrigger>
                <TabsTrigger value="inventory" className="text-xs md:text-sm whitespace-nowrap">Inventory</TabsTrigger>
                <TabsTrigger value="dispatch" className="text-xs md:text-sm whitespace-nowrap">Dispatch</TabsTrigger>
                <TabsTrigger value="financial" className="text-xs md:text-sm whitespace-nowrap">Financial</TabsTrigger>
                <TabsTrigger value="cancellation" className="text-xs md:text-sm whitespace-nowrap">Cancellation</TabsTrigger>
                <TabsTrigger value="email-automation" className="text-xs md:text-sm whitespace-nowrap">Email Auto</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="company">
              <Card className="border-0 shadow-lg">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                    <Settings className="w-4 h-4 md:w-5 md:h-5" />
                    Company Information
                    <InfoTooltip content={"Your display name, contact details, and kitchen location used in quotes and route planning.\n\nNote: there is a separate Company Profile page that holds the master record, those values take priority."} />
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
                    <h3 className="font-semibold text-base mb-1 flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Kitchen / HQ Location
                    </h3>
                    <p className="text-xs text-slate-600 mb-3">
                      Used as the navigation start point for drivers and as the origin for delivery distance + fee calculations.
                      For multi-branch operations, set per-branch kitchens under <strong>Operations → Regions</strong>.
                    </p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-sm md:text-base">Kitchen address</Label>
                        <AddressAutocomplete
                          value={settings.company.kitchenAddress}
                          onChange={(pick) => {
                            updateSetting("company", "kitchenAddress", pick.address);
                            if (pick.lat != null) updateSetting("company", "kitchenLat", pick.lat);
                            if (pick.lng != null) updateSetting("company", "kitchenLng", pick.lng);
                          }}
                          placeholder="Search the kitchen / HQ address"
                          hint="Pick from the list to lock the precise pin, this is what Google Maps uses as the start point."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm">Latitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={settings.company.kitchenLat || ""}
                            onChange={(e) => updateSetting("company", "kitchenLat", parseFloat(e.target.value))}
                            placeholder="auto-filled from address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Longitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={settings.company.kitchenLng || ""}
                            onChange={(e) => updateSetting("company", "kitchenLng", parseFloat(e.target.value))}
                            placeholder="auto-filled from address"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <strong>Tip:</strong> Pick from the dropdown to lock the exact pin. Manual coords drift the route Google Maps draws.
                      </p>
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
                    <InfoTooltip content={"Toggle email and SMS alerts on a per-event basis, new bookings, status changes, payments and so on."} />
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
                    <InfoTooltip content={"How long the system waits before nudging clients with follow-ups, reminders and review requests after a quote is sent or an event ends.\n\nValues you set here are saved against your company. The email engine reads them when scheduling each automated send."} />
                  </CardTitle>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
                    Heads up: these timings are stored against your company but the live cron-driven sender is still on the engineering backlog. Set them now -- the moment the sender ships, your timings are already live.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        First Follow-up (days)
                        <InfoTooltip content={"How many days after a quote is sent (and not yet accepted) the first follow-up email goes out.\n\nLeave at 5 to nudge gently a working week later. Lower it for shorter sales cycles."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.automation.autoFollowUpDays}
                        onChange={(e) =>
                          updateSetting("automation", "autoFollowUpDays", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Second Follow-up (days)
                        <InfoTooltip content={"How many days after the quote was sent the second (final) follow-up goes out.\n\nThis is the email that can carry a small discount to nudge a stalled quote across the line."} />
                      </Label>
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
                    <Label className="text-sm md:text-base flex items-center gap-1">
                      Follow-up Discount (%)
                      <InfoTooltip content={"Discount baked into the second follow-up email. The template substitutes {{discount}} with this value, so editing it here updates every queued send.\n\nSet to 0 to disable the discount and keep the second follow-up as a plain reminder."} />
                    </Label>
                    <Input
                      type="number"
                      value={settings.automation.autoDiscountPercent}
                      onChange={(e) =>
                        updateSetting("automation", "autoDiscountPercent", parseInt(e.target.value))
                      }
                    />
                    <p className="text-xs md:text-sm text-slate-600">Discount offered in second follow-up email.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base flex items-center gap-1">
                      Event Reminder Days
                      <InfoTooltip content={"Comma-separated days BEFORE the event when reminder emails fire to the client.\n\nDefault 14, 7, 3, 1 means: a fortnight out, a week out, three days out and the day before.\n\nLeave blank to disable client-facing reminders."} />
                    </Label>
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
                    <p className="text-xs md:text-sm text-slate-600">Comma-separated (e.g., 14, 7, 3, 1).</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base flex items-center gap-1">
                      Review Request (days after)
                      <InfoTooltip content={"How many days AFTER the event date the review-request email goes out.\n\n1 = next morning, while the experience is fresh. Set higher if your post-event communications run later."} />
                    </Label>
                    <Input
                      type="number"
                      value={settings.automation.reviewRequestDays}
                      onChange={(e) =>
                        updateSetting("automation", "reviewRequestDays", parseInt(e.target.value))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm md:text-base flex items-center gap-1">
                      Complaint Response SLA (hours)
                      <InfoTooltip content={"Internal target for how quickly the team responds to a customer complaint.\n\nWhen breached, the complaint surfaces with an amber 'overdue' badge on the dashboard so it stops slipping. Does not auto-reply."} />
                    </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Weekend Premium (%)
                        <InfoTooltip content={"Extra percentage added to the menu subtotal when the event date falls on a Saturday or Sunday.\n\n0 disables. 10 means a R5,000 base order becomes R5,500 on a Saturday."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.pricing.weekendPremium}
                        onChange={(e) =>
                          updateSetting("pricing", "weekendPremium", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Last Minute Surcharge (%)
                        <InfoTooltip content={"Extra percentage when the event is within 7 days of the quote being created.\n\nCovers the rush cost of pulling stock and staff at short notice. 0 disables."} />
                      </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Early Bird Discount (%)
                        <InfoTooltip content={"Discount applied when the event is more than 60 days out. Rewards clients who book early so you can lock in suppliers and staffing.\n\n0 disables."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.pricing.earlyBirdDiscount}
                        onChange={(e) =>
                          updateSetting("pricing", "earlyBirdDiscount", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Bulk Discount Threshold (guests)
                        <InfoTooltip content={"Number of guests at which the bulk discount kicks in.\n\nMeasured against the quote's guest_count, not item totals. 100 means events of 100+ guests get the bulk-discount %."} />
                      </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Bulk Discount (%)
                        <InfoTooltip content={"Discount applied when the guest count meets or exceeds the threshold above.\n\nReflects the lower per-head cost of large events. Stacks AFTER weekend / last-minute uplifts."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.pricing.bulkDiscountPercent}
                        onChange={(e) =>
                          updateSetting("pricing", "bulkDiscountPercent", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Minimum Order Value (R)
                        <InfoTooltip content={"Quotes whose subtotal falls below this number get a warning at save time so you can decline or upsell.\n\nDoes not auto-block the save -- the quote builder is allowed to go below for special cases."} />
                      </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Equipment Cleaning (hours)
                        <InfoTooltip content={"How many hours of cleaning time the dispatcher reserves between an event ending and the equipment being available again.\n\nKeeps a piece of equipment from being double-booked across two events that finish + start back-to-back."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.operations.equipmentCleaningHours}
                        onChange={(e) =>
                          updateSetting("operations", "equipmentCleaningHours", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Kitchen Prep Lead Time (hours)
                        <InfoTooltip content={"How many hours before the event starts the kitchen needs to begin prep.\n\nDrives the prep-task scheduler -- a 6 hour lead means a 17:00 event has a 11:00 prep start."} />
                      </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Delivery Buffer (minutes)
                        <InfoTooltip content={"Minutes the driver should arrive at the venue BEFORE the event start time, so setup is done by the time guests arrive.\n\n45 means the driver leaves the kitchen with 45 min spare on top of the Google-Maps route time."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.operations.deliveryBufferMinutes}
                        onChange={(e) =>
                          updateSetting("operations", "deliveryBufferMinutes", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Max Concurrent Events
                        <InfoTooltip content={"Hard cap on the number of events your team will accept on the same day.\n\nQuote builder warns when the cap would be exceeded so you don't overbook your kitchen capacity."} />
                      </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Driver Service Radius (km)
                        <InfoTooltip content={"How far from the kitchen / HQ you're willing to deliver.\n\nQuotes outside this radius surface a warning at save time. Doesn't block manual override -- you can still take a one-off long-distance booking."} />
                      </Label>
                      <Input
                        type="number"
                        value={settings.operations.driverRadius}
                        onChange={(e) =>
                          updateSetting("operations", "driverRadius", parseInt(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Delivery Cost Per Kilometer (R)
                        <InfoTooltip content={"Rand per kilometre used by the quote builder to auto-calculate the delivery fee from kitchen to venue.\n\nThe operator can manually override the fee on the quote -- this is just the default rate."} />
                      </Label>
                      <Input
                        type="number"
                        step="0.50"
                        value={settings.operations.deliveryCostPerKm}
                        onChange={(e) =>
                          updateSetting("operations", "deliveryCostPerKm", parseFloat(e.target.value))
                        }
                      />
                      <p className="text-xs text-slate-600">This rate will be used to automatically calculate delivery fees in quotes.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory">
              <InventorySettingsTab />
            </TabsContent>

            <TabsContent value="dispatch">
              <DispatchSettingsTab />
            </TabsContent>

            <TabsContent value="cancellation">
              <CancellationPolicyTab />
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        Currency
                        <InfoTooltip content={"The currency every quote, invoice and refund will be issued in. Default ZAR for South African operators.\n\nAll prices in your menu, equipment list and quotes are interpreted in this currency."} />
                      </Label>
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
                      <Label className="text-sm md:text-base flex items-center gap-1">
                        VAT/Tax Rate (%)
                        <InfoTooltip content={"VAT or sales tax percentage added to the subtotal on every quote and invoice.\n\nFor SA VAT-registered operators this is 15. Set to 0 if you're not VAT-registered -- the public quote will not show a VAT line."} />
                      </Label>
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
                        <Label className="text-sm md:text-base flex items-center gap-1">
                          Required Deposit (%)
                          <InfoTooltip content={"How much of the total the client must pay to confirm a booking.\n\nDeposit invoice is generated automatically the moment the quote is accepted. The remaining balance is invoiced separately closer to the event."} />
                        </Label>
                        <Input
                          type="number"
                          value={settings.financial.depositPercent}
                          onChange={(e) =>
                            updateSetting("financial", "depositPercent", parseInt(e.target.value))
                          }
                          min="10"
                          max="100"
                        />
                        <p className="text-xs text-slate-600 mt-1">Percentage of total to confirm booking (10-100%).</p>
                      </div>

                      <div>
                        <Label className="text-sm md:text-base flex items-center gap-1">
                          Balance Due Days Before Event
                          <InfoTooltip content={"How many days before the event the remaining balance invoice goes out.\n\n7 means the balance reminder fires a week before. The system also sends an overdue nudge if it's not paid by event day."} />
                        </Label>
                        <Input
                          type="number"
                          value={settings.financial.balanceDueDays || 7}
                          onChange={(e) =>
                            updateSetting("financial", "balanceDueDays", parseInt(e.target.value))
                          }
                          min="1"
                          max="30"
                        />
                        <p className="text-xs text-slate-600 mt-1">When clients must pay remaining balance.</p>
                      </div>

                      <div>
                        <Label className="text-sm md:text-base flex items-center gap-1">
                          Final Order Changes (days before event)
                          <InfoTooltip content={"The last day on which clients can amend guest count, menu items or venue address from their portal.\n\nAfter this point, edits are admin-only -- protects you from same-week swaps that bust kitchen prep."} />
                        </Label>
                        <Input
                          type="number"
                          value={settings.financial.finalOrderChangeDays || 7}
                          onChange={(e) =>
                            updateSetting("financial", "finalOrderChangeDays", parseInt(e.target.value))
                          }
                          min="1"
                          max="30"
                        />
                        <p className="text-xs text-slate-600 mt-1">Last day clients can modify guest count/address.</p>
                      </div>

                      <div>
                        <Label className="text-sm md:text-base flex items-center gap-1">
                          Cancellation Fee (%)
                          <InfoTooltip content={"Fallback cancellation fee when no tier on the Cancellation tab applies.\n\nThe Cancellation tab lets you set proper notice-based tiers (e.g. 100% within 7 days, 50% within 30 days). This is the catch-all if no tier matches."} />
                        </Label>
                        <Input
                          type="number"
                          value={settings.financial.cancellationFeePercent}
                          onChange={(e) =>
                            updateSetting("financial", "cancellationFeePercent", parseInt(e.target.value))
                          }
                        />
                        <p className="text-xs text-slate-600 mt-1">Fee charged for cancellations.</p>
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
                    <Label className="text-sm md:text-base flex items-center gap-1">
                      Refund Processing Time (days)
                      <InfoTooltip content={"Estimated turnaround time you communicate to clients on a refund.\n\nDoesn't gate the refund itself -- it just sets expectations on the client-facing email and the refunds dashboard. 7 = 'allow up to 7 working days for the refund to reflect'."} />
                    </Label>
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

      {/* Sticky save bar -- always visible at the bottom of the page so
          the operator never has to scroll back up to save what they
          changed in a tab. Slides into view only when there are unsaved
          edits, and hides itself again on save. */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 lg:left-[calc(50%+9rem)] xl:left-[calc(50%+10rem)]">
          <div className="flex items-center gap-3 rounded-full bg-slate-900 text-white shadow-2xl px-4 py-2.5 border border-amber-400/40">
            <span className="inline-flex items-center gap-2 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved changes
            </span>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="h-8 bg-amber-500 hover:bg-amber-400 text-slate-900 gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};
