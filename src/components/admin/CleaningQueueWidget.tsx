/**
 * CleaningQueueWidget - active cleaning_jobs for this tenant.
 *
 * Wave 42 Tier 2. Migrated off the legacy equipment_cleaning_status
 * model onto the unified cleaning_jobs ledger introduced in Wave 41
 * Phase 2. Same shape (compact list of equipment in the wash queue,
 * deep-link to the cleaning dashboard) but the data now matches
 * what the cleaning team sees in CleaningJobsQueue - no more
 * admin-vs-staff contradiction where one surface said "complete"
 * and the other still said "pending".
 *
 * Self-hides when nothing is in the queue.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Droplets, Truck } from "lucide-react";
import {
  listActiveJobs,
  type CleaningJobWithEquipment,
  type CleaningMethod,
} from "@/services/cleaningJobsService";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { useTenantHref } from "@/lib/tenantUrl";

const METHOD_TONE: Record<CleaningMethod, { label: string; chip: string; icon: any }> = {
  dishwasher: {
    label: "Dishwasher",
    chip: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
    icon: Sparkles,
  },
  manual: {
    label: "Manual",
    chip: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Droplets,
  },
  outsourced_hire: {
    label: "Outsourced",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Truck,
  },
};

function formatEta(plannedEnd: string): string {
  const end = new Date(plannedEnd).getTime();
  const now = Date.now();
  const diffMin = Math.round((end - now) / 60000);
  if (diffMin <= 0) return "due now";
  if (diffMin < 60) return `${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function CleaningQueueWidget({ companyId }: { companyId: string | null }) {
  const { reportError, retryNonce } = useReportWidgetError();
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<CleaningJobWithEquipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listActiveJobs(supabase as any, companyId);
        // Cap at 5 to keep the widget compact - the full queue lives
        // on the cleaning dashboard.
        if (!cancelled) {
          setRows(data.slice(0, 5));
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load cleaning queue");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-6 border-brand-primary/20 bg-brand-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-brand-primary" />
              Cleaning queue
            </CardTitle>
            <CardDescription className="text-xs">
              Equipment currently being cleaned. ETA = back in inventory.
            </CardDescription>
          </div>
          <Link href={withSlug("/team-portal/cleaning/dashboard")}>
            <Button variant="ghost" size="sm" className="text-brand-primary">
              All cleaning <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-brand-primary/15">
            {rows.map((r) => {
              // Defensive: fall back to 'manual' tone if method comes
              // back as anything unexpected (PostgREST cache lag,
              // future enum value, etc).
              const meta = METHOD_TONE[r.method] ?? METHOD_TONE.manual;
              const Icon = meta.icon;
              const eta = formatEta(r.planned_end);
              const inProgress = r.status === "in_progress";
              return (
                <li key={r.id}>
                  <Link
                    href={withSlug("/team-portal/cleaning/dashboard")}
                    className="py-2 flex items-center gap-3 hover:bg-brand-primary/10 rounded transition"
                  >
                    <Badge variant="outline" className={`shrink-0 ${meta.chip} text-[10px] inline-flex items-center gap-1`}>
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.equipment_name || "Equipment"}
                        <span className="ml-1 text-xs font-normal text-slate-500 tabular-nums">
                          x{r.quantity}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {inProgress ? "In progress" : "Queued"}
                        <span className="ml-2 text-slate-400">ETA {eta}</span>
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
