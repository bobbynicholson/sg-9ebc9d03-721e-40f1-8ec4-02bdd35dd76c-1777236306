/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * KitchenRulesPanel - shared kitchen-settings form.
 *
 * Extracted from src/pages/admin/kitchen-settings.tsx in TIGHTEN I.30
 * (admin.md section 7 follow-up #5) so the same form can mount in two
 * places without duplication:
 *
 *   - /admin/kitchen-settings: the standalone page (legacy + Settings
 *     nav entry point).
 *   - /admin/teams/kitchen "Kitchen rules" tab: the IA-correct home
 *     per admin.md - kitchen rules are operational, not configuration,
 *     so they belong on the Kitchen team landing alongside the team
 *     management.
 *
 * Self-contained: own state, own load + save, own dirty / saved chips,
 * own beforeunload guard. Mount it anywhere; no caller plumbing.
 *
 * Storage unchanged: companies.kitchen_settings jsonb. The kitchen
 * runtime (kitchenPrepService, dashboard widgets) reads the same
 * column, so this refactor is UI-only.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Clock, Flame, ChefHat, AlertTriangle, Save, Loader2, ShieldCheck,
  RotateCcw, CheckCircle2,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

export interface KitchenSettings {
  // Production timing
  prep_safety_buffer_min: number;
  default_prep_min_per_dish: number;
  default_cook_min_per_dish: number;
  auto_generate_prep_tasks: boolean;
  // Shift safety
  overtime_after_hours: number;
  meal_break_after_hours: number;
  max_hot_hold_min: number;
}

export const KITCHEN_RULES_DEFAULTS: KitchenSettings = {
  prep_safety_buffer_min: 30,
  default_prep_min_per_dish: 15,
  default_cook_min_per_dish: 30,
  auto_generate_prep_tasks: true,
  overtime_after_hours: 9,
  meal_break_after_hours: 5,
  max_hot_hold_min: 90,
};

// KS-B (task #220, 2026-05-25): per-field clamp bounds. Each row is
// `[min, max]` with a sensible food-service maximum so a tenant
// can't ship 99999-minute prep times. clamp() is applied on every
// onChange so the value in state is always valid.
const BOUNDS: Record<keyof Omit<KitchenSettings, "auto_generate_prep_tasks">, [number, number]> = {
  prep_safety_buffer_min:    [0, 180],   // 3-hour buffer ceiling
  default_prep_min_per_dish: [0, 240],   // 4 hours / portion ceiling
  default_cook_min_per_dish: [0, 240],
  overtime_after_hours:      [1, 24],    // BCEA ordinary day is 9
  meal_break_after_hours:    [1, 12],    // BCEA s14 is 5h
  max_hot_hold_min:          [0, 240],   // SA food-safety ceiling 4h
};
const clamp = (key: keyof typeof BOUNDS, raw: number): number => {
  const [min, max] = BOUNDS[key];
  if (!Number.isFinite(raw)) return min;
  return Math.max(min, Math.min(max, raw));
};

interface Props {
  /** TIGHTEN I.30: optional context-banner override. Default copy reads
   *  as the standalone page; teams/kitchen overrides with a "you're
   *  editing live kitchen rules" note that fits the tab context. */
  contextNote?: string;
}

export function KitchenRulesPanel({ contextNote }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = (user as { company_id?: string } | null)?.company_id;

  const [settings, setSettings] = useState<KitchenSettings>(KITCHEN_RULES_DEFAULTS);
  const [loading, setLoading] = useState(true);
  // Surfaced load failure. Pre-fix a failed kitchen_settings read only
  // toasted, then rendered the form seeded with the platform defaults
  // and dirty=false. One Save from that state clobbered the tenant's
  // real saved rules with defaults. While loadError is set the form is
  // replaced by an error card with Retry, same gate pattern as
  // /admin/white-label and /admin/email-settings.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("kitchen_settings")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        captureException(error, {
          tags: { component: "KitchenRulesPanel", step: "load", companyId },
        });
        const msg = dbErrorMessage(error, { entity: "kitchen rule" });
        toast({ title: "Couldn't load settings", description: msg, variant: "destructive" });
        // Do NOT seed the form with defaults here. Keep the panel in
        // the error state so a Save can't overwrite the tenant's real
        // saved kitchen_settings with platform defaults.
        setLoadError(msg || "Could not load kitchen rules.");
        setLoading(false);
        return;
      }
      const raw = (data as any)?.kitchen_settings || {};
      setSettings({
        prep_safety_buffer_min:    clamp("prep_safety_buffer_min",    Number(raw.prep_safety_buffer_min    ?? KITCHEN_RULES_DEFAULTS.prep_safety_buffer_min)),
        default_prep_min_per_dish: clamp("default_prep_min_per_dish", Number(raw.default_prep_min_per_dish ?? KITCHEN_RULES_DEFAULTS.default_prep_min_per_dish)),
        default_cook_min_per_dish: clamp("default_cook_min_per_dish", Number(raw.default_cook_min_per_dish ?? KITCHEN_RULES_DEFAULTS.default_cook_min_per_dish)),
        auto_generate_prep_tasks:  Boolean(raw.auto_generate_prep_tasks ?? KITCHEN_RULES_DEFAULTS.auto_generate_prep_tasks),
        overtime_after_hours:      clamp("overtime_after_hours",      Number(raw.overtime_after_hours      ?? KITCHEN_RULES_DEFAULTS.overtime_after_hours)),
        meal_break_after_hours:    clamp("meal_break_after_hours",    Number(raw.meal_break_after_hours    ?? KITCHEN_RULES_DEFAULTS.meal_break_after_hours)),
        max_hot_hold_min:          clamp("max_hot_hold_min",          Number(raw.max_hot_hold_min          ?? KITCHEN_RULES_DEFAULTS.max_hot_hold_min)),
      });
      setLoading(false);
      setDirty(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, toast, reloadKey]);

  // Beforeunload guard while dirty.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = <K extends keyof KitchenSettings>(key: K, value: KitchenSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updateNumber = (key: keyof typeof BOUNDS, raw: string) => {
    const parsed = raw === "" ? BOUNDS[key][0] : Number(raw);
    const clamped = clamp(key, parsed);
    update(key as keyof KitchenSettings, clamped as KitchenSettings[keyof KitchenSettings]);
  };

  const handleSave = async () => {
    if (!companyId) return;
    // Belt and braces: the form is unmounted while loadError is set,
    // but never allow a save when the last load failed. Saving from
    // that state would write the default seed over the real settings.
    if (loadError) return;
    setSaving(true);
    try {
      // Read-merge-write. The old code wrote `settings` (only the known
      // interface keys) straight over the jsonb, which erased any
      // out-of-band key not on the form - e.g. prep_parallelism, set
      // directly in SQL and read by kitchenPrepService for the batch cap.
      // Merge over the current value so unknown keys survive a save.
      // Mirrors kitchenPrepService.updateKitchenSettings (the service path).
      const { data: current, error: readErr } = await (supabase as any)
        .from("companies")
        .select("kitchen_settings")
        .eq("id", companyId)
        .maybeSingle();
      if (readErr) throw readErr;
      const existing =
        current?.kitchen_settings && typeof current.kitchen_settings === "object"
          ? current.kitchen_settings
          : {};
      const merged = { ...existing, ...settings };
      const { error } = await (supabase as any)
        .from("companies")
        .update({ kitchen_settings: merged })
        .eq("id", companyId);
      if (error) throw error;

      // Audit-log the change so the policy trail is preserved. Owners
      // changing BCEA thresholds is a labour-compliance event.
      try {
        await (supabase as any).from("audit_logs").insert({
          company_id: companyId,
          user_id: (user as { id?: string } | null)?.id,
          action: "kitchen_settings_updated",
          entity_type: "company",
          entity_id: companyId,
          details: { settings },
        });
      } catch { /* non-blocking */ }

      toast({ title: "Kitchen rules saved", description: "Kitchen staff will see the new values on next page load." });
      setDirty(false);
      setLastSavedAt(new Date());
    } catch (e: any) {
      captureException(e, {
        tags: { component: "KitchenRulesPanel", step: "save", companyId: companyId || "" },
      });
      toast({ title: "Couldn't save", description: dbErrorMessage(e, { entity: "kitchen rule" }), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!window.confirm(
      "Reset every kitchen rule to the platform defaults?\n\n"
      + "This doesn't save until you hit Save changes - you can still back out.",
    )) return;
    setSettings(KITCHEN_RULES_DEFAULTS);
    setDirty(true);
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm text-slate-600">
            Tune the prep + shift defaults the kitchen runs on. Owner / admin
            only - kitchen staff see the effects but can&apos;t change the values.
          </p>
        </div>
        {!loading && !loadError && (dirty ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 self-start">
            <AlertTriangle className="w-3 h-3" /> Unsaved changes
          </span>
        ) : lastSavedAt ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20 self-start">
            <CheckCircle2 className="w-3 h-3" /> Just saved
          </span>
        ) : null)}
      </div>

      {contextNote && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 flex items-start gap-2 text-xs text-blue-900">
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-700" />
          <p>{contextNote}</p>
        </div>
      )}

      {loading ? (
        <Card className="border-0 shadow"><CardContent className="py-16 text-center text-slate-500">
          <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading kitchen rules...
        </CardContent></Card>
      ) : loadError ? (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto text-rose-500" />
            <p className="font-medium text-slate-900 mt-3">Couldn&apos;t load your kitchen rules</p>
            <p className="text-sm text-slate-600 mt-1">{loadError}</p>
            <p className="text-xs text-slate-500 mt-2">
              Editing is blocked until the saved values load, so a save can&apos;t
              overwrite your real rules with platform defaults.
            </p>
            <Button variant="outline" className="mt-4 bg-white" onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">

          {/* Production timing */}
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-brand-primary" />
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
                    type="number" min={BOUNDS.default_prep_min_per_dish[0]} max={BOUNDS.default_prep_min_per_dish[1]} step="1"
                    value={settings.default_prep_min_per_dish}
                    onChange={(e) => updateNumber("default_prep_min_per_dish", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                    <Clock className="w-3 h-3" />Default cook time (min/dish)
                    <InfoTooltip content="Per-dish cook time fallback when a menu item has no cook_time_minutes set." />
                  </Label>
                  <Input
                    type="number" min={BOUNDS.default_cook_min_per_dish[0]} max={BOUNDS.default_cook_min_per_dish[1]} step="1"
                    value={settings.default_cook_min_per_dish}
                    onChange={(e) => updateNumber("default_cook_min_per_dish", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                    <Clock className="w-3 h-3" />Safety buffer (min before pickup)
                    <InfoTooltip content="Finish all prep this many minutes before pickup so the kitchen never runs to the wire. Default 30 min." />
                  </Label>
                  <Input
                    type="number" min={BOUNDS.prep_safety_buffer_min[0]} max={BOUNDS.prep_safety_buffer_min[1]} step="5"
                    value={settings.prep_safety_buffer_min}
                    onChange={(e) => updateNumber("prep_safety_buffer_min", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                    <Flame className="w-3 h-3" />Max hot hold (min)
                    <InfoTooltip content="Warn when a ready order has been sitting under the heat lamp for longer than this. SA food-safety guidance caps hot hold at 4 hours; default 90 minutes." />
                  </Label>
                  <Input
                    type="number" min={BOUNDS.max_hot_hold_min[0]} max={BOUNDS.max_hot_hold_min[1]} step="5"
                    value={settings.max_hot_hold_min}
                    onChange={(e) => updateNumber("max_hot_hold_min", e.target.value)}
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
              {!settings.auto_generate_prep_tasks && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <p>
                    Auto-generation is off. New confirmed orders will land on the kitchen
                    schedule without prep tasks - someone has to manually create them from
                    the kitchen portal. Existing tasks stay in place.
                  </p>
                </div>
              )}
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
                    type="number" min={BOUNDS.overtime_after_hours[0]} max={BOUNDS.overtime_after_hours[1]} step="0.5"
                    value={settings.overtime_after_hours}
                    onChange={(e) => updateNumber("overtime_after_hours", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-slate-700 flex items-center gap-1">
                    Break prompt after (h)
                    <InfoTooltip content="Prompt the staff member to log a break after they've been on shift this many hours without one. Default 5 (BCEA s14)." />
                  </Label>
                  <Input
                    type="number" min={BOUNDS.meal_break_after_hours[0]} max={BOUNDS.meal_break_after_hours[1]} step="0.5"
                    value={settings.meal_break_after_hours}
                    onChange={(e) => updateNumber("meal_break_after_hours", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save bar */}
          <div className="sticky bottom-3 flex justify-end gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={handleResetDefaults}
              disabled={saving}
              className="bg-white shadow-lg"
              title="Reset every kitchen rule to the platform defaults. You still have to Save."
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Reset to defaults
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-brand-primary text-white shadow-lg hover:bg-brand-primary/90"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}
