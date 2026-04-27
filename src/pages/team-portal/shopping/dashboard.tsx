import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingCart, CheckCircle, Clock, AlertTriangle, Package } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { LowStockAlerts } from "@/components/shopping/LowStockAlerts";
import { supabase } from "@/integrations/supabase/client";

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
  const { user } = useAuth();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "purchased">("all");

  const inventoryItems = [
    { id: '1', name: 'Beef', quantityAvailable: 5, minimumStock: 20, unit: 'kg', costPerUnit: 120 },
    { id: '2', name: 'Chicken', quantityAvailable: 8, minimumStock: 25, unit: 'kg', costPerUnit: 80 },
    { id: '3', name: 'Rice', quantityAvailable: 15, minimumStock: 30, unit: 'kg', costPerUnit: 25 },
    { id: '4', name: 'Olive Oil', quantityAvailable: 2, minimumStock: 10, unit: 'L', costPerUnit: 150 },
    { id: '5', name: 'Plates', quantityAvailable: 50, minimumStock: 100, unit: 'units', costPerUnit: 15 },
  ];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const cutoff = new Date(Date.now() + 86400000 * 14);
      const startStr = today.toISOString().split("T")[0];
      const endStr = cutoff.toISOString().split("T")[0];

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, event_date, status, order_items(item_name, quantity, special_instructions)")
        .gte("event_date", startStr)
        .lte("event_date", endStr)
        .order("event_date", { ascending: true });

      if (error) {
        console.error("Shopping list query failed:", error);
      }

      const generated: ShoppingItem[] = [];
      const guessCategory = (name: string): "fresh" | "staple" | "other" => {
        const n = (name || "").toLowerCase();
        if (/beef|chicken|lamb|pork|fish|salad|veg|fruit|meat|herb|tomato|onion|cheese|milk|cream|butter/.test(n)) return "fresh";
        if (/rice|oil|flour|sugar|salt|pasta|bread|stock|sauce|spice/.test(n)) return "staple";
        return "other";
      };

      (orders || []).forEach((order: any) => {
        const items = order.order_items || [];
        if (!Array.isArray(items)) return;
        items.forEach((mi: any, idx: number) => {
          const name = mi?.item_name ?? "Unnamed";
          const qty = Number(mi?.quantity ?? 1);
          generated.push({
            id: `${order.id}-${idx}`,
            name,
            quantity: qty,
            unit: "unit",
            category: guessCategory(name),
            orderId: order.order_number || order.id,
            orderName: order.client_name || `Order ${order.order_number || order.id}`,
            eventDate: order.event_date,
            purchased: false,
            notes: mi?.special_instructions,
          });
        });
      });

      const stored = localStorage.getItem("shopping_items_purchased");
      const purchasedIds: string[] = stored ? JSON.parse(stored) : [];
      const merged = generated.map(it => ({ ...it, purchased: purchasedIds.includes(it.id) }));
      if (!cancelled) setItems(merged);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleTogglePurchased = (itemId: string) => {
    const updated = items.map((item) =>
      item.id === itemId ? { ...item, purchased: !item.purchased } : item
    );
    setItems(updated);
    const purchasedIds = updated.filter((i) => i.purchased).map((i) => i.id);
    localStorage.setItem("shopping_items_purchased", JSON.stringify(purchasedIds));
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
      <Head>
        <title>Shopping Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.SHOPPING_STAFF} />

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-screen-2xl">
          <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">Shopping Dashboard</h1>
              <p className="text-xs sm:text-sm md:text-base text-slate-600">Manage inventory and purchasing</p>
            </div>
          </div>

          <Card className="border-0 shadow-lg mb-6 sm:mb-8">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                Today's Purchase Priority
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="space-y-2 sm:space-y-3">
                <div className="p-3 sm:p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-xs sm:text-sm text-slate-600">Urgent Orders Needed</p>
                      <p className="text-2xl sm:text-3xl font-bold text-green-600">
                        {inventoryItems.filter(i => i.quantityAvailable < i.minimumStock).length}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs sm:text-sm text-slate-600">Estimated Cost</p>
                      <p className="text-xl sm:text-2xl font-bold text-slate-900">
                        R{inventoryItems
                          .filter(i => i.quantityAvailable < i.minimumStock)
                          .reduce((sum, i) => sum + (i.costPerUnit * (i.minimumStock - i.quantityAvailable)), 0)
                          .toFixed(0)}
                      </p>
                    </div>
                  </div>
                  <Button className="w-full text-sm sm:text-base h-10 sm:h-11">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Create Bulk Purchase Order
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Total Items</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">{items.length}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Pending</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-orange-600">{pendingCount}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Purchased</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">{purchasedCount}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-3 sm:pt-4 md:pt-6 px-2 sm:px-3 md:px-6 pb-3 sm:pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs sm:text-sm text-slate-600">Urgent</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold text-red-600">{urgentCount}</p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-red-100 flex items-center justify-center self-end md:self-auto">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-4 md:px-6">
              <CardTitle className="text-base sm:text-lg md:text-xl">Shopping List</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 md:px-6">
              <div className="space-y-2 sm:space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="text-center py-8 text-sm sm:text-base text-slate-600">
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
                        className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border-2 ${
                          item.purchased
                            ? "bg-green-50 border-green-200"
                            : isUrgent
                            ? "bg-red-50 border-red-200"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-start gap-2 sm:gap-3 sm:gap-4 flex-1">
                          <Checkbox
                            checked={item.purchased}
                            onCheckedChange={() => handleTogglePurchased(item.id)}
                            className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h4
                                className={`font-semibold text-xs sm:text-sm md:text-base ${
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
                            
                            <div className="space-y-1 text-xs sm:text-sm text-slate-600">
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
                            
                            {item.notes && (
                              <p className="text-xs sm:text-sm text-slate-600 mt-2 italic">{item.notes}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex sm:flex-col items-center justify-center sm:ml-4 self-start sm:self-center">
                          {item.purchased ? (
                            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-green-600" />
                          ) : (
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-orange-600" />
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
      
      <ChatBot userRole="shopping" companyId={user?.user_metadata?.company_id} />
    </>
  );
}