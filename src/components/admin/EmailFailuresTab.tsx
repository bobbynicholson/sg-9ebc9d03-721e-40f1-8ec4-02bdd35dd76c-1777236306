/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Failures tab for /admin/email-automation-dashboard.
 *
 * Reads from /api/admin/email-failures and renders rows with a Resend
 * button per failed entry. Resend hits /api/admin/resend-email which
 * re-fires the original message through emailService - the same
 * negative gates (block list, quarantine) run again, so resending a
 * blocked recipient stays blocked.
 *
 * Status surface:
 *   failed       - provider rejected or threw
 *   blocked      - recipient is on the company block list
 *   quarantined  - recipient is in import quarantine
 *   simulated    - no email provider configured (admin needs to wire one)
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Ban, Clock, RefreshCw, Send, Mail } from "lucide-react";

interface FailureRow {
  id: string;
  user_id: string;
  order_id: string | null;
  template_type: string | null;
  recipient_email: string;
  recipient_name: string | null;
  subject: string | null;
  status: "failed" | "blocked" | "quarantined" | "simulated";
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

const STATUS_META: Record<string, { label: string; tone: string; icon: any; resendable: boolean; tip: string }> = {
  failed: {
    label: "Failed",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertCircle,
    resendable: true,
    tip: "Provider rejected the send or threw. Resend to retry.",
  },
  blocked: {
    label: "Blocked",
    tone: "border-slate-300 bg-slate-50 text-slate-700",
    icon: Ban,
    resendable: false,
    tip: "Recipient is on the company block list. Remove them from blocked_contacts to allow sends.",
  },
  quarantined: {
    label: "Quarantined",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Clock,
    resendable: false,
    tip: "Recipient came from a bulk import that hasn't been green-lit. Enable comms on the import batch first.",
  },
  simulated: {
    label: "Simulated",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
    icon: Mail,
    resendable: false,
    tip: "No email provider configured. Wire Resend / SMTP in /admin/email-settings, then resend from here.",
  },
};

export function EmailFailuresTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<FailureRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ failed: 0, blocked: 0, quarantined: 0, simulated: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | FailureRow["status"]>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // TIGHTEN I.85 (2026-06-02): cancellation guard. Fast filter toggles
  // (failed -> blocked -> failed) could paint stale rows when the
  // first request resolved after the second. signal closure ensures
  // only the newest in-flight load() touches state.
  const load = async (signal: { cancelled: boolean }) => {
    setLoading(true);
    try {
      const url = filter === "all"
        ? "/api/admin/email-failures?limit=200"
        : `/api/admin/email-failures?status=${filter}&limit=200`;
      const resp = await fetch(url);
      const j = await resp.json().catch(() => ({}));
      if (signal.cancelled) return;
      if (!resp.ok) throw new Error(j?.error || "Could not load failures");
      setRows(j.rows || []);
      setCounts(j.counts || { failed: 0, blocked: 0, quarantined: 0, simulated: 0 });
    } catch (e: any) {
      if (signal.cancelled) return;
      toast({ title: "Couldn't load failures", description: e?.message || "", variant: "destructive" });
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  };

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [filter]);

  const resend = async (id: string) => {
    setBusyId(id);
    try {
      const resp = await fetch("/api/admin/resend-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: id }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.error || "Resend failed");
      toast({
        title: j.ok ? "Resent" : "Resend attempted",
        description: j.ok ? "The email re-fired through the configured provider." : "Provider returned not-ok; check the row again in a minute.",
      });
      load({ cancelled: false });
    } catch (e: any) {
      toast({ title: "Couldn't resend", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const totalNonSent = counts.failed + counts.blocked + counts.quarantined + counts.simulated;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="All" count={totalNonSent} active={filter === "all"} onClick={() => setFilter("all")} tone="primary" />
        <FilterChip label="Failed" count={counts.failed} active={filter === "failed"} onClick={() => setFilter("failed")} tone="rose" />
        <FilterChip label="Blocked" count={counts.blocked} active={filter === "blocked"} onClick={() => setFilter("blocked")} tone="slate" />
        <FilterChip label="Quarantined" count={counts.quarantined} active={filter === "quarantined"} onClick={() => setFilter("quarantined")} tone="amber" />
        <FilterChip label="Simulated" count={counts.simulated} active={filter === "simulated"} onClick={() => setFilter("simulated")} tone="blue" />
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => load({ cancelled: false })}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Reload
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-slate-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12">
          <Send className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-600">No failed emails</p>
          <p className="text-xs text-slate-500 mt-1">Everything that's been attempted has gone through cleanly.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="text-left py-2.5 px-3 font-medium">When</th>
                <th className="text-left py-2.5 px-3 font-medium">To</th>
                <th className="text-left py-2.5 px-3 font-medium">Subject</th>
                <th className="text-left py-2.5 px-3 font-medium">Status</th>
                <th className="text-left py-2.5 px-3 font-medium">Reason</th>
                <th className="text-right py-2.5 px-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.failed;
                const Icon = meta.icon;
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 px-3 text-slate-900">
                      <div className="font-medium truncate max-w-[20ch]" title={r.recipient_email}>{r.recipient_email}</div>
                      {r.recipient_name && (
                        <div className="text-xs text-slate-500 truncate max-w-[20ch]" title={r.recipient_name}>{r.recipient_name}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-700">
                      <div className="truncate max-w-[30ch]" title={r.subject || ""}>{r.subject || "-"}</div>
                      {r.template_type && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{r.template_type}</div>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className={`${meta.tone} gap-1 text-[11px]`} title={meta.tip}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-600 max-w-[24ch]">
                      <div className="truncate" title={r.error_message || ""}>{r.error_message || "-"}</div>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {meta.resendable ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resend(r.id)}
                          disabled={busyId === r.id}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${busyId === r.id ? "animate-spin" : ""}`} />
                          Resend
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label, count, active, onClick, tone,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
  tone: "primary" | "rose" | "slate" | "amber" | "blue";
}) {
  const activeClasses: Record<string, string> = {
    primary: "bg-blue-600 text-white border-blue-600",
    rose:    "bg-rose-600 text-white border-rose-600",
    slate:   "bg-slate-700 text-white border-slate-700",
    amber:   "bg-amber-500 text-white border-amber-500",
    blue:    "bg-blue-600 text-white border-blue-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active ? activeClasses[tone] : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      <span className={`ml-1.5 text-xs ${active ? "opacity-90" : "text-slate-500"}`}>{count}</span>
    </button>
  );
}
