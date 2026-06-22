/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DamageAnalytics - CLN2-I (extracted from BrokenEquipmentDashboard).
 *
 * Why: cost / breakdown / repair-vs-replace analytics belong on
 * /admin/equipment (admin, finance-adjacent) not on the cleaner
 * daily dashboard. The cleaner sees DamageFlagForm + a recent
 * strip; this component is the admin-side cost view.
 */
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Package, Banknote, Calendar as CalendarIcon, BellRing, CheckCircle2, Receipt, Download } from "lucide-react";
import { equipmentTrackingService, type DamageType } from "@/services/equipmentTrackingService";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { onEquipmentDamaged } from "@/lib/events/equipmentEvents";
import { format } from "date-fns";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

export function DamageAnalytics() {
  const { user } = useAuth();
  const { toast } = useToast();
  // TIGHTEN I.80 (2026-06-02): tenant-aware currency. Was previously
  // hardcoded "R" prefix which read wrong for USD / GBP / EUR tenants.
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  const [, setLoading] = useState(true);
  const [damages, setDamages] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [selectedType, setSelectedType] = useState<DamageType | "all">("all");
  // Recent-tab status filter: separate open work from already-billed vs
  // otherwise-resolved (write-off / repaired) so the admin can see at a
  // glance what's been charged to clients.
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "billed" | "resolved">("all");
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

  const formatCurrency = (amount: number) => tenantCurrency.format(amount, 2);

  // A damage was billed to the client when it's resolved with a "Billed..."
  // note (written by billDamageToClient). Distinguishes a charged damage from
  // one resolved another way (write-off, repaired in-house).
  const isBilled = (d: any): boolean => !!d?.resolved && /billed/i.test(String(d?.resolution_notes || ""));

  // Export the loaded register (respects the active date range + type filter)
  // to CSV so the operator can hand it to finance or reconcile against
  // invoices. Builds the file client-side and triggers a download - no server
  // round-trip. RFC-4180 quoting so commas / quotes / newlines in notes are safe.
  const exportCsv = () => {
    const headers = [
      "Date", "Order", "Event", "Client", "Equipment", "Type", "Stage",
      "Quantity", "Unit cost", "Total cost", "Responsible", "Status",
      "Resolution", "Description",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = (damages || []).map((d: any) => [
      d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : "",
      d.order?.order_number || "",
      d.order?.event_name && d.order.event_name !== "Untitled" ? d.order.event_name : "",
      d.order?.client_name || "",
      d.equipment?.name || "",
      d.damage_type || "",
      d.damage_stage || "",
      d.quantity_damaged ?? "",
      Number(d.unit_cost || 0).toFixed(2),
      Number(d.total_cost || 0).toFixed(2),
      d.responsible_name || "",
      isBilled(d) ? "Billed" : d.resolved ? "Resolved" : "Open",
      d.resolution_notes || "",
      d.description || "",
    ].map(esc).join(","));
    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equipment-damages-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Roll the raw damage rows up into the accountability + recovery views the
  // admin needs to actually act: how much money is still open (recoverable),
  // how much is already resolved, average per incident, and breakdowns by
  // client (who to bill), by responsible person (staff accountability), and
  // by event (which function cost us the most).
  const analytics = useMemo(() => {
    const rows = (damages || []) as any[];
    let totalUnits = 0, openCount = 0, resolvedCount = 0, openCost = 0, resolvedCost = 0;
    const byClient = new Map<string, { cost: number; count: number; units: number }>();
    const byPerson = new Map<string, { cost: number; count: number; units: number }>();
    const byEvent = new Map<string, { cost: number; count: number; units: number; eventName: string | null; client: string | null; date: string | null }>();
    for (const d of rows) {
      const units = Number(d.quantity_damaged || 0);
      const cost = Number(d.total_cost || 0);
      totalUnits += units;
      if (d.resolved) { resolvedCount += 1; resolvedCost += cost; }
      else { openCount += 1; openCost += cost; }

      const client = d.order?.client_name || "Unknown client";
      const c = byClient.get(client) || { cost: 0, count: 0, units: 0 };
      c.cost += cost; c.count += 1; c.units += units; byClient.set(client, c);

      const person = d.responsible_name || "Unassigned";
      const p = byPerson.get(person) || { cost: 0, count: 0, units: 0 };
      p.cost += cost; p.count += 1; p.units += units; byPerson.set(person, p);

      const evKey = d.order?.order_number || "No linked order";
      const e = byEvent.get(evKey) || { cost: 0, count: 0, units: 0, eventName: d.order?.event_name ?? null, client: d.order?.client_name ?? null, date: d.order?.event_date ?? null };
      e.cost += cost; e.count += 1; e.units += units; byEvent.set(evKey, e);
    }
    const total = rows.length;
    const totalCost = openCost + resolvedCost;
    return {
      total, totalUnits, openCount, resolvedCount, openCost, resolvedCost, totalCost,
      avg: total ? totalCost / total : 0,
      resolvedPct: total ? Math.round((resolvedCount / total) * 100) : 0,
      byClient: Array.from(byClient.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cost - a.cost),
      byPerson: Array.from(byPerson.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cost - a.cost),
      byEvent: Array.from(byEvent.entries()).map(([order, v]) => ({ order, ...v })).sort((a, b) => b.cost - a.cost),
    };
  }, [damages]);

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

  // Bill the client for a damage. The service decides dynamically whether to
  // add it to an outstanding invoice (client still owes a balance) or raise a
  // new one (already paid in full). Marks the damage resolved on success.
  const handleBillClient = async (damage: any) => {
    if (!user?.id) return;
    if (pendingDamageId) return;
    const cost = Number(damage.total_cost || 0);
    if (cost <= 0) {
      toast({ title: "No cost set", description: "Set a replacement cost on this item before billing.", variant: "destructive" });
      return;
    }
    if (!damage.order_id) {
      toast({ title: "No order linked", description: "This damage isn't tied to an order, so there's no client to bill.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Bill the client ${formatCurrency(cost)} for this damage?\n\nIf they still owe a balance it's added to that invoice, otherwise a new invoice is raised.`)) return;
    setPendingDamageId(damage.id);
    try {
      const res = await equipmentTrackingService.billDamageToClient({ damageId: damage.id, actorUserId: user.id });
      if (!res.ok) {
        toast({ title: "Could not bill", description: res.error || "Try again.", variant: "destructive" });
        return;
      }
      toast({
        title: res.mode === "added" ? "Added to outstanding invoice" : "New invoice raised",
        description: `${res.invoiceNumber} · ${formatCurrency(Number(res.amount || 0))}`,
      });
      await loadDamages();
    } catch (err) {
      console.error("[DamageAnalytics] bill failed:", err);
      toast({ title: "Could not bill", description: err instanceof Error ? err.message : "Please retry.", variant: "destructive" });
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
          <Button
            variant="outline"
            className="gap-2"
            onClick={exportCsv}
            disabled={(damages || []).length === 0}
            title="Export the current register to CSV"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
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
                  <Banknote className="h-6 w-6 text-red-600" />
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

      {/* Accountability + recovery KPIs - the numbers an admin needs to act:
          how many incidents, units lost, money still open (recoverable) vs
          already resolved, and the average hit per incident. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Incidents</p>
          <p className="text-xl font-bold">{analytics.total}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Units lost/damaged</p>
          <p className="text-xl font-bold">{analytics.totalUnits}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Open (recoverable)</p>
          <p className="text-xl font-bold text-rose-600">{formatCurrency(analytics.openCost)}</p>
          <p className="text-[11px] text-muted-foreground">{analytics.openCount} open</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Resolved</p>
          <p className="text-xl font-bold text-emerald-600">{formatCurrency(analytics.resolvedCost)}</p>
          <p className="text-[11px] text-muted-foreground">{analytics.resolvedCount} closed · {analytics.resolvedPct}%</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Avg / incident</p>
          <p className="text-xl font-bold">{formatCurrency(analytics.avg)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Total cost</p>
          <p className="text-xl font-bold">{formatCurrency(analytics.totalCost)}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="items">By Item</TabsTrigger>
          <TabsTrigger value="client">By Client</TabsTrigger>
          <TabsTrigger value="person">By Person</TabsTrigger>
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

        <TabsContent value="client" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost by Client</CardTitle>
              <p className="text-sm text-muted-foreground">Who the damage happened to - the basis for billing the responsible client.</p>
            </CardHeader>
            <CardContent>
              {analytics.byClient.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No damages in this period</p>
              ) : (
                <div className="space-y-3">
                  {analytics.byClient.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted-foreground">{c.count} incident{c.count === 1 ? "" : "s"} · {c.units} unit{c.units === 1 ? "" : "s"}</p>
                      </div>
                      <p className="font-bold text-lg text-rose-600">{formatCurrency(c.cost)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="person" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost by Responsible Person</CardTitle>
              <p className="text-sm text-muted-foreground">Which staff member was on the hook - spot repeat causes and training gaps.</p>
            </CardHeader>
            <CardContent>
              {analytics.byPerson.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No damages in this period</p>
              ) : (
                <div className="space-y-3">
                  {analytics.byPerson.map((p) => (
                    <div key={p.name} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{p.count} incident{p.count === 1 ? "" : "s"} · {p.units} unit{p.units === 1 ? "" : "s"}</p>
                      </div>
                      <p className="font-bold text-lg">{formatCurrency(p.cost)}</p>
                    </div>
                  ))}
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
          <div className="flex flex-wrap gap-2 mb-2">
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
          {/* Status filter: open vs billed-to-client vs otherwise-resolved. */}
          <div className="flex flex-wrap gap-2 mb-4">
            {([
              { key: "all", label: "Any status" },
              { key: "open", label: "Open" },
              { key: "billed", label: "Billed" },
              { key: "resolved", label: "Resolved (not billed)" },
            ] as const).map((s) => (
              <Button
                key={s.key}
                variant={statusFilter === s.key ? "default" : "outline"}
                onClick={() => setStatusFilter(s.key)}
                size="sm"
                className={statusFilter === s.key && s.key === "billed" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                {s.label}
              </Button>
            ))}
          </div>

          {(() => { const recentRows = damages.filter((d: any) => {
            if (statusFilter === "open") return !d.resolved;
            if (statusFilter === "billed") return isBilled(d);
            if (statusFilter === "resolved") return d.resolved && !isBilled(d);
            return true;
          }); return (
          recentRows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No incidents recorded</p>
                <p className="text-sm">Equipment is being well maintained</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentRows.map((damage) => (
                <Card key={damage.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{damage.equipment?.name}</h4>
                          <Badge className={damageTypeColours[damage.damage_type as DamageType]}>
                            {damageTypeLabels[damage.damage_type as DamageType]}
                          </Badge>
                          {isBilled(damage) && (
                            <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-400">
                              Billed
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {/* Event + client so this reads as a billable line -
                              which event it happened on and who to charge. */}
                          <p>
                            Event: {damage.order?.order_number || "-"}
                            {damage.order?.event_name && damage.order.event_name !== "Untitled" ? ` - ${damage.order.event_name}` : ""}
                            {damage.order?.event_date ? ` (${damage.order.event_date})` : ""}
                          </p>
                          {damage.order?.client_name && (
                            <p>Client: {damage.order.client_name}</p>
                          )}
                          <p>Stage: {damage.damage_stage}</p>
                          <p>
                            Quantity: {damage.quantity_damaged} items
                            {Number(damage.unit_cost) > 0 ? ` · ${formatCurrency(Number(damage.unit_cost))} each` : ""}
                          </p>
                          {damage.responsible_name && (
                            <p>Responsible: {damage.responsible_name}</p>
                          )}
                          {damage.description && (
                            <p className="mt-2 text-foreground">{damage.description}</p>
                          )}
                          {damage.resolved && damage.resolution_notes && (
                            <p className="mt-1 text-emerald-700 dark:text-emerald-400">Resolution: {damage.resolution_notes}</p>
                          )}
                          {damage.photo_url && (
                            <a href={damage.photo_url} target="_blank" rel="noopener noreferrer" className="inline-block text-cyan-700 hover:underline">
                              View photo
                            </a>
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
                          size="sm"
                          className="gap-1.5 min-h-11 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleBillClient(damage)}
                          disabled={pendingDamageId === damage.id || Number(damage.total_cost || 0) <= 0 || !damage.order_id}
                          aria-label={`Bill client for ${damage.equipment?.name || "this damage"}`}
                          title={Number(damage.total_cost || 0) <= 0 ? "Set a replacement cost first" : !damage.order_id ? "No order linked" : "Charge this to the client"}
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Bill client {Number(damage.total_cost || 0) > 0 ? formatCurrency(Number(damage.total_cost)) : ""}
                        </Button>
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
          ) ); })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
