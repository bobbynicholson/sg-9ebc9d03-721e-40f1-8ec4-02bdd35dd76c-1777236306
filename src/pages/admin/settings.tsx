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
import { NotificationsSettingsTab } from "@/components/admin/settings/NotificationsSettingsTab";
import { AutomationSettingsTab } from "@/components/admin/settings/AutomationSettingsTab";
import { PricingSettingsTab } from "@/components/admin/settings/PricingSettingsTab";
import { OperationsSettingsTab } from "@/components/admin/settings/OperationsSettingsTab";
import { CompanySettingsTab } from "@/components/admin/settings/CompanySettingsTab";
import { EmailAutomationSettingsTab } from "@/components/admin/settings/EmailAutomationSettingsTab";
import { FinancialSettingsTab } from "@/components/admin/settings/FinancialSettingsTab";
import type { AdminSettings } from "@/components/admin/settings/types";
import { useTenantHref } from "@/lib/tenantUrl";

export default function ProtectedSettingsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <SettingsPage />
    </ProtectedRoute>
  );
}

function SettingsPage() {
  const { withSlug } = useTenantHref();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Snapshot of the last persisted settings, used to derive a clean
  // 'unsaved changes' state. Updated after a successful save.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [settings, setSettings] = useState<AdminSettings>({
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
        .maybeSingle();
      if (!profile?.company_id || cancelled) return;

      // Cast to any so the new financial columns (added in
      // migration companies_financial_settings_columns) compile
      // without regenerating Supabase types - the type file is
      // 370k+ chars and rebuilding it for three new columns
      // would balloon every diff in the project.
      const { data: company } = await (supabase as any)
        .from("companies")
        .select("company_name, email, phone, address_line1, logo_url, headquarters_lat, headquarters_lng, deposit_percent, balance_due_days, amendment_cutoff_days, cancellation_fee_percent, refund_process_days")
        .eq("id", profile.company_id)
        .maybeSingle();
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
          financial: {
            ...prev.financial,
            // companies columns are the canonical source - override
            // the localStorage / user_metadata copy so a colleague
            // who set values on another machine doesn't get stale
            // local state. finalOrderChangeDays maps onto the
            // existing amendment_cutoff_days column already used by
            // the is_order_amendable RPC; the rest landed via the
            // companies_financial_settings_columns migration.
            depositPercent: company.deposit_percent != null
              ? Number(company.deposit_percent)
              : prev.financial.depositPercent,
            balanceDueDays: company.balance_due_days != null
              ? Number(company.balance_due_days)
              : prev.financial.balanceDueDays,
            finalOrderChangeDays: (company as any).amendment_cutoff_days != null
              ? Number((company as any).amendment_cutoff_days)
              : prev.financial.finalOrderChangeDays,
            cancellationFeePercent: (company as any).cancellation_fee_percent != null
              ? Number((company as any).cancellation_fee_percent)
              : prev.financial.cancellationFeePercent,
            refundProcessDays: (company as any).refund_process_days != null
              ? Number((company as any).refund_process_days)
              : prev.financial.refundProcessDays,
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
    let dbWriteOk = true;
    let dbErrorMessage: string | null = null;
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
          .maybeSingle();
        if (profile?.company_id) {
          // Read the current JSONB so we merge instead of clobber.
          // Audit (May 2026, Wave 8): dispatch_settings is shared with
          // other writers (DispatchSettingsTab, branch overrides);
          // overwriting the whole blob would wipe sibling keys.
          const { data: existing } = await (supabase as any)
            .from("companies")
            .select("dispatch_settings, kitchen_settings")
            .eq("id", profile.company_id)
            .maybeSingle();
          const priorDispatch = ((existing as any)?.dispatch_settings || {}) as Record<string, any>;
          const priorKitchen = ((existing as any)?.kitchen_settings || {}) as Record<string, any>;

          await (supabase as any)
            .from("companies")
            .update({
              company_name: settings.company.name,
              email: settings.company.email,
              phone: settings.company.phone || null,
              address_line1: settings.company.address || null,
              logo_url: settings.company.logo || null,
              headquarters_lat: settings.company.kitchenLat || null,
              headquarters_lng: settings.company.kitchenLng || null,
              // Financial: deposit / balance-due / amendment cutoff /
              // cancellation fee / refund SLA. depositPercent feeds
              // resolveBranchSettings + the quote builder.
              deposit_percent: Number(settings.financial.depositPercent) || 30,
              balance_due_days: Number(settings.financial.balanceDueDays) || 7,
              amendment_cutoff_days: Number(settings.financial.finalOrderChangeDays) || 7,
              cancellation_fee_percent: Number(settings.financial.cancellationFeePercent) || 25,
              refund_process_days: Number(settings.financial.refundProcessDays) || 7,
              // Audit (May 2026, Wave 8): the previous save only
              // persisted seven fields. currency, VAT rate, every
              // operations and pricing key, and notification toggles
              // all silently fell into user_metadata + localStorage,
              // so a second admin on the same tenant saw stale or
              // default values. Now persisted to canonical company
              // columns / JSONB so every admin shares one source of
              // truth.
              currency: settings.financial.currency || "ZAR",
              vat_rate: Number(settings.financial.taxRate) || 0,
              // Dispatch settings: merge into the existing JSONB so
              // sibling keys (set by DispatchSettingsTab, region
              // overrides, etc) are preserved.
              dispatch_settings: {
                ...priorDispatch,
                deliveryCostPerKm: Number(settings.operations.deliveryCostPerKm) || 0,
                minDeliveryFee: priorDispatch.minDeliveryFee ?? 0,
                deliveryBufferMinutes: Number(settings.operations.deliveryBufferMinutes) || 30,
                driverRadius: Number(settings.operations.driverRadius) || 50,
                maxConcurrentEvents: Number(settings.operations.maxConcurrentEvents) || 5,
                equipmentCleaningHours: Number(settings.operations.equipmentCleaningHours) || 4,
                pricing: {
                  ...((priorDispatch as any).pricing || {}),
                  weekendPremium: Number(settings.pricing?.weekendPremium) || 0,
                  lastMinuteSurcharge: Number(settings.pricing?.lastMinuteSurcharge) || 0,
                  earlyBirdDiscount: Number(settings.pricing?.earlyBirdDiscount) || 0,
                  bulkDiscountThreshold: Number(settings.pricing?.bulkDiscountThreshold) || 0,
                  bulkDiscountPercent: Number(settings.pricing?.bulkDiscountPercent) || 0,
                  minimumOrderValue: Number(settings.pricing?.minimumOrderValue) || 0,
                },
                notifications: {
                  ...((priorDispatch as any).notifications || {}),
                  emailNewLead: !!settings.notifications?.emailNewLead,
                  emailQuoteAccepted: !!settings.notifications?.emailQuoteAccepted,
                  emailPaymentReceived: !!settings.notifications?.emailPaymentReceived,
                  emailComplaint: !!settings.notifications?.emailComplaint,
                  emailDailyReport: !!settings.notifications?.emailDailyReport,
                  smsDriverAssigned: !!settings.notifications?.smsDriverAssigned,
                },
              },
              // Kitchen prep lead time merges into kitchen_settings.
              kitchen_settings: {
                ...priorKitchen,
                kitchenPrepHours: Number(settings.operations.kitchenPrepHours) || 48,
              },
            })
            .eq("id", profile.company_id);
        }
      }
    } catch (e: any) {
      console.error("Failed to persist company settings to DB:", e);
      dbWriteOk = false;
      dbErrorMessage = e?.message || "DB save failed.";
    }

    // Update the snapshot so the dirty-tracker shows clean again,
    // but only when the DB write actually succeeded. Audit (May 2026,
    // Wave 8): previous code fired the green "Settings saved" toast
    // unconditionally, even when the companies update was rejected
    // (permissions, validation, etc), so the operator thought
    // financial settings persisted when they hadn't.
    if (dbWriteOk) {
      setSavedSnapshot(JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else if (typeof window !== "undefined") {
      // eslint-disable-next-line no-alert
      window.alert(`Settings did not save to the company record: ${dbErrorMessage}. Try again or contact support.`);
    }
    setSaving(false);
  };

  // Beforeunload guard: warn the operator if they try to leave the page
  // while there are unsaved edits. Standard browser confirm dialog;
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
        <title>System settings - CateringMS</title>
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
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">Settings <InfoTooltip content={"Every operational setting in one place: company info, notifications, automation, pricing, operations, finance, and email.\n\nWork through the tabs and hit Save All when you are done."} /></h1>
                <p className="text-sm md:text-base text-slate-600">Operational defaults that drive the rest of the system. Quote minimums, kitchen prep lead times, delivery radius, VAT, refund SLA, follow-up cadences. Saved against your company and applied everywhere immediately.</p>
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
                    <Link href={withSlug("/admin/white-label")} className="w-full md:w-auto">
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
                      <Link href={withSlug("/admin/regions")} className="w-full">
                        <Button size="sm" className="bg-white text-purple-600 hover:bg-purple-50 w-full">
                          Manage Regions
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                    <Link href={withSlug("/admin/order-assignments")} className="w-full">
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
                    <Link href={withSlug("/admin/payment-gateways")}>
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
              <CompanySettingsTab
                settings={settings.company}
                onUpdate={(key, value) => updateSetting("company", key, value)}
              />
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationsSettingsTab
                settings={settings.notifications}
                onUpdate={(key, value) => updateSetting("notifications", key, value)}
              />
            </TabsContent>

            <TabsContent value="automation">
              <AutomationSettingsTab
                settings={settings.automation}
                onUpdate={(key, value) => updateSetting("automation", key, value)}
              />
            </TabsContent>

            <TabsContent value="pricing">
              <PricingSettingsTab
                settings={settings.pricing}
                onUpdate={(key, value) => updateSetting("pricing", key, value)}
              />
            </TabsContent>

            <TabsContent value="operations">
              <OperationsSettingsTab
                settings={settings.operations}
                onUpdate={(key, value) => updateSetting("operations", key, value)}
              />
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
              <FinancialSettingsTab
                settings={settings.financial}
                onUpdate={(key, value) => updateSetting("financial", key, value)}
              />
            </TabsContent>

            <TabsContent value="email-automation">
              <EmailAutomationSettingsTab
                templatesHref={withSlug("/admin/after-sales-emails")}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Sticky save bar - always visible at the bottom of the page so
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
