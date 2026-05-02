/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /team-portal/kitchen/settings -- knobs that drive the kitchen's
 * production timing + shift safety prompts.
 *
 * Storage: companies.kitchen_settings jsonb. The kitchenPrepService
 * already reads this column for prep timing; this page is the only
 * UI that writes it. New shift-safety knobs (overtime warn after,
 * meal break after, hot hold cap) live in the same blob keyed by
 * snake_case so the existing reader keeps working.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Clock, Flame, ChefHat, AlertTriangle, Save, Loader2 } from "lucide-react";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface KitchenSettings {
  // Production timing
  prep_safety_buffer_min: number;
  default_prep_min_per_dish: number;
  default_cook_min_per_dish: number;
  auto_generate_prep_tasks: boolean;
  // Shift safety
  overtime_after_hours: number;
  meal_break_after_hours: number;
  max_hot_hold_min: number;
  // Dietary alerts
  dietary_alert_high_severity_threshold: number;
}

const DEFAULTS: KitchenSettings = {
  prep_safety_buffer_min: 30,
  default_prep_min_per_dish: 15,
  default_cook_min_per_dish: 30,
  auto_generate_prep_tasks: true,
  overtime_after_hours: 9,
  meal_break_after_hours: 5,
  max_hot_hold_min: 90,
  dietary_alert_high_severity_threshold: 1,
};

export default function KitchenSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = (user as any)?.company_id as string | undefined;

  const [settings, setSettings] = useState<KitchenSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("companies")
        .select("kitchen_settings")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      const raw = (data as any)?.kitchen_settings || {};
      setSettings({
        prep_safety_buffer_min:    Number(raw.prep_safety_buffer_min    ?? DEFAULTS.prep_safety_buffer_min),
        default_prep_min_per_dish: Number(raw.default_prep_min_per_dish ?? DEFAULTS.default_prep_min_per_dish),
        default_cook_min_per_dish: Number(raw.default_cook_min_per_dish ?? DEFAULTS.default_cook_min_per_dish),
        auto_generate_prep_tasks:  Boolean(raw.auto_generate_prep_tasks ?? DEFAULTS.auto_generate_prep_tasks),
        overtime_after_hours:      Number(raw.overtime_after_hours      ?? DEFAULTS.overtime_after_hours),
        meal_break_after_hours:    Number(raw.meal_break_after_hours    ?? DEFAULTS.meal_break_after_hours),
        max_hot_hold_min:          Number(raw.max_hot_hold_min          ?? DEFAULTS.max_hot_hold_min),
        dietary_alert_high_severity_threshold: Number(raw.dietary_alert_high_severity_threshold ?? DEFAULTS.dietary_alert_high_severity_threshold),
      });
      setLoading(false);
      setDirty(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const update = <K extends keyof KitchenSettings>(key: K, value: KitchenSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("companies")
        .update({ kitchen_settings: settings })
        .eq("id", companyId);
      if (error) throw error;
      toast({ title: "Kitchen settings saved" });
      setDirty(false);
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Kitchen Settings - CateringMS</title></Head>
      <KitchenNav />

      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-3xl">

          <div className="mb-6 flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Kitchen Settings</h1>
              <p className="text-sm text-slate-600 mt-1">
                Tune the prep + shift defaults the kitchen runs on.
              </p>
            </div>
          </div>

          {loading ? (
            <Card className="border-0 shadow"><CardContent className="py-16 text-center text-slate-500">
              <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading settings...
            </CardContent></Card>
          ) : (
            <div className="space-y-4">

              {/* Production timing */}
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-orange-600" />
                    Production timing
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Defaults the prep-task generator falls back to when a menu item doesn&apos;t have its own prep / cook time set.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />Default prep time (min/dish)
                        <InfoTooltip content="How long to prep one portion of a menu item that has no recipe-level prep time. Used to size the prep tasks the kitchen sees." />
                      </Label>
                      <Input
                        type="number" min="0" step="1"
                        value={settings.default_prep_min_per_dish}
                        onChange={(e) => update("default_prep_min_per_dish", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />Default cook time (min/dish)
                        <InfoTooltip content="Per-dish cook time fallback when a menu item has no cook_time_minutes set." />
                      </Label>
                      <Input
                        type="number" min="0" step="1"
                        value={settings.default_cook_min_per_dish}
                        onChange={(e) => update("default_cook_min_per_dish", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />Safety buffer (min before pickup)
                        <InfoTooltip content="Finish all prep this many minutes before pickup so the kitchen never runs to the wire. Default 30 min." />
                      </Label>
                      <Input
                        type="number" min="0" step="5"
                        value={settings.prep_safety_buffer_min}
                        onChange={(e) => update("prep_safety_buffer_min", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                        <Flame className="w-3 h-3" />Max hot hold (min)
                        <InfoTooltip content="Warn when a ready order has been sitting under the heat lamp for longer than this. Helps prevent food-safety issues." />
                      </Label>
                      <Input
                        type="number" min="0" step="5"
                        value={settings.max_hot_hold_min}
                        onChange={(e) => update("max_hot_hold_min", Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">Auto-generate prep tasks</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        When a confirmed order lands, automatically split it into prep / cook / pack tasks on the kitchen schedule.
                      </p>
                    </div>
                    <Switch
                      checked={settings.auto_generate_prep_tasks}
                      onCheckedChange={(v: boolean) => update("auto_generate_prep_tasks", v)}
                    />
                  </label>
                </CardContent>
              </Card>

              {/* Shift safety */}
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Shift safety prompts
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Triggers the kitchen tablet uses to nudge staff about overtime + breaks. BCEA-aligned.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                        Overtime warn after (h)
                        <InfoTooltip content="Show an overtime warning on the duty board after this many worked hours in one shift. Default 9 (BCEA ordinary day)." />
                      </Label>
                      <Input
                        type="number" min="0" step="0.5"
                        value={settings.overtime_after_hours}
                        onChange={(e) => update("overtime_after_hours", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                        Break prompt after (h)
                        <InfoTooltip content="Prompt the staff member to log a break after they've been on shift this many hours without one. Default 5 (BCEA s14)." />
                      </Label>
                      <Input
                        type="number" min="0" step="0.5"
                        value={settings.meal_break_after_hours}
                        onChange={(e) => update("meal_break_after_hours", Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Dietary alerts */}
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Dietary alert thresholds
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Surface dietary flags loudly when an order has at least this many high-severity tags (allergen / strict halal / strict kosher).
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-w-xs">
                    <Label className="text-xs uppercase tracking-wide text-slate-700">High-severity flag count</Label>
                    <Input
                      type="number" min="0" step="1"
                      value={settings.dietary_alert_high_severity_threshold}
                      onChange={(e) => update("dietary_alert_high_severity_threshold", Number(e.target.value) || 0)}
                    />
                    <p className="text-[11px] text-slate-500">
                      Set to 0 to surface every dietary flag. Set to 1 (default) to only flag when at least one allergen / strict-religious tag is present.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Save bar */}
              <div className="sticky bottom-3 flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
                </Button>
              </div>

            </div>
          )}
        </div>
      </main>
    </>
  );
}
