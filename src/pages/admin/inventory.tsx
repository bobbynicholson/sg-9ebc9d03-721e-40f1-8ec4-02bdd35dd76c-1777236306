import { useState, useEffect } from "react";
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    setLoading(true);
    try {
      // Mock data for now
      const mockInventory: InventoryItem[] = [
        {
          id: "1",
          name: "Beef Fillet",
          category: "Meat",
          quantity: 45,
          unit: "kg",
          minStock: 30,
          maxStock: 100,
          costPerUnit: 180,
          supplier: "Premium Meats SA",
          lastRestocked: "2026-04-18",
          expiryDate: "2026-04-25",
        },
        {
          id: "2",
          name: "Chicken Breast",
          category: "Meat",
          quantity: 15,
          unit: "kg",
          minStock: 25,
          maxStock: 80,
          costPerUnit: 65,
          supplier: "Premium Meats SA",
          lastRestocked: "2026-04-17",
          expiryDate: "2026-04-24",
        },
        {
          id: "3",
          name: "Rice (Basmati)",
          category: "Staples",
          quantity: 120,
          unit: "kg",
          minStock: 50,
          maxStock: 200,
          costPerUnit: 25,
          supplier: "Bulk Foods Direct",
          lastRestocked: "2026-04-10",
        },
        {
          id: "4",
          name: "Olive Oil",
          category: "Oils",
          quantity: 8,
          unit: "L",
          minStock: 10,
          maxStock: 30,
          costPerUnit: 85,
          supplier: "Gourmet Supplies",
          lastRestocked: "2026-04-12",
        },
      ];
      setInventory(mockInventory);
    } catch (error) {
      console.error("Error loading inventory:", error);
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

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === "all") return matchesSearch;
    if (activeTab === "low-stock") return matchesSearch && item.quantity < item.minStock;
    if (activeTab === "out-of-stock") return matchesSearch && item.quantity === 0;
    if (activeTab === "expiring") {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      return (
        matchesSearch &&
        item.expiryDate &&
        new Date(item.expiryDate) < thirtyDaysFromNow
      );
    }
    return matchesSearch;
  });

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

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
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
                    <p className="text-sm text-slate-600 mb-1">Total Items</p>
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
                    <p className="text-sm text-red-700 mb-1">Low Stock</p>
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
                    <p className="text-sm text-amber-700 mb-1">Expiring Soon</p>
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
                    <p className="text-sm text-green-700 mb-1">Total Value</p>
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
                                <span className="font-medium">Min/Max:</span> {item.minStock}/
                                {item.maxStock}
                              </div>
                              <div>
                                <span className="font-medium">Cost:</span> R{item.costPerUnit}/
                                {item.unit}
                              </div>
                              <div>
                                <span className="font-medium">Supplier:</span> {item.supplier}
                              </div>
                            </div>
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
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.OWNER]}>
      <AdminInventory />
    </ProtectedRoute>
  );
}