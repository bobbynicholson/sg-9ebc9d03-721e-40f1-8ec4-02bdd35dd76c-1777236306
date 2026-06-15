import { useState, useEffect } from "react";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Loader2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ShopSettings {
  receiptRequiredOnComplete: boolean;
  varianceAlertPct: number;
  autoNotifyOnLowStock: boolean;
  defaultLeadTimeDays: number;
  preferRatedSuppliers: boolean;
  autoCreateListFromUpcoming: boolean;
  upcomingHorizonDays: number;
  notifyAdminOnVariance: boolean;
}

const DEFAULTS: ShopSettings = {
  receiptRequiredOnComplete: true,
  varianceAlertPct: 15,
  autoNotifyOnLowStock: true,
  defaultLeadTimeDays: 2,
  preferRatedSuppliers: true,
  autoCreateListFromUpcoming: false,
  upcomingHorizonDays: 7,
  notifyAdminOnVariance: true,
};

const storageKey = (companyId: string) => `cms_shopping_settings_${companyId}`;

export default function ShoppingSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<ShopSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey(user.company_id));
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, [user?.company_id]);

  const update = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const save = () => {
    if (!user?.company_id) return;
    setSaving(true);
    try {
      localStorage.setItem(storageKey(user.company_id), JSON.stringify(settings));
      toast({ title: "Settings saved" });
    } catch { toast({ title: "Could not save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Head><title>Shopping settings - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      {/* Nav-offset wrapper: leaves room for the fixed ShoppingNav, then the
          shared PortalShell carries the neutral ground + centred column. */}
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell width="narrow" className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Shopping settings"
            subtitle="Procurement defaults for this catering company"
            icon={SettingsIcon}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setSettings(DEFAULTS)}
                >
                  Reset to defaults
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving || !loaded}
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : <><Save className="h-4 w-4 mr-2" />Save changes</>}
                </Button>
              </>
            }
          />

          <div className="space-y-5">
            {/* Group: Purchase runs */}
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Purchase runs
                    <InfoTooltip content="Defaults used when a new shopping list is created, receipts, auto-generation window, lead time.\n\nSaved on this device only." />
                  </span>
                }
              />
              <p className="-mt-2 mb-4 text-sm text-slate-600 dark:text-slate-400">Defaults for shopping lists and procurement runs</p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="flex items-start justify-between gap-4 pb-4">
                  <div className="min-w-0">
                    <Label htmlFor="rrc" className="text-slate-700 dark:text-slate-200">Require receipt to mark a list complete</Label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Lists cannot be set to completed without a receipt URL</p>
                  </div>
                  <Switch id="rrc" checked={settings.receiptRequiredOnComplete} onCheckedChange={(v) => update("receiptRequiredOnComplete", v)} />
                </div>
                <div className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <Label htmlFor="acu" className="text-slate-700 dark:text-slate-200">Auto-create lists from upcoming events</Label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Generate a draft shopping list from confirmed orders within the horizon</p>
                  </div>
                  <Switch id="acu" checked={settings.autoCreateListFromUpcoming} onCheckedChange={(v) => update("autoCreateListFromUpcoming", v)} />
                </div>
                <div className="py-4">
                  <Label htmlFor="uh" className="text-slate-700 dark:text-slate-200">Upcoming events horizon (days)</Label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 mb-2">How many days ahead to scan for procurement work</p>
                  <Input id="uh" type="number" min="1" max="60" value={settings.upcomingHorizonDays} onChange={(e) => update("upcomingHorizonDays", Number(e.target.value))} className="w-32" />
                </div>
                <div className="pt-4">
                  <Label htmlFor="lt" className="text-slate-700 dark:text-slate-200">Default lead time (days)</Label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 mb-2">When ordering from a supplier, days needed before delivery</p>
                  <Input id="lt" type="number" min="0" max="30" value={settings.defaultLeadTimeDays} onChange={(e) => update("defaultLeadTimeDays", Number(e.target.value))} className="w-32" />
                </div>
              </div>
            </PortalCard>

            {/* Group: Variance + budget */}
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Variance + budget
                    <InfoTooltip content="Sets when a shopping run gets flagged as over budget and whether the admin gets a notification.\n\nSaved on this device only." />
                  </span>
                }
              />
              <p className="-mt-2 mb-4 text-sm text-slate-600 dark:text-slate-400">Triggers for price-variance alerts</p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="pb-4">
                  <Label htmlFor="va" className="text-slate-700 dark:text-slate-200">Variance alert threshold (%)</Label>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 mb-2">Alert when actual spend exceeds estimate by this percentage</p>
                  <Input id="va" type="number" min="0" max="100" value={settings.varianceAlertPct} onChange={(e) => update("varianceAlertPct", Number(e.target.value))} className="w-32" />
                </div>
                <div className="flex items-start justify-between gap-4 pt-4">
                  <div className="min-w-0">
                    <Label htmlFor="nav" className="text-slate-700 dark:text-slate-200">Notify admin on variance breach</Label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Push alert to company admin when a list goes over the threshold</p>
                  </div>
                  <Switch id="nav" checked={settings.notifyAdminOnVariance} onCheckedChange={(v) => update("notifyAdminOnVariance", v)} />
                </div>
              </div>
            </PortalCard>

            {/* Group: Suppliers + alerts */}
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Suppliers + alerts
                    <InfoTooltip content="How suppliers get ranked, plus the alert that fires when stock runs low.\n\nSaved on this device only." />
                  </span>
                }
              />
              <p className="-mt-2 mb-4 text-sm text-slate-600 dark:text-slate-400">Supplier preferences and notifications</p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="flex items-start justify-between gap-4 pb-4">
                  <div className="min-w-0">
                    <Label htmlFor="prs" className="text-slate-700 dark:text-slate-200">Prefer rated suppliers (rating greater-than-equal-to 4)</Label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Recommend high-rated suppliers first when generating lists</p>
                  </div>
                  <Switch id="prs" checked={settings.preferRatedSuppliers} onCheckedChange={(v) => update("preferRatedSuppliers", v)} />
                </div>
                <div className="flex items-start justify-between gap-4 pt-4">
                  <div className="min-w-0">
                    <Label htmlFor="anls" className="text-slate-700 dark:text-slate-200">Auto-notify on low stock</Label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">When inventory hits par, push a notification to this team</p>
                  </div>
                  <Switch id="anls" checked={settings.autoNotifyOnLowStock} onCheckedChange={(v) => update("autoNotifyOnLowStock", v)} />
                </div>
              </div>
            </PortalCard>

            {/* Storage note: calm, neutral, informational. */}
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 px-1">
              Settings are stored locally per company until a per-tenant settings table lands. Toggles persist on this device but won&apos;t sync across the team yet, on the running todo for Phase 2.
            </p>
          </div>
        </PortalShell>
      </div>
    </>
  );
}
