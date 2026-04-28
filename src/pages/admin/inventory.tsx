import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  RefreshCw,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { inventoryService } from "@/services/inventoryService";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minStock: number;
  maxStock: number;
  costPerUnit: number;
  supplier: string;
  lastRestocked: string;
  expiryDate?: string;
}

export default function AdminInventory() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [outlook, setOutlook] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    loadInventory();
    loadOutlook();
  }, [user?.company_id]);

  const loadOutlook = async () => {
    if (!user?.company_id) return;
    const { data, error } = await supabase
      .from("inventory_demand_outlook")
      .select("*")
      .eq("company_id", user.company_id)
      .returns<Record<string, unknown>[]>();
    if (error) {
      console.error("outlook error", error);
      setOutlook([]);
      return;
    }
    setOutlook(data || []);
  };

  const loadInventory = async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await inventoryService.getInventory(user.company_id);
      const mapped: InventoryItem[] = (rows || []).map((row: any) => ({
        id: row.id,
        name: row.item_name ?? "Unnamed",
        category: row.category ?? "Other",
        quantity: Number(row.current_stock ?? 0),
        unit: row.unit_of_measure ?? "unit",
        minStock: Number(row.minimum_stock ?? 0),
        maxStock: Number(row.maximum_stock ?? 0),
        costPerUnit: Number(row.cost_per_unit ?? 0),
        supplier: row.preferred_supplier_id ? "Supplier set" : "—",
        lastRestocked: row.updated_at ?? "",
        expiryDate: undefined,
      }));
      setInventory(mapped);
    } catch (error) {
      console.error("Error loading inventory:", error);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const getLowStockItems = () => inventory.filter((item) => item.quantity < item.minStock);
  const getOutOfStockItems = () => inventory.filter((item) => item.quantity === 0);
  const getExpiringItems = () => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return inventory.filter(
      (item) => item.expiryDate && new Date(item.expiryDate) < thirtyDaysFromNow
    );
  };

  // Apply tab filter first, then fuzzy-rank the remainder so low-stock /
  // expiring views still benefit from smart search across name + category.
  const tabFilteredInventory = useMemo(() => {
    if (activeTab === "all") return inventory;
    if (activeTab === "low-stock") return inventory.filter((i) => i.quantity < i.minStock);
    if (activeTab === "out-of-stock") return inventory.filter((i) => i.quantity === 0);
    if (activeTab === "expiring") {
      const thirty = new Date();
      thirty.setDate(thirty.getDate() + 30);
      return inventory.filter((i) => i.expiryDate && new Date(i.expiryDate) < thirty);
    }
    return inventory;
  }, [inventory, activeTab]);

  const filteredInventory = useFuzzyItems(
    tabFilteredInventory,
    searchTerm,
    [
      { key: "name" as any, weight: 3 },
      { key: "category" as any, weight: 2 },
      { key: "sku" as any, weight: 2 },
      { key: "supplier" as any, weight: 1 },
      { key: "location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const totalValue = inventory.reduce(
    (sum, item) => sum + item.quantity * item.costPerUnit,
    0
  );

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Inventory Management - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Inventory Management
                  </h1>
                  <p className="text-slate-600 mt-1">Monitor stock levels and supplies</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Sync
                </Button>
                <Button className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 gap-2">
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Total Items <InfoTooltip content={"Number of distinct items currently tracked in your inventory."} /></p>
                    <p className="text-3xl font-bold text-slate-900">{inventory.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-700 mb-1 flex items-center gap-1.5">Low Stock <InfoTooltip content={"Items that have dropped below their minimum and need reordering."} /></p>
                    <p className="text-3xl font-bold text-red-900">
                      {getLowStockItems().length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-yellow-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-700 mb-1 flex items-center gap-1.5">Expiring Soon <InfoTooltip content={"Items with an expiry date in the next 30 days. Use them up or move them on."} /></p>
                    <p className="text-3xl font-bold text-amber-900">
                      {getExpiringItems().length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 mb-1 flex items-center gap-1.5">Total Value <InfoTooltip content={"Total value of stock you have on hand right now, based on each item's cost per unit."} /></p>
                    <p className="text-2xl font-bold text-green-900">
                      R{totalValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <Package className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search inventory items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Demand Outlook -- ties stock to confirmed orders */}
          {outlook.length > 0 && (() => {
            const at_risk = outlook
              .filter((o: any) => o.status === "shortfall" || o.status === "below_minimum" || o.status === "low")
              .sort((a: any, b: any) => {
                const order: Record<string, number> = { shortfall: 0, below_minimum: 1, low: 2 };
                return (order[a.status] ?? 9) - (order[b.status] ?? 9);
              })
              .slice(0, 8);
            const totalUpcoming = outlook.reduce((s: number, o: any) => s + (Number(o.upcoming_order_count) || 0), 0);
            if (at_risk.length === 0) return null;
            return (
              <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-amber-50 to-orange-50">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        Demand outlook
                      </CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {at_risk.length} item{at_risk.length === 1 ? "" : "s"} at risk against confirmed orders
                      </p>
                    </div>
                    <Link href="/team-portal/shopping/alerts">
                      <Button size="sm" variant="outline" className="gap-2">
                        <TrendingDown className="w-4 h-4" />
                        Open shopping alerts
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-amber-200">
                        <tr>
                          <th className="text-left py-2 pr-3"><span className="inline-flex items-center gap-1.5">Item <InfoTooltip content={"The name of the inventory item."} /></span></th>
                          <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1.5">On hand <InfoTooltip content={"How much of this item you have in stock right now."} /></span></th>
                          <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1.5">Need 7d <InfoTooltip content={"How much of this item your confirmed orders for the next seven days will use, based on the recipes."} /></span></th>
                          <th className="text-right py-2 px-3"><span className="inline-flex items-center gap-1.5">After 7d <InfoTooltip content={"What you will be left with once the next seven days of bookings have run through."} /></span></th>
                          <th className="text-left py-2 pl-3"><span className="inline-flex items-center gap-1.5">Status <InfoTooltip content={"How tight stock is looking. Shortfall means you will run out, below minimum means below the reorder point, low means thin, healthy means you are fine."} /></span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {at_risk.map((r: any) => {
                          const tone =
                            r.status === "shortfall" ? "bg-red-100 text-red-800 border-red-200" :
                            r.status === "below_minimum" ? "bg-amber-100 text-amber-800 border-amber-200" :
                            "bg-yellow-100 text-yellow-800 border-yellow-200";
                          const projected = Number(r.projected_stock_after_7_days);
                          const projectedTone = projected < 0
                            ? "text-red-600"
                            : projected < Number(r.minimum_stock)
                              ? "text-amber-600"
                              : "text-slate-900";
                          return (
                            <tr key={r.inventory_item_id} className="border-b border-amber-100">
                              <td className="py-2 pr-3 font-medium text-slate-900">{r.item_name}</td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {Number(r.current_stock).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                                {Number(r.demand_next_7_days).toLocaleString()}
                              </td>
                              <td className={`py-2 px-3 text-right tabular-nums font-medium ${projectedTone}`}>
                                {projected.toLocaleString()}
                              </td>
                              <td className="py-2 pl-3">
                                <Badge variant="outline" className={`${tone} border capitalize`}>
                                  {r.status.replace("_", " ")}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Calculated from {totalUpcoming} confirmed order line item{totalUpcoming === 1 ? "" : "s"} in the next 30 days. Recipe-driven -- editing recipes or stock updates this immediately.
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {/* Inventory Table */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 bg-slate-100">
                  <TabsTrigger value="all">All Items</TabsTrigger>
                  <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
                  <TabsTrigger value="out-of-stock">Out of Stock</TabsTrigger>
                  <TabsTrigger value="expiring">Expiring</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-slate-600">Loading inventory...</p>
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">No items found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredInventory.map((item) => {
                    const isLowStock = item.quantity < item.minStock;
                    const isOutOfStock = item.quantity === 0;
                    const thirtyDaysFromNow = new Date();
                    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                    const isExpiring =
                      item.expiryDate && new Date(item.expiryDate) < thirtyDaysFromNow;

                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-lg border-2 ${
                          isOutOfStock
                            ? "bg-red-50 border-red-200"
                            : isLowStock
                            ? "bg-orange-50 border-orange-200"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-lg text-slate-900">
                                {item.name}
                              </h4>
                              <Badge className="bg-slate-100 text-slate-700">
                                {item.category}
                              </Badge>
                              {isOutOfStock && (
                                <Badge className="bg-red-100 text-red-800">Out of Stock</Badge>
                              )}
                              {isLowStock && !isOutOfStock && (
                                <Badge className="bg-orange-100 text-orange-800">Low Stock</Badge>
                              )}
                              {isExpiring && (
                                <Badge className="bg-amber-100 text-amber-800">Expiring Soon</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-600">
                              <div>
                                <span className="font-medium">Stock:</span> {item.quantity}{" "}
                                {item.unit}
                              </div>
                              <div>
                                <span className="font-medium">Reorder at:</span> {item.minStock} {item.unit}
                                {item.maxStock > 0 && (
                                  <span className="text-slate-400"> / max {item.maxStock}</span>
                                )}
                              </div>
                              <div>
                                <span className="font-medium">Cost:</span> R{item.costPerUnit}/
                                {item.unit}
                              </div>
                              <div>
                                <span className="font-medium">Supplier:</span> {item.supplier}
                              </div>
                            </div>
                            {item.maxStock > 0 && (
                              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    item.quantity <= item.minStock
                                      ? "bg-red-500"
                                      : item.quantity >= item.maxStock * 0.85
                                      ? "bg-emerald-500"
                                      : "bg-blue-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(100, Math.max(2, (item.quantity / item.maxStock) * 100))}%`,
                                  }}
                                />
                              </div>
                            )}
                            {item.expiryDate && (
                              <div className="mt-2 text-sm text-slate-600">
                                <span className="font-medium">Expires:</span>{" "}
                                {new Date(item.expiryDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function ProtectedInventoryPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <AdminInventory />
    </ProtectedRoute>
  );
}