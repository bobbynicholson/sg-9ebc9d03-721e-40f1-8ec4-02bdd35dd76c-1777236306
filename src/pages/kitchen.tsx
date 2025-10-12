
import { useState, useEffect } from "react";
import Head from "next/head";
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
        client: "Sarah Johnson",
        clientName: "Sarah Johnson",
        eventDate: new Date().toISOString().split("T")[0],
        date: new Date().toISOString().split("T")[0],
        venue: "Grand Palace Hotel",
        location: "123 Main St, Cape Town",
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
        total: 37500,
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
      pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
      confirmed: "bg-blue-100 text-blue-800 border-blue-200",
      preparing: "bg-purple-100 text-purple-800 border-purple-200",
      ready: "bg-green-100 text-green-800 border-green-200",
      delivered: "bg-slate-100 text-slate-800 border-slate-200",
      completed: "bg-green-100 text-green-800 border-green-200",
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
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Kitchen Dashboard - CaterOS</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50">
        <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-4 md:space-y-6">
          {/* Header - Mobile Optimized */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <ChefHat className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Kitchen Dashboard</h1>
              <p className="text-sm md:text-base text-slate-600">Manage orders and prep schedules</p>
            </div>
          </div>

          {/* Stats Cards - Mobile Optimized Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Today&apos;s Orders</p>
                    <p className="text-2xl md:text-3xl font-bold text-slate-900">{todayOrders.length}</p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Preparing</p>
                    <p className="text-2xl md:text-3xl font-bold text-orange-600">
                      {orders.filter((o) => o.status === "preparing").length}
                    </p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <ChefHat className="w-4 h-4 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Ready</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-600">
                      {orders.filter((o) => o.status === "ready").length}
                    </p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4 md:pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600 mb-1">Upcoming</p>
                    <p className="text-2xl md:text-3xl font-bold text-purple-600">{upcomingOrders.length}</p>
                  </div>
                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 md:w-6 md:h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs - Mobile Optimized */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3 h-auto">
              <TabsTrigger value="today" className="text-xs md:text-sm py-2">Today</TabsTrigger>
              <TabsTrigger value="upcoming" className="text-xs md:text-sm py-2">Upcoming</TabsTrigger>
              <TabsTrigger value="all" className="text-xs md:text-sm py-2">All Orders</TabsTrigger>
            </TabsList>

            {/* Today's Orders */}
            <TabsContent value="today" className="space-y-4 mt-4">
              {todayOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 md:py-16 text-center px-4">
                    <Clock className="w-12 h-12 md:w-16 md:h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-sm md:text-base text-slate-600">No orders for today</p>
                  </CardContent>
                </Card>
              ) : (
                todayOrders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-lg">
                    <CardHeader className="pb-3 md:pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg md:text-xl truncate">{order.clientName}</CardTitle>
                          <p className="text-xs md:text-sm text-slate-600 mt-1 truncate">
                            {order.guestCount} guests • {order.venue}
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-xs flex-shrink-0`}>{order.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 md:space-y-4">
                      {/* Menu Items */}
                      <div>
                        <h4 className="font-semibold text-sm md:text-base mb-2">Menu Items</h4>
                        {order.menuItems.map((item) => (
                          <div key={item.id} className="bg-slate-50 p-3 rounded-lg mb-2">
                            <p className="font-medium text-sm md:text-base">{item.name}</p>
                            <p className="text-xs md:text-sm text-slate-600">Quantity: {item.quantity}</p>
                            {item.ingredients && (
                              <div className="mt-2 space-y-1">
                                {item.ingredients.map((ing) => (
                                  <div
                                    key={ing.id}
                                    className="flex items-center justify-between text-xs md:text-sm"
                                  >
                                    <span className="truncate mr-2">{ing.name}</span>
                                    <span className="text-slate-600 flex-shrink-0">
                                      {ing.quantityNeeded} {ing.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Kitchen Instructions */}
                      {order.kitchenInstructions && (
                        <div className="bg-yellow-50 p-3 rounded-lg">
                          <p className="text-xs md:text-sm font-medium text-yellow-900 mb-1">Instructions:</p>
                          <p className="text-xs md:text-sm text-yellow-800">{order.kitchenInstructions}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        {order.status === "pending" && (
                          <Button
                            onClick={() => handleUpdateStatus(order.id, "preparing")}
                            className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto text-sm"
                            size="sm"
                          >
                            <ChefHat className="w-4 h-4 mr-2" />
                            Start Preparing
                          </Button>
                        )}
                        {order.status === "preparing" && (
                          <Button
                            onClick={() => handleUpdateStatus(order.id, "ready")}
                            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto text-sm"
                            size="sm"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark as Ready
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Upcoming Orders */}
            <TabsContent value="upcoming" className="space-y-4 mt-4">
              {upcomingOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 md:py-16 text-center px-4">
                    <AlertCircle className="w-12 h-12 md:w-16 md:h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-sm md:text-base text-slate-600">No upcoming orders</p>
                  </CardContent>
                </Card>
              ) : (
                upcomingOrders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-lg">
                    <CardHeader className="pb-3 md:pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg md:text-xl truncate">{order.clientName}</CardTitle>
                          <p className="text-xs md:text-sm text-slate-600 mt-1">
                            {new Date(order.eventDate).toLocaleDateString()} • {order.guestCount} guests
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-xs flex-shrink-0`}>{order.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {order.menuItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-center text-sm md:text-base">
                            <span className="truncate mr-2">{item.name}</span>
                            <span className="text-slate-600 flex-shrink-0">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* All Orders */}
            <TabsContent value="all" className="space-y-4 mt-4">
              {orders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 md:py-16 text-center px-4">
                    <ShoppingCart className="w-12 h-12 md:w-16 md:h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-sm md:text-base text-slate-600">No orders yet</p>
                  </CardContent>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={order.id} className="border-0 shadow-lg">
                    <CardHeader className="pb-3 md:pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg md:text-xl truncate">{order.clientName}</CardTitle>
                          <p className="text-xs md:text-sm text-slate-600 mt-1">
                            {new Date(order.eventDate).toLocaleDateString()} • {order.guestCount} guests
                          </p>
                        </div>
                        <Badge className={`${getStatusColor(order.status)} text-xs flex-shrink-0`}>{order.status}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
        
        <Footer />
      </div>
    </>
  );
}
