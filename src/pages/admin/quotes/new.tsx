import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  ArrowLeft,
  Save,
  Send,
  Plus,
  Trash2,
  Calculator,
  MapPin,
  TrendingUp
} from "lucide-react";
import { inventoryService } from "@/services/inventoryService";
import { useToast } from "@/hooks/use-toast";
import { MenuItem, EquipmentItem } from "@/types/app";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";
import { ChatBot } from "@/components/ChatBot";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedNewQuotePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <NewQuotePage />
    </ProtectedRoute>
  );
}

function NewQuotePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { leadId } = router.query;
  
  const [formData, setFormData] = useState({
    clientName: "",
    email: "",
    eventDate: "",
    eventType: "",
    guestCount: 0,
    deliveryAddress: ""
  });

  const [deliveryDetails, setDeliveryDetails] = useState({
    distance: 0,
    costPerKm: 8.50,
    deliveryFee: 0
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>([
    {
      id: "M1",
      name: "",
      category: "main",
      pricePerPerson: 0,
      quantity: 0,
      ingredients: []
    }
  ]);

  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([
    {
      id: "E1",
      name: "",
      category: "chafing",
      quantity: 0,
      available: 0,
      condition: "good",
      rentalPrice: 0
    }
  ]);

  useEffect(() => {
    const savedSettings = localStorage.getItem("admin_settings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setDeliveryDetails(prev => ({
        ...prev,
        costPerKm: settings.operations?.deliveryCostPerKm || 8.50
      }));
    }
  }, []);

  useEffect(() => {
    if (leadId) {
      const leads = JSON.parse(localStorage.getItem("leads") || "[]");
      const lead = leads.find((l: any) => l.id === leadId);
      if (lead) {
        setFormData({
          clientName: lead.clientName,
          email: lead.email,
          eventDate: lead.eventDate,
          eventType: lead.eventType,
          guestCount: lead.guestCount,
          deliveryAddress: ""
        });
      }
    }
  }, [leadId]);

  const calculateDistance = (deliveryAddress: string) => {
    if (!deliveryAddress || deliveryAddress.trim().length < 5) {
      setDeliveryDetails(prev => ({ ...prev, distance: 0, deliveryFee: 0 }));
      return;
    }

    const estimatedDistance = Math.floor(Math.random() * 30) + 5;
    const fee = estimatedDistance * deliveryDetails.costPerKm;
    
    setDeliveryDetails(prev => ({
      ...prev,
      distance: estimatedDistance,
      deliveryFee: fee
    }));
  };

  const handleDeliveryAddressChange = (address: string) => {
    setFormData(prev => ({ ...prev, deliveryAddress: address }));
    
    const debounceTimer = setTimeout(() => {
      calculateDistance(address);
    }, 500);

    return () => clearTimeout(debounceTimer);
  };

  const addMenuItem = () => {
    setMenuItems([...menuItems, {
      id: `M${Date.now()}`,
      name: "",
      category: "main",
      pricePerPerson: 0,
      quantity: formData.guestCount,
      ingredients: []
    }]);
  };

  const removeMenuItem = (id: string) => {
    setMenuItems(menuItems.filter(item => item.id !== id));
  };

  const updateMenuItem = (id: string, field: keyof MenuItem, value: any) => {
    setMenuItems(menuItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const addEquipmentItem = () => {
    setEquipmentItems([...equipmentItems, {
      id: `E${Date.now()}`,
      name: "",
      category: "chafing",
      quantity: 0,
      available: 0,
      condition: "good",
      rentalPrice: 0
    }]);
  };

  const removeEquipmentItem = (id: string) => {
    setEquipmentItems(equipmentItems.filter(item => item.id !== id));
  };

  const updateEquipmentItem = (id: string, field: keyof EquipmentItem, value: any) => {
    setEquipmentItems(equipmentItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const calculateSubtotal = () => {
    const menuTotal = menuItems.reduce((sum, item) => 
      sum + (item.pricePerPerson * item.quantity), 0
    );
    const equipmentTotal = equipmentItems.reduce((sum, item) => 
      sum + (item.rentalPrice * item.quantity), 0
    );
    return menuTotal + equipmentTotal;
  };

  const subtotal = calculateSubtotal();
  const deliveryFee = deliveryDetails.deliveryFee;
  const subtotalWithDelivery = subtotal + deliveryFee;
  const tax = subtotalWithDelivery * 0.15;
  const total = subtotalWithDelivery + tax;

  const handleSaveQuote = (sendToClient: boolean) => {
    const quote = {
      id: `Q${Date.now()}`,
      leadId: leadId as string,
      ...formData,
      deliveryDistance: deliveryDetails.distance,
      deliveryFee: deliveryDetails.deliveryFee,
      deliveryCostPerKm: deliveryDetails.costPerKm,
      menuItems: menuItems.filter(item => item.name && item.pricePerPerson > 0),
      equipmentItems: equipmentItems.filter(item => item.name && item.rentalPrice > 0),
      subtotal,
      tax,
      total,
      status: sendToClient ? "sent" : "draft",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const quotes = JSON.parse(localStorage.getItem("quotes") || "[]");
    localStorage.setItem("quotes", JSON.stringify([...quotes, quote]));

    if (leadId) {
      const leads = JSON.parse(localStorage.getItem("leads") || "[]");
      const updatedLeads = leads.map((lead: any) => 
        lead.id === leadId ? { ...lead, status: "quoted", updatedAt: new Date().toISOString() } : lead
      );
      localStorage.setItem("leads", JSON.stringify(updatedLeads));
    }

    router.push("/admin/quotes");
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>New Quote | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Link href="/admin/leads">
            <Button variant="ghost" className="mb-3 sm:mb-4 text-sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Leads
            </Button>
          </Link>

          <div className="mb-4 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl sm:rounded-2xl shadow-lg flex-shrink-0">
                  <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Create Quote
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1">Generate a detailed quote for the client</p>
                </div>
              </div>
              {leadId && (
                <Badge variant="outline" className="px-3 py-1.5 text-xs w-fit">
                  Lead: {leadId}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">Client Information</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Event and contact details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-xs sm:text-sm">Client Name</Label>
                      <Input value={formData.clientName} readOnly className="bg-slate-50 text-sm h-10" />
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm">Email</Label>
                      <Input value={formData.email} readOnly className="bg-slate-50 text-sm h-10" />
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm">Event Date</Label>
                      <Input value={formData.eventDate} readOnly className="bg-slate-50 text-sm h-10" />
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm">Guest Count</Label>
                      <Input value={formData.guestCount} readOnly className="bg-slate-50 text-sm h-10" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                    Delivery Address
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Calculate delivery distance and fees automatically</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  <div>
                    <Label className="text-xs sm:text-sm">Full Delivery Address</Label>
                    <Input
                      value={formData.deliveryAddress}
                      onChange={(e) => handleDeliveryAddressChange(e.target.value)}
                      placeholder="123 Main Street, Johannesburg, 2000"
                      className="bg-white text-sm h-10"
                    />
                    <p className="text-xs text-slate-600 mt-1">
                      Enter the complete delivery address to calculate distance and fees
                    </p>
                  </div>

                  {deliveryDetails.distance > 0 && (
                    <div className="p-3 sm:p-4 bg-white rounded-lg border border-blue-200">
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                        <div>
                          <div className="text-xl sm:text-2xl font-bold text-blue-600">{deliveryDetails.distance}km</div>
                          <div className="text-xs text-slate-600">Distance</div>
                        </div>
                        <div>
                          <div className="text-xl sm:text-2xl font-bold text-green-600">R{deliveryDetails.costPerKm.toFixed(2)}</div>
                          <div className="text-xs text-slate-600">Per Km</div>
                        </div>
                        <div>
                          <div className="text-xl sm:text-2xl font-bold text-purple-600">R{deliveryDetails.deliveryFee.toFixed(2)}</div>
                          <div className="text-xs text-slate-600">Fee</div>
                        </div>
                      </div>
                      <div className="mt-2 sm:mt-3 flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-600">
                        <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="text-center">Calculated from kitchen to delivery</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Menu Items</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">Food and beverage offerings</CardDescription>
                    </div>
                    <Button onClick={addMenuItem} size="sm" className="w-full sm:w-auto h-9 text-xs">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  {menuItems.map((item, index) => (
                    <div key={item.id} className="p-3 sm:p-4 border rounded-lg bg-slate-50">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-xs sm:text-sm font-medium text-slate-600">Item {index + 1}</span>
                        {menuItems.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeMenuItem(item.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        <div className="sm:col-span-2">
                          <Label className="text-xs sm:text-sm">Item Name</Label>
                          <Input
                            value={item.name}
                            onChange={(e) => updateMenuItem(item.id, "name", e.target.value)}
                            placeholder="Grilled Chicken"
                            className="text-sm h-10"
                          />
                        </div>
                        <div>
                          <Label className="text-xs sm:text-sm">Category</Label>
                          <select
                            value={item.category}
                            onChange={(e) => updateMenuItem(item.id, "category", e.target.value)}
                            className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                          >
                            <option value="appetizer">Appetizer</option>
                            <option value="main">Main Course</option>
                            <option value="side">Side Dish</option>
                            <option value="dessert">Dessert</option>
                            <option value="beverage">Beverage</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs sm:text-sm">Price per Person</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.pricePerPerson}
                            onChange={(e) => updateMenuItem(item.id, "pricePerPerson", parseFloat(e.target.value) || 0)}
                            placeholder="15.00"
                            className="text-sm h-10"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs sm:text-sm">Quantity</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateMenuItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                            placeholder={formData.guestCount.toString()}
                            className="text-sm h-10"
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-right">
                        <span className="text-xs sm:text-sm text-slate-600">Subtotal: </span>
                        <span className="text-sm sm:text-base font-semibold text-green-600">
                          R{(item.pricePerPerson * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base sm:text-lg">Equipment Rental</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">Chafing dishes, serving ware, etc.</CardDescription>
                    </div>
                    <Button onClick={addEquipmentItem} size="sm" variant="outline" className="w-full sm:w-auto h-9 text-xs">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Equipment
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  {equipmentItems.map((item, index) => (
                    <div key={item.id} className="p-3 sm:p-4 border rounded-lg bg-slate-50">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-xs sm:text-sm font-medium text-slate-600">Equipment {index + 1}</span>
                        {equipmentItems.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeEquipmentItem(item.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:gap-3">
                        <div>
                          <Label className="text-xs sm:text-sm">Equipment Name</Label>
                          <Input
                            value={item.name}
                            onChange={(e) => updateEquipmentItem(item.id, "name", e.target.value)}
                            placeholder="Chafing Dish"
                            className="text-sm h-10"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div>
                            <Label className="text-xs sm:text-sm">Quantity</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => updateEquipmentItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                              placeholder="4"
                              className="text-sm h-10"
                            />
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm">Rental Price</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rentalPrice}
                              onChange={(e) => updateEquipmentItem(item.id, "rentalPrice", parseFloat(e.target.value) || 0)}
                              placeholder="25.00"
                              className="text-sm h-10"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-right">
                        <span className="text-xs sm:text-sm text-slate-600">Subtotal: </span>
                        <span className="text-sm sm:text-base font-semibold text-green-600">
                          R{(item.rentalPrice * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <Card className="border-0 shadow-lg lg:sticky lg:top-4">
                <CardHeader className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                    Quote Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex justify-between text-slate-600 text-sm sm:text-base">
                      <span>Items Subtotal</span>
                      <span className="font-medium">R{subtotal.toFixed(2)}</span>
                    </div>
                    
                    {deliveryDetails.distance > 0 && (
                      <div className="flex justify-between text-slate-600 bg-blue-50 -mx-2 px-2 py-2 rounded text-sm sm:text-base">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                          <span className="text-xs sm:text-sm">Delivery ({deliveryDetails.distance}km)</span>
                        </div>
                        <span className="font-medium text-blue-600 text-xs sm:text-sm">R{deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between text-slate-600 text-sm sm:text-base">
                      <span>VAT (15%)</span>
                      <span className="font-medium">R{tax.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex justify-between text-base sm:text-lg font-bold text-slate-900">
                      <span>Total</span>
                      <span className="text-green-600">R{total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="pt-3 sm:pt-4 space-y-2 sm:space-y-3">
                    <Button 
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-11 text-sm"
                      onClick={() => handleSaveQuote(true)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send to Client
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full h-11 text-sm"
                      onClick={() => handleSaveQuote(false)}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save as Draft
                    </Button>
                  </div>

                  <div className="pt-3 sm:pt-4 border-t text-xs sm:text-sm text-slate-600">
                    <p className="mb-2 font-medium">Quote includes:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• {menuItems.filter(i => i.name).length} menu items</li>
                      <li>• {equipmentItems.filter(i => i.name).length} equipment rentals</li>
                      {deliveryDetails.distance > 0 && (
                        <li>• Delivery ({deliveryDetails.distance}km at R{deliveryDetails.costPerKm}/km)</li>
                      )}
                      <li>• Setup and professional service</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        
        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}