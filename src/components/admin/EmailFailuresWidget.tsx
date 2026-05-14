/**
 * EmailFailuresWidget -- dashboard card surfacing the last 5
 * failed email sends in the last 24 hours.
 *
 * Phase 10 #7. /admin/email-automation-dashboard is the full
 * triage surface (with retry buttons + failure detail) but the
 * owner had to remember to open it. Failures piling up went
 * unnoticed for days. This widget puts the most recent ones on
 * /admin/dashboard so the operator sees them on every visit.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, Mail } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface FailRow {
  id: string;
  created_at: string;
  template_type: string | null;
  recipient_email: string | null;
  subject: string | null;
  error_message: string | null;
}

const fmtRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

export function EmailFailuresWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<FailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data } = await (supabase as any)
          .from("email_automation_log")
          .select("id, created_at, template_type, recipient_email, subject, error_message")
          .eq("user_id", companyId)
          .eq("status", "failed")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setRows((data || []) as FailRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-rose-200 bg-rose-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              Recent email failures
            </CardTitle>
            <CardDescription className="text-xs">
              Sends that didn't reach the recipient in the last 24 hours.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/email-automation-dashboard")}>
            <Button variant="ghost" size="sm" className="text-rose-700">
              Triage <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-rose-100">
            {rows.map((r) => (
              // Phase 24 #3: link straight into the email automation
              // dashboard where retries + sender config live.
              <li key={r.id}>
                <Link
                  href={withSlug("/admin/email-automation-dashboard")}
                  className="py-2 flex items-start gap-3 hover:bg-rose-50/60 rounded transition"
                >
                  <div className="w-8 h-8 rounded-md bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-rose-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {r.subject || r.template_type || "(no subject)"}
                      </span>
                      {r.template_type && (
                        <Badge variant="outline" className="text-[10px]">{r.template_type.replace(/_/g, " ")}</Badge>
                      )}
                      <span className="text-[11px] text-slate-500 tabular-nums">{fmtRelative(r.created_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                      {r.recipient_email || "(no recipient)"}
                    </div>
                    {r.error_message && (
                      <div className="text-[11px] text-rose-700 mt-0.5 truncate" title={r.error_message}>
                        {r.error_message}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
