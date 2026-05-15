/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AutomationDashboardPanel -- read-only follow-up audit log.
 *
 * Extracted from /admin/email-automation-dashboard. Reads
 * quote_followup_log so the operator can see who sent which template
 * to whom, when, and via which channel. Source of truth for
 * "did the FU2 actually go out for the Smith wedding?".
 *
 * Nothing here triggers a send -- this surface is observation only.
 *
 * Pure component: no AdminNav / NoIndexMeta / page header -- those are
 * page concerns. This is just the body.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare, ArrowRight, Filter } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";

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

export function AutomationDashboardPanel() {
  const { user } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<"all" | "email" | "whatsapp">("all");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
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
          .limit(200);
        if (error) {
          console.error("[AutomationDashboardPanel] quote_followup_log fetch failed:", error);
        }
        if (cancelled) return;
        const flat: AuditRow[] = (data || []).map((r: any) => ({
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const filtered = useMemo(
    () => channelFilter === "all" ? rows : rows.filter((r) => r.channel === channelFilter),
    [rows, channelFilter],
  );

  const stats = useMemo(() => ({
    total: rows.length,
    email: rows.filter((r) => r.channel === "email").length,
    whatsapp: rows.filter((r) => r.channel === "whatsapp").length,
    fu1: rows.filter((r) => r.sequence_position === 1).length,
    fu2: rows.filter((r) => r.sequence_position === 2).length,
    fu3: rows.filter((r) => r.sequence_position === 3).length,
  }), [rows]);

  return (
    <>
      <p className="text-sm text-slate-600 mb-4">
        Every follow-up the team has clicked, with channel and template used. Nothing fires automatically -- this view is observation only.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <StatTile label="Total sends" value={stats.total} />
        <StatTile label="Email" value={stats.email} />
        <StatTile label="WhatsApp" value={stats.whatsapp} />
        <StatTile label="FU 1" value={stats.fu1} />
        <StatTile label="FU 2" value={stats.fu2} />
        <StatTile label="FU 3" value={stats.fu3} />
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="w-4 h-4 text-purple-600" />
              Recent follow-up sends
            </CardTitle>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              {(["all", "email", "whatsapp"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannelFilter(c)}
                  className={`px-2.5 py-1 rounded-md capitalize ${
                    channelFilter === c
                      ? "bg-purple-600 text-white font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-sm text-slate-500 py-12">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 px-4">
              <p className="mb-2">Nothing logged yet.</p>
              <p className="text-xs">Send a follow-up from the Quotes page and it'll appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <Link key={r.id} href={withSlug(`/admin/quotes?focus=${r.quote_id}`)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    {r.channel === "whatsapp"
                      ? <MessageSquare className="w-4 h-4 text-emerald-600" />
                      : <Mail className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-slate-900 truncate">
                        {r.client_name || "Quote"} {r.quote_number && <span className="font-normal text-slate-500">· {r.quote_number}</span>}
                      </p>
                      <Badge variant="outline" className="text-[10px] capitalize border-slate-200">
                        FU {r.sequence_position}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize border-slate-200">
                        {r.channel}
                      </Badge>
                      {r.status !== "sent" && (
                        <Badge variant="outline" className="text-[10px] capitalize bg-rose-50 text-rose-700 border-rose-200">
                          {r.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {r.template_key} · {new Date(r.sent_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                      {r.client_email ? ` · ${r.client_email}` : ""}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-slate-500 text-center mt-6">
        Read-only. Send actions live on{" "}
        <Link href={withSlug("/admin/quotes")} className="underline hover:text-slate-700">/admin/quotes</Link>.
        Templates live on the Templates tab.
      </p>
    </>
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
