/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RecentDamagesStrip - CLN2-I.
 *
 * Why: after CLN2-I the cleaner no longer sees the full
 * cost-analytics dashboard on the Damages tab. They still need
 * a feedback loop on what's been flagged this week so they can
 * spot duplicates / patterns. This is the lightweight version -
 * last 5 entries, cleaner name + date + brief description.
 *
 * Refreshes on the cateringms:equipment-damaged event so a
 * flag submitted on the form right above updates the strip
 * instantly without a full reload.
 */
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { equipmentTrackingService, type DamageType } from "@/services/equipmentTrackingService";
import { useAuth } from "@/contexts/AuthContext";
import { onEquipmentDamaged } from "@/lib/events/equipmentEvents";

const damageTypeLabels: Record<DamageType, string> = {
  broken: "Broken",
  lost: "Lost",
  stolen: "Stolen",
  damaged: "Damaged",
};

export function RecentDamagesStrip() {
  const { user } = useAuth();
  const companyId = (user as any)?.company_id || null;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !companyId) return;
    setLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const damages = await equipmentTrackingService.getDamages({
        companyId,
        startDate: sevenDaysAgo,
        endDate: new Date().toISOString(),
      });
      setRows((damages || []).slice(0, 5));
    } catch (e) {
      console.error("[RecentDamagesStrip] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [user, companyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = onEquipmentDamaged(() => { load(); });
    return off;
  }, [load]);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Loading recent damages...
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No damages flagged in the last 7 days.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        Recent damages this week
      </div>
      <div className="space-y-2">
        {rows.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{d.equipment?.name || "Equipment"}</span>
                <Badge variant="outline" className="text-xs">
                  {damageTypeLabels[d.damage_type as DamageType] || d.damage_type}
                </Badge>
                <span className="text-xs text-muted-foreground">x{d.quantity_damaged}</span>
              </div>
              {d.description ? (
                <p className="text-xs text-muted-foreground truncate">{d.description}</p>
              ) : null}
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <div className="truncate max-w-[140px]">{d.responsible_name || "Cleaning team"}</div>
              <div>{format(new Date(d.created_at), "MMM d, HH:mm")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
