import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, ShoppingCart, XCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

interface LowStockItem {
  id: string;
  item_name: string;
  category: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number;
  unit_of_measure: string;
  cost_per_unit: number;
  supplier_name?: string;
  preferred_supplier_id?: string;
}

export function LowStockAlerts() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.company_id) {
      loadLowStockItems();
      
      // Set up real-time subscription. Phase 6 audit: per-tenant
      // channel name. Existing company_id filter kept payloads safe;
      // the channel name was previously global which is harmless but
      // noisy.
      const channel = supabase
        .channel(`inventory-changes:${profile.company_id}-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'inventory_items',
            filter: `company_id=eq.${profile.company_id}`
          },
          () => {
            loadLowStockItems();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile]);

  const loadLowStockItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("inventory_items")
        .select(`
          *,
          suppliers:preferred_supplier_id (supplier_name)
        `)
        .eq("company_id", profile?.company_id)
        .order("current_stock", { ascending: true });

      if (error) throw error;

      // Filter locally since current_stock <= minimum_stock isn't natively supported in JS client directly
      const filtered = (data || []).filter(item => item.current_stock <= item.minimum_stock);

      const items = filtered.map(item => ({
        ...item,
        supplier_name: Array.isArray(item.suppliers) ? item.suppliers[0]?.supplier_name : item.suppliers?.supplier_name
      }));

      setLowStockItems(items);
    } catch (error: any) {
      console.error("Error loading low stock items:", error);
    } finally {
      setLoading(false);
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
          list_date: new Date().toISOString().split('T')[0] 
        }])
        .select()
        .single();
      if (listError) throw listError;
      list = newList;
    }
    return list.id;
  };

  const addToShoppingList = async (item: LowStockItem) => {
    try {
      const listId = await getOrCreateShoppingList();
      const quantityNeeded = item.maximum_stock - item.current_stock;
      
      const { error } = await supabase
        .from("shopping_list_items")
        .insert([{
          shopping_list_id: listId,
          user_id: profile?.id,
          item_id: item.id,
          name: item.item_name,
          quantity: quantityNeeded,
          unit: item.unit_of_measure,
          category: item.category,
          estimated_cost: quantityNeeded * item.cost_per_unit,
          purchased: false
        }]);

      if (error) throw error;

      toast({
        title: "Added to Shopping List",
        description: `${item.item_name} (${quantityNeeded} ${item.unit_of_measure}) added to shopping list`
      });

      loadLowStockItems();
    } catch (error: any) {
      console.error("Error adding to shopping list:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "shopping item" }),
        variant: "destructive"
      });
    }
  };

  const addAllToShoppingList = async () => {
    try {
      const listId = await getOrCreateShoppingList();

      const shoppingListItems = lowStockItems.map(item => ({
        shopping_list_id: listId,
        user_id: profile?.id,
        item_id: item.id,
        name: item.item_name,
        quantity: item.maximum_stock - item.current_stock,
        unit: item.unit_of_measure,
        category: item.category,
        estimated_cost: (item.maximum_stock - item.current_stock) * item.cost_per_unit,
        purchased: false
      }));

      const { error } = await supabase
        .from("shopping_list_items")
        .insert(shoppingListItems);

      if (error) throw error;

      toast({
        title: "Success",
        description: `All ${lowStockItems.length} items added to shopping list!`
      });

      loadLowStockItems();
    } catch (error: any) {
      console.error("Error adding to shopping list:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "shopping item" }),
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Package className="h-6 w-6 animate-spin text-brand-primary" />
            <span className="ml-2 text-slate-600">Loading alerts...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (lowStockItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-brand-primary" />
            All Items In Stock
          </CardTitle>
          <CardDescription>No low stock alerts at this time</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const outOfStockCount = lowStockItems.filter(item => item.current_stock === 0).length;
  const criticalCount = lowStockItems.filter(item => item.current_stock > 0 && item.current_stock <= item.minimum_stock).length;

  return (
    <Card className="border-brand-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-brand-primary">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alerts ({lowStockItems.length})
            </CardTitle>
            <CardDescription>
              {outOfStockCount > 0 && `${outOfStockCount} out of stock`}
              {outOfStockCount > 0 && criticalCount > 0 && " • "}
              {criticalCount > 0 && `${criticalCount} running low`}
            </CardDescription>
          </div>
          {lowStockItems.length > 0 && (
            <Button onClick={addAllToShoppingList}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add All to List
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {lowStockItems.map(item => {
            const isOutOfStock = item.current_stock === 0;
            const percentRemaining = (item.current_stock / item.maximum_stock) * 100;
            const quantityNeeded = item.maximum_stock - item.current_stock;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-lg border-2 ${
                  isOutOfStock ? 'border-red-300 bg-red-50' : 'border-brand-primary/20 bg-brand-primary/5'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{item.item_name}</h4>
                      {isOutOfStock && (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Out of Stock
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 capitalize">
                      {item.category.replace('_', ' ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addToShoppingList(item)}
                  >
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    Add to List
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Current Stock:</span>
                    <span className={`font-semibold ${isOutOfStock ? 'text-red-700' : 'text-brand-primary'}`}>
                      {item.current_stock} {item.unit_of_measure}
                    </span>
                  </div>

                  <div className="w-full bg-white rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        isOutOfStock ? 'bg-red-500' : 'bg-brand-primary'
                      }`}
                      style={{ width: `${Math.max(percentRemaining, 5)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Need to order:</span>
                    <span className="font-semibold">
                      {quantityNeeded} {item.unit_of_measure}
                    </span>
                  </div>

                  {item.supplier_name && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Supplier:</span>
                      <span>{item.supplier_name}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Estimated Cost:</span>
                    <span className="font-semibold">
                      R{(quantityNeeded * item.cost_per_unit).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
