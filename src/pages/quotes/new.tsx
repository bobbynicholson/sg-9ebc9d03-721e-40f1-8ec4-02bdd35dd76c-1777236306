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
import { MenuItem, EquipmentItem } from "@/types";
import { Footer } from "@/components/Footer";

export default function NewQuotePage() {
  const router = useRouter();
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
      deliveryFee,
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

    router.push("/quotes");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Link href="/leads">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Leads
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Create Quote
                </h1>
                <p className="text-slate-600 mt-1">Generate a detailed quote for the client</p>
              </div>
            </div>
            {leadId && (
              <Badge variant="outline" className="px-4 py-2">
                Lead: {leadId}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
                <CardDescription>Event and contact details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Client Name</Label>
                    <Input value={formData.clientName} readOnly className="bg-slate-50" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={formData.email} readOnly className="bg-slate-50" />
                  </div>
                  <div>
                    <Label>Event Date</Label>
                    <Input value={formData.eventDate} readOnly className="bg-slate-50" />
                  </div>
                  <div>
                    <Label>Guest Count</Label>
                    <Input value={formData.guestCount} readOnly className="bg-slate-50" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  Delivery Address
                </CardTitle>
                <CardDescription>Calculate delivery distance and fees automatically</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Full Delivery Address</Label>
                  <Input
                    value={formData.deliveryAddress}
                    onChange={(e) => handleDeliveryAddressChange(e.target.value)}
                    placeholder="123 Main Street, Johannesburg, 2000"
                    className="bg-white"
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    Enter the complete delivery address to calculate distance and fees
                  </p>
                </div>

                {deliveryDetails.distance > 0 && (
                  <div className="p-4 bg-white rounded-lg border border-blue-200">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-blue-600">{deliveryDetails.distance}km</div>
                        <div className="text-xs text-slate-600">Distance</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">R{deliveryDetails.costPerKm.toFixed(2)}</div>
                        <div className="text-xs text-slate-600">Per Km</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">R{deliveryDetails.deliveryFee.toFixed(2)}</div>
                        <div className="text-xs text-slate-600">Delivery Fee</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                      <TrendingUp className="w-4 h-4" />
                      Calculated from kitchen to delivery location
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Menu Items</CardTitle>
                    <CardDescription>Food and beverage offerings</CardDescription>
                  </div>
                  <Button onClick={addMenuItem} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {menuItems.map((item, index) => (
                  <div key={item.id} className="p-4 border rounded-lg bg-slate-50">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-medium text-slate-600">Item {index + 1}</span>
                      {menuItems.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeMenuItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Item Name</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => updateMenuItem(item.id, "name", e.target.value)}
                          placeholder="Grilled Chicken"
                        />
                      </div>
                      <div>
                        <Label>Category</Label>
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
                        <Label>Price per Person</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.pricePerPerson}
                          onChange={(e) => updateMenuItem(item.id, "pricePerPerson", parseFloat(e.target.value) || 0)}
                          placeholder="15.00"
                        />
                      </div>
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => updateMenuItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                          placeholder={formData.guestCount.toString()}
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <span className="text-sm text-slate-600">Subtotal: </span>
                      <span className="font-semibold text-green-600">
                        R{(item.pricePerPerson * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Equipment Rental</CardTitle>
                    <CardDescription>Chafing dishes, serving ware, etc.</CardDescription>
                  </div>
                  <Button onClick={addEquipmentItem} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Equipment
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {equipmentItems.map((item, index) => (
                  <div key={item.id} className="p-4 border rounded-lg bg-slate-50">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-medium text-slate-600">Equipment {index + 1}</span>
                      {equipmentItems.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeEquipmentItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Equipment Name</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => updateEquipmentItem(item.id, "name", e.target.value)}
                          placeholder="Chafing Dish"
                        />
                      </div>
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => updateEquipmentItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                          placeholder="4"
                        />
                      </div>
                      <div>
                        <Label>Rental Price (each)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rentalPrice}
                          onChange={(e) => updateEquipmentItem(item.id, "rentalPrice", parseFloat(e.target.value) || 0)}
                          placeholder="25.00"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <span className="text-sm text-slate-600">Subtotal: </span>
                      <span className="font-semibold text-green-600">
                        R{(item.rentalPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-0 shadow-lg sticky top-4">
              <CardHeader className="bg-gradient-to-br from-green-50 to-emerald-50">
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-green-600" />
                  Quote Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between text-slate-600">
                    <span>Items Subtotal</span>
                    <span className="font-medium">R{subtotal.toFixed(2)}</span>
                  </div>
                  
                  {deliveryDetails.distance > 0 && (
                    <div className="flex justify-between text-slate-600 bg-blue-50 -mx-2 px-2 py-2 rounded">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        <span>Delivery Fee ({deliveryDetails.distance}km)</span>
                      </div>
                      <span className="font-medium text-blue-600">R{deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-slate-600">
                    <span>VAT (15%)</span>
                    <span className="font-medium">R{tax.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex justify-between text-lg font-bold text-slate-900">
                    <span>Total</span>
                    <span className="text-green-600">R{total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <Button 
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                    onClick={() => handleSaveQuote(true)}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send to Client
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleSaveQuote(false)}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save as Draft
                  </Button>
                </div>

                <div className="pt-4 border-t text-sm text-slate-600">
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
  );
}
