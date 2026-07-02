import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { toLocalISO } from "@/lib/localDate";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { notificationService } from "@/services/notificationService";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Dialog + Label imports were only used by the inline AddItem /
// StockMovement dialogs that now live in
// @/components/admin/inventory-tracking/. Keep the page imports lean.
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  AlertTriangle,
  Plus,
  Minus,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Trash2,
  CheckCircle,
  XCircle,
  X,
  RefreshCw,
  Clock,
  Download,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AddInventoryItemDialog } from "@/components/admin/inventory-tracking/AddInventoryItemDialog";
import { StockMovementDialog } from "@/components/admin/inventory-tracking/StockMovementDialog";
import type { InventoryItem, Supplier, StockMovement } from "@/components/admin/inventory-tracking/types";

// Audit 2026-07-02: same INV-C class bug /admin/inventory had. This
// page shipped with NO route guard, so any authenticated role
// (kitchen, cleaning, even client-portal users) could open it and
// hit the add / move / delete mutations, gated only by RLS. Wrap in
// the same allow-list the other inventory surfaces use.
export default function ProtectedInventoryTrackingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <InventoryTracking />
    </ProtectedRoute>
  );
}

function InventoryTracking() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  // Wave 24: tenant currency on the Total Value tile.
  const tenantCurrency = useTenantCurrency(profile?.company_id ?? null);
  const [loading, setLoading] = useState(true);
  // Audit 2026-07-02: persistent load-failure state with Retry.
  // Toast-only errors left the page reading as an empty store room.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  // Phase 29 #9: "/" focus + "n" open Add Item. Same keyboard
  // pattern as the rest of the admin list pages.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsAddItemOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [formData, setFormData] = useState({
    item_name: "",
    category: "produce",
    current_stock: 0,
    minimum_stock: 0,
    maximum_stock: 0,
    unit_of_measure: "kg",
    preferred_supplier_id: "none",
    cost_per_unit: 0
  });

  const [stockMovementData, setStockMovementData] = useState({
    transaction_type: "purchase" as 'purchase' | 'usage',
    quantity: 0,
    notes: ""
  });

  useEffect(() => {
    if (profile?.company_id) {
      loadInventory();
      loadSuppliers();
      loadStockMovements();
    }
  }, [profile]);

  // Audit 2026-07-02: honour ?itemId=<id>. The CommandPalette deep-
  // links inventory hits to /admin/inventory-tracking?itemId=... but
  // the page ignored the param, so every jump landed unfiltered.
  // Once the list loads, pre-fill the search with the item's name.
  const [didFocusFromQuery, setDidFocusFromQuery] = useState(false);
  useEffect(() => {
    if (didFocusFromQuery) return;
    if (!router.isReady || inventoryItems.length === 0) return;
    const id = typeof router.query.itemId === "string" ? router.query.itemId : "";
    if (!id) return;
    const target = inventoryItems.find((i) => i.id === id);
    if (!target) return;
    setDidFocusFromQuery(true);
    setSearchTerm(target.item_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.itemId, inventoryItems.length]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from("inventory_items")
        .select(`
          *,
          suppliers:preferred_supplier_id (
            supplier_name
          )
        `)
        .eq("company_id", profile?.company_id)
        // Audit 2026-07-02: /admin/inventory soft-deletes items
        // (deleted_at). This page ignored the flag and kept showing
        // deleted rows, so the two surfaces disagreed on counts and
        // total value.
        .is("deleted_at", null)
        .order("item_name");

      if (error) throw error;

      const items = data?.map(item => ({
        ...item,
        supplier_name: Array.isArray(item.suppliers) ? item.suppliers[0]?.supplier_name : item.suppliers?.supplier_name
      })) || [];

      setInventoryItems(items);
    } catch (error: any) {
      console.error("Error loading inventory:", error);
      setLoadError(error?.message || "Failed to load inventory items.");
      toast({
        title: "Error",
        description: "Failed to load inventory items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", profile?.company_id)
        .order("supplier_name");

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error: any) {
      console.error("Error loading suppliers:", error);
    }
  };

  const loadStockMovements = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select(`
          *,
          inventory_items (item_name),
          profiles:performed_by (full_name)
        `)
        .eq("company_id", profile?.company_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const movements = data?.map(movement => ({
        ...movement,
        item_name: Array.isArray(movement.inventory_items) 
          ? movement.inventory_items[0]?.item_name 
          : movement.inventory_items?.item_name,
        staff_name: Array.isArray(movement.profiles) 
          ? movement.profiles[0]?.full_name 
          : movement.profiles?.full_name
      })) || [];

      setStockMovements(movements as any);
    } catch (error: any) {
      console.error("Error loading stock movements:", error);
    }
  };

  const handleAddItem = async () => {
    try {
      const insertData = {
        company_id: profile?.company_id,
        item_name: formData.item_name,
        category: formData.category,
        current_stock: formData.current_stock,
        minimum_stock: formData.minimum_stock,
        maximum_stock: formData.maximum_stock,
        unit_of_measure: formData.unit_of_measure,
        cost_per_unit: formData.cost_per_unit,
        preferred_supplier_id: formData.preferred_supplier_id === "none" ? null : formData.preferred_supplier_id
      };

      const { error } = await supabase
        .from("inventory_items")
        .insert([insertData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Inventory item added successfully!"
      });

      setIsAddItemOpen(false);
      setFormData({
        item_name: "",
        category: "produce",
        current_stock: 0,
        minimum_stock: 0,
        maximum_stock: 0,
        unit_of_measure: "kg",
        preferred_supplier_id: "none",
        cost_per_unit: 0
      });
      loadInventory();
    } catch (error: any) {
      console.error("Error adding item:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "inventory item" }),
        variant: "destructive"
      });
    }
  };

  const handleStockMovement = async () => {
    if (!selectedItem) return;

    try {
      const newStock = stockMovementData.transaction_type === 'purchase'
        ? selectedItem.current_stock + stockMovementData.quantity
        : selectedItem.current_stock - stockMovementData.quantity;

      if (newStock < 0) {
        toast({
          title: "Error",
          description: "Cannot remove more stock than available",
          variant: "destructive"
        });
        return;
      }

      // Update inventory stock
      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ 
          current_stock: newStock
        })
        .eq("id", selectedItem.id);

      if (updateError) throw updateError;

      // Record movement. Audit 2026-07-02: quantity is now SIGNED
      // (usage stores a negative number) to match the canonical
      // inventoryService.adjustStock convention - /admin/inventory's
      // movement history renders the raw sign, so an unsigned usage
      // row from this page displayed as "+5" stock added.
      const { error: movementError } = await supabase
        .from("inventory_transactions")
        .insert([{
          company_id: profile?.company_id,
          inventory_item_id: selectedItem.id,
          transaction_type: stockMovementData.transaction_type,
          quantity: stockMovementData.transaction_type === 'purchase'
            ? Math.abs(stockMovementData.quantity)
            : -Math.abs(stockMovementData.quantity),
          notes: stockMovementData.notes,
          performed_by: profile?.id
        }]);

      if (movementError) throw movementError;

      // Check if low stock and notify the people who can act on it.
      // Audit 2026-07-02: this used to insert a notification for the
      // CURRENT user only - the person who just moved the stock and
      // already knows. Broadcast (deduped, best-effort) to admins +
      // shopping staff instead.
      if (newStock <= selectedItem.minimum_stock && profile?.company_id) {
        try {
          await notificationService.broadcastNotification({
            companyId: profile.company_id,
            type: 'stock_low',
            title: 'Low Stock Alert',
            message: `${selectedItem.item_name} is low on stock (${newStock} ${selectedItem.unit_of_measure} remaining).`,
            targetRoles: [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SHOPPING_STAFF],
            priority: "normal",
            link: "/admin/inventory",
            relatedEntityType: 'inventory_item',
            relatedEntityId: selectedItem.id,
            dedup: true,
          });
        } catch (notifyErr) {
          console.warn("[admin/inventory-tracking] low-stock notification failed:", notifyErr);
        }
      }

      toast({
        title: "Success",
        description: "Stock updated successfully!"
      });

      setIsAddStockOpen(false);
      setSelectedItem(null);
      setStockMovementData({
        transaction_type: "purchase",
        quantity: 0,
        notes: ""
      });
      loadInventory();
      loadStockMovements();
    } catch (error: any) {
      console.error("Error updating stock:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "inventory item" }),
        variant: "destructive"
      });
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) return;

    try {
      // Audit 2026-07-02: soft delete (deleted_at) instead of a hard
      // DELETE. /admin/inventory soft-deletes so history and FK'd
      // transactions survive; a hard delete here either orphaned or
      // failed on the FK depending on the constraint.
      const { error } = await (supabase as any)
        .from("inventory_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", itemId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Item deleted successfully!"
      });

      loadInventory();
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "inventory item" }),
        variant: "destructive"
      });
    }
  };

  const getOrCreateShoppingList = async () => {
    let { data: list } = await supabase
      .from("shopping_lists")
      .select("id")
      .eq("company_id", profile?.company_id)
      .eq("status", "pending")
      .maybeSingle();

    if (!list) {
      const { data: newList, error: listError } = await supabase
        .from("shopping_lists")
        .insert([{ 
          company_id: profile?.company_id, 
          status: 'pending', 
          list_date: toLocalISO(new Date())
        }])
        .select()
        .single();
      if (listError) throw listError;
      list = newList;
    }
    return list.id;
  };

  const generateShoppingList = async () => {
    const lowStockItems = inventoryItems.filter(item => item.current_stock <= item.minimum_stock);
    
    if (lowStockItems.length === 0) {
      toast({
        title: "No Action Needed",
        description: "All items are adequately stocked!"
      });
      return;
    }

    try {
      const listId = await getOrCreateShoppingList();

      // Audit 2026-07-02: guard items without a par level. max = 0
      // used to produce NEGATIVE buy quantities and costs; fall back
      // to topping up to 1.5x the reorder point, minimum 1.
      const shoppingListItems = lowStockItems.map(item => {
        const qty = item.maximum_stock > 0
          ? Math.max(1, item.maximum_stock - item.current_stock)
          : Math.max(1, Math.ceil(item.minimum_stock * 1.5 - item.current_stock));
        return {
          shopping_list_id: listId,
          user_id: profile?.id,
          item_id: item.id,
          name: item.item_name,
          quantity: qty,
          unit: item.unit_of_measure,
          category: item.category,
          estimated_cost: qty * item.cost_per_unit,
          purchased: false
        };
      });

      const { error } = await supabase
        .from("shopping_list_items")
        .insert(shoppingListItems);

      if (error) throw error;

      // Best-effort: tell the shopping team a run is ready. Deduped
      // broadcast; a notification failure never blocks the list.
      if (profile?.company_id) {
        try {
          await notificationService.broadcastNotification({
            companyId: profile.company_id,
            type: "shopping_list_created",
            title: "New shopping list ready",
            message: `A low-stock shopping list with ${lowStockItems.length} item${lowStockItems.length === 1 ? "" : "s"} was generated. Open the Buy list to start ticking items off.`,
            targetRoles: [UserRole.SHOPPING_STAFF],
            priority: "normal",
            link: "/team-portal/shopping/dashboard",
            relatedEntityType: "shopping_list",
            relatedEntityId: listId,
            dedup: true,
          });
        } catch (notifyErr) {
          console.warn("[admin/inventory-tracking] shopping-list notification failed:", notifyErr);
        }
      }

      toast({
        title: "Success",
        description: `Shopping list created with ${lowStockItems.length} items!`,
      });
    } catch (error: any) {
      console.error("Error generating shopping list:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "shopping list" }),
        variant: "destructive"
      });
    }
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.current_stock === 0) return { label: "Out of Stock", color: "bg-rose-500", icon: XCircle };
    if (item.current_stock <= item.minimum_stock) return { label: "Low Stock", color: "bg-amber-500", icon: AlertTriangle };
    // Audit 2026-07-02: guard maximum_stock > 0. Items with no par
    // level set (max = 0) were all flagged "Overstocked".
    if (item.maximum_stock > 0 && item.current_stock >= item.maximum_stock) return { label: "Overstocked", color: "bg-blue-500", icon: TrendingUp };
    return { label: "In Stock", color: "bg-brand-primary", icon: CheckCircle };
  };

  // Apply category + status filters first, then fuzzy-rank by name / sku /
  // supplier / location so a query like "olive PE-12" still finds it.
  const categoryStatusFiltered = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "low" && item.current_stock <= item.minimum_stock) ||
        (statusFilter === "out" && item.current_stock === 0) ||
        (statusFilter === "ok" && item.current_stock > item.minimum_stock);
      return matchesCategory && matchesStatus;
    });
  }, [inventoryItems, categoryFilter, statusFilter]);

  const filteredItems = useFuzzyItems(
    categoryStatusFiltered,
    searchTerm,
    [
      { key: "item_name" as any, weight: 3 },
      { key: "sku" as any, weight: 2 },
      { key: "category" as any, weight: 2 },
      { key: "supplier" as any, weight: 1 },
      { key: "location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const categories = [...new Set(inventoryItems.map(item => item.category))];
  const lowStockCount = inventoryItems.filter(item => item.current_stock <= item.minimum_stock).length;
  const outOfStockCount = inventoryItems.filter(item => item.current_stock === 0).length;
  const totalValue = inventoryItems.reduce((sum, item) => sum + (item.current_stock * item.cost_per_unit), 0);

  if (loading) {
    return (
      <>
        <AdminNav />
        <div className="admin-page-shell">
          <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
            <div className="text-center">
              <Package className="h-12 w-12 animate-spin mx-auto mb-4 text-slate-600" />
              <p className="text-slate-600">Loading inventory...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Inventory tracking"
            icon={Package}
            subtitle="Live stock levels with low-stock alerts. Generate a shopping list from the gap between what you have and what upcoming events will need."
            meta={
              !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {inventoryItems.length} item{inventoryItems.length === 1 ? "" : "s"}
                  </span>
                  {lowStockCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {lowStockCount} low stock
                    </span>
                  )}
                  {outOfStockCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      {outOfStockCount} out of stock
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
            <>
            {/* Phase 28 #5: manual refresh. Stock counts change
                constantly via clock-outs, deliveries, manual
                edits from other tabs. */}
            <Button
              variant="outline"
              onClick={() => { loadInventory(); loadStockMovements(); }}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {/* Phase 19 #7: inventory CSV export. The shopping
                list generator covers what to buy, but suppliers
                and bookkeepers regularly want a flat snapshot of
                current vs minimum vs cost for stock-take and
                budgeting. Exports filteredItems so search +
                category + status filters all flow through. */}
            <Button
              variant="outline"
              onClick={() => {
                if (filteredItems.length === 0) {
                  toast({ title: "Nothing to export", description: "Adjust filters until at least one item is visible." });
                  return;
                }
                const esc = (v: any) => {
                  if (v == null) return "";
                  const s = String(v).replace(/"/g, '""');
                  return /[",\n]/.test(s) ? `"${s}"` : s;
                };
                const headers = [
                  "Item", "Category", "Current stock", "Minimum", "Maximum", "Unit", "Cost per unit", "Supplier",
                ];
                const lines = [headers.join(",")];
                for (const it of filteredItems as InventoryItem[]) {
                  lines.push([
                    esc(it.item_name),
                    esc(it.category),
                    esc(it.current_stock),
                    esc(it.minimum_stock),
                    esc(it.maximum_stock),
                    esc(it.unit_of_measure),
                    esc(it.cost_per_unit),
                    esc(it.supplier_name || ""),
                  ].join(","));
                }
                // UTF-8 BOM so Excel-ZA renders currency + accents.
                const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `inventory-${toLocalISO(new Date())}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={generateShoppingList}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Generate Shopping List
            </Button>
            <AddInventoryItemDialog
              open={isAddItemOpen}
              onOpenChange={setIsAddItemOpen}
              suppliers={suppliers}
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleAddItem}
            />
            </>
            }
          />
          <PageWorkbench />

        {/* Audit 2026-07-02: persistent load-failure state with Retry. */}
        {loadError && (
          <Card className="bg-rose-50 border-l-4 border-l-rose-500 mb-6">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-900">Could not load inventory</p>
                <p className="text-xs text-rose-800/90">{loadError}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { loadInventory(); loadStockMovements(); }} disabled={loading} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">Total Items <InfoTooltip content={"Every inventory item recorded for your company."} /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{inventoryItems.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">Low Stock <InfoTooltip content={"Items sitting at or below their minimum level. Time to reorder."} /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{lowStockCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">Out of Stock <InfoTooltip content={"Items with zero stock on the shelf."} /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-600">{outOfStockCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">Total Value <InfoTooltip content={"Total value of the stock you currently hold, across every item."} /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{tenantCurrency.format(totalValue)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Input
                  ref={searchRef}
                  placeholder="Search by name, SKU, category, supplier, location... (press /)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-9"
                />
                {/* Phase 25 #9: clear-search affordance. */}
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat.replace('_', ' ').toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                  <SelectItem value="ok">In Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="inventory" className="space-y-6">
          <TabsList>
            <TabsTrigger value="inventory">Inventory ({filteredItems.length})</TabsTrigger>
            <TabsTrigger value="movements">Stock Movements ({stockMovements.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map(item => {
                const status = getStockStatus(item);
                const StatusIcon = status.icon;
                
                return (
                  <Card key={item.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{item.item_name}</CardTitle>
                          <CardDescription className="capitalize">{item.category.replace('_', ' ')}</CardDescription>
                        </div>
                        <Badge className={`${status.color} text-white`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-600">Stock Level</span>
                            <span className="font-semibold">{item.current_stock} {item.unit_of_measure}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            {/* Audit 2026-07-02: guard divide-by-zero.
                                max = 0 produced NaN/Infinity widths;
                                fall back to the same 2x-reorder par
                                proxy /admin/inventory uses. */}
                            <div
                              className={`h-2 rounded-full ${status.color}`}
                              style={{
                                width: `${(() => {
                                  const par = item.maximum_stock > 0
                                    ? item.maximum_stock
                                    : Math.max(item.minimum_stock * 2, 1);
                                  return Math.min(Math.max((item.current_stock / par) * 100, 0), 100);
                                })()}%`
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>Min: {item.minimum_stock}</span>
                            <span>Max: {item.maximum_stock}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-600">Cost/Unit:</span>
                            <span className="ml-1 font-medium">{tenantCurrency.format(item.cost_per_unit)}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Value:</span>
                            <span className="ml-1 font-medium">{tenantCurrency.format(item.current_stock * item.cost_per_unit)}</span>
                          </div>
                        </div>

                        {item.supplier_name && (
                          <div className="text-sm">
                            <span className="text-slate-600">Supplier:</span>
                            <span className="ml-1">{item.supplier_name}</span>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setSelectedItem(item);
                              setStockMovementData({ transaction_type: 'purchase', quantity: 0, notes: '' });
                              setIsAddStockOpen(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setSelectedItem(item);
                              setStockMovementData({ transaction_type: 'usage', quantity: 0, notes: '' });
                              setIsAddStockOpen(true);
                            }}
                          >
                            <Minus className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteItem(item.id, item.item_name)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                  <h3 className="text-lg font-semibold mb-2">No items found</h3>
                  <p className="text-slate-600">Try adjusting your search or filters</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="movements">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">Stock Movement History <InfoTooltip content={"The last 50 stock movements: purchases, usage, waste, transfers, returns and corrections."} /></CardTitle>
                <CardDescription>Recent inventory adjustments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stockMovements.map(movement => {
                    // Audit 2026-07-02: 'transfer' was hard-coded as an
                    // addition, but transfers OUT are removals. Purchase
                    // and return always add, usage and waste always
                    // remove; for the ambiguous types trust the sign of
                    // the stored quantity.
                    const qty = Number(movement.quantity || 0);
                    const isAdd = ['purchase', 'return'].includes(movement.transaction_type)
                      ? true
                      : ['usage', 'waste'].includes(movement.transaction_type)
                        ? false
                        : qty > 0;
                    return (
                    <div key={movement.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          isAdd ? 'bg-brand-primary/15 text-brand-primary' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isAdd ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{movement.item_name}</div>
                          <div className="text-sm text-slate-600 capitalize">
                            {movement.transaction_type}: {Math.abs(qty)} units
                          </div>
                          {movement.notes && (
                            <div className="text-xs text-slate-500">Notes: {movement.notes}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{movement.staff_name || 'System'}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(movement.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )})}

                  {stockMovements.length === 0 && (
                    <div className="text-center py-12">
                      <Clock className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                      <p className="text-slate-600">No stock movements yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add/Remove Stock Dialog */}
        <StockMovementDialog
          open={isAddStockOpen}
          onOpenChange={setIsAddStockOpen}
          selectedItem={selectedItem}
          stockMovementData={stockMovementData}
          setStockMovementData={setStockMovementData}
          onSubmit={handleStockMovement}
        />
        </PortalShell>
      </div>
    </>
  );
}