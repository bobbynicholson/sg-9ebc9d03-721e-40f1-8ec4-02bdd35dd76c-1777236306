import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package,
  ArrowLeft,
  Search,
  AlertTriangle,
  TrendingDown,
  Plus,
  Edit,
  Trash2
} from "lucide-react";
import { Ingredient, EquipmentItem } from "@/types";

export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    const mockIngredients: Ingredient[] = [
      { id: "I001", name: "Chicken Breast", quantity: 25, quantityNeeded: 0, unit: "kg", category: "fresh" },
      { id: "I002", name: "Salmon Fillet", quantity: 8, quantityNeeded: 0, unit: "kg", category: "fresh" },
      { id: "I003", name: "Mixed Vegetables", quantity: 15, quantityNeeded: 0, unit: "kg", category: "fresh" },
      { id: "I004", name: "Rice", quantity: 50, quantityNeeded: 0, unit: "kg", category: "staple" },
      { id: "I005", name: "Pasta", quantity: 30, quantityNeeded: 0, unit: "kg", category: "staple" },
      { id: "I006", name: "Olive Oil", quantity: 12, quantityNeeded: 0, unit: "L", category: "staple" },
      { id: "I007", name: "Ice Cream", quantity: 20, quantityNeeded: 0, unit: "L", category: "frozen" },
    ];

    const mockEquipment: EquipmentItem[] = [
      { id: "E001", name: "Chafing Dishes", category: "chafing", quantity: 15, available: 12, condition: "good", rentalPrice: 25 },
      { id: "E002", name: "Serving Platters", category: "serving", quantity: 50, available: 45, condition: "good", rentalPrice: 15 },
      { id: "E003", name: "Chef Knives", category: "utensil", quantity: 20, available: 18, condition: "excellent", rentalPrice: 10 },
      { id: "E004", name: "Chafing Fuel", category: "other", quantity: 100, available: 85, condition: "good", rentalPrice: 5 },
      { id: "E005", name: "Table Linens", category: "other", quantity: 30, available: 25, condition: "fair", rentalPrice: 8 },
      { id: "E006", name: "Serving Utensils", category: "utensil", quantity: 60, available: 55, condition: "good", rentalPrice: 12 },
    ];

    setIngredients(mockIngredients);
    setEquipment(mockEquipment);
  }, []);

  const filteredIngredients = ingredients.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredEquipment = equipment.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLowStockItems = () => {
    return ingredients.filter(item => item.quantity < 10);
  };

  const getStockStatus = (quantity: number) => {
    if (quantity < 5) return { label: "Critical", color: "bg-red-100 text-red-700 border-red-200" };
    if (quantity < 10) return { label: "Low", color: "bg-orange-100 text-orange-700 border-orange-200" };
    return { label: "In Stock", color: "bg-green-100 text-green-700 border-green-200" };
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  Inventory Management
                </h1>
                <p className="text-slate-600 mt-1">Track stock levels and equipment</p>
              </div>
            </div>
            <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
        </div>

        {getLowStockItems().length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-orange-900 mb-1">Low Stock Alert</h3>
                  <p className="text-sm text-orange-700">
                    {getLowStockItems().length} item(s) are running low and need restocking
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="ingredients" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
          </TabsList>

          <TabsContent value="ingredients" className="space-y-6">
            <div className="flex gap-2 mb-4">
              <Button
                variant={selectedCategory === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("all")}
              >
                All
              </Button>
              <Button
                variant={selectedCategory === "fresh" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("fresh")}
              >
                Fresh Produce
              </Button>
              <Button
                variant={selectedCategory === "staple" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("staple")}
              >
                Staples
              </Button>
              <Button
                variant={selectedCategory === "frozen" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("frozen")}
              >
                Frozen
              </Button>
            </div>

            <div className="grid gap-4">
              {filteredIngredients.map((item) => {
                const status = getStockStatus(item.quantity);
                return (
                  <Card key={item.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                            <Badge className={status.color}>{status.label}</Badge>
                            <Badge variant="outline" className="capitalize">
                              {item.category}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-6 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              <span>
                                <span className="font-semibold text-slate-900">{item.quantity}</span> {item.unit}
                              </span>
                            </div>
                            {item.quantity < 10 && (
                              <div className="flex items-center gap-2 text-orange-600">
                                <TrendingDown className="w-4 h-4" />
                                <span className="font-medium">Reorder needed</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="equipment" className="space-y-6">
            <div className="grid gap-4">
              {filteredEquipment.map((item) => (
                <Card key={item.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                          <Badge className={
                            item.condition === "excellent" 
                              ? "bg-green-100 text-green-700 border-green-200"
                              : item.condition === "good"
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : "bg-orange-100 text-orange-700 border-orange-200"
                          }>
                            {item.condition}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-slate-600">
                          <span>
                            Total: <span className="font-semibold text-slate-900">{item.quantity}</span>
                          </span>
                          <span>
                            Available: <span className="font-semibold text-green-600">{item.available}</span>
                          </span>
                          <span>
                            In Use: <span className="font-semibold text-blue-600">{item.quantity - item.available}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
