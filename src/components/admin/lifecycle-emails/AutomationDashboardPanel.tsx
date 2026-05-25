/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AutomationDashboardPanel - read-only follow-up audit log.
 *
 * Reads quote_followup_log, the audit trail every time the operator
 * clicks a follow-up send from /admin/quotes. Source of truth for
 * "did FU2 actually go out for the Smith wedding?". Nothing here
 * triggers a send - this surface is observation only.
 *
 * Wave 50 LCF-P (task #238): full audit pass to match the depth of
 * the Templates + Sent Log tabs:
 *   - Search across recipient, quote number, template key, notes
 *   - Status filter (sent / failed / other) alongside the channel filter
 *   - Date range chips (24h / 7d / 30d / all)
 *   - Per-row template-key label resolved against TEMPLATE_REGISTRY
 *     so the row reads "Hot lead, fresh enquiry" not "email_lead_hot"
 *   - Per-row recipient (client_name + email) surfaced directly on
 *     the card instead of buried in a small grey line
 *   - Refresh button + Last loaded chip
 *   - CSV export (UTF-8 BOM for Excel-ZA)
 *   - captureException with route + step + companyId tags on the
 *     fetch path, replacing console.error
 *   - profile.company_id (authoritative) instead of the JWT
 *     user_metadata copy that lags after role / company changes
 *   - Empty state copy that points at /admin/quotes for action
 *
 * Pure component: no AdminNav / NoIndexMeta / page header - those are
 * page concerns.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Mail, MessageSquare, ArrowRight, Search, RefreshCw, Download,
  CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

interface AuditRow {
  id: string;
  quote_id: string;
  sequence_position: number;
  template_key: string;
  channel: "email" | "whatsapp";
  status: string;
  sent_at: string;
  notes: string | null;
  client_name: string | null;
  client_email: string | null;
  quote_number: string | null;
}

type ChannelFilter = "all" | "email" | "whatsapp";
type StatusFilter = "all" | "sent" | "failed";
type RangeKey = "24h" | "7d" | "30d" | "all";

const RANGE_MS: Record<RangeKey, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "all": null,
};

const TEMPLATE_LABEL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const t of TEMPLATE_REGISTRY) m[t.key] = t.label;
  return m;
})();

function useCompanyId(): string | null {
  const { user, profile } = useAuth();
  return profile?.company_id ?? user?.company_id ?? null;
}

export function AutomationDashboardPanel() {
  const companyId = useCompanyId();
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [range, setRange] = useState<RangeKey>("30d");
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("quote_followup_log")
        .select(`
          id, quote_id, sequence_position, template_key, channel, status, sent_at, notes,
          quotes (client_name, client_email, quote_number)
        `)
        .eq("company_id", companyId)
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const flat: AuditRow[] = ((data || []) as any[]).map((r: any) => ({
        id: r.id,
        quote_id: r.quote_id,
        sequence_position: r.sequence_position,
        template_key: r.template_key,
        channel: r.channel,
        status: r.status,
        sent_at: r.sent_at,
        notes: r.notes,
        client_name: r.quotes?.client_name ?? null,
        client_email: r.quotes?.client_email ?? null,
        quote_number: r.quotes?.quote_number ?? null,
      }));
      setRows(flat);
      setLastLoadedAt(new Date());
    } catch (err) {
      captureException(err, {
        tags: { route: "/admin/email-templates", step: "automation-load", companyId },
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // Apply range first so the stat tiles reflect what the operator is
  // looking at, not the raw 500-row dump.
  const inRange = useMemo(() => {
    const window = RANGE_MS[range];
    if (window === null) return rows;
    const cutoff = Date.now() - window;
    return rows.filter((r) => new Date(r.sent_at).getTime() >= cutoff);
  }, [rows, range]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange.filter((r) => {
      if (channelFilter !== "all" && r.channel !== channelFilter) return false;
      if (statusFilter !== "all") {
        const s = (r.status || "").toLowerCase();
        if (statusFilter === "sent" && s !== "sent") return false;
        if (statusFilter === "failed" && !(s === "failed" || s === "error")) return false;
      }
      if (q) {
        const templateLabel = TEMPLATE_LABEL[r.template_key] || r.template_key || "";
        const hay = `${r.client_name || ""} ${r.client_email || ""} ${r.quote_number || ""} ${r.template_key} ${templateLabel} ${r.notes || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inRange, channelFilter, statusFilter, query]);

  const stats = useMemo(() => ({
    total:    inRange.length,
    email:    inRange.filter((r) => r.channel === "email").length,
    whatsapp: inRange.filter((r) => r.channel === "whatsapp").length,
    fu1:      inRange.filter((r) => r.sequence_position === 1).length,
    fu2:      inRange.filter((r) => r.sequence_position === 2).length,
    fu3:      inRange.filter((r) => r.sequence_position === 3).length,
    failed:   inRange.filter((r) => {
      const s = (r.status || "").toLowerCase();
      return s === "failed" || s === "error";
    }).length,
  }), [inRange]);

  // CSV export. UTF-8 BOM so Excel-ZA reads the rand symbol and any
  // accented client names correctly. Includes the current filter set
  // (range + channel + status + search) so what's downloaded matches
  // what's on screen.
  const exportCsv = () => {
    const header = ["Sent at", "Channel", "FU sequence", "Template", "Template key", "Client", "Email", "Quote number", "Status", "Notes"];
    const rows2 = filtered.map((r) => [
      new Date(r.sent_at).toISOString(),
      r.channel,
      `FU${r.sequence_position}`,
      TEMPLATE_LABEL[r.template_key] || r.template_key,
      r.template_key,
      r.client_name || "",
      r.client_email || "",
      r.quote_number || "",
      r.status,
      (r.notes || "").replace(/\r?\n/g, " ").replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows2]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `follow-up-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <p className="text-sm text-slate-600 mb-4">
        Every follow-up the team has clicked, with channel and template used. Nothing fires automatically. this view is observation only.
      </p>

      {/* Stat tiles - reflect the current date range */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <StatTile label="Total sends" value={stats.total} />
        <StatTile label="Email"       value={stats.email} />
        <StatTile label="WhatsApp"    value={stats.whatsapp} />
        <StatTile label="FU 1"        value={stats.fu1} />
        <StatTile label="FU 2"        value={stats.fu2} />
        <StatTile label="FU 3"        value={stats.fu3} />
      </div>

      {stats.failed > 0 && (
        <Card className="border-0 shadow-sm mb-4 bg-rose-50">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="text-xs text-rose-900 leading-relaxed">
              <strong>{stats.failed} follow-up{stats.failed === 1 ? "" : "s"} failed</strong> in this window. Filter to <em>Failed</em> below to see which ones and why, then re-send from <code>/admin/quotes</code>.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="relative grow min-w-[220px] max-w-[420px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by client, quote number, template..."
              className="pl-9 h-9 text-sm"
            />
          </div>

          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Range</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {([
              { id: "24h", label: "24h" },
              { id: "7d",  label: "7d" },
              { id: "30d", label: "30d" },
              { id: "all", label: "All" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setRange(t.id)}
                className={`px-3 py-1.5 rounded-md ${
                  range === t.id
                    ? "bg-purple-600 text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Channel</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {(["all", "email", "whatsapp"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannelFilter(c)}
                className={`px-2.5 py-1.5 rounded-md capitalize ${
                  channelFilter === c
                    ? "bg-purple-600 text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Status</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {([
              { id: "all",    label: "All" },
              { id: "sent",   label: "Sent" },
              { id: "failed", label: "Failed" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={`px-3 py-1.5 rounded-md ${
                  statusFilter === t.id
                    ? "bg-purple-600 text-white font-medium"
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
            title={lastLoadedAt ? `Last loaded ${lastLoadedAt.toLocaleTimeString("en-ZA")}` : "Refresh"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
            title="Download the current view as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="w-4 h-4 text-purple-600" />
              Recent follow-up sends
            </CardTitle>
            <span className="text-[11px] text-slate-500">
              {filtered.length} of {inRange.length} in the {range === "all" ? "log" : `last ${range}`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-sm text-slate-500 py-12">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 px-4">
              <p className="mb-2">
                {rows.length === 0
                  ? "Nothing logged yet."
                  : inRange.length === 0
                    ? "No follow-ups in this window. Try a wider date range."
                    : "No follow-ups match the filter."}
              </p>
              {rows.length === 0 && (
                <p className="text-xs">
                  Send a follow-up from <Link href={withSlug("/admin/quotes")} className="underline hover:text-slate-700">/admin/quotes</Link> and it appears here.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const status = (r.status || "").toLowerCase();
                const templateLabel = TEMPLATE_LABEL[r.template_key] || r.template_key;
                return (
                  <Link
                    key={r.id}
                    href={withSlug(`/admin/quotes?focus=${r.quote_id}`)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <StatusIcon status={status} channel={r.channel} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {r.client_name || "Quote"}
                          {r.quote_number && (
                            <span className="font-normal text-slate-500"> &middot; {r.quote_number}</span>
                          )}
                        </p>
                        <Badge variant="outline" className="text-[10px] border-slate-200">
                          {templateLabel}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize border-slate-200">
                          FU{r.sequence_position}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize border-slate-200">
                          {r.channel}
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
                        {new Date(r.sent_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                        {r.client_email ? ` · ${r.client_email}` : ""}
                        {` · ${r.template_key}`}
                      </p>
                      {r.notes && (
                        <p className="text-[11px] text-slate-600 mt-1 truncate" title={r.notes}>
                          {r.notes}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-500 text-center mt-6">
        Read-only. Send actions live on{" "}
        <Link href={withSlug("/admin/quotes")} className="underline hover:text-slate-700">/admin/quotes</Link>.
        Templates live on the Templates tab.
        {lastLoadedAt && (
          <> Last loaded {lastLoadedAt.toLocaleTimeString("en-ZA")}.</>
        )}
      </p>
    </>
  );
}

function StatusIcon({ status, channel }: { status: string; channel: "email" | "whatsapp" }) {
  if (status === "failed" || status === "error") {
    return (
      <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 text-rose-600" />
      </div>
    );
  }
  if (status === "sent") {
    return (
      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      </div>
    );
  }
  // Anything else (queued, retrying, unknown) renders as a clock so
  // the operator gets a clear "in-flight" signal without an alarm.
  if (channel === "whatsapp") {
    return (
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <MessageSquare className="w-4 h-4 text-emerald-600" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
      <Clock className="w-4 h-4 text-amber-600" />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-3 px-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export default AutomationDashboardPanel;
