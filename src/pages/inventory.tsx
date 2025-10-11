
import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  BarChart3
} from "lucide-react";
import { InventoryItem, SupplierComparison, ScannedReceipt } from "@/types";
import { Footer } from "@/components/Footer";
import { ReceiptScanner } from "@/components/ReceiptScanner";
import { fullStarterInventory } from "@/lib/starterInventory";

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showScanner, setShowScanner] = useState(false);
  const [supplierComparisons, setSupplierComparisons] = useState<SupplierComparison[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("inventory");
    if (stored) {
      setInventory(JSON.parse(stored));
    } else {
      setInventory(fullStarterInventory);
      localStorage.setItem("inventory", JSON.stringify(fullStarterInventory));
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
                <p className="text-slate-600 mt-1">Track stock levels and optimize purchasing</p>
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
              <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
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
                  <p className="text-sm text-slate-600 mb-1">Inventory Value</p>
                  <p className="text-2xl font-bold text-green-600">R{totalInventoryValue.toFixed(0)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Savings Available</p>
                  <p className="text-2xl font-bold text-purple-600">R{totalSavingsOpportunity.toFixed(0)}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {showScanner && (
          <div className="mb-6">
            <ReceiptScanner onReceiptProcessed={handleReceiptProcessed} />
          </div>
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
                
                return (
                  <Card key={item.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                            <Badge className={status.color}>{status.label}</Badge>
                            <Badge variant="outline" className="capitalize">
                              {item.category.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-slate-600 mb-2">
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
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              <span>Best Price: R{bestPrice.toFixed(2)}</span>
                            </div>
                          </div>
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
                  Switch to recommended suppliers to save up to R{totalSavingsOpportunity.toFixed(2)} on these items
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
                        Potential savings: <span className="font-semibold text-green-600">R{comparison.potentialSavings.toFixed(2)}</span> per unit
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
                            <p className="text-lg font-bold text-slate-900">R{supplier.price.toFixed(2)}</p>
                            {supplier.savings > 0 && (
                              <p className="text-xs text-red-600">+R{supplier.savings.toFixed(2)}</p>
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
