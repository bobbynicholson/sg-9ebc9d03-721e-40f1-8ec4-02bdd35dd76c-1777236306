/**
 * ActiveStaffNowWidget -- staff currently clocked in, with how long
 * each has been on the clock.
 *
 * Phase 20 #5. Today's Pulse counts active drivers on shift, but the
 * kitchen + cleaning + shopping side wasn't surfaced anywhere on the
 * dashboard. The owner glancing in at 7am wants the names: who's
 * already on the floor, who's late, who's been working past 8 hours.
 *
 * Reads staff_work_sessions where clock_out IS NULL, hydrates the
 * staff name via the kitchen_staff join, and shows up to 8 active
 * sessions sorted longest-on-the-clock first. Self-hides when nobody
 * is currently clocked in.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface SessionRow {
  id: string;
  staff_id: string | null;
  clock_in: string;
  staff_name: string;
  role_title: string | null;
}

const fmtElapsed = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
};

export function ActiveStaffNowWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        // Open sessions for this tenant. Order oldest clock-in first
        // so the operator sees who's been on the clock longest at the
        // top -- that's the row that matters when checking for stale
        // sessions someone forgot to close.
        const { data, error } = await (supabase as any)
          .from("staff_work_sessions")
          .select(`
            id, staff_id, clock_in,
            kitchen_staff:staff_id ( full_name, role_title, company_id )
          `)
          .is("clock_out", null)
          .order("clock_in", { ascending: true })
          .limit(20);
        if (error) {
          console.error("[ActiveStaffNowWidget] staff_work_sessions fetch failed:", error);
        }
        const list = ((data || []) as any[])
          .filter((r) => r.kitchen_staff?.company_id === companyId)
          .map((r) => ({
            id: r.id,
            staff_id: r.staff_id,
            clock_in: r.clock_in,
            staff_name: r.kitchen_staff?.full_name || "Unknown staff",
            role_title: r.kitchen_staff?.role_title || null,
          }))
          .slice(0, 8);
        if (!cancelled) setRows(list);
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
    <Card className="mb-6 border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-emerald-600" />
              On the clock now
              {rows.length > 0 && (
                <Badge className="ml-2 bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                  {rows.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Staff currently clocked in across kitchen, shopping and cleaning. Longest-running session first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/staff-hours")}>
            <Button variant="ghost" size="sm" className="text-emerald-700">
              Staff hours <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-emerald-100">
            {rows.map((r) => {
              const elapsedMs = Date.now() - new Date(r.clock_in).getTime();
              const overEight = elapsedMs > 8 * 3_600_000;
              // Phase 23 #5: deep-link straight to /admin/staff-hours
              // so closing a stale clock-in or reviewing the session
              // history is one click.
              return (
                <li key={r.id}>
                  <Link
                    href={withSlug("/admin/staff-hours")}
                    className="py-2 flex items-center gap-3 hover:bg-emerald-50/60 rounded transition"
                  >
                    <Badge className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold ${
                      overEight
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200"
                    }`}>
                      {fmtElapsed(r.clock_in)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.staff_name}
                        {r.role_title && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500">
                            {r.role_title}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Clocked in {new Date(r.clock_in).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
