import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Building2,
  CheckCircle,
  Code2,
  CookingPot,
  Loader2,
  Mail,
  MessageSquare,
  Palette,
  Save,
  Settings,
  Shield,
  Sparkles,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";

const DEFAULT_SETTINGS: AdminSettings = {
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
  },
  roleCompatibility: {
    allowDriverWaiterOverlap: false,
    allowKitchenCleaningOverlap: false,
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
};

interface SettingsShortcut {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  source: string;
}

const SETTINGS_SHORTCUTS: SettingsShortcut[] = [
  {
    title: "Company profile",
    description: "Business identity, contact details, VAT, bank details, HQ pin, and document numbering.",
    href: "/admin/company-profile",
    icon: Building2,
    source: "companies",
  },
  {
    title: "Branding",
    description: "Logo, colours, accent palette, and tenant fonts used across admin, client, and team portals.",
    href: "/admin/white-label",
    icon: Palette,
    source: "companies",
  },
  {
    title: "Kitchen rules",
    description: "Prep timing, dietary flags, stock handling, and kitchen policy shared with the team landing.",
    href: "/admin/kitchen-settings",
    icon: CookingPot,
    source: "companies.kitchen_settings",
  },
  {
    title: "Daily operations",
    description: "Daily kitchen and equipment cleaning times, lead-time reminders, recipients, and task status.",
    href: "/admin/daily-operations",
    icon: Sparkles,
    source: "company_daily_operations_settings",
  },
  {
    title: "Email delivery",
    description: "Sender identity, verified domain, provider settings, test send, and client email automation.",
    href: "/admin/email-settings",
    icon: Mail,
    source: "email_provider_settings",
  },
  {
    title: "Integrations",
    description: "API keys, Zapier webhooks, accounting defaults, and outbound event wiring.",
    href: "/admin/integrations",
    icon: Zap,
    source: "api_keys + webhooks",
  },
  {
    title: "Lead forms",
    description: "Embeddable enquiry forms, field mapping, live previews, snippets, and conversion metrics.",
    href: "/admin/integrations/embed",
    icon: Code2,
    source: "embed_form_configs",
  },
  {
    title: "Messages",
    description: "Email and WhatsApp templates, sent log, automation overview, and per-tenant wording.",
    href: "/admin/email-templates",
    icon: MessageSquare,
    source: "email_templates",
  },
  {
    title: "Notifications",
    description: "Per-user email, push, WhatsApp, and SMS preferences. Tenant mute rules are enforced by the notification service.",
    href: "/admin/notification-settings",
    icon: Bell,
    source: "email_notification_preferences",
  },
  {
    title: "Audit logs",
    description: "Company-scoped compliance trail with filters, saved views, row links, and CSV export.",
    href: "/admin/audit-logs",
    icon: Shield,
    source: "audit_logs",
  },
];

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
  const { profile, user } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const { withSlug } = useTenantHref();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  // Set when the DB read fails and we fell back to the local cache.
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
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

        const next = companyToSettings(company || {}, local);
        setSettings(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch (error: any) {
        if (!cancelled) {
          const fallback = readLocalSettings(companyId);
          setSettings(fallback);
          setSavedSnapshot(JSON.stringify(fallback));
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

  const updateSetting = <Category extends keyof AdminSettings>(
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

    setSaving(true);
    try {
      const { data: existing, error: existingError } = await (supabase as any)
        .from("companies")
        .select("dispatch_settings, kitchen_settings, role_compatibility_settings")
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
          deposit_percent: numberOr(settings.financial.depositPercent, 30),
          balance_due_days: numberOr(settings.financial.balanceDueDays, 7),
          amendment_cutoff_days: numberOr(settings.financial.finalOrderChangeDays, 7),
          cancellation_fee_percent: numberOr(settings.financial.cancellationFeePercent, 25),
          refund_process_days: numberOr(settings.financial.refundProcessDays, 7),
          dispatch_settings: {
            ...priorDispatch,
            deliveryCostPerKm: numberOr(settings.operations.deliveryCostPerKm, 0),
            deliveryBufferMinutes: numberOr(settings.operations.deliveryBufferMinutes, 30),
            driverRadius: numberOr(settings.operations.driverRadius, 50),
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

      mirrorSettingsCache(companyId, settings);
      setSavedSnapshot(JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "Settings saved", description: "Operational defaults are now saved for this company." });
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
        <title>Settings - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title={
              <span className="flex items-center gap-2">
                Settings
                <InfoTooltip
                  content={
                    "Use the setup cards for specialist areas such as company profile, branding, email, integrations, forms, templates, notifications, and audit logs.\n\nUse Operational defaults for pricing, finance, kitchen capacity, dispatch, inventory, and cancellation policy values that drive the system."
                  }
                />
              </span>
            }
            icon={Settings}
            subtitle="A clean hub for admin setup plus the shared operational defaults that affect quotes, finance, kitchen capacity, dispatch, and cancellation rules."
            meta={
              !loading ? (
                <>
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
                disabled={!hasUnsavedChanges || saving || loading}
                className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
                size="sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : hasUnsavedChanges ? "Save defaults" : "Saved"}
              </Button>
            }
          />
          <PageWorkbench />

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
                Settings saved successfully.
              </CardContent>
            </Card>
          )}

          <section className="mb-8">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Setup areas</h2>
                <p className="text-sm text-slate-600">
                  Each card opens the canonical page for that part of the admin system.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SETTINGS_SHORTCUTS.map((item) => (
                <SettingsShortcutCard key={item.href} item={item} href={withSlug(item.href)} />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  Operational defaults
                </h2>
                <p className="text-sm text-slate-600">
                  These tabs save to company-backed settings and are shared by every admin on the tenant.
                </p>
              </div>
              {hasUnsavedChanges && (
                <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 sm:inline-flex">
                  Unsaved changes
                </span>
              )}
            </div>

            {loading ? (
              <Card>
                <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading settings...
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="financial" className="space-y-4 md:space-y-6">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                  <TabsTrigger value="financial" className="whitespace-nowrap text-xs md:text-sm">Financial</TabsTrigger>
                  <TabsTrigger value="pricing" className="whitespace-nowrap text-xs md:text-sm">Pricing</TabsTrigger>
                  <TabsTrigger value="operations" className="whitespace-nowrap text-xs md:text-sm">Operations</TabsTrigger>
                  <TabsTrigger value="roles" className="whitespace-nowrap text-xs md:text-sm">Team roles</TabsTrigger>
                  <TabsTrigger value="automation" className="whitespace-nowrap text-xs md:text-sm">Automation</TabsTrigger>
                  <TabsTrigger value="inventory" className="whitespace-nowrap text-xs md:text-sm">Inventory</TabsTrigger>
                  <TabsTrigger value="dispatch" className="whitespace-nowrap text-xs md:text-sm">Dispatch</TabsTrigger>
                  <TabsTrigger value="cancellation" className="whitespace-nowrap text-xs md:text-sm">Terms &amp; Policies</TabsTrigger>
                </TabsList>

                <TabsContent value="financial">
                  <FinancialSettingsTab
                    settings={settings.financial}
                    onUpdate={(key, value) => updateSetting("financial", key, value)}
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

                <TabsContent value="roles">
                  <RoleCompatibilitySettingsTab
                    settings={settings.roleCompatibility}
                    onUpdate={(key, value) => updateSetting("roleCompatibility", key, value)}
                  />
                </TabsContent>

                <TabsContent value="automation">
                  <AutomationSettingsTab
                    settings={settings.automation}
                    onUpdate={(key, value) => updateSetting("automation", key, value)}
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
              </Tabs>
            )}
          </section>
        </PortalShell>
      </div>

      {hasUnsavedChanges && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+9rem)] xl:left-[calc(50%+10rem)]">
          <div className="flex items-center gap-3 rounded-full border border-amber-400/40 bg-slate-900 px-4 py-2.5 text-white shadow-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-medium">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Unsaved changes
            </span>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="h-8 gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsShortcutCard({ item, href }: { item: SettingsShortcut; href: string }) {
  const Icon = item.icon;
  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
            {item.source}
          </span>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={href}>
              Open
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
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
      finalOrderChangeDays: numberOr(company.amendment_cutoff_days, fallback.financial.finalOrderChangeDays),
      cancellationFeePercent: numberOr(company.cancellation_fee_percent, fallback.financial.cancellationFeePercent),
      refundProcessDays: numberOr(company.refund_process_days, fallback.financial.refundProcessDays),
    },
  };
}

function readLocalSettings(companyId: string): AdminSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const keys = [`admin_settings.${companyId}`, "admin_settings"];
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
    window.localStorage.setItem("admin_settings", json);
  } catch {
    // Local cache is only a compatibility mirror. The DB save already succeeded.
  }
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
