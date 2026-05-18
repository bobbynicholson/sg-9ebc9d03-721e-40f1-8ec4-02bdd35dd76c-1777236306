/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Banknote, Pencil, Save, X, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as currencyUtils from "@/lib/currencyUtils";

interface Props {
  companyId: string;
  /** ISO timestamp the page last refreshed - lets us tag stale-data warnings. */
  loadedAt: number;
  /** Existing 30-day projection from the page's metrics. */
  projectedRevenue30Days: number;
  /** Existing 90-day projection from the page's metrics. */
  projectedRevenue90Days: number;
  /** Wages still owed to staff (paymentLedgerService.totalOwed). */
  staffPaymentsOwed: number;
  /** Currency code from the company (ZAR / USD / GBP / EUR). */
  currency: string;
  /** Auth user id for the audit_log row + cash_on_hand_updated_by. */
  userId: string | null;
  /** When set, expand the card by default - lets the parent decide. */
  defaultOpen?: boolean;
}

const HORIZON_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

/**
 * Cashflow Forecast Card (post-audit feature scoped on /admin/platform/
 * running-todo). Two numbers side by side: (a) owner-typed cash on hand
 * from the bank balance, (b) projected net = cash_on_hand + income still
 * to come - costs still to come over the picker-selected horizon.
 *
 * Income side reuses the financial-dashboard's existing projected-
 * revenue calculation. Costs side starts with staff wages owed; future
 * phases add supplier payables + predicted shopping + hired equipment
 * (each one a category the running-todo card scopes for follow-up
 * iterations).
 *
 * Stale-data warning fires when cash_on_hand_updated_at > 24h old -
 * the figure rapidly loses signal if the operator hasn't punched in
 * today's bank balance. Drives the daily-update habit.
 *
 * Role-gated upstream: the financial-dashboard renders this card only
 * for owner / company_admin / super_admin per the Skylight finance-
 * visibility rule.
 */
export function CashflowForecastCard({
  companyId,
  loadedAt,
  projectedRevenue30Days,
  projectedRevenue90Days,
  staffPaymentsOwed,
  currency,
  userId,
}: Props) {
  const { toast } = useToast();
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [cashOnHand, setCashOnHand] = useState<number>(0);
  const [cashUpdatedAt, setCashUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("cash_on_hand_cents, cash_on_hand_updated_at")
        .eq("id", companyId)
        .single();
      if (cancelled) return;
      if (error) {
        console.error("[CashflowForecastCard] load failed:", error);
      } else if (data) {
        const value = Number((data as any).cash_on_hand_cents || 0) / 100;
        setCashOnHand(value);
        setCashUpdatedAt((data as any).cash_on_hand_updated_at || null);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, loadedAt]);

  // Income side scales linearly between the 30d and 90d projections
  // we already compute. Crude but fit-for-purpose at this phase - the
  // page would need to compute per-day projections to be exact, and
  // that's a deeper refactor than the running-todo plan calls for now.
  const projectedRevenueForWindow = useMemo(() => {
    if (horizonDays <= 30) {
      return projectedRevenue30Days * (horizonDays / 30);
    }
    const beyond30 = horizonDays - 30;
    const slope = (projectedRevenue90Days - projectedRevenue30Days) / 60;
    return projectedRevenue30Days + slope * beyond30;
  }, [horizonDays, projectedRevenue30Days, projectedRevenue90Days]);

  // Costs side - PR-1 covers wages owed only. Future phases add the
  // other 4 cost categories listed in the running-todo card.
  const projectedCostsForWindow = staffPaymentsOwed;

  const forecast = cashOnHand + projectedRevenueForWindow - projectedCostsForWindow;
  const isPositive = forecast > 0;
  const isTight = forecast >= 0 && forecast < Math.max(staffPaymentsOwed, 10000);

  const updatedAgeHours = cashUpdatedAt
    ? (Date.now() - new Date(cashUpdatedAt).getTime()) / (60 * 60 * 1000)
    : Infinity;
  const isStale = updatedAgeHours > 24;

  const handleSave = async () => {
    const parsed = Number(draft.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(parsed)) {
      toast({
        title: "Invalid amount",
        description: "Enter a number, e.g. 50000.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const cents = Math.round(parsed * 100);
      const { error: updErr } = await (supabase as any)
        .from("companies")
        .update({
          cash_on_hand_cents: cents,
          cash_on_hand_updated_at: nowIso,
          cash_on_hand_updated_by: userId,
        })
        .eq("id", companyId);
      if (updErr) {
        toast({
          title: "Couldn't save",
          description: updErr.message || "Update failed",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Audit trail. Drives the future bookkeeper-export tile (see
      // running-todo card item 10).
      try {
        await (supabase as any).from("audit_logs").insert({
          action: "financial.cash_on_hand.update",
          entity_type: "company",
          entity_id: companyId,
          company_id: companyId,
          user_id: userId,
          details: {
            old_cents: Math.round(cashOnHand * 100),
            new_cents: cents,
            currency,
          },
        });
      } catch (auditErr) {
        console.warn("[CashflowForecastCard] audit log insert failed:", auditErr);
      }

      setCashOnHand(parsed);
      setCashUpdatedAt(nowIso);
      setEditing(false);
      toast({
        title: "Cash on hand updated",
        description: "Forecast refreshed.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-2 border-emerald-200 hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
            Cashflow Forecast
            <InfoTooltip
              content={
                "How much cash you'll have at the end of the picker-selected horizon, given:\n\n+ Cash on hand today (typed in from your bank balance)\n+ Income still to come (booked orders firing in the window)\n- Costs still to come (staff wages owed, more categories coming in later phases)\n\nUpdate the cash-on-hand figure daily from your bank app for the forecast to stay sharp."
              }
            />
          </CardTitle>
          <Banknote className="w-5 h-5 text-emerald-600" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column: cash on hand (editable). */}
          <div className="border-r border-slate-100 md:pr-4">
            <div className="text-xs text-slate-500 mb-1">Cash on hand</div>
            {loading ? (
              <div className="text-2xl font-bold text-slate-400">...</div>
            ) : editing ? (
              <div className="space-y-2">
                <Input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="50000"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setDraft("");
                    }}
                    disabled={saving}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {(currencyUtils.formatCurrency as (a: number, c: string) => string)(cashOnHand, currency)}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      setDraft(String(cashOnHand || ""));
                      setEditing(true);
                    }}
                    title="Update cash on hand"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {cashUpdatedAt ? (
                    <>
                      <span className="text-slate-500">
                        Updated {formatRelativeTime(cashUpdatedAt)}
                      </span>
                      {isStale && (
                        <Badge
                          className="bg-amber-100 text-amber-800 border border-amber-200 gap-1"
                          variant="secondary"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Stale
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">Never set</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right column: forecast for the selected horizon. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Forecast end of</span>
              <Select
                value={String(horizonDays)}
                onValueChange={(v) => setHorizonDays(Number(v))}
              >
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HORIZON_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={String(o.days)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                isPositive ? (isTight ? "text-amber-700" : "text-emerald-700") : "text-red-700"
              }`}
            >
              {(currencyUtils.formatCurrency as (a: number, c: string) => string)(forecast, currency)}
            </div>
            {/* Breakdown so the forecast number isn't a black box. */}
            <div className="mt-2 space-y-0.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Income in window</span>
                <span className="tabular-nums text-green-700">
                  +{(currencyUtils.formatCurrency as (a: number, c: string) => string)(projectedRevenueForWindow, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Wages owed</span>
                <span className="tabular-nums text-red-700">
                  -{(currencyUtils.formatCurrency as (a: number, c: string) => string)(projectedCostsForWindow, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
