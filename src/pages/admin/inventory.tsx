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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ArrowUpDown,
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

const CATEGORIES = [
  "Produce",
  "Meat & Poultry",
  "Seafood",
  "Dairy",
  "Dry Goods",
  "Beverages",
  "Condiments",
  "Bakery",
  "Frozen",
  "Cleaning",
  "Equipment",
  "Other",
];

const emptyForm = {
  item_name: "",
  category: "Other",
  unit_of_measure: "unit",
  current_stock: "",
  minimum_stock: "",
  maximum_stock: "",
  cost_per_unit: "",
};

export default function AdminInventory() {
  const { user } = useAuth();
  const companyId = (user as any)?.company_id ?? null;
  const userId = user?.id ?? "";

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [outlook, setOutlook] = useState<any[]>([]);

  // ── Add Item modal ──────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyForm });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // ── Edit modal ─────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // ── Adjust Stock modal ─────────────────────────────────────────
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  // ── Delete confirm ─────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadInventory();
    loadOutlook();
  }, [(user as any)?.company_id]);

  const loadOutlook = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("inventory_demand_outlook")
      .select("*")
      .eq("company_id", companyId)
      .returns<Record<string, unknown>[]>();
    if (error) {
      console.error("outlook error", error);
      setOutlook([]);
      return;
    }
    setOutlook(data || []);
  };

  const loadInventory = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await inventoryService.getInventory(companyId);
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

  // ── Add handlers ───────────────────────────────────────────────
  const openAdd = () => {
    setAddForm({ ...emptyForm });
    setAddError("");
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    if (!addForm.item_name.trim()) {
      setAddError("Item name is required.");
      return;
    }
    if (!companyId) {
      setAddError("No company associated with your account.");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      await inventoryService.createInventoryItem({
        company_id: companyId,
        item_name: addForm.item_name.trim(),
        category: addForm.category,
        unit_of_measure: addForm.unit_of_measure.trim() || "unit",
        current_stock: addForm.current_stock !== "" ? Number(addForm.current_stock) : 0,
        minimum_stock: addForm.minimum_stock !== "" ? Number(addForm.minimum_stock) : 0,
        maximum_stock: addForm.maximum_stock !== "" ? Number(addForm.maximum_stock) : 0,
        cost_per_unit: addForm.cost_per_unit !== "" ? Number(addForm.cost_per_unit) : 0,
      });
      setAddOpen(false);
      await loadInventory();
    } catch (err: any) {
      setAddError(err?.message ?? "Failed to save item.");
    } finally {
      setAddSaving(false);
    }
  };

  // ── Edit handlers ──────────────────────────────────────────────
  const openEdit = (item: InventoryItem) => {
    setEditTarget(item);
    setEditForm({
      item_name: item.name,
      category: item.category,
      unit_of_measure: item.unit,
      current_stock: String(item.quantity),
      minimum_stock: String(item.minStock),
      maximum_stock: String(item.maxStock),
      cost_per_unit: String(item.costPerUnit),
    });
    setEditError("");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editForm.item_name.trim()) {
      setEditError("Item name is required.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      await inventoryService.updateInventoryItem(editTarget.id, {
        item_name: editForm.item_name.trim(),
        category: editForm.category,
        unit_of_measure: editForm.unit_of_measure.trim() || "unit",
        current_stock: editForm.current_stock !== "" ? Number(editForm.current_stock) : 0,
        minimum_stock: editForm.minimum_stock !== "" ? Number(editForm.minimum_stock) : 0,
        maximum_stock: editForm.maximum_stock !== "" ? Number(editForm.maximum_stock) : 0,
        cost_per_unit: editForm.cost_per_unit !== "" ? Number(editForm.cost_per_unit) : 0,
      });
      setEditOpen(false);
      await loadInventory();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to update item.");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Adjust stock handlers ──────────────────────────────────────
  const openAdjust = (item: InventoryItem) => {
    setAdjustTarget(item);
    setAdjustDelta("");
    setAdjustNote("");
    setAdjustError("");
    setAdjustOpen(true);
  };

  const handleAdjustSave = async () => {
    if (!adjustTarget) return;
    const delta = Number(adjustDelta);
    if (adjustDelta === "" || isNaN(delta)) {
      setAdjustError("Enter a quantity to add or remove (use a negative number to remove stock).");
      return;
    }
    const newTotal = adjustTarget.quantity + delta;
    if (newTotal < 0) {
      setAdjustError(`Cannot go below 0. Current stock is ${adjustTarget.quantity} ${adjustTarget.unit}.`);
      return;
    }
    setAdjustSaving(true);
    setAdjustError("");
    try {
      await inventoryService.adjustStock(
        adjustTarget.id,
        newTotal,
        userId,
        adjustNote.trim() || undefined
      );
      setAdjustOpen(false);
      await loadInventory();
    } catch (err: any) {
      setAdjustError(err?.message ?? "Failed to adjust stock.");
    } finally {
      setAdjustSaving(false);
    }
  };

  // ── Delete handlers ────────────────────────────────────────────
  const openDelete = (item: InventoryItem) => {
    setDeleteTarget(item);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await inventoryService.deleteInventoryItem(deleteTarget.id);
      setDeleteOpen(false);
      await loadInventory();
    } catch (err: any) {
      console.error("Delete failed:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Derived data ───────────────────────────────────────────────
  const getLowStockItems = () => inventory.filter((item) => item.quantity < item.minStock);
  const getOutOfStockItems = () => inventory.filter((item) => item.quantity === 0);
  const getExpiringItems = () => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return inventory.filter(
      (item) => item.expiryDate && new Date(item.expiryDate) < thirtyDaysFromNow
    );
  };

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

  // ── Shared form field renderer ─────────────────────────────────
  const renderItemForm = (
    form: typeof emptyForm,
    setForm: (f: typeof emptyForm) => void,
    error: string
  ) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="item_name">Item name *</Label>
          <Input
            id="item_name"
            value={form.item_name}
            onChange={(e) => setForm({ ...form, item_name: e.target.value })}
            placeholder="e.g. Chicken Breast"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="unit_of_measure">Unit of measure</Label>
          <Input
            id="unit_of_measure"
            value={form.unit_of_measure}
            onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
            placeholder="e.g. kg, litre, unit"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="current_stock">Current stock</Label>
          <Input
            id="current_stock"
            type="number"
            min="0"
            value={form.current_stock}
            onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cost_per_unit">Cost per unit (R)</Label>
          <Input
            id="cost_per_unit"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_per_unit}
            onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
            placeholder="0.00"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="minimum_stock">Reorder at (min stock)</Label>
          <Input
            id="minimum_stock"
            type="number"
            min="0"
            value={form.minimum_stock}
            onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="maximum_stock">Max stock</Label>
          <Input
            id="maximum_stock"
            type="number"
            min="0"
            value={form.maximum_stock}
            onChange={(e) => setForm({ ...form, maximum_stock: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
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
                <Button variant="outline" className="gap-2" onClick={loadInventory}>
                  <RefreshCw className="w-4 h-4" />
                  Sync
                </Button>
                <Button
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 gap-2"
                  onClick={openAdd}
                >
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
                  <p className="text-slate-600 mb-4">No items found</p>
                  <Button
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 gap-2"
                    onClick={openAdd}
                  >
                    <Plus className="w-4 h-4" />
                    Add your first item
                  </Button>
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
                          <div className="flex items-center gap-1 ml-4 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Adjust stock"
                              onClick={() => openAdjust(item)}
                              className="text-slate-500 hover:text-green-700 hover:bg-green-50"
                            >
                              <ArrowUpDown className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit item"
                              onClick={() => openEdit(item)}
                              className="text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete item"
                              onClick={() => openDelete(item)}
                              className="text-slate-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* ── Add Item Modal ─────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-600" />
              Add inventory item
            </DialogTitle>
          </DialogHeader>
          {renderItemForm(addForm, setAddForm, addError)}
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={addSaving}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAddSave}
              disabled={addSaving}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              {addSaving ? "Saving..." : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ─────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Edit item -- {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {renderItemForm(editForm, setEditForm, editError)}
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={editSaving}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleEditSave}
              disabled={editSaving}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {editSaving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Modal ─────────────────────────────────────── */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="w-5 h-5 text-green-600" />
              Adjust stock -- {adjustTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
                <span className="text-slate-500">Current stock:</span>{" "}
                <span className="font-semibold text-slate-900">
                  {adjustTarget.quantity} {adjustTarget.unit}
                </span>
              </div>
              <div>
                <Label htmlFor="adjust_delta">
                  Quantity to add or remove
                </Label>
                <p className="text-xs text-slate-500 mb-1.5">
                  Positive number to receive stock, negative to use or remove.
                </p>
                <Input
                  id="adjust_delta"
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  placeholder="e.g. 10 or -3"
                  className="mt-1"
                  autoFocus
                />
                {adjustDelta !== "" && !isNaN(Number(adjustDelta)) && (
                  <p className="text-xs mt-1.5 text-slate-600">
                    New total:{" "}
                    <span className={`font-semibold ${adjustTarget.quantity + Number(adjustDelta) < 0 ? "text-red-600" : "text-slate-900"}`}>
                      {adjustTarget.quantity + Number(adjustDelta)} {adjustTarget.unit}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="adjust_note">Note (optional)</Label>
                <Input
                  id="adjust_note"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="e.g. Weekly delivery, used for event"
                  className="mt-1"
                />
              </div>
              {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
            </div>
          )}
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={adjustSaving}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAdjustSave}
              disabled={adjustSaving}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              {adjustSaving ? "Saving..." : "Update stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Modal ───────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              Delete item
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            Remove <span className="font-semibold">{deleteTarget?.name}</span> from inventory? This cannot be undone.
          </p>
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteLoading}>Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
