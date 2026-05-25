/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SentLogPanel - real cross-template sent log.
 *
 * Wave 50 LCF-M (task #235): replaces the previous "moved" placeholder
 * with an actual log of recent template-driven sends. Reads from
 * outgoing_email_queue so the operator can see what landed, what's
 * still pending, and what failed across every template type
 * (after-sales, pre-event reminders, balance reminders, equipment
 * collection, lifecycle emails, etc.).
 *
 * Read-only. Send actions live on the page or workflow that owns the
 * touchpoint - this surface is observation only, deliberately.
 *
 * Pure component: no AdminNav / NoIndexMeta / page header - those are
 * page concerns.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Mail, RefreshCw, Search, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

interface QueueRow {
  id: string;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  template_type: string | null;
  status: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  trigger_event: string | null;
  created_at: string | null;
}

type StatusFilter = "all" | "sent" | "pending" | "failed";

const LABEL_BY_KEY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const t of TEMPLATE_REGISTRY) m[t.key] = t.label;
  return m;
})();

function useCompanyId(): string | null {
  const { user, profile } = useAuth();
  return profile?.company_id ?? user?.company_id ?? null;
}

export function SentLogPanel() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("outgoing_email_queue")
        .select("id, to_email, to_name, subject, template_type, status, scheduled_for, sent_at, error_message, trigger_event, created_at")
        .eq("company_id", companyId)
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      setRows((data as QueueRow[]) || []);
    } catch (err) {
      captureException(err, {
        tags: { route: "/admin/email-templates", step: "sent-log-load", companyId },
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all") {
        const s = (r.status || "").toLowerCase();
        if (statusFilter === "sent" && s !== "sent") return false;
        if (statusFilter === "pending" && !(s === "pending" || s === "queued" || s === "scheduled")) return false;
        if (statusFilter === "failed" && !(s === "failed" || s === "error")) return false;
      }
      if (q) {
        const label = (r.template_type && LABEL_BY_KEY[r.template_type]) || r.template_type || "";
        const hay = `${r.to_email || ""} ${r.to_name || ""} ${r.subject || ""} ${label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, query]);

  const stats = useMemo(() => ({
    total: rows.length,
    sent: rows.filter((r) => (r.status || "").toLowerCase() === "sent").length,
    pending: rows.filter((r) => {
      const s = (r.status || "").toLowerCase();
      return s === "pending" || s === "queued" || s === "scheduled";
    }).length,
    failed: rows.filter((r) => {
      const s = (r.status || "").toLowerCase();
      return s === "failed" || s === "error";
    }).length,
  }), [rows]);

  return (
    <>
      <p className="text-sm text-slate-600 mb-4">
        Recent template-driven sends across every workflow (lifecycle, after-sales, pre-event reminders, balance reminders, equipment collection). Read-only. Sends fire from the workflow that owns the touchpoint.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Sent" value={stats.sent} accent="emerald" />
        <StatTile label="Pending" value={stats.pending} accent="amber" />
        <StatTile label="Failed" value={stats.failed} accent="rose" />
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="relative grow min-w-[220px] max-w-[420px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by recipient, subject or template..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {([
              { id: "all",     label: "All" },
              { id: "sent",    label: "Sent" },
              { id: "pending", label: "Pending" },
              { id: "failed",  label: "Failed" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={`px-3 py-1.5 rounded-md ${
                  statusFilter === t.id
                    ? "bg-emerald-600 text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-blue-600" />
            Recent sends
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-sm text-slate-500 py-12">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 px-4">
              <p className="mb-2">
                {rows.length === 0 ? "Nothing sent yet." : "No sends match the filter."}
              </p>
              <p className="text-xs">
                {rows.length === 0
                  ? "When the system fires a templated email, it shows up here."
                  : "Adjust the search or status filter to see more."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const status = (r.status || "").toLowerCase();
                const when = r.sent_at || r.scheduled_for || r.created_at;
                const templateLabel = r.template_type
                  ? (LABEL_BY_KEY[r.template_type] || r.template_type)
                  : "(no template type)";
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <StatusIcon status={status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {r.subject || "(no subject)"}
                        </p>
                        <Badge variant="outline" className="text-[10px] border-slate-200">
                          {templateLabel}
                        </Badge>
                        {status && status !== "sent" && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize ${
                              status === "failed" || status === "error"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {(r.to_name || r.to_email || "unknown recipient")}
                        {r.to_email && r.to_name ? ` (${r.to_email})` : ""}
                        {when ? ` · ${new Date(when).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                        {r.trigger_event ? ` · ${r.trigger_event}` : ""}
                      </p>
                      {r.error_message && (
                        <p className="text-[11px] text-rose-700 mt-1 truncate" title={r.error_message}>
                          Error: {r.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-500 text-center mt-6">
        Showing the most recent 200 entries from <code className="font-mono">outgoing_email_queue</code>. Older sends are archived by the cron worker.
      </p>
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      </div>
    );
  }
  if (status === "failed" || status === "error") {
    return (
      <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 text-rose-600" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
      <Clock className="w-4 h-4 text-amber-600" />
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "amber" | "rose" }) {
  const colour =
    accent === "emerald" ? "text-emerald-700" :
    accent === "amber"   ? "text-amber-700" :
    accent === "rose"    ? "text-rose-700" :
                           "text-slate-900";
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-3 px-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 tabular-nums ${colour}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default SentLogPanel;
