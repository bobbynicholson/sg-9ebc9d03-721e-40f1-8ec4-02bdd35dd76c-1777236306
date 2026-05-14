/**
 * EquipmentDamagesWidget -- unresolved equipment_damages rows for
 * the tenant.
 *
 * Phase 16 #2. Damages reported by drivers / cleaners on
 * equipment_damages were sitting unresolved because nothing on
 * the dashboard surfaced them. Repair costs added up without
 * anyone chasing.
 *
 * Self-hides when nothing is unresolved.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";

interface DamageRow {
  id: string;
  damage_type: string | null;
  notes: string | null;
  repair_cost: number | null;
  created_at: string | null;
  order: { order_number: string | null; client_name: string | null } | null;
}

const fmtAge = (iso: string | null): string => {
  if (!iso) return "";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}m`;
};

export function EquipmentDamagesWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<DamageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("equipment_damages")
          .select(`
            id, damage_type, notes, repair_cost, created_at,
            order:order_id ( order_number, client_name )
          `)
          .eq("company_id", companyId)
          .or("resolved.is.null,resolved.eq.false")
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setRows((data || []) as DamageRow[]);
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

  const totalCost = rows.reduce((acc, r) => acc + Number(r.repair_cost || 0), 0);

  return (
    <Card className="mb-6 border-rose-200 bg-rose-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-4 h-4 text-rose-600" />
              Equipment damages -- unresolved
            </CardTitle>
            <CardDescription className="text-xs">
              Damage reports without a resolution stamp. Newest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/equipment?tab=shortages")}>
            <Button variant="ghost" size="sm" className="text-rose-700">
              Equipment hub <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <>
            <ul className="divide-y divide-rose-100">
              {rows.map((r) => (
                // Phase 24 #2: link straight into the equipment hub
                // shortages tab so the operator can resolve the
                // damage in one click.
                <li key={r.id}>
                  <Link
                    href={withSlug("/admin/equipment?tab=shortages")}
                    className="py-2 flex items-center gap-3 hover:bg-rose-50/60 rounded transition"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                      {r.damage_type || "damage"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.order?.client_name || "Unknown client"}
                        {r.order?.order_number && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">
                            {r.order.order_number}
                          </span>
                        )}
                      </p>
                      {r.notes && (
                        <p className="text-[11px] text-slate-600 truncate">{r.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {Number(r.repair_cost || 0) > 0 && (
                        <p className="text-sm font-bold tabular-nums text-rose-800">
                          {tenantCurrency.format(Number(r.repair_cost), 0)}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 tabular-nums">{fmtAge(r.created_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {totalCost > 0 && (
              <div className="mt-3 pt-2 border-t border-rose-100 text-[11px] text-slate-500 flex items-center justify-between">
                <span>{rows.length} unresolved</span>
                <span className="tabular-nums font-medium text-slate-700">
                  {tenantCurrency.format(totalCost, 0)} repair cost
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
