/**
 * VehicleServiceDueWidget -- vehicles whose next_service_due date
 * lands within the next 30 days (or has already passed).
 *
 * Phase 13 #4. Phase 7 #1 added the maintenance schedule fields
 * (service_interval_days + next_service_due) on vehicles, but
 * the dashboard never surfaced them. The fleet manager only saw
 * 'service overdue' the day a driver mentioned it.
 *
 * Mirrors the InventoryExpiryWidget pattern: pull vehicles with
 * next_service_due <= today + 30d, sort soonest-first, render
 * top 5 with urgency-toned chip + plate + nickname.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Truck, ArrowRight, AlertCircle } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface VehicleRow {
  id: string;
  plate: string | null;
  nickname: string | null;
  make: string | null;
  model: string | null;
  next_service_due: string | null;
}

const HORIZON_DAYS = 30;

export function VehicleServiceDueWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000)
          .toISOString().slice(0, 10);
        const { data, error } = await (supabase as any)
          .from("vehicles")
          .select("id, plate, nickname, make, model, next_service_due")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .not("next_service_due", "is", null)
          .lte("next_service_due", horizon)
          .order("next_service_due", { ascending: true })
          .limit(5);
        if (error) {
          console.error("[VehicleServiceDueWidget] vehicles fetch failed:", error);
        }
        if (!cancelled) setRows((data || []) as VehicleRow[]);
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-4 h-4 text-blue-600" />
              Fleet service due
            </CardTitle>
            <CardDescription className="text-xs">
              Vehicles with a service date within {HORIZON_DAYS} days. Soonest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/vehicles")}>
            <Button variant="ghost" size="sm" className="text-blue-700">
              All vehicles <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-blue-100">
            {rows.map((v) => {
              const due = v.next_service_due ? new Date(v.next_service_due) : null;
              const days = due ? Math.floor((due.getTime() - today.getTime()) / 86_400_000) : 0;
              const overdue = days < 0;
              const tone = overdue
                ? "text-rose-700 bg-rose-100 border-rose-200"
                : days <= 7
                  ? "text-orange-700 bg-orange-100 border-orange-200"
                  : "text-blue-700 bg-blue-100 border-blue-200";
              const label = overdue
                ? `${Math.abs(days)}d overdue`
                : days === 0
                  ? "today"
                  : `${days}d`;
              const name = v.nickname || `${v.make || ""} ${v.model || ""}`.trim() || "Vehicle";
              // Phase 23 #10: full-row link into /admin/vehicles so
              // logging a service is one click from the dashboard.
              return (
                <li key={v.id}>
                  <Link
                    href={withSlug("/admin/vehicles")}
                    className="py-2 flex items-center gap-3 hover:bg-blue-50/60 rounded transition"
                  >
                    <div className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tone}`}>
                      {overdue && <AlertCircle className="w-3 h-3" />}
                      {label}
                    </div>
                    <div className="w-9 h-9 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4 text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums font-mono">
                        {v.plate || "—"}
                        {v.next_service_due && (
                          <span className="ml-2 font-sans text-slate-400">
                            due {new Date(v.next_service_due).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                          </span>
                        )}
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
