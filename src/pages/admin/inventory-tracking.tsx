import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  AlertTriangle,
  Plus,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  Download,
  Filter
} from "lucide-react";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  unit: string;
  supplier_id?: string;
  cost_per_unit: number;
  last_restocked: string;
  supplier_name?: string;
}

interface Supplier {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
}

interface StockMovement {
  id: string;
  item_id: string;
  item_name: string;
  movement_type: 'add' | 'remove' | 'adjust';
  quantity: number;
  reason: string;
  created_by: string;
  created_at: string;
  staff_name?: string;
}

export default function InventoryTracking() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    category: "produce",
    current_stock: 0,
    min_stock_level: 0,
    max_stock_level: 0,
    unit: "kg",
    supplier_id: "",
    cost_per_unit: 0
  });

  const [stockMovementData, setStockMovementData] = useState({
    movement_type: "add" as 'add' | 'remove',
    quantity: 0,
    reason: ""
  });

  useEffect(() => {
    if (profile?.company_id) {
      loadInventory();
      loadSuppliers();
      loadStockMovements();
    }
  }, [profile]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("inventory_items")
        .select(`
          *,
          suppliers (
            name
          )
        `)
        .eq("company_id", profile?.company_id)
        .order("name");

      if (error) throw error;

      const items = data?.map(item => ({
        ...item,
        supplier_name: Array.isArray(item.suppliers) ? item.suppliers[0]?.name : item.suppliers?.name
      })) || [];

      setInventoryItems(items);
    } catch (error: any) {
      console.error("Error loading inventory:", error);
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
        .order("name");

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error: any) {
      console.error("Error loading suppliers:", error);
    }
  };

  const loadStockMovements = async () => {
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(`
          *,
          inventory_items (name),
          profiles (full_name)
        `)
        .eq("company_id", profile?.company_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const movements = data?.map(movement => ({
        ...movement,
        item_name: Array.isArray(movement.inventory_items) 
          ? movement.inventory_items[0]?.name 
          : movement.inventory_items?.name,
        staff_name: Array.isArray(movement.profiles) 
          ? movement.profiles[0]?.full_name 
          : movement.profiles?.full_name
      })) || [];

      setStockMovements(movements);
    } catch (error: any) {
      console.error("Error loading stock movements:", error);
    }
  };

  const handleAddItem = async () => {
    try {
      const { error } = await supabase
        .from("inventory_items")
        .insert([{
          ...formData,
          company_id: profile?.company_id,
          last_restocked: new Date().toISOString()
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Inventory item added successfully!"
      });

      setIsAddItemOpen(false);
      setFormData({
        name: "",
        category: "produce",
        current_stock: 0,
        min_stock_level: 0,
        max_stock_level: 0,
        unit: "kg",
        supplier_id: "",
        cost_per_unit: 0
      });
      loadInventory();
    } catch (error: any) {
      console.error("Error adding item:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleStockMovement = async () => {
    if (!selectedItem) return;

    try {
      const newStock = stockMovementData.movement_type === 'add'
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
          current_stock: newStock,
          last_restocked: stockMovementData.movement_type === 'add' ? new Date().toISOString() : undefined
        })
        .eq("id", selectedItem.id);

      if (updateError) throw updateError;

      // Record movement
      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert([{
          company_id: profile?.company_id,
          item_id: selectedItem.id,
          movement_type: stockMovementData.movement_type,
          quantity: stockMovementData.quantity,
          reason: stockMovementData.reason,
          created_by: profile?.id
        }]);

      if (movementError) throw movementError;

      // Check if low stock and create notification
      if (newStock <= selectedItem.min_stock_level) {
        await supabase
          .from("notifications")
          .insert([{
            company_id: profile?.company_id,
            user_id: profile?.id,
            type: 'inventory_alert',
            title: 'Low Stock Alert',
            message: `${selectedItem.name} is low on stock (${newStock} ${selectedItem.unit} remaining)`,
            related_entity_type: 'inventory_item',
            related_entity_id: selectedItem.id
          }]);
      }

      toast({
        title: "Success",
        description: "Stock updated successfully!"
      });

      setIsAddStockOpen(false);
      setSelectedItem(null);
      setStockMovementData({
        movement_type: "add",
        quantity: 0,
        reason: ""
      });
      loadInventory();
      loadStockMovements();
    } catch (error: any) {
      console.error("Error updating stock:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Are you sure you want to delete "${itemName}"?`)) return;

    try {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
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
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const generateShoppingList = async () => {
    const lowStockItems = inventoryItems.filter(item => item.current_stock <= item.min_stock_level);
    
    if (lowStockItems.length === 0) {
      toast({
        title: "No Action Needed",
        description: "All items are adequately stocked!"
      });
      return;
    }

    try {
      const shoppingListItems = lowStockItems.map(item => ({
        company_id: profile?.company_id,
        item_name: item.name,
        quantity_needed: item.max_stock_level - item.current_stock,
        unit: item.unit,
        category: item.category,
        supplier_id: item.supplier_id,
        estimated_cost: (item.max_stock_level - item.current_stock) * item.cost_per_unit,
        priority: item.current_stock === 0 ? 'urgent' : 'high',
        status: 'pending',
        created_by: profile?.id
      }));

      const { error } = await supabase
        .from("shopping_list")
        .insert(shoppingListItems);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Shopping list created with ${lowStockItems.length} items!`,
      });
    } catch (error: any) {
      console.error("Error generating shopping list:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.current_stock === 0) return { label: "Out of Stock", color: "bg-red-500", icon: XCircle };
    if (item.current_stock <= item.min_stock_level) return { label: "Low Stock", color: "bg-orange-500", icon: AlertTriangle };
    if (item.current_stock >= item.max_stock_level) return { label: "Overstocked", color: "bg-blue-500", icon: TrendingUp };
    return { label: "In Stock", color: "bg-green-500", icon: CheckCircle };
  };

  const filteredItems = inventoryItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const status = getStockStatus(item);
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "low" && item.current_stock <= item.min_stock_level) ||
      (statusFilter === "out" && item.current_stock === 0) ||
      (statusFilter === "ok" && item.current_stock > item.min_stock_level);
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = [...new Set(inventoryItems.map(item => item.category))];
  const lowStockCount = inventoryItems.filter(item => item.current_stock <= item.min_stock_level).length;
  const outOfStockCount = inventoryItems.filter(item => item.current_stock === 0).length;
  const totalValue = inventoryItems.reduce((sum, item) => sum + (item.current_stock * item.cost_per_unit), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminNav />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Package className="h-12 w-12 animate-spin mx-auto mb-4 text-purple-600" />
            <p className="text-slate-600">Loading inventory...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Inventory Tracking</h1>
            <p className="text-slate-600 mt-1">Monitor stock levels and manage inventory</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateShoppingList}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Generate Shopping List
            </Button>
            <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Inventory Item</DialogTitle>
                  <DialogDescription>Add a new item to track in your inventory</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Tomatoes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="produce">Produce</SelectItem>
                        <SelectItem value="meat">Meat</SelectItem>
                        <SelectItem value="dairy">Dairy</SelectItem>
                        <SelectItem value="dry_goods">Dry Goods</SelectItem>
                        <SelectItem value="beverages">Beverages</SelectItem>
                        <SelectItem value="condiments">Condiments</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Current Stock</Label>
                    <Input
                      type="number"
                      value={formData.current_stock}
                      onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">Kilograms (kg)</SelectItem>
                        <SelectItem value="g">Grams (g)</SelectItem>
                        <SelectItem value="l">Liters (L)</SelectItem>
                        <SelectItem value="ml">Milliliters (ml)</SelectItem>
                        <SelectItem value="units">Units</SelectItem>
                        <SelectItem value="boxes">Boxes</SelectItem>
                        <SelectItem value="packs">Packs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum Stock Level</Label>
                    <Input
                      type="number"
                      value={formData.min_stock_level}
                      onChange={(e) => setFormData({ ...formData, min_stock_level: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum Stock Level</Label>
                    <Input
                      type="number"
                      value={formData.max_stock_level}
                      onChange={(e) => setFormData({ ...formData, max_stock_level: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cost Per Unit</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.cost_per_unit}
                      onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Supplier</Label>
                    <Select value={formData.supplier_id} onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(supplier => (
                          <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddItem}>Add Item</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{inventoryItems.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Low Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{lowStockCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Out of Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{outOfStockCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">R{totalValue.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
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
                          <CardTitle className="text-lg">{item.name}</CardTitle>
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
                            <span className="font-semibold">{item.current_stock} {item.unit}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${status.color}`}
                              style={{
                                width: `${Math.min((item.current_stock / item.max_stock_level) * 100, 100)}%`
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>Min: {item.min_stock_level}</span>
                            <span>Max: {item.max_stock_level}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-600">Cost/Unit:</span>
                            <span className="ml-1 font-medium">R{item.cost_per_unit}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Value:</span>
                            <span className="ml-1 font-medium">R{(item.current_stock * item.cost_per_unit).toFixed(2)}</span>
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
                              setStockMovementData({ movement_type: 'add', quantity: 0, reason: '' });
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
                              setStockMovementData({ movement_type: 'remove', quantity: 0, reason: '' });
                              setIsAddStockOpen(true);
                            }}
                          >
                            <Minus className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteItem(item.id, item.name)}
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
                <CardTitle>Stock Movement History</CardTitle>
                <CardDescription>Recent inventory adjustments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stockMovements.map(movement => (
                    <div key={movement.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          movement.movement_type === 'add' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {movement.movement_type === 'add' ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{movement.item_name}</div>
                          <div className="text-sm text-slate-600">
                            {movement.movement_type === 'add' ? 'Added' : 'Removed'} {movement.quantity} units
                          </div>
                          {movement.reason && (
                            <div className="text-xs text-slate-500">Reason: {movement.reason}</div>
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
                  ))}

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
        <Dialog open={isAddStockOpen} onOpenChange={setIsAddStockOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {stockMovementData.movement_type === 'add' ? 'Add' : 'Remove'} Stock
              </DialogTitle>
              <DialogDescription>
                Update stock for {selectedItem?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Current Stock</Label>
                <div className="text-2xl font-bold mt-1">
                  {selectedItem?.current_stock} {selectedItem?.unit}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quantity to {stockMovementData.movement_type === 'add' ? 'Add' : 'Remove'}</Label>
                <Input
                  type="number"
                  value={stockMovementData.quantity}
                  onChange={(e) => setStockMovementData({ ...stockMovementData, quantity: parseFloat(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  value={stockMovementData.reason}
                  onChange={(e) => setStockMovementData({ ...stockMovementData, reason: e.target.value })}
                  placeholder="e.g., Delivery received, Used for order #123"
                />
              </div>
              {selectedItem && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">New Stock Level</div>
                  <div className="text-xl font-bold mt-1">
                    {stockMovementData.movement_type === 'add'
                      ? selectedItem.current_stock + stockMovementData.quantity
                      : selectedItem.current_stock - stockMovementData.quantity
                    } {selectedItem.unit}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIsAddStockOpen(false)}>Cancel</Button>
              <Button onClick={handleStockMovement}>Update Stock</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}