import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Save, AlertCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { dispatchService, type DispatchSettings } from "@/services/dispatchService";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Props {
  companyId?: string | null;
}

export function DispatchSettingsTab({ companyId: companyIdProp }: Props = {}) {
  const { toast } = useToast();
  const { user, profile } = useAuth() as any;
  const companyId = companyIdProp ?? profile?.company_id ?? user?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<DispatchSettings | null>(null);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    dispatchService.getDispatchSettings(companyId)
      .then(s => { setSettings(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [companyId]);

  if (loading || !settings) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-8 text-center text-sm text-slate-500">Loading...</CardContent>
      </Card>
    );
  }

  const updateWeight = (key: keyof DispatchSettings["weights"], value: number) => {
    setSettings({ ...settings, weights: { ...settings.weights, [key]: value } });
  };

  const totalWeight =
    settings.weights.distance + settings.weights.currentLoad + settings.weights.regionMatch +
    settings.weights.onTimeRate + settings.weights.rating;

  const handleSave = async () => {
    if (!companyId) { setError("No company on your profile."); return; }
    if (Math.abs(totalWeight - 1) > 0.01) {
      setError(`Weights must add up to 1.00 (currently ${totalWeight.toFixed(2)}).`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatchService.updateDispatchSettings(companyId, settings);
      toast({ title: "Dispatch settings saved" });
    } catch (e: any) {
      setError(e?.message ?? "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="px-4 md:px-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
          <Truck className="w-4 h-4 md:w-5 md:h-5" />
          Dispatch Settings
          <InfoTooltip content={"Controls how the dispatch queue behaves: when to flag orders red, how early drivers must arrive, and how the auto-suggest matcher weighs candidates."} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-4 md:px-6">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              SLA: assign within (minutes before event)
              <InfoTooltip content={"If an order is unassigned and its event is within this many minutes, the dispatch queue flags it red. Default 720 (12 hours)."} />
            </Label>
            <Input
              type="number"
              min="60"
              step="60"
              value={settings.slaAssignMinutes}
              onChange={e => setSettings({ ...settings, slaAssignMinutes: Number(e.target.value) })}
              className="tabular-nums"
            />
            <p className="text-xs text-slate-500">
              {(settings.slaAssignMinutes / 60).toFixed(1)} hours before event time
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              Arrival buffer (minutes before event)
              <InfoTooltip content={"Drivers must arrive at least this many minutes before event_time. Used by the feasibility check at assignment time."} />
            </Label>
            <Input
              type="number"
              min="0"
              step="5"
              value={settings.arrivalBufferMinutes}
              onChange={e => setSettings({ ...settings, arrivalBufferMinutes: Number(e.target.value) })}
              className="tabular-nums"
            />
            <p className="text-xs text-slate-500">
              Driver must be on-site at least {settings.arrivalBufferMinutes}m early
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <div className="mb-3">
            <Label className="text-sm md:text-base font-medium">Auto-batching thresholds</Label>
            <p className="text-xs text-slate-500 mt-0.5">
              Two unassigned orders close in distance and time can be sent on one trip. Plan Routes surfaces these as "Batch suggestions".
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                Max distance between orders (km)
                <InfoTooltip content={"Two orders further apart than this won't be suggested as a batch."} />
              </Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={settings.batchDistanceKm}
                onChange={e => setSettings({ ...settings, batchDistanceKm: Number(e.target.value) })}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                Max time gap (minutes)
                <InfoTooltip content={"Two orders with event times further apart than this won't be batched."} />
              </Label>
              <Input
                type="number"
                min="0"
                step="15"
                value={settings.batchTimeWindowMinutes}
                onChange={e => setSettings({ ...settings, batchTimeWindowMinutes: Number(e.target.value) })}
                className="tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <Label className="text-sm md:text-base font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Auto-suggest top drivers
              </Label>
              <p className="text-xs text-slate-500 mt-0.5">
                Show the dispatcher the top 3 ranked drivers in the assign dialog. One click to accept the top match.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoSuggestEnabled}
              onChange={e => setSettings({ ...settings, autoSuggestEnabled: e.target.checked })}
              className="w-5 h-5 accent-emerald-600 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between mb-1">
            <div>
              <Label className="text-sm md:text-base font-medium">Auto-commit top suggestion</Label>
              <p className="text-xs text-slate-500 mt-0.5">
                When enabled, the system auto-assigns the top-scored driver without asking. Requires auto-suggest to be on.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoAssignEnabled}
              onChange={e => setSettings({ ...settings, autoAssignEnabled: e.target.checked })}
              disabled={!settings.autoSuggestEnabled}
              className="w-5 h-5 accent-emerald-600 cursor-pointer disabled:opacity-30"
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <div className="mb-3">
            <Label className="text-sm md:text-base font-medium">Auto-suggest weights</Label>
            <p className="text-xs text-slate-500 mt-0.5">
              How the matcher ranks drivers per order. Each component is 0-1 normalised, weighted, summed. The five values must add up to 1.00.
            </p>
          </div>

          <div className="space-y-3">
            <WeightRow
              label="Distance"
              helper="Closer to venue scores higher (max 30km radius)"
              value={settings.weights.distance}
              onChange={v => updateWeight("distance", v)}
            />
            <WeightRow
              label="Current load"
              helper="Drivers with fewer jobs today score higher"
              value={settings.weights.currentLoad}
              onChange={v => updateWeight("currentLoad", v)}
            />
            <WeightRow
              label="Region match"
              helper="Driver covers the order's region"
              value={settings.weights.regionMatch}
              onChange={v => updateWeight("regionMatch", v)}
            />
            <WeightRow
              label="On-time rate"
              helper="Historical on-time delivery percentage"
              value={settings.weights.onTimeRate}
              onChange={v => updateWeight("onTimeRate", v)}
            />
            <WeightRow
              label="Driver rating"
              helper="Customer feedback rolling average"
              value={settings.weights.rating}
              onChange={v => updateWeight("rating", v)}
            />
          </div>

          <div className={`mt-3 px-3 py-2 rounded-md border text-sm ${
            Math.abs(totalWeight - 1) < 0.01
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            Total: <span className="font-semibold tabular-nums">{totalWeight.toFixed(2)}</span>
            {Math.abs(totalWeight - 1) > 0.01 && <span> (must equal 1.00)</span>}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save dispatch settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeightRow({
  label,
  helper,
  value,
  onChange,
}: { label: string; helper: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-12 gap-3 items-center">
      <div className="col-span-5">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{helper}</p>
      </div>
      <div className="col-span-5">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full accent-emerald-600"
        />
      </div>
      <div className="col-span-2 text-right">
        <span className="text-sm font-semibold tabular-nums text-slate-700">
          {value.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
