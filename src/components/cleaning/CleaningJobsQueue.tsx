/**
 * CleaningJobsQueue - Wave 41 Phase 2.
 *
 * Live ledger of equipment-availability jobs (NOT labour). Each row
 * tells the team:
 *   - which gear is in cleaning (and how many units)
 *   - which method is being used (dishwasher | manual | outsourced)
 *   - when it returns to inventory (planned_end ETA)
 *   - actions: Start (queued -> in_progress), Complete (-> complete)
 *
 * Polls every 30s so multiple cleaners on different devices stay in
 * sync without each needing a refresh.
 *
 * Bobby's rule: dishwasher jobs cost no extra labour because the
 * machine does the work. Manual jobs may pull a kitchen staffer
 * via a linked staff_shift_tasks row - if that task is
 * billable=FALSE, no extra payroll cost.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Droplets, Truck, Play, Check, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  listActiveJobs,
  startJob,
  completeJob,
  type CleaningJobWithEquipment,
  type CleaningMethod,
} from "@/services/cleaningJobsService";
import { LogCleaningJobModal } from "./LogCleaningJobModal";

const METHOD_META: Record<CleaningMethod, { label: string; icon: any; chip: string }> = {
  dishwasher: {
    label: "Dishwasher",
    icon: Sparkles,
    chip: "bg-cyan-100 text-cyan-800 border-cyan-300",
  },
  manual: {
    label: "Manual",
    icon: Droplets,
    chip: "bg-blue-100 text-blue-800 border-blue-300",
  },
  outsourced_hire: {
    label: "Outsourced",
    icon: Truck,
    chip: "bg-amber-100 text-amber-800 border-amber-300",
  },
};

function formatEta(plannedEnd: string): string {
  const end = new Date(plannedEnd).getTime();
  const now = Date.now();
  const diffMin = Math.round((end - now) / 60000);
  if (diffMin <= 0) return "due now";
  if (diffMin < 60) return `${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function CleaningJobsQueue() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = user?.company_id;
  const [rows, setRows] = useState<CleaningJobWithEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const data = await listActiveJobs(supabase as any, companyId);
    setRows(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const onStart = async (jobId: string) => {
    setBusyId(jobId);
    const r = await startJob(supabase as any, jobId);
    setBusyId(null);
    if (!r.ok) {
      toast({ title: "Couldn't start", description: r.error, variant: "destructive" });
      return;
    }
    await refresh();
  };

  const onComplete = async (jobId: string) => {
    setBusyId(jobId);
    const r = await completeJob(supabase as any, jobId);
    setBusyId(null);
    if (!r.ok) {
      toast({ title: "Couldn't complete", description: r.error, variant: "destructive" });
      return;
    }
    toast({ title: "Cleaning job complete", description: "Equipment back in inventory." });
    await refresh();
  };

  return (
    <>
      <Card className="border-0 shadow-lg mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-cyan-600" />
            Cleaning queue
            {rows.length > 0 && (
              <Badge variant="outline" className="ml-2 bg-cyan-50 text-cyan-700">
                {rows.length} active
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setShowLog(true)}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            New job
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6 text-slate-500 text-sm">Loading queue...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Sparkles className="w-10 h-10 mx-auto mb-2 text-cyan-400" />
              <p className="text-sm">No active cleaning jobs.</p>
              <p className="text-xs mt-1 text-slate-400">
                Items return here when the team logs a cleaning job after a function.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const meta = METHOD_META[r.method] ?? METHOD_META.manual;
                const Icon = meta.icon;
                const eta = formatEta(r.planned_end);
                const isBusy = busyId === r.id;
                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`mt-0.5 px-2 py-1 rounded-md border ${meta.chip} flex items-center gap-1 text-xs font-medium whitespace-nowrap`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {r.equipment_name || "Unknown equipment"}{" "}
                          <span className="text-slate-500 font-normal">x {r.quantity}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {r.status === "in_progress" ? "In progress" : "Queued"} - back in inventory in <strong>{eta}</strong>
                        </p>
                        {r.notes && (
                          <p className="text-xs text-slate-500 mt-1 italic line-clamp-1">
                            {r.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* CLN2-H (cleaning deep audit, CLN2-71): 44px tap
                        targets on the queue actions. Cleaners often
                        operate on a wet tablet beside the dishwasher;
                        Apple HIG / WCAG min-tappable surface keeps
                        mis-taps on Complete (irreversible) low. */}
                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === "queued" && (
                        <Button
                          variant="outline"
                          onClick={() => onStart(r.id)}
                          disabled={isBusy}
                          className="min-h-11 px-3"
                        >
                          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          <span className="ml-1">Start</span>
                        </Button>
                      )}
                      <Button
                        onClick={() => onComplete(r.id)}
                        disabled={isBusy}
                        className="bg-emerald-600 hover:bg-emerald-700 min-h-11 px-3"
                      >
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span className="ml-1">Complete</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <LogCleaningJobModal
        open={showLog}
        onOpenChange={setShowLog}
        companyId={companyId || ""}
        actorUserId={user?.id || null}
        onCreated={() => {
          setShowLog(false);
          refresh();
        }}
      />
    </>
  );
}
