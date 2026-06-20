/**
 * /admin/smoke-test - Wave 70.47
 *
 * One-button UI for the end-to-end smoke endpoint. Owner-tier roles
 * only. Hit "Run smoke" - the endpoint creates a tagged test client +
 * order, walks the full lifecycle, runs a package cancel cascade, and
 * cleans up after itself. The results table shows pass / fail per
 * stage with timing + the actual error message if a stage broke.
 *
 * Bobby's gate: the smoke must pass on a real tenant before we sign
 * off on the "this is the greatest catering tool ever" video.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Play, Loader2, AlertTriangle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
}

interface SmokeResult {
  ok: boolean;
  stages: Stage[];
  passed: number;
  failed: number;
  total_ms: number;
  cleanup: { deleted: Record<string, number>; skipped: boolean };
}

export default function ProtectedSmokeTestPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN]}>
      <SmokeTestPage />
    </ProtectedRoute>
  );
}

function SmokeTestPage() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [skipCleanup, setSkipCleanup] = useState(false);
  const [result, setResult] = useState<SmokeResult | null>(null);

  const runSmoke = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/smoke/run-end-to-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_cleanup: skipCleanup }),
      });
      const data = await r.json();
      setResult(data);
      if (data.ok) {
        toast({ title: "Smoke passed", description: `${data.passed} stages in ${data.total_ms}ms` });
      } else {
        toast({
          title: "Smoke FAILED",
          description: `${data.failed} of ${data.passed + data.failed} stages broke. Scroll down for detail.`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Run crashed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Head><title>Smoke test - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="space-y-4 w-full px-4 sm:px-6 pt-20 lg:pt-6 pb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-slate-500" />
              End-to-end smoke test
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Runs the full lifecycle on a tagged test row - client,
              order, deposit, status transitions, invoice trigger,
              package cancel cascade. Cleans up after itself unless you
              tick the box below. Use before claiming the platform
              works end-to-end.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="skip-cleanup" checked={skipCleanup} onCheckedChange={(v) => setSkipCleanup(!!v)} />
                <label htmlFor="skip-cleanup" className="text-sm text-slate-700 cursor-pointer">
                  Skip cleanup (leave SMOKE-* rows in the DB for inspection)
                </label>
              </div>
              <Button onClick={runSmoke} disabled={running} size="lg">
                {running ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running smoke...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Run smoke</>
                )}
              </Button>
              <p className="text-xs text-slate-500">
                Takes ~2-5 seconds. Owner-tier roles only.
              </p>
            </CardContent>
          </Card>

          {result && (
            <Card className={cn(
              "border-2",
              result.ok ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40",
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    {result.ok ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-600" />
                    )}
                    {result.ok ? "All stages passed" : "Smoke failed"}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="bg-white">
                      {result.passed} pass
                    </Badge>
                    {result.failed > 0 && (
                      <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200">
                        {result.failed} fail
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-white tabular-nums">
                      {result.total_ms}ms
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {result.stages.map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2 p-2 rounded border text-sm",
                        s.ok ? "border-emerald-200 bg-white" : "border-rose-200 bg-rose-50",
                      )}
                    >
                      {s.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-slate-900">{s.name}</span>
                          <span className="text-[10px] tabular-nums text-slate-500">{s.ms}ms</span>
                        </div>
                        {s.detail && (
                          <p className="text-[11px] text-slate-600 mt-0.5 font-mono break-all">{s.detail}</p>
                        )}
                        {s.error && (
                          <p className="text-[11px] text-rose-700 mt-0.5 font-mono break-all flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            {s.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!result.cleanup.skipped && Object.keys(result.cleanup.deleted).length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Cleanup</p>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {Object.entries(result.cleanup.deleted).map(([table, count]) => (
                        <Badge key={table} variant="outline" className="bg-white">
                          <span className="font-mono">{table}</span>
                          <span className="ml-1.5 tabular-nums text-slate-500">{count}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {result.cleanup.skipped && (
                  <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Cleanup skipped. Search the DB for <span className="font-mono bg-amber-100 px-1 rounded">SMOKE-</span> rows and delete manually when done.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
