import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import {
  Building2,
  CheckCircle,
  Loader2,
  Save,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import { AdminNav } from "@/components/admin/AdminNav";
import { DispatchSettingsTab } from "@/components/admin/dispatch/DispatchSettingsTab";
import { InventorySettingsTab } from "@/components/admin/inventory/InventorySettingsTab";
import { CancellationPolicyTab } from "@/components/admin/policy/CancellationPolicyTab";
import { AutomationSettingsTab } from "@/components/admin/settings/AutomationSettingsTab";
import { FinancialSettingsTab } from "@/components/admin/settings/FinancialSettingsTab";
import { OperationsSettingsTab } from "@/components/admin/settings/OperationsSettingsTab";
import { PricingSettingsTab } from "@/components/admin/settings/PricingSettingsTab";
import { RoleCompatibilitySettingsTab } from "@/components/admin/settings/RoleCompatibilitySettingsTab";
import type { AdminSettings } from "@/components/admin/settings/types";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PortalHeader, PageWorkbench, PortalShell } from "@/components/portal/ui";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import { DEFAULT_PAYMENT_TERMS } from "@/lib/paymentTerms";
import { DEFAULT_PAYMENT_REMINDERS, readPaymentDueSettings, readPaymentReminderSettings } from "@/lib/paymentReminderSchedule";
import { readQuoteExpiryMode } from "@/lib/quoteExpiryPolicy";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";

const DEFAULT_SETTINGS: AdminSettings = {
  quoteExpiryMode: "valid_until",
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
    maxGuestsPerEvent: 0,
    maxKitchenLoadPerDay: 0,
    driverRadius: 50,
    deliveryCostPerKm: 8.5,
    serviceAreaBase: "",
    serviceAreas: [],
    unavailableAreas: [],
  },
  roleCompatibility: {
    allowDriverWaiterOverlap: false,
    allowKitchenCleaningOverlap: false,
  },
  financial: {
    currency: "ZAR",
    taxRate: 15,
    depositPercent: 50,
    balanceDueDays: 7,
    paymentTermsText: DEFAULT_PAYMENT_TERMS,
    paymentDueDirection: "before_event",
    paymentReminderMode: DEFAULT_PAYMENT_REMINDERS.mode,
    paymentReminderDays: DEFAULT_PAYMENT_REMINDERS.days,
    finalOrderChangeDays: 7,
    cancellationFeePercent: 25,
    refundProcessDays: 7,
  },
};

export default function ProtectedSettingsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <SettingsPage />
    </ProtectedRoute>
  );
}

function SettingsPage() {
  const { profile, user, company } = useAuth() as any;
  const companyId = company?.id || profile?.company_id || user?.company_id || null;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  // Set when the DB read fails and we fell back to the local cache.
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [defaultsTab, setDefaultsTab] = useState("financial");

  useEffect(() => {
    const tabForHash = (hash: string) => {
      const match = hash.match(/^#settings-(financial|pricing|quotes|operations|roles|automation|inventory|dispatch|cancellation)$/);
      return match?.[1] || (["#payment-reminders", "#payment-due"].includes(hash) ? "financial" : null);
    };
    const syncTabToHash = () => {
      const tab = tabForHash(window.location.hash);
      if (tab) setDefaultsTab(tab);
    };
    syncTabToHash();
    window.addEventListener("hashchange", syncTabToHash);
    return () => window.removeEventListener("hashchange", syncTabToHash);
  }, []);

  useEffect(() => {
    if (!companyId) {
      setSettings(DEFAULT_SETTINGS);
      setSavedSnapshot("");
      setLoadedCompanyId(null);
      setLoadFailed(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setSettings(DEFAULT_SETTINGS);
      setSavedSnapshot("");
      setLoadedCompanyId(null);
      setSaved(false);
      setLoadFailed(null);
      try {
        const local = readLocalSettings(companyId);
        const { data: company, error } = await (supabase as any)
          .from("companies")
          .select([
            "currency",
            "vat_rate",
            "deposit_percent",
            "balance_due_days",
            "amendment_cutoff_days",
            "cancellation_fee_percent",
            "refund_process_days",
            "dispatch_settings",
            "kitchen_settings",
            "role_compatibility_settings",
          ].join(", "))
          .eq("id", companyId)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;

        if (!company) throw new Error("Company settings could not be found for the active company.");
        const next = companyToSettings(company, local);
        setSettings(next);
        setSavedSnapshot(JSON.stringify(next));
        setLoadedCompanyId(companyId);
      } catch (error: any) {
        if (!cancelled) {
          const fallback = readLocalSettings(companyId);
          setSettings(fallback);
          setSavedSnapshot(JSON.stringify(fallback));
          setLoadedCompanyId(companyId);
          // Persistent banner as well as the toast: cached values can
          // be stale and the operator must know before editing them.
          setLoadFailed(error?.message || "Could not read company settings from the database.");
          toast({
            title: "Settings loaded from local cache",
            description: error?.message || "Could not read company settings from the database.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, toast, reloadNonce]);

  const isLoadingCurrentCompany = Boolean(companyId) && (loading || loadedCompanyId !== companyId);

  const hasUnsavedChanges = useMemo(
    () => !!savedSnapshot && savedSnapshot !== JSON.stringify(settings),
    [savedSnapshot, settings],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  const updateSetting = <Category extends Exclude<keyof AdminSettings, "quoteExpiryMode">>(
    category: Category,
    key: keyof AdminSettings[Category],
    value: AdminSettings[Category][keyof AdminSettings[Category]],
  ) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!companyId) {
      toast({
        title: "No company resolved",
        description: "Sign out and back in before saving settings.",
        variant: "destructive",
      });
      return;
    }
    if (isLoadingCurrentCompany || loadFailed || !savedSnapshot) return;

    setSaving(true);
    try {
      const { data: existing, error: existingError } = await (supabase as any)
        .from("companies")
        .select("dispatch_settings, kitchen_settings, role_compatibility_settings, timezone")
        .eq("id", companyId)
        .maybeSingle();
      if (existingError) throw existingError;

      const priorDispatch = ((existing as any)?.dispatch_settings || {}) as Record<string, any>;
      const priorKitchen = ((existing as any)?.kitchen_settings || {}) as Record<string, any>;
      const priorRoleCompatibility = ((existing as any)?.role_compatibility_settings || {}) as Record<string, any>;

      // Bug fix (restructure audit 2026-07-02): the previous
      // `Number(x) || fallback` pattern clobbered legitimate zeros on
      // save. A tenant that set deposit to 0% (no-deposit business),
      // cancellation fee to 0%, or balance due to 0 days saw the value
      // silently rewritten to 30 / 25 / 7 in the database, then the
      // edit form loaded the wrong value back. numberOr keeps 0 and
      // only falls back on NaN / null / empty input.
      const { error: updateError } = await (supabase as any)
        .from("companies")
        .update({
          currency: settings.financial.currency || "ZAR",
          vat_rate: numberOr(settings.financial.taxRate, 0),
          deposit_percent: numberOr(settings.financial.depositPercent, 50),
          balance_due_days: numberOr(settings.financial.balanceDueDays, 7),
          amendment_cutoff_days: numberOr(settings.financial.finalOrderChangeDays, 7),
          cancellation_fee_percent: numberOr(settings.financial.cancellationFeePercent, 25),
          refund_process_days: numberOr(settings.financial.refundProcessDays, 7),
          dispatch_settings: {
            ...priorDispatch,
            quoteExpiryMode: settings.quoteExpiryMode,
            paymentTermsText: settings.financial.paymentTermsText.trim() || DEFAULT_PAYMENT_TERMS,
            paymentDue: { direction: settings.financial.paymentDueDirection },
            paymentReminders: {
              mode: settings.financial.paymentReminderMode,
              days: Math.max(0, Math.floor(numberOr(settings.financial.paymentReminderDays, DEFAULT_PAYMENT_REMINDERS.days))),
            },
            deliveryCostPerKm: numberOr(settings.operations.deliveryCostPerKm, 0),
            deliveryBufferMinutes: numberOr(settings.operations.deliveryBufferMinutes, 30),
            driverRadius: numberOr(settings.operations.driverRadius, 50),
            serviceAreaBase: settings.operations.serviceAreaBase.trim(),
            serviceAreas: settings.operations.serviceAreas,
            unavailableAreas: settings.operations.unavailableAreas,
            maxConcurrentEvents: numberOr(settings.operations.maxConcurrentEvents, 5),
            maxGuestsPerEvent: numberOr(settings.operations.maxGuestsPerEvent, 0),
            maxKitchenLoadPerDay: numberOr(settings.operations.maxKitchenLoadPerDay, 0),
            equipmentCleaningHours: numberOr(settings.operations.equipmentCleaningHours, 4),
            pricing: {
              ...((priorDispatch as any).pricing || {}),
              weekendPremium: numberOr(settings.pricing.weekendPremium, 0),
              lastMinuteSurcharge: numberOr(settings.pricing.lastMinuteSurcharge, 0),
              earlyBirdDiscount: numberOr(settings.pricing.earlyBirdDiscount, 0),
              bulkDiscountThreshold: numberOr(settings.pricing.bulkDiscountThreshold, 0),
              bulkDiscountPercent: numberOr(settings.pricing.bulkDiscountPercent, 0),
              minimumOrderValue: numberOr(settings.pricing.minimumOrderValue, 0),
            },
            automation: {
              ...((priorDispatch as any).automation || {}),
              autoFollowUpDays: numberOr(settings.automation.autoFollowUpDays, 0),
              secondFollowUpDays: numberOr(settings.automation.secondFollowUpDays, 0),
              reminderDays: settings.automation.reminderDays,
              autoDiscountPercent: numberOr(settings.automation.autoDiscountPercent, 0),
              reviewRequestDays: numberOr(settings.automation.reviewRequestDays, 0),
              complaintResponseHours: numberOr(settings.automation.complaintResponseHours, 0),
            },
          },
          kitchen_settings: {
            ...priorKitchen,
            kitchenPrepHours: numberOr(settings.operations.kitchenPrepHours, 48),
          },
          role_compatibility_settings: {
            ...priorRoleCompatibility,
            allow_driver_waiter_overlap: settings.roleCompatibility.allowDriverWaiterOverlap,
            allow_kitchen_cleaning_overlap: settings.roleCompatibility.allowKitchenCleaningOverlap,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);

      if (updateError) throw updateError;
      // Restore quotes expired by the old validity rule when their event is
      // still ahead, preserving whether each quote had been sent.
      let quoteRefreshError: string | null = null;
      if (settings.quoteExpiryMode === "event_date" && readQuoteExpiryMode(priorDispatch) !== "event_date") {
        const todayIso = toZonedISO(new Date(), (existing as any)?.timezone || DEFAULT_TENANT_TIMEZONE);
        const refreshedAt = new Date().toISOString();
        const resetExpiryState = {
          expired_at: null,
          updated_at: refreshedAt,
          expiry_admin_notified_at: null,
          expiry_admin_emailed_at: null,
          expiry_client_notified_at: null,
          expiry_client_emailed_at: null,
        };
        const { error: sentQuoteError } = await (supabase as any)
          .from("quotes")
          .update({ ...resetExpiryState, status: "sent" })
          .eq("company_id", companyId)
          .eq("status", "expired")
          .is("converted_to_order_id", null)
          .not("sent_at", "is", null)
          .lt("valid_until", todayIso)
          .gt("event_date", todayIso)
          .is("deleted_at", null);
        const { error: draftQuoteError } = await (supabase as any)
          .from("quotes")
          .update({ ...resetExpiryState, status: "draft" })
          .eq("company_id", companyId)
          .eq("status", "expired")
          .is("converted_to_order_id", null)
          .is("sent_at", null)
          .lt("valid_until", todayIso)
          .gt("event_date", todayIso)
          .is("deleted_at", null);
        const refreshErrors = [sentQuoteError, draftQuoteError].filter(Boolean);
        if (refreshErrors.length > 0) quoteRefreshError = refreshErrors.map((error: any) => error.message).join("; ");
      }
      // Existing unpaid event invoices must follow the saved schedule too.
      let invoiceDateRefreshError: string | null = null;
      try {
        const { reconcileCompanyInvoiceDueDates } = await import("@/services/invoiceDueDateService");
        await reconcileCompanyInvoiceDueDates(supabase, companyId);
      } catch (error: any) {
        invoiceDateRefreshError = error?.message || "Invoice due dates could not be refreshed.";
      }

      mirrorSettingsCache(companyId, settings);
      setSavedSnapshot(JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({
        title: invoiceDateRefreshError || quoteRefreshError ? "Settings saved; some records need review" : "Business defaults saved",
        description: quoteRefreshError ? `Quote setting saved, but future quotes could not be reopened: ${quoteRefreshError}` : invoiceDateRefreshError || "Company-wide rules and open invoice due dates are now saved.",
        variant: invoiceDateRefreshError || quoteRefreshError ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({
        title: "Settings not saved",
        description: error?.message || "Database save failed. Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Business defaults - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title={
              <span className="flex items-center gap-2">
                Business defaults
                <InfoTooltip
                  content={
                    "These are company-wide rules for financial terms, pricing, operations, team-role compatibility, automation, inventory, dispatch and order policies. Specialist pages such as company profile, branding, email, integrations and templates are in the Settings sidebar. Some specialist pages save their own changes."
                  }
                />
              </span>
            }
            icon={Settings}
            subtitle="Manage the company-wide rules used for pricing, finance, operations and order handling."
            meta={
              !isLoadingCurrentCompany && company ? (
                <>
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{company.company_name || company.name || "Company settings"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {settings.financial.currency} · VAT {settings.financial.taxRate}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    Deposit {settings.financial.depositPercent}%
                  </span>
                  {hasUnsavedChanges && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                      Unsaved changes
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <Button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || saving || isLoadingCurrentCompany || !!loadFailed}
                className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
                size="sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : hasUnsavedChanges ? "Save defaults" : "Saved"}
              </Button>
            }
          />
          <PageWorkbench />
      {hasUnsavedChanges && !isLoadingCurrentCompany && companyId && (
        <div className="mb-6 flex justify-end">
          <div className="flex items-center gap-3 rounded-full border border-amber-400/40 bg-slate-900 px-4 py-2.5 text-white shadow-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-medium">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Unsaved changes
            </span>
            <Button
              onClick={handleSave}
              disabled={saving || isLoadingCurrentCompany || !!loadFailed}
              size="sm"
              className="h-8 gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

          {loadFailed && (
            <Card className="mb-6 border-amber-200 bg-amber-50">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-900">Showing locally cached settings</p>
                  <p className="text-xs text-amber-800">{loadFailed} Values below may be stale; retry before editing.</p>
                </div>
                <Button onClick={() => setReloadNonce((n) => n + 1)} size="sm" variant="outline">
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {saved && (
            <Card className="mb-6 border-0 bg-brand-primary/10 shadow">
              <CardContent className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-brand-primary">
                <CheckCircle className="h-4 w-4" />
                Business defaults saved successfully.
              </CardContent>
            </Card>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  Company-wide rules
                </h2>
                <p className="text-sm text-slate-600">
                  Choose a category. Some tabs save here; inventory, dispatch and policies have their own save controls.
                </p>
              </div>
              {hasUnsavedChanges && (
                <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 sm:inline-flex">
                  Unsaved changes
                </span>
              )}
            </div>

            {!companyId ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm font-semibold text-slate-900">Choose a company to edit settings</p>
                  <p className="mt-1 text-sm text-slate-600">Company defaults stay separate. Open this page from a company workspace.</p>
                </CardContent>
              </Card>
            ) : isLoadingCurrentCompany ? (
              <Card>
                <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading settings...
                </CardContent>
              </Card>
            ) : (
              <Tabs key={companyId} value={defaultsTab} onValueChange={setDefaultsTab} className="space-y-4 md:space-y-6">
                <label htmlFor="business-defaults-category" className="sr-only">Business defaults category</label>
                <select
                  id="business-defaults-category"
                  value={defaultsTab}
                  onChange={(event) => setDefaultsTab(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 sm:hidden"
                >
                  <option value="financial">Financial</option>
                  <option value="pricing">Pricing</option>
                  <option value="quotes">Quotes</option>
                  <option value="operations">Operations</option>
                  <option value="roles">Team roles</option>
                  <option value="automation">Automation</option>
                  <option value="inventory">Inventory</option>
                  <option value="dispatch">Dispatch</option>
                  <option value="cancellation">Terms &amp; Policies</option>
                </select>
                <TabsList className="hidden h-auto w-full flex-wrap justify-start gap-1 sm:flex">
                  <TabsTrigger value="financial" className="whitespace-nowrap text-xs md:text-sm">Financial</TabsTrigger>
                  <TabsTrigger value="pricing" className="whitespace-nowrap text-xs md:text-sm">Pricing</TabsTrigger>
                  <TabsTrigger value="quotes" className="whitespace-nowrap text-xs md:text-sm">Quotes</TabsTrigger>
                  <TabsTrigger value="operations" className="whitespace-nowrap text-xs md:text-sm">Operations</TabsTrigger>
                  <TabsTrigger value="roles" className="whitespace-nowrap text-xs md:text-sm">Team roles</TabsTrigger>
                  <TabsTrigger value="automation" className="whitespace-nowrap text-xs md:text-sm">Automation</TabsTrigger>
                  <TabsTrigger value="inventory" className="whitespace-nowrap text-xs md:text-sm">Inventory</TabsTrigger>
                  <TabsTrigger value="dispatch" className="whitespace-nowrap text-xs md:text-sm">Dispatch</TabsTrigger>
                  <TabsTrigger value="cancellation" className="whitespace-nowrap text-xs md:text-sm">Terms &amp; Policies</TabsTrigger>
                </TabsList>

                <TabsContent id="settings-financial" data-chat-section="admin.settings.financial" data-chat-section-label="Financial settings" value="financial">
                  <FinancialSettingsTab
                    settings={settings.financial}
                    onUpdate={(key, value) => updateSetting("financial", key, value)}
                  />
                </TabsContent>

                <TabsContent id="settings-pricing" data-chat-section="admin.settings.pricing" data-chat-section-label="Pricing settings" value="pricing">
                  <PricingSettingsTab
                    settings={settings.pricing}
                    onUpdate={(key, value) => updateSetting("pricing", key, value)}
                  />
                </TabsContent>

                <TabsContent id="settings-quotes" value="quotes">
                  <Card className="border-0 shadow-lg">
                    <CardContent className="space-y-4 px-4 py-6 md:px-6">
                      <h2 className="text-lg font-semibold text-slate-900">Quote expiration</h2>
                      <p className="text-sm text-slate-600">Choose when open quotes close automatically, using your company time zone.</p>
                      <fieldset className="space-y-3">
                        <legend className="text-sm font-medium text-slate-800">Expire quotes after</legend>
                        {([
                          { value: "valid_until", label: "Quote valid-until date", detail: "The quote remains open through the date set on it." },
                          { value: "event_date", label: "Event date", detail: "The quote closes when the event date begins. Quotes without an event date use their valid-until date." },
                        ] as const).map((option) => (
                          <label key={option.value} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:border-brand-primary/50">
                            <input type="radio" name="quote-expiry-mode" value={option.value} checked={settings.quoteExpiryMode === option.value} onChange={() => setSettings((current) => ({ ...current, quoteExpiryMode: option.value }))} className="mt-1 accent-brand-primary" />
                            <span><span className="block font-medium text-slate-900">{option.label}</span><span className="block text-slate-600">{option.detail}</span></span>
                          </label>
                        ))}
                      </fieldset>
                      <p className="text-xs text-slate-500">Saving Event date reopens sent quotes that expired under an earlier valid-until date when their event has not yet passed.</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent id="settings-operations" data-chat-section="admin.settings.operations" data-chat-section-label="Operations settings" value="operations">
                  <OperationsSettingsTab
                    settings={settings.operations}
                    onUpdate={(key, value) => updateSetting("operations", key, value)}
                  />
                </TabsContent>

                <TabsContent id="settings-roles" data-chat-section="admin.settings.roles" data-chat-section-label="Team roles settings" value="roles">
                  <RoleCompatibilitySettingsTab
                    settings={settings.roleCompatibility}
                    onUpdate={(key, value) => updateSetting("roleCompatibility", key, value)}
                  />
                </TabsContent>

                <TabsContent id="settings-automation" data-chat-section="admin.settings.automation" data-chat-section-label="Automation settings" value="automation">
                  <AutomationSettingsTab
                    settings={settings.automation}
                    onUpdate={(key, value) => updateSetting("automation", key, value)}
                  />
                </TabsContent>

                <TabsContent id="settings-inventory" data-chat-section="admin.settings.inventory" data-chat-section-label="Inventory settings" value="inventory">
                  <InventorySettingsTab key={companyId} companyId={companyId} />
                </TabsContent>

                <TabsContent id="settings-dispatch" data-chat-section="admin.settings.dispatch" data-chat-section-label="Dispatch settings" value="dispatch">
                  <DispatchSettingsTab key={companyId} companyId={companyId} />
                </TabsContent>

                <TabsContent id="settings-cancellation" data-chat-section="admin.settings.cancellation" data-chat-section-label="Terms and policies" value="cancellation">
                  <CancellationPolicyTab key={companyId} companyId={companyId} />
                </TabsContent>
              </Tabs>
            )}
          </section>
        </PortalShell>
      </div>


    </>
  );
}

function companyToSettings(company: Record<string, any>, fallback: AdminSettings): AdminSettings {
  const dispatch = (company.dispatch_settings || {}) as Record<string, any>;
  const kitchen = (company.kitchen_settings || {}) as Record<string, any>;
  const roleCompatibility = (company.role_compatibility_settings || {}) as Record<string, any>;
  const pricing = (dispatch.pricing || {}) as Record<string, any>;
  const automation = (dispatch.automation || {}) as Record<string, any>;

  return {
    automation: {
      autoFollowUpDays: numberOr(automation.autoFollowUpDays, fallback.automation.autoFollowUpDays),
      secondFollowUpDays: numberOr(automation.secondFollowUpDays, fallback.automation.secondFollowUpDays),
      reminderDays: Array.isArray(automation.reminderDays)
        ? automation.reminderDays.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
        : fallback.automation.reminderDays,
      autoDiscountPercent: numberOr(automation.autoDiscountPercent, fallback.automation.autoDiscountPercent),
      reviewRequestDays: numberOr(automation.reviewRequestDays, fallback.automation.reviewRequestDays),
      complaintResponseHours: numberOr(automation.complaintResponseHours, fallback.automation.complaintResponseHours),
    },
    pricing: {
      weekendPremium: numberOr(pricing.weekendPremium, fallback.pricing.weekendPremium),
      lastMinuteSurcharge: numberOr(pricing.lastMinuteSurcharge, fallback.pricing.lastMinuteSurcharge),
      earlyBirdDiscount: numberOr(pricing.earlyBirdDiscount, fallback.pricing.earlyBirdDiscount),
      bulkDiscountThreshold: numberOr(pricing.bulkDiscountThreshold, fallback.pricing.bulkDiscountThreshold),
      bulkDiscountPercent: numberOr(pricing.bulkDiscountPercent, fallback.pricing.bulkDiscountPercent),
      minimumOrderValue: numberOr(pricing.minimumOrderValue, fallback.pricing.minimumOrderValue),
    },
    operations: {
      equipmentCleaningHours: numberOr(dispatch.equipmentCleaningHours, fallback.operations.equipmentCleaningHours),
      kitchenPrepHours: numberOr(kitchen.kitchenPrepHours, fallback.operations.kitchenPrepHours),
      deliveryBufferMinutes: numberOr(dispatch.deliveryBufferMinutes, fallback.operations.deliveryBufferMinutes),
      maxConcurrentEvents: numberOr(dispatch.maxConcurrentEvents, fallback.operations.maxConcurrentEvents),
      maxGuestsPerEvent: numberOr(dispatch.maxGuestsPerEvent, fallback.operations.maxGuestsPerEvent),
      maxKitchenLoadPerDay: numberOr(dispatch.maxKitchenLoadPerDay, fallback.operations.maxKitchenLoadPerDay),
      driverRadius: numberOr(dispatch.driverRadius, fallback.operations.driverRadius),
      deliveryCostPerKm: numberOr(dispatch.deliveryCostPerKm, fallback.operations.deliveryCostPerKm),
      serviceAreaBase: typeof dispatch.serviceAreaBase === "string" ? dispatch.serviceAreaBase : fallback.operations.serviceAreaBase,
      serviceAreas: Array.isArray(dispatch.serviceAreas) ? dispatch.serviceAreas.filter((area: unknown): area is string => typeof area === "string") : fallback.operations.serviceAreas,
      unavailableAreas: Array.isArray(dispatch.unavailableAreas) ? dispatch.unavailableAreas.filter((area: unknown): area is string => typeof area === "string") : fallback.operations.unavailableAreas,
    },
    roleCompatibility: {
      allowDriverWaiterOverlap: Boolean(roleCompatibility.allow_driver_waiter_overlap),
      allowKitchenCleaningOverlap: Boolean(roleCompatibility.allow_kitchen_cleaning_overlap),
    },
    financial: {
      currency: company.currency || fallback.financial.currency,
      taxRate: numberOr(company.vat_rate, fallback.financial.taxRate),
      depositPercent: numberOr(company.deposit_percent, fallback.financial.depositPercent),
      balanceDueDays: numberOr(company.balance_due_days, fallback.financial.balanceDueDays),
      paymentTermsText: typeof dispatch.paymentTermsText === "string" && dispatch.paymentTermsText.trim()
        ? dispatch.paymentTermsText
        : fallback.financial.paymentTermsText,
      paymentDueDirection: readPaymentDueSettings(dispatch, company.balance_due_days).direction,
      paymentReminderMode: readPaymentReminderSettings(dispatch).mode,
      paymentReminderDays: readPaymentReminderSettings(dispatch).days,
      finalOrderChangeDays: numberOr(company.amendment_cutoff_days, fallback.financial.finalOrderChangeDays),
      cancellationFeePercent: numberOr(company.cancellation_fee_percent, fallback.financial.cancellationFeePercent),
      refundProcessDays: numberOr(company.refund_process_days, fallback.financial.refundProcessDays),
    },
    quoteExpiryMode: readQuoteExpiryMode(dispatch),
  };
}

function readLocalSettings(companyId: string): AdminSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const keys = [`admin_settings.${companyId}`];
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      return mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
      // Try the next cache key.
    }
  }
  return DEFAULT_SETTINGS;
}

function mergeSettings(base: AdminSettings, patch: any): AdminSettings {
  return {
    quoteExpiryMode: patch?.quoteExpiryMode === "event_date" ? "event_date" : base.quoteExpiryMode,
    automation: { ...base.automation, ...(patch?.automation || {}) },
    pricing: { ...base.pricing, ...(patch?.pricing || {}) },
    operations: { ...base.operations, ...(patch?.operations || {}) },
    roleCompatibility: { ...base.roleCompatibility, ...(patch?.roleCompatibility || {}) },
    financial: { ...base.financial, ...(patch?.financial || {}) },
  };
}

function mirrorSettingsCache(companyId: string, settings: AdminSettings) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(settings);
    window.localStorage.setItem(`admin_settings.${companyId}`, json);
  } catch {
    // Local cache is only a compatibility mirror. The DB save already succeeded.
  }
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
