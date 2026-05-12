/**
 * CleaningQueueWidget -- equipment_cleaning_status rows still in
 * pending / cleaning / drying for this tenant.
 *
 * Phase 13 #7. The cleaning workflow exists in
 * equipmentTrackingService but the dashboard never surfaced
 * which items were stuck in the wash queue. The cleaning team
 * coordinator had to drill into the team portal to find them.
 *
 * Self-hides when nothing is pending.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight } from "lucide-react";

interface CleaningRow {
  id: string;
  current_status: string | null;
  returned_quantity: number | null;
  cleaned_quantity: number | null;
  created_at: string | null;
  equipment: { name: string | null; category: string | null } | null;
  order: { order_number: string | null; event_date: string | null } | null;
}

const STATUS_TONE: Record<string, string> = {
  pending:  "bg-rose-100 text-rose-800 border-rose-200",
  cleaning: "bg-amber-100 text-amber-800 border-amber-200",
  drying:   "bg-blue-100 text-blue-800 border-blue-200",
};

export function CleaningQueueWidget({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<CleaningRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("equipment_cleaning_status")
          .select(`
            id, current_status, returned_quantity, cleaned_quantity, created_at,
            equipment:equipment_id ( name, category ),
            order:order_id ( order_number, event_date )
          `)
          .eq("company_id", companyId)
          .in("current_status", ["pending", "cleaning", "drying"])
          .order("created_at", { ascending: true })
          .limit(5);
        if (!cancelled) setRows((data || []) as CleaningRow[]);
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
    <Card className="mb-6 border-cyan-200 bg-cyan-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              Cleaning queue
            </CardTitle>
            <CardDescription className="text-xs">
              Equipment returned from events still pending wash, dry or inspection.
            </CardDescription>
          </div>
          <Link href="/team-portal/cleaning/dashboard">
            <Button variant="ghost" size="sm" className="text-cyan-700">
              All cleaning <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-cyan-100">
            {rows.map((r) => {
              const tone = STATUS_TONE[r.current_status || "pending"] || STATUS_TONE.pending;
              const ageMs = r.created_at ? Date.now() - new Date(r.created_at).getTime() : 0;
              const ageHours = Math.round(ageMs / 3_600_000);
              return (
                <li key={r.id} className="py-2 flex items-center gap-3">
                  <Badge variant="outline" className={`shrink-0 ${tone} text-[10px] capitalize`}>
                    {r.current_status || "pending"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {r.equipment?.name || "Equipment"}
                      {(r.returned_quantity != null) && (
                        <span className="ml-1 text-xs font-normal text-slate-500 tabular-nums">
                          x{r.returned_quantity}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {r.order?.order_number ? `${r.order.order_number} · ` : ""}
                      {r.order?.event_date && new Date(r.order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                      {ageHours > 0 && (
                        <span className="ml-2 text-slate-400">
                          {ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
