/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DamageAnalytics - CLN2-I (extracted from BrokenEquipmentDashboard).
 *
 * Why: cost / breakdown / repair-vs-replace analytics belong on
 * /admin/equipment (admin, finance-adjacent) not on the cleaner
 * daily dashboard. The cleaner sees DamageFlagForm + a recent
 * strip; this component is the admin-side cost view.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Package, DollarSign, Calendar as CalendarIcon, BellRing, CheckCircle2 } from "lucide-react";
import { equipmentTrackingService, type DamageType } from "@/services/equipmentTrackingService";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { onEquipmentDamaged } from "@/lib/events/equipmentEvents";
import { format } from "date-fns";

export function DamageAnalytics() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLoading] = useState(true);
  const [damages, setDamages] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [selectedType, setSelectedType] = useState<DamageType | "all">("all");
  // CLN2-G: in-flight set so the escalate / resolve buttons disable
  // while their broadcast or update is mid-air. Avoids the cleaner
  // tapping twice and firing two admin pings for the same damage.
  const [pendingDamageId, setPendingDamageId] = useState<string | null>(null);
  // Local "we already notified admin" set, keyed by damage id. The
  // broadcastNotification call uses dedup so the DB side is safe, but
  // this stops the button changing label back to "Notify admin" after
  // the row reloads from getDamages (which doesn't return the
  // notification record).
  const [notifiedSet, setNotifiedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDamages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dateRange, selectedType]);

  // Refresh when a cleaner flags new damage in another tab / page.
  useEffect(() => {
    const off = onEquipmentDamaged(() => { loadDamages(); });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dateRange, selectedType]);

  const loadDamages = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const filters: any = {
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      };

      if (selectedType !== "all") {
        filters.damageType = selectedType;
      }

      const [damagesData, breakdownData] = await Promise.all([
        equipmentTrackingService.getDamages(filters),
        equipmentTrackingService.getDamageCostBreakdown({
          userId: user.id,
          startDate: dateRange.from.toISOString(),
          endDate: dateRange.to.toISOString(),
        }),
      ]);

      setDamages(damagesData);
      setBreakdown(breakdownData);
    } catch (error) {
      console.error("Error loading damages:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `R${amount.toFixed(2)}`;

  const damageTypeColours: Record<DamageType, string> = {
    broken: "bg-red-500",
    lost: "bg-orange-500",
    stolen: "bg-purple-500",
    damaged: "bg-amber-500",
  };

  const damageTypeLabels: Record<DamageType, string> = {
    broken: "Broken",
    lost: "Lost",
    stolen: "Stolen",
    damaged: "Damaged",
  };

  // CLN2-G (cleaning deep audit, CLN2-31 / CLN2-72): broken-equipment
  // escalation flow. Lets the cleaner ping company admins about a
  // damage so the procurement / replacement can start without the
  // admin discovering it from a weekly losses report. Uses
  // broadcastNotification with dedup so a double-tap doesn't spam.
  const handleEscalate = async (damage: any) => {
    if (!user?.company_id) return;
    if (pendingDamageId) return;
    setPendingDamageId(damage.id);
    try {
      const itemName = damage.equipment?.name || "Equipment";
      const orderNumber = damage.order?.order_number ? ` (order ${damage.order.order_number})` : "";
      const dmgLabel = damageTypeLabels[damage.damage_type as DamageType] || damage.damage_type || "damaged";
      await notificationService.broadcastNotification({
        companyId: user.company_id,
        type: "system_alert",
        title: `${itemName} - ${dmgLabel}`,
        message: `Cleaning team flagged ${itemName}${orderNumber} for admin review. Replacement / repair needed.`,
        priority: "high",
        targetRoles: [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN],
        link: "/team-portal/cleaning",
        relatedEntityType: "equipment_damage",
        relatedEntityId: damage.id,
        dedup: true,
        dedupWindowMinutes: 1440,
      });
      setNotifiedSet((prev) => {
        const next = new Set(prev);
        next.add(damage.id);
        return next;
      });
      toast({ title: "Admin notified", description: `${itemName} flagged for replacement.` });
    } catch (err) {
      console.error("[DamageAnalytics] escalate failed:", err);
      toast({
        title: "Could not notify admin",
        description: err instanceof Error ? err.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setPendingDamageId(null);
    }
  };

  // CLN2-G companion: mark a damage resolved once admin acts. Uses
  // the pre-existing resolveDamage method but is wired here so the
  // cleaner doesn't need to leave the dashboard.
  const handleResolve = async (damage: any) => {
    if (!user?.id) return;
    if (pendingDamageId) return;
    const resolution = window.prompt("Resolution notes (e.g. 'Replacement ordered', 'Repaired in-house')")?.trim();
    if (!resolution) return;
    setPendingDamageId(damage.id);
    try {
      await equipmentTrackingService.resolveDamage({
        damageId: damage.id,
        resolutionNotes: resolution,
        resolvedByUserId: user.id,
      });
      toast({ title: "Resolved", description: damage.equipment?.name || "Damage closed." });
      await loadDamages();
    } catch (err) {
      console.error("[DamageAnalytics] resolve failed:", err);
      toast({
        title: "Could not mark resolved",
        description: err instanceof Error ? err.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setPendingDamageId(null);
    }
  };

  // Repair-vs-replace heuristic: if avg cost per incident on an
  // item exceeds 60% of its full replacement, the line item is
  // flagged "replace" so the admin can sense-check the call. The
  // cut-off is intentionally simple and lives here, not in the
  // service, because the rule is UI guidance not source-of-truth.
  const replaceThresholdRatio = 0.6;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Equipment Losses & Damages</h2>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">From Date</p>
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => date && setDateRange({ ...dateRange, from: date })}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">To Date</p>
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => date && setDateRange({ ...dateRange, to: date })}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {breakdown && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="text-2xl font-bold">{formatCurrency(breakdown.totalCost)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {Object.entries(breakdown.byType).map(([type, cost]) => (
            <Card key={type}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 ${damageTypeColours[type as DamageType]} bg-opacity-10 rounded-lg`}>
                    <AlertTriangle className={`h-6 w-6 ${damageTypeColours[type as DamageType].replace("bg-", "text-")}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{damageTypeLabels[type as DamageType]}</p>
                    <p className="text-2xl font-bold">{formatCurrency(cost as number)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="items">By Item</TabsTrigger>
          <TabsTrigger value="stage">By Stage</TabsTrigger>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Equipment Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {breakdown?.items.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No damages in this period</p>
              ) : (
                <div className="space-y-3">
                  {breakdown?.items.map((item: any, index: number) => {
                    const avgCost = item.count > 0 ? item.cost / item.count : 0;
                    const unitCost = (() => {
                      const match = damages.find((d) => (d.equipment?.name || "Unknown") === item.name);
                      return Number(match?.unit_cost || 0);
                    })();
                    const replaceFlag = unitCost > 0 && avgCost / unitCost >= replaceThresholdRatio;
                    return (
                      <div key={index} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-background rounded">
                            <Package className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.count} items - avg {formatCurrency(avgCost)} per loss
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(item.cost)}</p>
                          {replaceFlag ? (
                            <Badge variant="destructive" className="mt-1">Replace</Badge>
                          ) : (
                            <Badge variant="outline" className="mt-1">Repair</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stage" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost by Process Stage</CardTitle>
            </CardHeader>
            <CardContent>
              {breakdown && Object.keys(breakdown.byStage).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No damages in this period</p>
              ) : (
                <div className="space-y-3">
                  {breakdown && Object.entries(breakdown.byStage).map(([stage, cost]) => (
                    <div key={stage} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">
                          {stage}
                        </Badge>
                      </div>
                      <p className="font-bold text-lg">{formatCurrency(cost as number)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Cost Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                if (damages.length === 0) {
                  return <p className="text-center text-muted-foreground py-8">No damages in this period</p>;
                }
                const byDay = new Map<string, number>();
                damages.forEach((d: any) => {
                  const day = format(new Date(d.created_at), "yyyy-MM-dd");
                  byDay.set(day, (byDay.get(day) || 0) + Number(d.total_cost || 0));
                });
                const rows = Array.from(byDay.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
                const max = Math.max(...rows.map(([, v]) => v), 1);
                return (
                  <div className="space-y-2">
                    {rows.map(([day, cost]) => (
                      <div key={day} className="flex items-center gap-3">
                        <span className="text-xs font-mono w-24 text-muted-foreground">
                          {format(new Date(day), "MMM d")}
                        </span>
                        <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-red-400"
                            style={{ width: `${(cost / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-24 text-right">{formatCurrency(cost)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4 mt-4">
          <div className="flex gap-2 mb-4">
            <Button
              variant={selectedType === "all" ? "default" : "outline"}
              onClick={() => setSelectedType("all")}
              size="sm"
            >
              All
            </Button>
            {(Object.keys(damageTypeLabels) as DamageType[]).map((type) => (
              <Button
                key={type}
                variant={selectedType === type ? "default" : "outline"}
                onClick={() => setSelectedType(type)}
                size="sm"
              >
                {damageTypeLabels[type]}
              </Button>
            ))}
          </div>

          {damages.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No incidents recorded</p>
                <p className="text-sm">Equipment is being well maintained</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {damages.map((damage) => (
                <Card key={damage.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{damage.equipment?.name}</h4>
                          <Badge className={damageTypeColours[damage.damage_type as DamageType]}>
                            {damageTypeLabels[damage.damage_type as DamageType]}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>Order: {damage.order?.order_number}</p>
                          <p>Stage: {damage.damage_stage}</p>
                          <p>Quantity: {damage.quantity_damaged} items</p>
                          {damage.responsible_name && (
                            <p>Responsible: {damage.responsible_name}</p>
                          )}
                          {damage.description && (
                            <p className="mt-2 text-foreground">{damage.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-600">
                          {formatCurrency(damage.total_cost)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(damage.created_at), "MMM d, yyyy")}
                        </p>
                        {damage.resolved && (
                          <Badge variant="outline" className="mt-2 text-emerald-700 border-emerald-400">
                            Resolved
                          </Badge>
                        )}
                      </div>
                    </div>
                    {/* CLN2-G: escalation + resolve CTAs. Render only
                        for unresolved rows so the row tile collapses
                        back to read-only once admin closes the loop. */}
                    {!damage.resolved && (
                      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 min-h-11"
                          onClick={() => handleEscalate(damage)}
                          disabled={pendingDamageId === damage.id || notifiedSet.has(damage.id)}
                          aria-label={`Notify admin about ${damage.equipment?.name || "this equipment"}`}
                        >
                          <BellRing className="w-3.5 h-3.5" />
                          {notifiedSet.has(damage.id) ? "Admin notified" : "Notify admin"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 min-h-11 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => handleResolve(damage)}
                          disabled={pendingDamageId === damage.id}
                          aria-label={`Mark ${damage.equipment?.name || "this damage"} as resolved`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Mark resolved
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
