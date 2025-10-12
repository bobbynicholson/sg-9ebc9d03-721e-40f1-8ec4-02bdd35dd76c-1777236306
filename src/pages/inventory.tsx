import { useState, useEffect } from "react";
import Head from "next/head";
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
  AlertCircle,
  X
} from "lucide-react";
import { InventoryItem, SupplierComparison, ScannedReceipt } from "@/types";
import { Footer } from "@/components/Footer";
import { ReceiptScanner } from "@/components/ReceiptScanner";
import { fullStarterInventory } from "@/lib/starterInventory";
import { calculateExpiryStatus, getExpiryAlerts, getExpiryStatusConfig } from "@/lib/expiryUtils";
import { getUserCurrency, formatCurrency } from "@/lib/currencyUtils";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [addItemError, setAddItemError] = useState("");
  const [addItemSuccess, setAddItemSuccess] = useState("");

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
    setAddItemError("");
    setAddItemSuccess("");

    // Validation
    if (!newItem.name.trim()) {
      setAddItemError("Please enter an item name");
      return;
    }
    if (newItem.currentStock < 0) {
      setAddItemError("Current stock cannot be negative");
      return;
    }
    if (newItem.minimumStock < 0) {
      setAddItemError("Minimum stock cannot be negative");
      return;
    }

    const item: InventoryItem = {
      id: `INV-${Date.now()}`,
      name: newItem.name,
      category: newItem.category as any,
      currentStock: Number(newItem.currentStock),
      unit: newItem.unit,
      minimumStock: Number(newItem.minimumStock),
      lastRestocked: new Date().toISOString().split("T")[0],
      shelfLifeDays: newItem.shelfLifeDays > 0 ? newItem.shelfLifeDays : undefined,
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
    
    setAddItemSuccess(`Successfully added ${newItem.name} to inventory!`);
    
    // Reset form
    setNewItem({
      name: "",
      category: "fresh_produce",
      currentStock: 0,
      unit: "kg",
      minimumStock: 0,
      shelfLifeDays: 0,
      purchaseDate: new Date().toISOString().split("T")[0]
    });
    
    // Close form after 2 seconds
    setTimeout(() => {
      setShowAddItemForm(false);
      setAddItemSuccess("");
    }, 2000);
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
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Inventory Management | CaterOS</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
          <Link href="/">
            <Button variant="ghost" className="mb-4" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>

          {/* Header - Mobile Optimized */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl md:rounded-2xl shadow-lg">
                  <Package className="w-6 h-6 md:w-8 md:h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                    Inventory Management
                  </h1>
                  <p className="text-xs md:text-sm text-slate-600 mt-1">Track stock levels, expiry dates, and optimize purchasing</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowScanner(!showScanner)}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-initial border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Scan Receipt</span>
                  <span className="sm:hidden">Scan</span>
                </Button>
                <Button 
                  onClick={() => {
                    setShowAddItemForm(!showAddItemForm);
                    setAddItemError("");
                    setAddItemSuccess("");
                  }}
                  size="sm"
                  className="flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
          </div>

          {/* Stats Cards - Mobile Optimized */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Total Items</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900">{inventory.length}</p>
                  </div>
                  <Package className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Low Stock</p>
                    <p className="text-xl md:text-2xl font-bold text-orange-600">{getLowStockItems().length}</p>
                  </div>
                  <AlertTriangle className="w-6 h-6 md:w-8 md:h-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Expiry Alerts</p>
                    <p className="text-xl md:text-2xl font-bold text-red-600">{totalExpiryAlerts}</p>
                  </div>
                  <Clock className="w-6 h-6 md:w-8 md:h-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Inventory Value</p>
                    <p className="text-lg md:text-2xl font-bold text-green-600">{formatCurrency(totalInventoryValue, userCurrency)}</p>
                  </div>
                  <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Success/Error Messages */}
          {addItemSuccess && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-sm text-green-800">{addItemSuccess}</AlertDescription>
            </Alert>
          )}

          {addItemError && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-sm text-red-800">{addItemError}</AlertDescription>
            </Alert>
          )}

          {/* Add Item Form - Mobile Optimized */}
          {showAddItemForm && (
            <Card className="mb-6 border-0 shadow-lg">
              <CardHeader className="px-4 py-4 md:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg md:text-xl">Add New Inventory Item</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddItemForm(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 md:px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Item Name *</Label>
                    <Input
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      placeholder="e.g., Chicken Breast"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Category</Label>
                    <select
                      className="w-full h-10 px-3 rounded-md border border-slate-200 mt-1 text-sm"
                      value={newItem.category}
                      onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    >
                      {categories.filter(c => c.value !== "all").map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm">Current Stock *</Label>
                    <Input
                      type="number"
                      value={newItem.currentStock}
                      onChange={(e) => setNewItem({ ...newItem, currentStock: parseFloat(e.target.value) || 0 })}
                      className="mt-1"
                      min="0"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Unit</Label>
                    <Input
                      value={newItem.unit}
                      onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      placeholder="kg, units, liters, etc."
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Minimum Stock Level</Label>
                    <Input
                      type="number"
                      value={newItem.minimumStock}
                      onChange={(e) => setNewItem({ ...newItem, minimumStock: parseFloat(e.target.value) || 0 })}
                      className="mt-1"
                      min="0"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Shelf Life (Days)</Label>
                    <Input
                      type="number"
                      value={newItem.shelfLifeDays}
                      onChange={(e) => setNewItem({ ...newItem, shelfLifeDays: parseInt(e.target.value) || 0 })}
                      placeholder="Leave 0 if not applicable"
                      className="mt-1"
                      min="0"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Purchase Date</Label>
                    <Input
                      type="date"
                      value={newItem.purchaseDate}
                      onChange={(e) => setNewItem({ ...newItem, purchaseDate: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-6">
                  <Button 
                    onClick={handleAddItem} 
                    className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-cyan-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddItemForm(false)}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Receipt Scanner */}
          {showScanner && (
            <div className="mb-6">
              <ReceiptScanner onReceiptProcessed={handleReceiptProcessed} />
            </div>
          )}

          {/* Expiry Alerts - Mobile Optimized */}
          {totalExpiryAlerts > 0 && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm md:text-base text-red-900 mb-2">Product Expiry Alerts</h3>
                    <div className="space-y-1 text-xs md:text-sm">
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

          {/* Low Stock Alert - Mobile Optimized */}
          {getLowStockItems().length > 0 && (
            <Card className="mb-6 border-orange-200 bg-orange-50">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm md:text-base text-orange-900 mb-1">Low Stock Alert</h3>
                    <p className="text-xs md:text-sm text-orange-700">
                      {getLowStockItems().length} item(s) need restocking. Consider scanning receipts to update stock levels automatically.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search - Mobile Optimized */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 md:pl-10 text-sm md:text-base"
              />
            </div>
          </div>

          {/* Tabs - Mobile Optimized */}
          <Tabs defaultValue="inventory" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-2xl">
              <TabsTrigger value="inventory" className="text-xs md:text-sm">Inventory</TabsTrigger>
              <TabsTrigger value="suppliers" className="text-xs md:text-sm">Suppliers</TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs md:text-sm">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory" className="space-y-6">
              {/* Category Filters - Mobile Optimized */}
              <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => (
                  <Button
                    key={cat.value}
                    variant={selectedCategory === cat.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.value)}
                    className="rounded-full text-xs md:text-sm"
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              {/* Inventory Items - Mobile Optimized */}
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
                      <CardContent className="p-4 md:p-6">
                        <div className="flex flex-col gap-4">
                          {/* Item Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-2 break-words">{item.name}</h3>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={status.color + " text-xs"}>{status.label}</Badge>
                                <Badge variant="outline" className="capitalize text-xs">
                                  {item.category.replace("_", " ")}
                                </Badge>
                                {expiryConfig && (
                                  <Badge className={expiryConfig.color + " text-xs"}>
                                    {expiryConfig.icon} {expiryConfig.label}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Item Details */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs md:text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 flex-shrink-0" />
                              <span>
                                <span className="font-semibold text-slate-900">{item.currentStock}</span> {item.unit}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TrendingDown className="w-4 h-4 flex-shrink-0" />
                              <span>Min: {item.minimumStock} {item.unit}</span>
                            </div>
                            {bestPrice > 0 && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">Best: {formatCurrency(bestPrice, userCurrency)}</span>
                              </div>
                            )}
                            {hasExpiry && item.daysUntilExpiry !== undefined && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">
                                  {item.daysUntilExpiry < 0 
                                    ? `Expired ${Math.abs(item.daysUntilExpiry)}d ago`
                                    : `${item.daysUntilExpiry}d left`
                                  }
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Additional Info */}
                          {hasExpiry && item.expiryDate && (
                            <div className="text-xs text-slate-500 break-words">
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-6">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
                <CardHeader className="px-4 md:px-6">
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <BarChart3 className="w-5 h-5" />
                    Top Savings Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 md:px-6">
                  <p className="text-xs md:text-sm text-slate-600">
                    Switch to recommended suppliers to save up to {formatCurrency(totalSavingsOpportunity, userCurrency)} on these items
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {supplierComparisons.map((comparison) => (
                  <Card key={comparison.itemId} className="border-0 shadow-md">
                    <CardContent className="p-4 md:p-6">
                      <div className="mb-4">
                        <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-1 break-words">{comparison.itemName}</h3>
                        <p className="text-xs md:text-sm text-slate-600">
                          Potential savings: <span className="font-semibold text-green-600">{formatCurrency(comparison.potentialSavings, userCurrency)}</span> per unit
                        </p>
                      </div>
                      <div className="space-y-2">
                        {comparison.suppliers.map((supplier, idx) => (
                          <div 
                            key={idx}
                            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg ${
                              supplier.recommended 
                                ? "bg-green-50 border border-green-200" 
                                : "bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm md:text-base text-slate-900 truncate">{supplier.name}</p>
                                <p className="text-xs text-slate-600">Updated: {new Date(supplier.lastUpdated).toLocaleDateString()}</p>
                              </div>
                              {supplier.recommended && (
                                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs flex-shrink-0">
                                  Best Price
                                </Badge>
                              )}
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-lg md:text-xl font-bold text-slate-900">{formatCurrency(supplier.price, userCurrency)}</p>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <Card className="border-0 shadow-lg">
                  <CardHeader className="px-4 py-4 md:px-6">
                    <CardTitle className="text-base md:text-lg">Stock Status Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Well Stocked</span>
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                          {inventory.filter(i => i.currentStock > i.minimumStock * 1.5).length} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Normal Stock</span>
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                          {inventory.filter(i => i.currentStock > i.minimumStock && i.currentStock <= i.minimumStock * 1.5).length} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Low Stock</span>
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                          {inventory.filter(i => i.currentStock > i.minimumStock * 0.5 && i.currentStock <= i.minimumStock).length} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Critical</span>
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          {inventory.filter(i => i.currentStock <= i.minimumStock * 0.5).length} items
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardHeader className="px-4 py-4 md:px-6">
                    <CardTitle className="text-base md:text-lg">Expiry Status Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Expired Items</span>
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          {expiryAlerts.expired.length} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Critical (2 days)</span>
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                          {expiryAlerts.critical.length} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Warning (7 days)</span>
                        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">
                          {expiryAlerts.warning.length} items
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs md:text-sm text-slate-600">Fresh Products</span>
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                          {inventory.filter(i => i.expiryStatus === "fresh" || !i.expiryStatus).length} items
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg md:col-span-2">
                  <CardHeader className="px-4 py-4 md:px-6">
                    <CardTitle className="text-base md:text-lg">Category Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 md:px-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {categories.filter(c => c.value !== "all").map(cat => {
                        const count = inventory.filter(i => i.category === cat.value).length;
                        return (
                          <div key={cat.value} className="flex justify-between items-center">
                            <span className="text-xs md:text-sm text-slate-600">{cat.label}</span>
                            <Badge variant="outline" className="text-xs">{count}</Badge>
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
    </>
  );
}
