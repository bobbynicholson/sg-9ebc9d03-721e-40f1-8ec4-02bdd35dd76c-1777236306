import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Order, Ingredient } from "@/types";
import { ChefHat, Clock, CheckCircle, AlertCircle, ShoppingCart } from "lucide-react";
import { Footer } from "@/components/Footer";

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState("today");

  useEffect(() => {
    const mockOrders: Order[] = [
      {
        id: "ORD-001",
        quoteId: "Q-001",
        clientName: "Sarah Johnson",
        eventDate: new Date().toISOString().split("T")[0],
        venue: "Grand Palace Hotel",
        eventLocation: "123 Main St, Cape Town",
        guestCount: 150,
        menuItems: [
          {
            id: "m1",
            name: "Braai Platter",
            category: "main",
            pricePerPerson: 250,
            quantity: 150,
            ingredients: [
              {
                id: "i1",
                name: "Beef",
                quantity: 30,
                quantityNeeded: 30,
                unit: "kg",
                category: "fresh",
              },
              {
                id: "i2",
                name: "Chicken",
                quantity: 25,
                quantityNeeded: 25,
                unit: "kg",
                category: "fresh",
              },
              {
                id: "i3",
                name: "Boerewors",
                quantity: 20,
                quantityNeeded: 20,
                unit: "kg",
                category: "fresh",
              },
            ],
          },
        ],
        equipmentItems: [],
        kitchenInstructions: "Prepare 2 hours before event. Marinate meat 24h in advance.",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ];

    const stored = localStorage.getItem("kitchen_orders");
    setOrders(stored ? JSON.parse(stored) : mockOrders);
  }, []);

  const handleUpdateStatus = (orderId: string, newStatus: Order["status"]) => {
    const updated = orders.map((order) =>
      order.id === orderId ? { ...order, status: newStatus } : order
    );
    setOrders(updated);
    localStorage.setItem("kitchen_orders", JSON.stringify(updated));
  };

  const getStatusColor = (status: Order["status"]) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-green-100 text-green-800",
      delivered: "bg-slate-100 text-slate-800",
      completed: "bg-green-100 text-green-800",
    };
    return colors[status];
  };

  const todayOrders = orders.filter(
    (order) => order.eventDate === new Date().toISOString().split("T")[0]
  );
  const upcomingOrders = orders.filter(
    (order) => new Date(order.eventDate) > new Date()
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Kitchen Dashboard</h1>
            <p className="text-slate-600">Manage orders and prep schedules</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Today&apos;s Orders</p>
                  <p className="text-2xl font-bold text-slate-900">{todayOrders.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Preparing</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {orders.filter((o) => o.status === "preparing").length}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <ChefHat className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Ready</p>
                  <p className="text-2xl font-bold text-green-600">
                    {orders.filter((o) => o.status === "ready").length}
                  </p>
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
                  <p className="text-sm text-slate-600">Upcoming</p>
                  <p className="text-2xl font-bold text-purple-600">{upcomingOrders.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="all">All Orders</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            {todayOrders.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-slate-600">
                  No orders for today
                </CardContent>
              </Card>
            ) : (
              todayOrders.map((order) => (
                <Card key={order.id} className="border-0 shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl">{order.clientName}</CardTitle>
                        <p className="text-sm text-slate-600 mt-1">
                          {order.guestCount} guests • {order.venue}
                        </p>
                      </div>
                      <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Menu Items</h4>
                      {order.menuItems.map((item) => (
                        <div key={item.id} className="bg-slate-50 p-3 rounded-lg mb-2">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-slate-600">Quantity: {item.quantity}</p>
                          {item.ingredients && (
                            <div className="mt-2 space-y-1">
                              {item.ingredients.map((ing) => (
                                <div
                                  key={ing.id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span>{ing.name}</span>
                                  <span className="text-slate-600">
                                    {ing.quantityNeeded} {ing.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {order.kitchenInstructions && (
                      <div className="bg-yellow-50 p-3 rounded-lg">
                        <p className="text-sm font-medium text-yellow-900">Instructions:</p>
                        <p className="text-sm text-yellow-800">{order.kitchenInstructions}</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {order.status === "pending" && (
                        <Button
                          onClick={() => handleUpdateStatus(order.id, "preparing")}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          Start Preparing
                        </Button>
                      )}
                      {order.status === "preparing" && (
                        <Button
                          onClick={() => handleUpdateStatus(order.id, "ready")}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Mark as Ready
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingOrders.map((order) => (
              <Card key={order.id} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">{order.clientName}</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {new Date(order.eventDate).toLocaleDateString()} • {order.guestCount} guests
                      </p>
                    </div>
                    <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {order.menuItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <span>{item.name}</span>
                        <span className="text-slate-600">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {orders.map((order) => (
              <Card key={order.id} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">{order.clientName}</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {new Date(order.eventDate).toLocaleDateString()} • {order.guestCount} guests
                      </p>
                    </div>
                    <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
    </div>
  );
}
