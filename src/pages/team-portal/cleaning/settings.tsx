import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Loader2, Camera, AlertTriangle, ListChecks } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Settings {
  photoRequiredForVerify: boolean;
  photoRequiredForDamage: boolean;
  autoBillMissing: boolean;
  defaultDailyTime: string;
  defaultReplacementCostMultiplier: number;
  notifyAdminOnDamage: boolean;
  notifyShoppingOnLowStock: boolean;
  damageThresholdR: number;
}

const DEFAULTS: Settings = {
  photoRequiredForVerify: false,
  photoRequiredForDamage: true,
  autoBillMissing: true,
  defaultDailyTime: "09:00",
  defaultReplacementCostMultiplier: 1.0,
  notifyAdminOnDamage: true,
  notifyShoppingOnLowStock: true,
  damageThresholdR: 500,
};

const storageKey = (companyId: string) => `cms_cleaning_settings_${companyId}`;

export default function CleaningSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey(user.company_id));
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, [user?.company_id]);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const save = () => {
    if (!user?.company_id) return;
    setSaving(true);
    try {
      localStorage.setItem(storageKey(user.company_id), JSON.stringify(settings));
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setSettings(DEFAULTS);
    toast({ title: "Reset to defaults", description: "Click Save to persist" });
  };

  return (
    <>
      <Head><title>Cleaning Settings - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
                <SettingsIcon className="h-7 w-7 text-cyan-600" />
                Cleaning Settings
              </h1>
              <p className="text-sm text-slate-600 mt-1">Configure cleaning workflow defaults for this catering company</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetDefaults}>Reset</Button>
              <Button size="sm" onClick={save} disabled={saving || !loaded} className="bg-cyan-600 hover:bg-cyan-700">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : <><Save className="h-4 w-4 mr-2" />Save</>}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4 text-cyan-600" />Photo evidence <InfoTooltip content="Forces a photo upload before staff can finish equipment verification or damage reports. Source: localStorage cms_cleaning_settings_<companyId>." /></CardTitle>
                <CardDescription>Force staff to attach a photo when verifying or reporting damage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="prv">Require photo on equipment verification</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Verification cannot save without a photo of returned items</p>
                  </div>
                  <Switch id="prv" checked={settings.photoRequiredForVerify} onCheckedChange={(v) => update("photoRequiredForVerify", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="prd">Require photo on damage report</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Damage reports cannot save without photographic evidence</p>
                  </div>
                  <Switch id="prd" checked={settings.photoRequiredForDamage} onCheckedChange={(v) => update("photoRequiredForDamage", v)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Damage and billing <InfoTooltip content="Drives how missing or damaged items get costed and which damage reports auto-escalate to the company admin. Source: localStorage cms_cleaning_settings_<companyId>." /></CardTitle>
                <CardDescription>How missing or damaged items get costed and reported</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="abm">Auto-bill client for missing items</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Missing items charged at replacement cost on the order's invoice</p>
                  </div>
                  <Switch id="abm" checked={settings.autoBillMissing} onCheckedChange={(v) => update("autoBillMissing", v)} />
                </div>
                <div>
                  <Label htmlFor="cost-mult">Replacement cost multiplier</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Multiplier applied to base replacement_cost when billing -- e.g. 1.0 for cost, 1.5 to recover handling</p>
                  <Input id="cost-mult" type="number" step="0.01" min="0" value={settings.defaultReplacementCostMultiplier}
                    onChange={(e) => update("defaultReplacementCostMultiplier", Number(e.target.value))} className="w-32" />
                </div>
                <div>
                  <Label htmlFor="dmg-thr">Auto-escalate damage threshold (R)</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Damage reports above this value notify the company admin immediately</p>
                  <Input id="dmg-thr" type="number" min="0" step="100" value={settings.damageThresholdR}
                    onChange={(e) => update("damageThresholdR", Number(e.target.value))} className="w-32" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="adn">Notify admin on damage report</Label>
                    <p className="text-xs text-slate-500 mt-0.5">Push a notification to the company admin's portal whenever damage is logged</p>
                  </div>
                  <Switch id="adn" checked={settings.notifyAdminOnDamage} onCheckedChange={(v) => update("notifyAdminOnDamage", v)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-emerald-600" />Schedules + supplies <InfoTooltip content="Defaults applied when creating new cleaning schedules and the trigger that pings shopping when consumables hit par. Source: localStorage cms_cleaning_settings_<companyId>." /></CardTitle>
                <CardDescription>Defaults for new schedules and the low-stock signal</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="ddt">Default daily start time</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Pre-fills the time field when creating a new daily schedule</p>
                  <Input id="ddt" type="time" value={settings.defaultDailyTime} onChange={(e) => update("defaultDailyTime", e.target.value)} className="w-32" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="nso">Notify shopping team on low cleaning supplies</Label>
                    <p className="text-xs text-slate-500 mt-0.5">When a cleaning consumable hits par, push to the shopping portal</p>
                  </div>
                  <Switch id="nso" checked={settings.notifyShoppingOnLowStock} onCheckedChange={(v) => update("notifyShoppingOnLowStock", v)} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-4 text-xs text-slate-600">
                Settings stored locally per company until a `companies.cleaning_settings` JSON column is added. Your toggles will persist on this device but won't sync to other staff devices yet -- this is on the running todo for Phase 2.
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
