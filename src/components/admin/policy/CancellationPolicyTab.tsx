import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Save, AlertCircle, ShieldAlert, Plus, Trash2, Calendar, Receipt, Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface RefundTier {
  min_days_before_event: number;
  refund_pct: number;
}

interface CancellationPolicy {
  deposit_refund_tiers: RefundTier[];
  postponement_notice_days: number;
  postponement_reschedule_window_days: number;
  min_guest_count: number;
  default_deposit_pct: number;
  balance_due_days_before_event: number;
  final_numbers_days_before_event: number;
  force_majeure_postponement_only: boolean;
  late_cancel_requires_owner_override_days: number;
}

const DEFAULT_POLICY: CancellationPolicy = {
  deposit_refund_tiers: [
    { min_days_before_event: 14, refund_pct: 90 },
    { min_days_before_event: 7,  refund_pct: 30 },
    { min_days_before_event: 0,  refund_pct: 0  },
  ],
  postponement_notice_days: 14,
  postponement_reschedule_window_days: 15,
  min_guest_count: 15,
  default_deposit_pct: 50,
  balance_due_days_before_event: 2,
  final_numbers_days_before_event: 5,
  force_majeure_postponement_only: true,
  late_cancel_requires_owner_override_days: 3,
};

interface Props {
  companyId?: string | null;
}

export function CancellationPolicyTab({ companyId: companyIdProp }: Props = {}) {
  const { toast } = useToast();
  const { user, profile } = useAuth() as any;
  const companyId = companyIdProp ?? profile?.company_id ?? user?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState<CancellationPolicy>(DEFAULT_POLICY);
  const [terms, setTerms] = useState<string>("");

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("cancellation_policy, terms_and_conditions" as any)
        .eq("id", companyId)
        .maybeSingle();
      if (error) {
        console.error("[CancellationPolicyTab] load failed", error);
      }
      const loaded = (data as any)?.cancellation_policy as CancellationPolicy | null;
      setPolicy(loaded && typeof loaded === "object"
        ? { ...DEFAULT_POLICY, ...loaded, deposit_refund_tiers: loaded.deposit_refund_tiers || DEFAULT_POLICY.deposit_refund_tiers }
        : DEFAULT_POLICY);
      setTerms(((data as any)?.terms_and_conditions as string) || "");
      setLoading(false);
    })();
  }, [companyId]);

  const sortedTiers = [...policy.deposit_refund_tiers].sort(
    (a, b) => b.min_days_before_event - a.min_days_before_event,
  );

  const updateTier = (idx: number, field: keyof RefundTier, value: number) => {
    const next = [...policy.deposit_refund_tiers];
    next[idx] = { ...next[idx], [field]: value };
    setPolicy({ ...policy, deposit_refund_tiers: next });
  };

  const addTier = () => {
    setPolicy({
      ...policy,
      deposit_refund_tiers: [...policy.deposit_refund_tiers, { min_days_before_event: 0, refund_pct: 0 }],
    });
  };

  const removeTier = (idx: number) => {
    if (policy.deposit_refund_tiers.length <= 1) return;
    setPolicy({
      ...policy,
      deposit_refund_tiers: policy.deposit_refund_tiers.filter((_, i) => i !== idx),
    });
  };

  const handleSave = async () => {
    if (!companyId) { setError("No company on your profile."); return; }

    // Validation: at least one tier, no negative pcts, refund_pct in [0,100],
    // tiers sorted by days desc and refund_pct non-increasing.
    if (policy.deposit_refund_tiers.length === 0) {
      setError("Add at least one refund tier (or use 0% to forfeit).");
      return;
    }
    for (const t of policy.deposit_refund_tiers) {
      if (t.min_days_before_event < 0 || t.refund_pct < 0 || t.refund_pct > 100) {
        setError("Each tier needs days >= 0 and refund between 0% and 100%.");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      // Persist sorted shape so the RPC iteration order is predictable.
      const sorted = sortedTiers;
      const { error } = await supabase
        .from("companies")
        .update({
          cancellation_policy: { ...policy, deposit_refund_tiers: sorted },
          terms_and_conditions: terms,
        } as any)
        .eq("id", companyId);
      if (error) throw error;
      toast({ title: "Cancellation policy saved" });
    } catch (e: any) {
      setError(e?.message || "Could not save policy");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="py-8 text-center text-sm text-slate-500">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-rose-50 to-orange-50 border-b">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            Cancellation refund tiers
            <InfoTooltip content={"How much of the deposit (or anything paid so far) the client gets back when they cancel. The tier matched is the highest one whose 'days before event' is still satisfied.\n\nExample: 14+ days = 90% back, 7-13 days = 30% back, less than 7 days = forfeit."} />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              Tiers fire in order of strictness: an event 21 days away matches the 14+ day tier and gets 90% back. An event in 5 days falls through to the &lt;7 days tier (0% / forfeit).
            </div>
          </div>

          <div className="space-y-2">
            {sortedTiers.map((tier, idxSorted) => {
              // Map back to original index since we render the sorted view.
              const idx = policy.deposit_refund_tiers.indexOf(tier);
              return (
                <div key={`${tier.min_days_before_event}-${tier.refund_pct}-${idxSorted}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Days before event (at least)</Label>
                    <Input
                      type="number"
                      min={0}
                      className="w-32 bg-white"
                      value={tier.min_days_before_event}
                      onChange={(e) => updateTier(idx, "min_days_before_event", Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Refund %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="w-32 bg-white"
                      value={tier.refund_pct}
                      onChange={(e) => updateTier(idx, "refund_pct", Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex-1 text-xs text-slate-600 px-2">
                    {tier.min_days_before_event === 0
                      ? `Cancelled less than ${policy.deposit_refund_tiers
                          .filter((t) => t.min_days_before_event > 0)
                          .reduce((m, t) => Math.min(m, t.min_days_before_event), 99)} days from event`
                      : `Cancelled ${tier.min_days_before_event}+ days before event`}
                    : <strong>{tier.refund_pct === 0 ? "Forfeit deposit" : `${tier.refund_pct}% refunded`}</strong>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                    onClick={() => removeTier(idx)}
                    disabled={policy.deposit_refund_tiers.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={addTier} className="gap-2">
            <Plus className="w-4 h-4" /> Add tier
          </Button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Postponement rules
            <InfoTooltip content={"Postponement is often a softer landing than cancellation. These rules say how much notice the client needs to give to postpone, and how long they have to set the new date before the deposit is forfeit."} />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Notice required (days before event)</Label>
            <Input
              type="number"
              min={0}
              value={policy.postponement_notice_days}
              onChange={(e) => setPolicy({ ...policy, postponement_notice_days: Number(e.target.value) || 0 })}
            />
            <p className="text-xs text-slate-500">Postponement requests inside this window will be refused (cancellation tiers apply instead).</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Reschedule window (days from original date)</Label>
            <Input
              type="number"
              min={0}
              value={policy.postponement_reschedule_window_days}
              onChange={(e) => setPolicy({ ...policy, postponement_reschedule_window_days: Number(e.target.value) || 0 })}
            />
            <p className="text-xs text-slate-500">Once postponed, the client has this many days to set a new event date or the deposit is forfeit.</p>
          </div>
          <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Force-majeure postponement only</p>
              <p className="text-xs text-slate-600">Loadshedding, lockdown or natural disaster: no cancellation refund, but free postponement allowed.</p>
            </div>
            <Switch
              checked={policy.force_majeure_postponement_only}
              onCheckedChange={(v) => setPolicy({ ...policy, force_majeure_postponement_only: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Booking + payment defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Default deposit %</Label>
            <Input
              type="number" min={0} max={100}
              value={policy.default_deposit_pct}
              onChange={(e) => setPolicy({ ...policy, default_deposit_pct: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Balance due (days before event)</Label>
            <Input
              type="number" min={0}
              value={policy.balance_due_days_before_event}
              onChange={(e) => setPolicy({ ...policy, balance_due_days_before_event: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-600">Final guest numbers due (days before event)</Label>
            <Input
              type="number" min={0}
              value={policy.final_numbers_days_before_event}
              onChange={(e) => setPolicy({ ...policy, final_numbers_days_before_event: Number(e.target.value) || 0 })}
            />
            <p className="text-xs text-slate-500">After this point, increases may incur a surcharge and decreases may not be refunded.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-600 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Minimum guest count
            </Label>
            <Input
              type="number" min={0}
              value={policy.min_guest_count}
              onChange={(e) => setPolicy({ ...policy, min_guest_count: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label className="text-xs text-slate-600 flex items-center gap-1">
              Late-cancel manager override threshold (days)
              <InfoTooltip content={"If a cancel comes in inside this window, only owners or admins with override permission can complete it. Stops a kitchen-staff mistake from cancelling an event one day out."} />
            </Label>
            <Input
              type="number" min={0}
              value={policy.late_cancel_requires_owner_override_days}
              onChange={(e) => setPolicy({ ...policy, late_cancel_requires_owner_override_days: Number(e.target.value) || 0 })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Plain-English terms (shown on quote acceptance)</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-2">
          <Textarea
            rows={10}
            placeholder={"Paste your terms and conditions here. The structured policy above is enforced automatically; this text gives the client the rest of your booking terms in your own words."}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
          <p className="text-xs text-slate-500">This is shown verbatim on quote acceptance and in the booking confirmation email.</p>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save policy"}
        </Button>
      </div>
    </div>
  );
}
