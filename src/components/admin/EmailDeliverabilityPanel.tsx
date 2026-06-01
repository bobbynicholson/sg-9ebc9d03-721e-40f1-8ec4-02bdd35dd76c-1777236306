/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EmailDeliverabilityPanel - per-tenant inbox-placement health.
 *
 * TIGHTEN I.45: reads from email_delivery_events (populated by
 * /api/webhooks/resend) and renders the 30-day delivery rate, bounce
 * rate, spam-complaint rate, and the last 20 problem events.
 *
 * Industry guard rails:
 *   - Bounce rate > 5% = Gmail/Yahoo will throttle. Show red.
 *   - Bounce rate 2-5% = warning. Show amber.
 *   - Spam complaint rate > 0.1% = critical. Show red.
 *   - Spam complaint rate 0.05-0.1% = warning. Show amber.
 *
 * Empty state: brand-new tenants will see "No data yet" - they
 * haven't sent enough to generate webhook events.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Activity, AlertTriangle, CheckCircle2, Loader2,
  MailX, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Props {
  companyId: string;
}

interface EventRow {
  event_type: string;
  event_at: string;
  to_email: string | null;
  bounce_type: string | null;
  reason: string | null;
}

interface DeliverabilityStats {
  sent: number;
  delivered: number;
  bounced: number;
  hardBounced: number;
  complained: number;
  failed: number;
  recentIssues: EventRow[];
}

const EMPTY: DeliverabilityStats = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  hardBounced: 0,
  complained: 0,
  failed: 0,
  recentIssues: [],
};

export function EmailDeliverabilityPanel({ companyId }: Props) {
  const [stats, setStats] = useState<DeliverabilityStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sinceIso = thirtyDaysAgo.toISOString();

      const { data, error } = await (supabase as any)
        .from("email_delivery_events")
        .select("event_type, event_at, to_email, bounce_type, reason")
        .eq("company_id", companyId)
        .gte("created_at", sinceIso)
        .order("event_at", { ascending: false })
        .limit(5000);

      if (cancelled) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[EmailDeliverabilityPanel] events query failed:", error);
        setStats(EMPTY);
        setLoading(false);
        return;
      }

      const rows = (data || []) as EventRow[];
      const next: DeliverabilityStats = { ...EMPTY, recentIssues: [] };
      for (const r of rows) {
        if (r.event_type === "sent") next.sent += 1;
        else if (r.event_type === "delivered") next.delivered += 1;
        else if (r.event_type === "bounced") {
          next.bounced += 1;
          if (r.bounce_type === "hard") next.hardBounced += 1;
        }
        else if (r.event_type === "complained") next.complained += 1;
        else if (r.event_type === "failed") next.failed += 1;
      }
      // Recent issues = bounced / complained / failed, in event_at desc
      // order. Cap to 20 for display.
      next.recentIssues = rows
        .filter((r) => r.event_type === "bounced" || r.event_type === "complained" || r.event_type === "failed")
        .slice(0, 20);

      setStats(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (loading) {
    return (
      <Card className="border-0 shadow-lg mb-6">
        <CardContent className="py-8 text-center text-sm text-slate-500">
          <Loader2 className="w-5 h-5 inline-block mr-2 animate-spin" />
          Loading deliverability health...
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.sent === 0) {
    return (
      <Card className="border-0 shadow-lg mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-600" />
            Deliverability health (30 days)
            <InfoTooltip content="Inbox placement and complaint rates for emails sent through CateringMS. Populated by Resend webhooks - takes a few sends to start showing meaningful data." />
          </CardTitle>
          <CardDescription>
            We'll start showing your bounce + complaint rates here once you've sent a few quotes or invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-slate-500">
          <MailX className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          No delivery events in the last 30 days yet.
        </CardContent>
      </Card>
    );
  }

  // Denominator for rates: delivered + bounced (excluding failed since
  // failed means we never even handed to Resend). Industry-standard
  // delivery rate calculation.
  const attempted = stats.sent;
  const deliveredPct = attempted > 0 ? (stats.delivered / attempted) * 100 : 0;
  const bouncePct = attempted > 0 ? (stats.bounced / attempted) * 100 : 0;
  const complaintPct = attempted > 0 ? (stats.complained / attempted) * 100 : 0;

  // Industry guard rails from Google Postmaster Tools docs.
  const bounceLevel = bouncePct >= 5 ? "bad" : bouncePct >= 2 ? "warn" : "ok";
  const complaintLevel = complaintPct >= 0.1 ? "bad" : complaintPct >= 0.05 ? "warn" : "ok";

  return (
    <Card className="border-0 shadow-lg mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-purple-600" />
          Deliverability health (30 days)
          <InfoTooltip content="Inbox placement, bounce rate and spam-complaint rate over the last 30 days. Data comes from Resend's webhooks - one row per provider event." />
        </CardTitle>
        <CardDescription>
          {bounceLevel === "ok" && complaintLevel === "ok" ? (
            <>Healthy. No action needed.</>
          ) : (
            <>One or more rates are above the safe threshold - review the recent issues below.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Three primary tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricTile
            level="ok"
            icon={<ShieldCheck className="w-4 h-4" />}
            label="Delivery rate"
            value={`${deliveredPct.toFixed(1)}%`}
            note={`${stats.delivered.toLocaleString()} of ${attempted.toLocaleString()} sent`}
            target="Target: > 95%"
          />
          <MetricTile
            level={bounceLevel}
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Bounce rate"
            value={`${bouncePct.toFixed(2)}%`}
            note={
              stats.bounced > 0
                ? `${stats.bounced.toLocaleString()} bounced (${stats.hardBounced} hard)`
                : "No bounces"
            }
            target="Safe: < 2%, throttled at 5%"
          />
          <MetricTile
            level={complaintLevel}
            icon={<ShieldAlert className="w-4 h-4" />}
            label="Spam complaints"
            value={`${complaintPct.toFixed(3)}%`}
            note={
              stats.complained > 0
                ? `${stats.complained.toLocaleString()} marked as spam`
                : "No complaints"
            }
            target="Safe: < 0.05%, throttled at 0.1%"
          />
        </div>

        {/* Recent issues list */}
        {stats.recentIssues.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Recent issues</h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Recipient</th>
                    <th className="px-3 py-2 font-semibold">Event</th>
                    <th className="px-3 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentIssues.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {new Date(r.event_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-3 py-2 font-mono break-all">{r.to_email || "-"}</td>
                      <td className="px-3 py-2">
                        <EventBadge type={r.event_type} bounceType={r.bounce_type} />
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-xs text-emerald-700 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            No bounces, complaints or failures in the last 30 days.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricTile({
  level, icon, label, value, note, target,
}: {
  level: "ok" | "warn" | "bad";
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  target: string;
}) {
  const colour =
    level === "bad"
      ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-900", iconBg: "bg-red-100", iconText: "text-red-600" }
      : level === "warn"
      ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", iconBg: "bg-amber-100", iconText: "text-amber-600" }
      : { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", iconBg: "bg-emerald-100", iconText: "text-emerald-600" };
  return (
    <div className={`rounded-lg border ${colour.border} ${colour.bg} p-3`}>
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-md ${colour.iconBg} ${colour.iconText} flex items-center justify-center`}>
          {icon}
        </span>
        <span className={`text-xs font-semibold ${colour.text}`}>{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${colour.text}`}>{value}</p>
      <p className={`text-[11px] ${colour.text} opacity-80`}>{note}</p>
      <p className="text-[10px] text-slate-500 mt-1">{target}</p>
    </div>
  );
}

function EventBadge({ type, bounceType }: { type: string; bounceType: string | null }) {
  if (type === "bounced") {
    const isHard = bounceType === "hard";
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isHard ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
        {isHard ? "Hard bounce" : "Soft bounce"}
      </span>
    );
  }
  if (type === "complained") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800">
        Spam complaint
      </span>
    );
  }
  if (type === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-800">
        Failed
      </span>
    );
  }
  return <span className="text-[10px] text-slate-500">{type}</span>;
}
