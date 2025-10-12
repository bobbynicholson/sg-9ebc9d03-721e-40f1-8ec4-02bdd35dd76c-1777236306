import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ClipboardList,
  ArrowLeft,
  ChefHat,
  ShoppingCart,
  Calendar,
  CheckCircle,
  Clock,
  Users,
  AlertTriangle,
  Package
} from "lucide-react";
import { Quote, InventoryItem } from "@/types";
import { Footer } from "@/components/Footer";
import { mockOrders } from "@/lib/mockData";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Quote[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  useEffect(() => {
    // Get accepted quotes from localStorage
    const storedQuotes = JSON.parse(localStorage.getItem("quotes") || "[]");
    const acceptedQuotes = storedQuotes.filter((q: Quote) => 
      q.status === "accepted" || q.status === "confirmed" || q.status === "paid"
    );
    
    // Get order assignments that have been accepted by regions
    const assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    const acceptedAssignments = assignments.filter((a: any) => 
      a.status === "accepted" || a.status === "in_progress" || a.status === "completed"
    );
    
    // Convert mockOrders that have been assigned and accepted to Quote format
    const ordersFromAssignments: Quote[] = acceptedAssignments.map((assignment: any) => {
      const mockOrder = mockOrders.find(o => o.id === assignment.orderId);
      if (!mockOrder) return null;
      
      // Convert Order type to Quote type for display
      return {
        id: mockOrder.id,
        leadId: mockOrder.quoteId,
        clientName: mockOrder.clientName,
        email: mockOrder.clientName.toLowerCase().replace(/\s+/g, '.') + "@example.com",
        eventDate: mockOrder.eventDate,
        eventType: mockOrder.menuItems[0]?.name || "Catering Event",
        guestCount: mockOrder.guestCount,
        menuItems: mockOrder.menuItems,
        equipmentItems: mockOrder.equipmentItems,
        subtotal: mockOrder.totalAmount * 0.87,
        tax: mockOrder.totalAmount * 0.13,
        total: mockOrder.totalAmount,
        status: "accepted" as const,
        version: 1,
        createdAt: mockOrder.createdAt,
        updatedAt: mockOrder.createdAt,
        deliveryAddress: mockOrder.location,
      };
    }).filter(Boolean) as Quote[];
    
    // Combine both sources and remove duplicates
    const allOrders = [...acceptedQuotes, ...ordersFromAssignments];
    const uniqueOrders = allOrders.filter((order, index, self) => 
      index === self.findIndex((o) => o.id === order.id)
    );
    
    setOrders(uniqueOrders);
    
    const storedInventory = JSON.parse(localStorage.getItem("inventory") || "[]");
    setInventory(storedInventory);
  }, []);

  const deductStockForOrder = (order: Quote) => {
    const updatedInventory = [...inventory];
    let stockDeducted = false;
    
    order.menuItems.forEach(menuItem => {
      menuItem.ingredients.forEach(ingredient => {
        const totalNeeded = ingredient.quantity * menuItem.quantity;
        const inventoryItem = updatedInventory.find(
          item => item.name.toLowerCase() === ingredient.name.toLowerCase()
        );
        
        if (inventoryItem && inventoryItem.currentStock >= totalNeeded) {
          inventoryItem.currentStock -= totalNeeded;
          stockDeducted = true;
        }
      });
    });
    
    if (stockDeducted) {
      setInventory(updatedInventory);
      localStorage.setItem("inventory", JSON.stringify(updatedInventory));
      
      const updatedOrders = orders.map(o => 
        o.id === order.id ? { ...o, stockDeducted: true } : o
      );
      setOrders(updatedOrders);
      
      const allQuotes = JSON.parse(localStorage.getItem("quotes") || "[]");
      const updatedQuotes = allQuotes.map((q: Quote) =>
        q.id === order.id ? { ...q, stockDeducted: true } : q
      );
      localStorage.setItem("quotes", JSON.stringify(updatedQuotes));
    }
  };

  const upcomingOrders = orders
    .filter(order => new Date(order.eventDate) >= new Date())
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

  const pastOrders = orders
    .filter(order => new Date(order.eventDate) < new Date())
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

  const getOrderIngredients = (order: Quote) => {
    const allIngredients: { [key: string]: { quantity: number; inStock: boolean } } = {};
    
    order.menuItems.forEach(item => {
      item.ingredients.forEach(ingredient => {
        const totalNeeded = ingredient.quantity * item.quantity;
        const inventoryItem = inventory.find(
          inv => inv.name.toLowerCase() === ingredient.name.toLowerCase()
        );
        
        if (allIngredients[ingredient.name]) {
          allIngredients[ingredient.name].quantity += totalNeeded;
        } else {
          allIngredients[ingredient.name] = {
            quantity: totalNeeded,
            inStock: inventoryItem ? inventoryItem.currentStock >= totalNeeded : false
          };
        }
      });
    });

    return Object.entries(allIngredients).map(([name, data]) => ({
      name,
      quantity: data.quantity,
      inStock: data.inStock,
      unit: "units"
    }));
  };

  const checkStockAvailability = (order: Quote) => {
    const ingredients = getOrderIngredients(order);
    return ingredients.every(ing => ing.inStock);
  };

  const OrderCard = ({ order }: { order: Quote }) => {
    const ingredients = getOrderIngredients(order);
    const hasStock = checkStockAvailability(order);
    const stockAlreadyDeducted = (order as any).stockDeducted || false;
    const daysUntil = Math.ceil(
      (new Date(order.eventDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    return (
      <Card className="border-0 shadow-lg hover:shadow-xl transition-all">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-semibold text-slate-900">{order.clientName}</h3>
                {daysUntil >= 0 && daysUntil <= 7 && (
                  <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                    {daysUntil === 0 ? "Today" : `${daysUntil} days`}
                  </Badge>
                )}
                {stockAlreadyDeducted ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Stock Deducted
                  </Badge>
                ) : !hasStock ? (
                  <Badge className="bg-red-100 text-red-700 border-red-200">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Low Stock
                  </Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                    <Package className="w-3 h-3 mr-1" />
                    Stock Available
                  </Badge>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(order.eventDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <Users className="w-4 h-4" />
                  <span>{order.guestCount} guests</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <ClipboardList className="w-4 h-4" />
                  <span>{order.menuItems.length} items</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <ShoppingCart className="w-4 h-4" />
                  <span>{ingredients.length} ingredients</span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <ChefHat className="w-4 h-4" />
                  Menu Items
                </h4>
                <div className="space-y-1">
                  {order.menuItems.map((item, idx) => (
                    <div key={idx} className="text-sm text-slate-600 flex justify-between">
                      <span>{item.name} ({item.category})</span>
                      <span className="font-medium">×{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {ingredients.length > 0 && (
                <div className={`rounded-lg p-4 ${!hasStock && !stockAlreadyDeducted ? 'bg-red-50 border border-red-200' : 'bg-blue-50'}`}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Required Ingredients
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {ingredients.slice(0, 6).map((ingredient, idx) => (
                      <div 
                        key={idx} 
                        className={`text-sm flex items-center gap-1 ${
                          !ingredient.inStock && !stockAlreadyDeducted ? 'text-red-600 font-medium' : 'text-slate-600'
                        }`}
                      >
                        {!ingredient.inStock && !stockAlreadyDeducted && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        • {ingredient.name}: {ingredient.quantity} {ingredient.unit}
                      </div>
                    ))}
                  </div>
                  {ingredients.length > 6 && (
                    <p className="text-xs text-slate-500 mt-2">
                      +{ingredients.length - 6} more ingredients
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="ml-4 space-y-2">
              <Link href={`/orders/${order.id}`}>
                <Button variant="outline" size="sm" className="w-full">
                  View Details
                </Button>
              </Link>
              {!stockAlreadyDeducted && hasStock && (
                <Button 
                  size="sm" 
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  onClick={() => deductStockForOrder(order)}
                >
                  <Package className="w-4 h-4 mr-2" />
                  Deduct Stock
                </Button>
              )}
              {!stockAlreadyDeducted && !hasStock && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full border-red-300 text-red-700 hover:bg-red-50"
                  disabled
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Insufficient Stock
                </Button>
              )}
              <Button 
                size="sm" 
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Order
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

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
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl shadow-lg">
              <ClipboardList className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                Order Management
              </h1>
              <p className="text-slate-600 mt-1">Manage orders and track inventory deduction</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-slate-900">{orders.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600 mb-1">Upcoming</p>
              <p className="text-2xl font-bold text-orange-600">{upcomingOrders.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600 mb-1">Completed</p>
              <p className="text-2xl font-bold text-green-600">{pastOrders.length}</p>
            </CardContent>
          </Card>
        </div>

        {upcomingOrders.some(order => !checkStockAvailability(order) && !(order as any).stockDeducted) && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Stock Alert</h3>
                  <p className="text-sm text-red-700">
                    Some orders have insufficient stock. Please restock inventory or scan receipts to update stock levels.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="upcoming" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingOrders.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <ClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No upcoming orders</h3>
                  <p className="text-slate-600">Orders will appear here once quotes are accepted</p>
                </CardContent>
              </Card>
            ) : (
              upcomingOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {pastOrders.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <CheckCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No completed orders</h3>
                  <p className="text-slate-600">Completed orders will appear here</p>
                </CardContent>
              </Card>
            ) : (
              pastOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
    </div>
  );
}
