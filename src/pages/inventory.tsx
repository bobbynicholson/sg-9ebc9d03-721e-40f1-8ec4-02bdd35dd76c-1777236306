import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { 
  Package,
  ArrowLeft,
  Search,
  AlertTriangle,
  TrendingDown,
  Plus,
  Edit,
  Trash2,
  TrendingUp,
  DollarSign,
  Camera,
  BarChart3,
  Calendar,
  Clock,
  AlertCircle
} from "lucide-react";
import { InventoryItem, SupplierComparison, ScannedReceipt } from "@/types";
import { Footer } from "@/components/Footer";
import { ReceiptScanner } from "@/components/ReceiptScanner";
import { fullStarterInventory } from "@/lib/starterInventory";
import { calculateExpiryStatus, getExpiryAlerts, getExpiryStatusConfig } from "@/lib/expiryUtils";
import { getUserCurrency, formatCurrency } from "@/lib/currencyUtils";

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showScanner, setShowScanner] = useState(false);
  const [supplierComparisons, setSupplierComparisons] = useState<SupplierComparison[]>([]);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "fresh_produce",
    currentStock: 0,
    unit: "kg",
    minimumStock: 0,
    shelfLifeDays: 0,
    purchaseDate: new Date().toISOString().split("T")[0]
  });

  const userCurrency = getUserCurrency();

  useEffect(() => {
    const stored = localStorage.getItem("inventory");
    if (stored) {
      const inventoryData = JSON.parse(stored);
      const updatedInventory = inventoryData.map((item: InventoryItem) => {
        if (item.shelfLifeDays && item.purchaseDate) {
          const expiryInfo = calculateExpiryStatus(item);
          return {
            ...item,
            expiryStatus: expiryInfo.status,
            daysUntilExpiry: expiryInfo.daysUntilExpiry,
            expiryDate: expiryInfo.expiryDate
          };
        }
        return item;
      });
      setInventory(updatedInventory);
    } else {
      const initialInventory = fullStarterInventory.map(item => {
        if (item.shelfLifeDays && item.purchaseDate) {
          const expiryInfo = calculateExpiryStatus(item);
          return {
            ...item,
            expiryStatus: expiryInfo.status,
            daysUntilExpiry: expiryInfo.daysUntilExpiry,
            expiryDate: expiryInfo.expiryDate
          };
        }
        return item;
      });
      setInventory(initialInventory);
      localStorage.setItem("inventory", JSON.stringify(initialInventory));
    }
    generateSupplierComparisons();
  }, []);

  const generateSupplierComparisons = () => {
    const stored = localStorage.getItem("inventory") || JSON.stringify(fullStarterInventory);
    const inventoryData: InventoryItem[] = JSON.parse(stored);
    
    const comparisons: SupplierComparison[] = inventoryData
      .filter(item => item.supplierPrices && item.supplierPrices.length > 1)
      .map(item => {
        const prices = item.supplierPrices!.map(sp => sp.price);
        const bestPrice = Math.min(...prices);
        const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        const suppliers = item.supplierPrices!.map(sp => ({
          name: sp.supplierName,
          price: sp.price,
          lastUpdated: sp.lastUpdated,
          savings: sp.price > bestPrice ? sp.price - bestPrice : 0,
          recommended: sp.price === bestPrice
        }));

        return {
          itemId: item.id,
          itemName: item.name,
          suppliers,
          bestPrice,
          averagePrice,
          potentialSavings: averagePrice - bestPrice
        };
      })
      .sort((a, b) => b.potentialSavings - a.potentialSavings)
      .slice(0, 10);

    setSupplierComparisons(comparisons);
  };

  const handleAddItem = () => {
    const item: InventoryItem = {
      id: `INV-${Date.now()}`,
      name: newItem.name,
      category: newItem.category as any,
      currentStock: newItem.currentStock,
      unit: newItem.unit,
      minimumStock: newItem.minimumStock,
      lastRestocked: new Date().toISOString().split("T")[0],
      shelfLifeDays: newItem.shelfLifeDays || undefined,
      purchaseDate: newItem.purchaseDate || undefined
    };

    if (item.shelfLifeDays && item.purchaseDate) {
      const expiryInfo = calculateExpiryStatus(item);
      item.expiryStatus = expiryInfo.status;
      item.daysUntilExpiry = expiryInfo.daysUntilExpiry;
      item.expiryDate = expiryInfo.expiryDate;
    }

    const updatedInventory = [...inventory, item];
    setInventory(updatedInventory);
    localStorage.setItem("inventory", JSON.stringify(updatedInventory));
    
    setNewItem({
      name: "",
      category: "fresh_produce",
      currentStock: 0,
      unit: "kg",
      minimumStock: 0,
      shelfLifeDays: 0,
      purchaseDate: new Date().toISOString().split("T")[0]
    });
    setShowAddItemForm(false);
  };

  const handleReceiptProcessed = (receipt: ScannedReceipt) => {
    if (receipt.status === "processed") {
      const updatedInventory = [...inventory];
      
      receipt.items.forEach(receiptItem => {
        const existingItem = updatedInventory.find(
          item => item.name.toLowerCase() === receiptItem.name.toLowerCase()
        );
        
        if (existingItem) {
          existingItem.currentStock += receiptItem.quantity;
          existingItem.lastRestocked = receipt.receiptDate;
          existingItem.purchaseDate = receipt.receiptDate;
          
          if (existingItem.shelfLifeDays) {
            const expiryInfo = calculateExpiryStatus(existingItem);
            existingItem.expiryStatus = expiryInfo.status;
            existingItem.daysUntilExpiry = expiryInfo.daysUntilExpiry;
            existingItem.expiryDate = expiryInfo.expiryDate;
          }
          
          if (existingItem.supplierPrices) {
            const existingSupplier = existingItem.supplierPrices.find(
              sp => sp.supplierName === receipt.supplierName
            );
            
            if (existingSupplier) {
              existingSupplier.price = receiptItem.price;
              existingSupplier.lastUpdated = receipt.scannedAt;
            } else {
              existingItem.supplierPrices.push({
                supplierId: receipt.supplierId,
                supplierName: receipt.supplierName,
                price: receiptItem.price,
                lastUpdated: receipt.scannedAt
              });
            }
          }
        }
      });
      
      setInventory(updatedInventory);
      localStorage.setItem("inventory", JSON.stringify(updatedInventory));
      generateSupplierComparisons();
      setShowScanner(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getLowStockItems = () => {
    return inventory.filter(item => item.currentStock <= item.minimumStock);
  };

  const getStockStatus = (current: number, minimum: number) => {
    const percentage = (current / minimum) * 100;
    if (percentage <= 50) return { label: "Critical", color: "bg-red-100 text-red-700 border-red-200" };
    if (percentage <= 100) return { label: "Low", color: "bg-orange-100 text-orange-700 border-orange-200" };
    return { label: "In Stock", color: "bg-green-100 text-green-700 border-green-200" };
  };

  const expiryAlerts = getExpiryAlerts(inventory);

  const categories = [
    { value: "all", label: "All Items" },
    { value: "meat", label: "Meat & Seafood" },
    { value: "vegetables", label: "Vegetables" },
    { value: "dairy", label: "Dairy" },
    { value: "staples", label: "Staples" },
    { value: "spices", label: "Spices" },
    { value: "beverages", label: "Beverages" },
    { value: "bakery", label: "Bakery" },
    { value: "frozen", label: "Frozen" },
    { value: "fresh_produce", label: "Fresh Produce" }
  ];

  const totalInventoryValue = inventory.reduce(
    (sum, item) => sum + (item.currentStock * (item.averageCost || 0)), 0
  );

  const totalSavingsOpportunity = supplierComparisons.reduce(
    (sum, comp) => sum + comp.potentialSavings, 0
  );

  const totalExpiryAlerts = expiryAlerts.expired.length + expiryAlerts.critical.length + expiryAlerts.warning.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  Inventory Management
                </h1>
                <p className="text-slate-600 mt-1">Track stock levels, expiry dates, and optimize purchasing</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowScanner(!showScanner)}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan Receipt
              </Button>
              <Button 
                onClick={() => setShowAddItemForm(!showAddItemForm)}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Items</p>
                  <p className="text-2xl font-bold text-slate-900">{inventory.length}</p>
                </div>
                <Package className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Low Stock</p>
                  <p className="text-2xl font-bold text-orange-600">{getLowStockItems().length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Expiry Alerts</p>
                  <p className="text-2xl font-bold text-red-600">{totalExpiryAlerts}</p>
                </div>
                <Clock className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Inventory Value</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalInventoryValue, userCurrency)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {showAddItemForm && (
          <Card className="mb-6 border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Add New Inventory Item</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Item Name</Label>
                  <Input
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="e.g., Chicken Breast"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-slate-200"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  >
                    {categories.filter(c => c.value !== "all").map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Current Stock</Label>
                  <Input
                    type="number"
                    value={newItem.currentStock}
                    onChange={(e) => setNewItem({ ...newItem, currentStock: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="kg, units, liters, etc."
                  />
                </div>
                <div>
                  <Label>Minimum Stock Level</Label>
                  <Input
                    type="number"
                    value={newItem.minimumStock}
                    onChange={(e) => setNewItem({ ...newItem, minimumStock: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Shelf Life (Days)</Label>
                  <Input
                    type="number"
                    value={newItem.shelfLifeDays}
                    onChange={(e) => setNewItem({ ...newItem, shelfLifeDays: parseInt(e.target.value) || 0 })}
                    placeholder="Leave 0 if not applicable"
                  />
                </div>
                <div>
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    value={newItem.purchaseDate}
                    onChange={(e) => setNewItem({ ...newItem, purchaseDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleAddItem} className="bg-gradient-to-r from-blue-600 to-cyan-600">
                  Add Item
                </Button>
                <Button variant="outline" onClick={() => setShowAddItemForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showScanner && (
          <div className="mb-6">
            <ReceiptScanner onReceiptProcessed={handleReceiptProcessed} />
          </div>
        )}

        {totalExpiryAlerts > 0 && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-2">Product Expiry Alerts</h3>
                  <div className="space-y-1 text-sm">
                    {expiryAlerts.expired.length > 0 && (
                      <p className="text-red-700">
                        <strong>{expiryAlerts.expired.length}</strong> item(s) have expired and must be discarded
                      </p>
                    )}
                    {expiryAlerts.critical.length > 0 && (
                      <p className="text-orange-700">
                        <strong>{expiryAlerts.critical.length}</strong> item(s) expiring within 2 days
                      </p>
                    )}
                    {expiryAlerts.warning.length > 0 && (
                      <p className="text-yellow-700">
                        <strong>{expiryAlerts.warning.length}</strong> item(s) expiring within 7 days
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {getLowStockItems().length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-orange-900 mb-1">Low Stock Alert</h3>
                  <p className="text-sm text-orange-700">
                    {getLowStockItems().length} item(s) need restocking. Consider scanning receipts to update stock levels automatically.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="inventory" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="suppliers">Supplier Comparison</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-6">
            <div className="flex gap-2 mb-4 flex-wrap">
              {categories.map((cat) => (
                <Button
                  key={cat.value}
                  variant={selectedCategory === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.value)}
                  className="rounded-full"
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-4">
              {filteredInventory.map((item) => {
                const status = getStockStatus(item.currentStock, item.minimumStock);
                const bestPrice = item.supplierPrices 
                  ? Math.min(...item.supplierPrices.map(sp => sp.price))
                  : item.averageCost || 0;
                
                const hasExpiry = item.shelfLifeDays && item.purchaseDate;
                const expiryConfig = hasExpiry && item.expiryStatus 
                  ? getExpiryStatusConfig(item.expiryStatus) 
                  : null;
                
                return (
                  <Card key={item.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                            <Badge className={status.color}>{status.label}</Badge>
                            <Badge variant="outline" className="capitalize">
                              {item.category.replace("_", " ")}
                            </Badge>
                            {expiryConfig && (
                              <Badge className={expiryConfig.color}>
                                {expiryConfig.icon} {expiryConfig.label}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-6 text-sm text-slate-600 mb-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              <span>
                                <span className="font-semibold text-slate-900">{item.currentStock}</span> {item.unit}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TrendingDown className="w-4 h-4" />
                              <span>Min: {item.minimumStock} {item.unit}</span>
                            </div>
                            {bestPrice > 0 && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                <span>Best Price: {formatCurrency(bestPrice, userCurrency)}</span>
                              </div>
                            )}
                            {hasExpiry && item.daysUntilExpiry !== undefined && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  {item.daysUntilExpiry < 0 
                                    ? `Expired ${Math.abs(item.daysUntilExpiry)} days ago`
                                    : `${item.daysUntilExpiry} days until expiry`
                                  }
                                </span>
                              </div>
                            )}
                          </div>
                          {hasExpiry && item.expiryDate && (
                            <div className="text-xs text-slate-500 mb-1">
                              Purchase: {item.purchaseDate} | Expires: {item.expiryDate} ({item.shelfLifeDays} day shelf life)
                            </div>
                          )}
                          {item.supplierPrices && item.supplierPrices.length > 1 && (
                            <div className="text-xs text-blue-600 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {item.supplierPrices.length} suppliers available
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-6">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Top Savings Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">
                  Switch to recommended suppliers to save up to {formatCurrency(totalSavingsOpportunity, userCurrency)} on these items
                </p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {supplierComparisons.map((comparison) => (
                <Card key={comparison.itemId} className="border-0 shadow-md">
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">{comparison.itemName}</h3>
                      <p className="text-sm text-slate-600">
                        Potential savings: <span className="font-semibold text-green-600">{formatCurrency(comparison.potentialSavings, userCurrency)}</span> per unit
                      </p>
                    </div>
                    <div className="space-y-2">
                      {comparison.suppliers.map((supplier, idx) => (
                        <div 
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            supplier.recommended 
                              ? "bg-green-50 border border-green-200" 
                              : "bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-medium text-slate-900">{supplier.name}</p>
                              <p className="text-xs text-slate-600">Updated: {new Date(supplier.lastUpdated).toLocaleDateString()}</p>
                            </div>
                            {supplier.recommended && (
                              <Badge className="bg-green-100 text-green-700 border-green-200">
                                Best Price
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">{formatCurrency(supplier.price, userCurrency)}</p>
                            {supplier.savings > 0 && (
                              <p className="text-xs text-red-600">+{formatCurrency(supplier.savings, userCurrency)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Stock Status Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Well Stocked</span>
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {inventory.filter(i => i.currentStock > i.minimumStock * 1.5).length} items
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Normal Stock</span>
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                        {inventory.filter(i => i.currentStock > i.minimumStock && i.currentStock <= i.minimumStock * 1.5).length} items
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Low Stock</span>
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                        {inventory.filter(i => i.currentStock > i.minimumStock * 0.5 && i.currentStock <= i.minimumStock).length} items
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Critical</span>
                      <Badge className="bg-red-100 text-red-700 border-red-200">
                        {inventory.filter(i => i.currentStock <= i.minimumStock * 0.5).length} items
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Expiry Status Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Expired Items</span>
                      <Badge className="bg-red-100 text-red-700 border-red-200">
                        {expiryAlerts.expired.length} items
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Critical (2 days)</span>
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                        {expiryAlerts.critical.length} items
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Warning (7 days)</span>
                      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                        {expiryAlerts.warning.length} items
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Fresh Products</span>
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {inventory.filter(i => i.expiryStatus === "fresh" || !i.expiryStatus).length} items
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Category Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categories.filter(c => c.value !== "all").map(cat => {
                      const count = inventory.filter(i => i.category === cat.value).length;
                      return (
                        <div key={cat.value} className="flex justify-between items-center">
                          <span className="text-slate-600">{cat.label}</span>
                          <Badge variant="outline">{count} items</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
    </div>
  );
}