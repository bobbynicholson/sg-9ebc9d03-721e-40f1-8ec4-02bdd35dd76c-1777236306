import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, Loader2, Camera, AlertTriangle, ListChecks, MonitorSmartphone, Cloud } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/app";
import {
  CleaningSettings as Settings,
  CLEANING_SETTINGS_DEFAULTS as DEFAULTS,
  getCleaningSettings,
  saveCleaningSettings,
} from "@/services/cleaningSettingsService";

function CleaningSettingsPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // Whether the loaded/saved value lives in the shared DB column (synced
  // to every device) vs the local cache (pre-migration fallback).
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { settings: loadedSettings, synced: isSynced } = await getCleaningSettings(user.company_id);
      if (cancelled) return;
      setSettings(loadedSettings);
      setSynced(isSynced);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const save = async () => {
    if (!user?.company_id || saving) return;
    setSaving(true);
    try {
      const res = await saveCleaningSettings(user.company_id, settings);
      setSynced(res.synced);
      toast({
        title: "Settings saved",
        description: res.synced ? "Applied for every cleaning device." : "Saved on this device (company sync pending migration).",
      });
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
    <CleaningPageShell
      pageTitle="Cleaning settings - CateringMS"
      heading="Settings"
      subheading="Configure cleaning workflow defaults for this catering company."
      icon={SettingsIcon}
      width="narrow"
      headerAction={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetDefaults} disabled={!loaded}>Reset</Button>
          <Button size="sm" onClick={save} disabled={saving || !loaded} className="bg-brand-primary hover:bg-brand-primary/90">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : <><Save className="h-4 w-4 mr-2" />Save</>}
          </Button>
        </div>
      }
      meta={
        loaded ? (
          <span className={CLEANING_HERO_CHIP}>
            {synced ? <Cloud className="h-3 w-3" /> : <MonitorSmartphone className="h-3 w-3" />}
            {synced ? "Synced company-wide" : "Saved on this device"}
          </span>
        ) : undefined
      }
    >
      {!loaded ? (
        // Standing rule: never flash defaults over the user's saved
        // values. Hold the form until the local read settles.
        <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading settings">
          <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-slate-400" />
        </div>
      ) : (
        <div className="space-y-4">
          <PortalCard>
            <div className="mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Camera className="h-4 w-4 text-slate-400 dark:text-slate-500" />Photo evidence
                <InfoTooltip content="Forces staff to attach a photo before they can finish an equipment check or a damage report.\n\nSaved on this device only." />
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Force staff to attach a photo when verifying or reporting damage</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <Label htmlFor="prv" className="text-slate-900 dark:text-white">Require photo on equipment verification</Label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Verification cannot save without a photo of returned items</p>
                </div>
                <Switch id="prv" checked={settings.photoRequiredForVerify} onCheckedChange={(v) => update("photoRequiredForVerify", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <Label htmlFor="prd" className="text-slate-900 dark:text-white">Require photo on damage report</Label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Damage reports cannot save without photographic evidence</p>
                </div>
                <Switch id="prd" checked={settings.photoRequiredForDamage} onCheckedChange={(v) => update("photoRequiredForDamage", v)} />
              </div>
            </div>
          </PortalCard>

          <PortalCard>
            <div className="mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />Damage and billing
                <InfoTooltip content="Controls how missing or damaged items get costed, and which damage reports get pushed straight to the company admin.\n\nSaved on this device only." />
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">How missing or damaged items get costed and reported</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <Label htmlFor="abm" className="text-slate-900 dark:text-white">Auto-bill client for missing items</Label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Missing items charged at replacement cost on the order's invoice</p>
                </div>
                <Switch id="abm" checked={settings.autoBillMissing} onCheckedChange={(v) => update("autoBillMissing", v)} />
              </div>
              <div>
                <Label htmlFor="cost-mult" className="text-slate-900 dark:text-white">Replacement cost multiplier</Label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-2">Multiplier applied to base replacement_cost when billing, e.g. 1.0 for cost, 1.5 to recover handling</p>
                <Input id="cost-mult" type="number" step="0.01" min="0" value={settings.defaultReplacementCostMultiplier}
                  onChange={(e) => update("defaultReplacementCostMultiplier", Number(e.target.value))} className="w-32" />
              </div>
              <div>
                <Label htmlFor="dmg-thr" className="text-slate-900 dark:text-white">Auto-escalate damage threshold (R)</Label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-2">Damage reports above this value notify the company admin immediately</p>
                <Input id="dmg-thr" type="number" min="0" step="100" value={settings.damageThresholdR}
                  onChange={(e) => update("damageThresholdR", Number(e.target.value))} className="w-32" />
              </div>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <Label htmlFor="adn" className="text-slate-900 dark:text-white">Notify admin on damage report</Label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Push a notification to the company admin's portal whenever damage is logged</p>
                </div>
                <Switch id="adn" checked={settings.notifyAdminOnDamage} onCheckedChange={(v) => update("notifyAdminOnDamage", v)} />
              </div>
            </div>
          </PortalCard>

          <PortalCard>
            <div className="mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <ListChecks className="h-4 w-4 text-slate-400 dark:text-slate-500" />Schedules + supplies
                <InfoTooltip content="Defaults used when you create a new cleaning schedule, plus the alert that goes to shopping when supplies run low.\n\nSaved on this device only." />
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Defaults for new schedules and the low-stock signal</p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="ddt" className="text-slate-900 dark:text-white">Default daily start time</Label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-2">Pre-fills the time field when creating a new daily schedule</p>
                <Input id="ddt" type="time" value={settings.defaultDailyTime} onChange={(e) => update("defaultDailyTime", e.target.value)} className="w-32" />
              </div>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <Label htmlFor="nso" className="text-slate-900 dark:text-white">Notify shopping team on low cleaning supplies</Label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">When a cleaning consumable hits par, push to the shopping portal</p>
                </div>
                <Switch id="nso" checked={settings.notifyShoppingOnLowStock} onCheckedChange={(v) => update("notifyShoppingOnLowStock", v)} />
              </div>
            </div>
          </PortalCard>

          <PortalCard className="bg-slate-50 dark:bg-slate-800/50">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {synced
                ? "Saved to this catering company and applied on every cleaning device. The default schedule time and low-stock / damage notifications read these values live."
                : "Saved on this device for now. Company-wide sync switches on automatically once the cleaning_settings migration is applied."}
            </p>
          </PortalCard>
        </div>
      )}
    </CleaningPageShell>
  );
}

export default function CleaningSettingsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningSettingsPageInner />
    </ProtectedRoute>
  );
}
