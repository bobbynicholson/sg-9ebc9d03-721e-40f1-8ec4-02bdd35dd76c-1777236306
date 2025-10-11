
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, CheckCircle, Clock, AlertTriangle, Package } from "lucide-react";

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

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "purchased">("all");

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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Shopping Management</h1>
              <p className="text-slate-600">Track ingredient purchases for events</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="gap-2"
            >
              <Package className="w-4 h-4" />
              All Items
            </Button>
            <Button
              variant={filter === "pending" ? "default" : "outline"}
              onClick={() => setFilter("pending")}
              className="gap-2"
            >
              <Clock className="w-4 h-4" />
              Pending
            </Button>
            <Button
              variant={filter === "purchased" ? "default" : "outline"}
              onClick={() => setFilter("purchased")}
              className="gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Purchased
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Items</p>
                  <p className="text-2xl font-bold text-slate-900">{items.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Pending</p>
                  <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Purchased</p>
                  <p className="text-2xl font-bold text-green-600">{purchasedCount}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Urgent</p>
                  <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Shopping List</CardTitle>
          </CardHeader>
          <CardContent>
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
                      className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                        item.purchased
                          ? "bg-green-50 border-green-200"
                          : isUrgent
                          ? "bg-red-50 border-red-200"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <Checkbox
                          checked={item.purchased}
                          onCheckedChange={() => handleTogglePurchased(item.id)}
                          className="w-5 h-5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4
                              className={`font-semibold ${
                                item.purchased ? "line-through text-slate-500" : "text-slate-900"
                              }`}
                            >
                              {item.name}
                            </h4>
                            <Badge className={getCategoryColor(item.category)}>
                              {item.category}
                            </Badge>
                            {isUrgent && (
                              <Badge className="bg-red-100 text-red-800">Urgent</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                            <span>
                              {item.quantity} {item.unit}
                            </span>
                            <span>•</span>
                            <span>{item.orderName}</span>
                            <span>•</span>
                            <span>
                              Event: {new Date(item.eventDate).toLocaleDateString()} (
                              {daysUntil > 0 ? `in ${daysUntil} days` : "today"})
                            </span>
                          </div>
                          {item.notes && (
                            <p className="text-sm text-slate-600 mt-1 italic">{item.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="ml-4">
                        {item.purchased ? (
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        ) : (
                          <Clock className="w-6 h-6 text-orange-600" />
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
    </div>
  );
}
