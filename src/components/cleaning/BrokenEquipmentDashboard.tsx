import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  TrendingUp,
  Package,
  DollarSign,
  Calendar as CalendarIcon,
  Filter,
} from "lucide-react";
import { equipmentTrackingService, type DamageType } from "@/services/equipmentTrackingService";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export function BrokenEquipmentDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [damages, setDamages] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });
  const [selectedType, setSelectedType] = useState<DamageType | "all">("all");

  useEffect(() => {
    loadDamages();
  }, [user, dateRange, selectedType]);

  const loadDamages = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const filters: any = {
        userId: user.id,
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

  const damageTypeColors: Record<DamageType, string> = {
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

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
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

      {/* Summary Cards */}
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
                  <div className={`p-3 ${damageTypeColors[type as DamageType]} bg-opacity-10 rounded-lg`}>
                    <AlertTriangle className={`h-6 w-6 ${damageTypeColors[type as DamageType].replace('bg-', 'text-')}`} />
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

      {/* Tabs for Different Views */}
      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="items">By Item</TabsTrigger>
          <TabsTrigger value="stage">By Stage</TabsTrigger>
          <TabsTrigger value="recent">Recent Incidents</TabsTrigger>
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
                  {breakdown?.items.map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded">
                          <Package className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.count} items</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(item.cost)}</p>
                      </div>
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
                          <Badge className={damageTypeColors[damage.damage_type]}>
                            {damageTypeLabels[damage.damage_type]}
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
                      </div>
                    </div>
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
