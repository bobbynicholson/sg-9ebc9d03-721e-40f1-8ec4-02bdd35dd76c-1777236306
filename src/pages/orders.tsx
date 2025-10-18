import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
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
import { regionManagement } from "@/lib/regionManagement";
import { InvoiceGenerator } from "@/components/InvoiceGenerator";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { GetServerSideProps } from "next";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppOrder } from "@/types/app";
import type { InventoryItem } from "@/types/app";
import { orderService } from "@/services/orderService";

interface OrdersPageProps {
  companySlug?: string;
  portal?: string;
  currentRoute?: string;
}

export default function OrdersPage({ companySlug: propCompanySlug }: OrdersPageProps = {}) {
  const { user } = useAuth();
  const companySlug = propCompanySlug || user?.company_slug;
  
  const [orders, setOrders] = useState<Quote[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  useEffect(() => {
    // Get accepted quotes from localStorage
    const storedQuotes = JSON.parse(localStorage.getItem("quotes") || "[]");
    const acceptedQuotes = storedQuotes.filter((q: Quote) => 
      q.status === "accepted" || q.status === "confirmed" || q.status === "paid"
    );
    
    // Get order assignments from localStorage or regionManagement
    let assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    
    // If localStorage is empty, use default regionManagement assignments
    if (assignments.length === 0) {
      assignments = regionManagement.orderAssignments;
      localStorage.setItem("order_assignments", JSON.stringify(assignments));
    }
    
    const acceptedAssignments = assignments.filter((a: any) => 
      a.status === "accepted" || a.status === "in_progress" || a.status === "completed"
    );
    
    console.log("Accepted assignments:", acceptedAssignments);
    console.log("Mock orders available:", mockOrders);
    
    // Convert mockOrders that have been assigned and accepted to Quote format
    const ordersFromAssignments: Quote[] = acceptedAssignments.map((assignment: any) => {
      const mockOrder = mockOrders.find(o => o.id === assignment.orderId);
      console.log(`Looking for order ${assignment.orderId}:`, mockOrder ? "FOUND" : "NOT FOUND");
      
      if (!mockOrder) return null;
      
      // Convert Order type to Quote type for display
      return {
        id: mockOrder.id,
        lead_id: mockOrder.quote_id,
        user_id: "mock-user-id",
        client_name: mockOrder.client_name,
        client_email: mockOrder.client_name.toLowerCase().replace(/\s+/g, '.') + "@example.com",
        event_date: mockOrder.event_date,
        event_time: "18:00",
        venue_address: mockOrder.venue_address,
        guest_count: mockOrder.guest_count,
        menu_items: mockOrder.menu_items,
        equipment_items: mockOrder.equipment_items,
        subtotal: (mockOrder.total ?? 0) * 0.87,
        tax: (mockOrder.total ?? 0) * 0.13,
        total: mockOrder.total ?? 0,
        status: "accepted",
        created_at: mockOrder.created_at,
        updated_at: mockOrder.created_at,
        // FIX: Add missing required properties
        notes: "Mock data from assignment.",
        quote_number: `QT-${mockOrder.id}`,
        terms: "Standard terms from mock data.",
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        viewed_at: null,
        accepted_at: new Date().toISOString(),
        client_phone: null,
        currency: "ZAR",
        region_id: null,
        sent_at: mockOrder.created_at,
      };
    }).filter(Boolean) as Quote[];
    
    console.log("Orders from assignments:", ordersFromAssignments);
    
    // Combine both sources and remove duplicates
    const allOrders = [...acceptedQuotes, ...ordersFromAssignments];
    const uniqueOrders = allOrders.filter((order, index, self) => 
      index === self.findIndex((o) => o.id === order.id)
    );
    
    console.log("Final unique orders:", uniqueOrders);
    setOrders(uniqueOrders);
    
    const storedInventory = JSON.parse(localStorage.getItem("inventory") || "[]");
    setInventory(storedInventory);
  }, []);

  const deductStockForOrder = (order: Quote) => {
    const updatedInventory = [...inventory];
    let stockDeducted = false;
    
    if (Array.isArray(order.menu_items)) {
      order.menu_items.forEach((menuItem: any) => {
        if (Array.isArray(menuItem.ingredients)) {
          menuItem.ingredients.forEach((ingredient: any) => {
            const totalNeeded = ingredient.quantity * menuItem.quantity;
            const inventoryItem = updatedInventory.find(
              item => item.name.toLowerCase() === ingredient.name.toLowerCase()
            );
            
            if (inventoryItem && inventoryItem.currentStock >= totalNeeded) {
              inventoryItem.currentStock -= totalNeeded;
              stockDeducted = true;
            }
          });
        }
      });
    }
    
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
    .filter(order => new Date(order.event_date) >= new Date())
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

  const pastOrders = orders
    .filter(order => new Date(order.event_date) < new Date())
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

  const getOrderIngredients = (order: Quote) => {
    const allIngredients: { [key: string]: { quantity: number; inStock: boolean } } = {};
    
    if (Array.isArray(order.menu_items)) {
      order.menu_items.forEach((item: any) => {
        if(Array.isArray(item.ingredients)) {
          item.ingredients.forEach((ingredient: any) => {
            const totalNeeded = ingredient.quantity * item.quantity;
            const inventoryItem = inventory.find(
              (inv: any) => inv.name.toLowerCase() === ingredient.name.toLowerCase()
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
        }
      });
    }

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
      (new Date(order.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    return (
      <Card className="border-0 shadow-lg hover:shadow-xl transition-all">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
            <div className="flex-1 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">{order.client_name}</h3>
                <div className="flex flex-wrap gap-2">
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
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{new Date(order.event_date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span>{order.guest_count} guests</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <ClipboardList className="w-4 h-4 flex-shrink-0" />
                  <span>{(Array.isArray(order.menu_items) ? order.menu_items.length : 0)} items</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <ShoppingCart className="w-4 h-4 flex-shrink-0" />
                  <span>{ingredients.length} ingredients</span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 sm:p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <ChefHat className="w-4 h-4" />
                  Menu Items
                </h4>
                <div className="space-y-1">
                  {Array.isArray(order.menu_items) && order.menu_items.map((item: any, idx) => (
                    <div key={idx} className="text-sm text-slate-600 flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="break-words">{item.name} ({item.category})</span>
                      <span className="font-medium">×{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {ingredients.length > 0 && (
                <div className={`rounded-lg p-3 sm:p-4 ${!hasStock && !stockAlreadyDeducted ? 'bg-red-50 border border-red-200' : 'bg-blue-50'}`}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Required Ingredients
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ingredients.slice(0, 6).map((ingredient, idx) => (
                      <div 
                        key={idx} 
                        className={`text-sm flex items-start gap-1 break-words ${
                          !ingredient.inStock && !stockAlreadyDeducted ? 'text-red-600 font-medium' : 'text-slate-600'
                        }`}
                      >
                        {!ingredient.inStock && !stockAlreadyDeducted && (
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        )}
                        <span>• {ingredient.name}: {ingredient.quantity} {ingredient.unit}</span>
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

            <div className="flex flex-row lg:flex-col gap-2 lg:ml-4 lg:min-w-[160px]">
              <Link href={`/orders/${order.id}`} className="flex-1 lg:flex-none">
                <Button variant="outline" size="sm" className="w-full h-11 lg:h-9">
                  View Details
                </Button>
              </Link>
              
              <div className="flex-1 lg:flex-none lg:pt-2">
                <InvoiceGenerator
                  orderId={order.id}
                  orderNumber={order.id.substring(0, 8).toUpperCase()}
                  customerEmail={order.client_email}
                />
              </div>
              
              {!stockAlreadyDeducted && hasStock && (
                <Button 
                  size="sm" 
                  className="flex-1 lg:flex-none w-full h-11 lg:h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  onClick={() => deductStockForOrder(order)}
                >
                  <Package className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Deduct Stock</span>
                  <span className="sm:hidden">Deduct</span>
                </Button>
              )}
              {!stockAlreadyDeducted && !hasStock && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex-1 lg:flex-none w-full h-11 lg:h-9 border-red-300 text-red-700 hover:bg-red-50"
                  disabled
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Insufficient Stock</span>
                  <span className="sm:hidden">Low Stock</span>
                </Button>
              )}
              <Button 
                size="sm" 
                className="flex-1 lg:flex-none w-full h-11 lg:h-9 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Complete Order</span>
                <span className="sm:hidden">Complete</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <NoIndexMeta />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
          <Link href="/">
            <Button variant="ghost" className="mb-4 h-11">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </Link>

          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl shadow-lg">
                <ClipboardList className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  Order Management
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">Manage orders and track inventory deduction</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
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
            <Card className="mb-4 sm:mb-6 border-red-200 bg-red-50">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 sm:mt-0.5" />
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

          <Tabs defaultValue="upcoming" className="space-y-4 sm:space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2 h-11">
              <TabsTrigger value="upcoming" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Upcoming</span>
                <span className="sm:hidden">Active</span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Completed</span>
                <span className="sm:hidden">Done</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="space-y-4">
              {upcomingOrders.length === 0 ? (
                <Card className="border-2 border-dashed">
                  <CardContent className="p-8 sm:p-12 text-center">
                    <ClipboardList className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">No upcoming orders</h3>
                    <p className="text-sm sm:text-base text-slate-600">Orders will appear here once quotes are accepted</p>
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
                  <CardContent className="p-8 sm:p-12 text-center">
                    <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">No completed orders</h3>
                    <p className="text-sm sm:text-base text-slate-600">Completed orders will appear here</p>
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
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};
