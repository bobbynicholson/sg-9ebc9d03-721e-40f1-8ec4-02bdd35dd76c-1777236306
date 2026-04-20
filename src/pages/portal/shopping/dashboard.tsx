import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, CheckCircle, Clock, AlertTriangle, Package } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import Head from "next/head";

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: "fresh" | "staple" | "other";
  orderId: string;
  orderName: string;
  eventDate: string;
  purchased: boolean;
  notes?: string;
}

export default function ShoppingDashboard() {
  const [shoppingList, setShoppingList] = useState<any[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "purchased">("all");

  // Mock inventory data for stock alerts
  const inventoryItems = [
    { id: '1', name: 'Beef', quantityAvailable: 5, minimumStock: 20, unit: 'kg', costPerUnit: 120 },
    { id: '2', name: 'Chicken', quantityAvailable: 8, minimumStock: 25, unit: 'kg', costPerUnit: 80 },
    { id: '3', name: 'Rice', quantityAvailable: 15, minimumStock: 30, unit: 'kg', costPerUnit: 25 },
    { id: '4', name: 'Olive Oil', quantityAvailable: 2, minimumStock: 10, unit: 'L', costPerUnit: 150 },
    { id: '5', name: 'Plates', quantityAvailable: 50, minimumStock: 100, unit: 'units', costPerUnit: 15 },
  ];

  useEffect(() => {
    const mockItems: ShoppingItem[] = [
      {
        id: "si1",
        name: "Beef",
        quantity: 30,
        unit: "kg",
        category: "fresh",
        orderId: "ORD-001",
        orderName: "Sarah Johnson Event",
        eventDate: new Date().toISOString().split("T")[0],
        purchased: false,
        notes: "Premium cuts needed",
      },
      {
        id: "si2",
        name: "Chicken",
        quantity: 25,
        unit: "kg",
        category: "fresh",
        orderId: "ORD-001",
        orderName: "Sarah Johnson Event",
        eventDate: new Date().toISOString().split("T")[0],
        purchased: false,
      },
      {
        id: "si3",
        name: "Boerewors",
        quantity: 20,
        unit: "kg",
        category: "fresh",
        orderId: "ORD-001",
        orderName: "Sarah Johnson Event",
        eventDate: new Date().toISOString().split("T")[0],
        purchased: true,
      },
      {
        id: "si4",
        name: "Rice",
        quantity: 10,
        unit: "kg",
        category: "staple",
        orderId: "ORD-002",
        orderName: "Corporate Event",
        eventDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        purchased: false,
      },
      {
        id: "si5",
        name: "Olive Oil",
        quantity: 5,
        unit: "L",
        category: "staple",
        orderId: "ORD-002",
        orderName: "Corporate Event",
        eventDate: new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0],
        purchased: false,
      },
    ];

    const stored = localStorage.getItem("shopping_items");
    setItems(stored ? JSON.parse(stored) : mockItems);
  }, []);

  const handleTogglePurchased = (itemId: string) => {
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, purchased: !item.purchased } : item
    );
    setItems(updated);
    localStorage.setItem("shopping_items", JSON.stringify(updated));
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      fresh: "bg-green-100 text-green-800",
      staple: "bg-blue-100 text-blue-800",
      other: "bg-slate-100 text-slate-800",
    };
    return colors[category as keyof typeof colors] || colors.other;
  };

  const filteredItems = items.filter((item) => {
    if (filter === "pending") return !item.purchased;
    if (filter === "purchased") return item.purchased;
    return true;
  });

  const pendingCount = items.filter((item) => !item.purchased).length;
  const purchasedCount = items.filter((item) => item.purchased).length;
  const urgentCount = items.filter(
    (item) =>
      !item.purchased &&
      new Date(item.eventDate).getTime() - Date.now() < 86400000 * 2
  ).length;

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Shopping Dashboard - CateringMS</title>
      </Head>

      <ShoppingNav />

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Shopping Dashboard</h1>
              <p className="text-slate-600">Manage inventory and purchasing</p>
            </div>
          </div>

          {/* Critical Stock Alerts - NEW */}
          {inventoryItems.filter(item => item.quantityAvailable < item.minimumStock).length > 0 && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-red-50 to-orange-50 mb-8">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Critical Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inventoryItems
                    .filter(item => item.quantityAvailable < item.minimumStock)
                    .slice(0, 3)
                    .map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-lg border-l-4 border-red-500">
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-sm text-red-600">
                            Only {item.quantityAvailable} {item.unit} remaining (Min: {item.minimumStock})
                          </p>
                        </div>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700">
                          Order Now
                        </Button>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Today's Purchase Priority - NEW */}
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-green-600" />
                Today's Purchase Priority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm text-slate-600">Urgent Orders Needed</p>
                      <p className="text-3xl font-bold text-green-600">
                        {inventoryItems.filter(i => i.quantityAvailable < i.minimumStock).length}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">Estimated Cost</p>
                      <p className="text-2xl font-bold text-slate-900">
                        R{inventoryItems
                          .filter(i => i.quantityAvailable < i.minimumStock)
                          .reduce((sum, i) => sum + (i.costPerUnit * (i.minimumStock - i.quantityAvailable)), 0)
                          .toFixed(0)}
                      </p>
                    </div>
                  </div>
                  <Button className="w-full">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Create Bulk Purchase Order
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards - Mobile Optimized Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Total Items</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900">{items.length}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <ShoppingCart className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Pending</p>
                    <p className="text-xl md:text-2xl font-bold text-orange-600">{pendingCount}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Purchased</p>
                    <p className="text-xl md:text-2xl font-bold text-green-600">{purchasedCount}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Urgent</p>
                    <p className="text-xl md:text-2xl font-bold text-red-600">{urgentCount}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-red-100 flex items-center justify-center self-end md:self-auto">
                    <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Shopping List - Mobile Optimized */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-4 md:px-6">
              <CardTitle className="text-lg md:text-xl">Shopping List</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              <div className="space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">
                    No items to display
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const daysUntil = Math.ceil(
                      (new Date(item.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    );
                    const isUrgent = daysUntil <= 2 && !item.purchased;

                    return (
                      <div
                        key={item.id}
                        className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 md:p-4 rounded-lg border-2 ${
                          item.purchased
                            ? "bg-green-50 border-green-200"
                            : isUrgent
                            ? "bg-red-50 border-red-200"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        {/* Checkbox and Content */}
                        <div className="flex items-start gap-3 sm:gap-4 flex-1">
                          <Checkbox
                            checked={item.purchased}
                            onCheckedChange={() => handleTogglePurchased(item.id)}
                            className="w-5 h-5 mt-0.5 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            {/* Item Name and Badges */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h4
                                className={`font-semibold text-sm md:text-base ${
                                  item.purchased ? "line-through text-slate-500" : "text-slate-900"
                                }`}
                              >
                                {item.name}
                              </h4>
                              <Badge className={`${getCategoryColor(item.category)} text-xs`}>
                                {item.category}
                              </Badge>
                              {isUrgent && (
                                <Badge className="bg-red-100 text-red-800 text-xs">Urgent</Badge>
                              )}
                            </div>
                            
                            {/* Item Details - Stacked on Mobile */}
                            <div className="space-y-1 text-xs md:text-sm text-slate-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  {item.quantity} {item.unit}
                                </span>
                                <span className="hidden sm:inline">•</span>
                                <span className="truncate">{item.orderName}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span>Event: {new Date(item.eventDate).toLocaleDateString()}</span>
                                <span>•</span>
                                <span className="whitespace-nowrap">
                                  {daysUntil > 0 ? `in ${daysUntil} days` : "today"}
                                </span>
                              </div>
                            </div>
                            
                            {/* Notes */}
                            {item.notes && (
                              <p className="text-xs md:text-sm text-slate-600 mt-2 italic">{item.notes}</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Status Icon */}
                        <div className="flex sm:flex-col items-center justify-center sm:ml-4 self-start sm:self-center">
                          {item.purchased ? (
                            <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                          ) : (
                            <Clock className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Footer />
      </div>
    </>
  );
}