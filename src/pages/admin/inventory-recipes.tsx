import { useState } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RECIPE_MAPPINGS, Recipe, RecipeIngredient } from "@/services/inventoryDeductionService";
import {
  ChefHat,
  Search,
  Package,
  AlertCircle,
  CheckCircle,
  Calculator,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export default function InventoryRecipes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [guestCount, setGuestCount] = useState(100);

  const filteredRecipes = useFuzzyItems(
    RECIPE_MAPPINGS,
    searchTerm,
    [
      { key: "menu_item_name" as any, weight: 3 },
      { key: ((r: Recipe) => (r.ingredients || []).map((i) => i.ingredient_name).join(" ")) as any, weight: 1, label: "ingredients" },
    ],
    { limit: 0 },
  );

  const calculateIngredientTotal = (ingredient: RecipeIngredient, guests: number) => {
    return (ingredient.quantity_per_serving * guests).toFixed(2);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav />
      <div className="px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <ChefHat className="h-8 w-8 text-purple-600" />
              Recipe & Ingredient Mappings
            </h1>
            <p className="text-slate-600 mt-1">
              Menu items linked to inventory ingredients for automatic deductions
            </p>
          </div>
        </div>

        {/* Info Alert */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">How Automatic Inventory Works</h3>
                <p className="text-sm text-blue-800">
                  When a delivery is marked as <strong>complete</strong>, the system automatically:
                </p>
                <ul className="list-disc list-inside text-sm text-blue-800 mt-2 space-y-1">
                  <li>Calculates ingredient needs based on final guest count</li>
                  <li>Deducts quantities from your inventory</li>
                  <li>Creates transaction records for audit trail</li>
                  <li>Sends low stock alerts if items run low</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">Total Recipes <InfoTooltip content={"Menu items linked to the inventory ingredients they consume."} /></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{RECIPE_MAPPINGS.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Unique Ingredients <InfoTooltip content={"Distinct ingredients used across all your recipe mappings."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {new Set(RECIPE_MAPPINGS.flatMap(r => r.ingredients.map(i => i.inventory_item_name))).size}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Calculator <InfoTooltip content={"Type in a guest count to preview the ingredients each recipe would use.\n\nThis is just a preview. Nothing gets saved or deducted."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={guestCount}
                  onChange={(e) => setGuestCount(parseInt(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-slate-600">guests</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search menu items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Recipe Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredRecipes.map((recipe) => {
            const totalIngredients = recipe.ingredients.length;
            const hasMultipleIngredients = totalIngredients > 1;

            return (
              <Card key={recipe.menu_item_name} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ChefHat className="h-5 w-5 text-purple-600" />
                        {recipe.menu_item_name}
                      </CardTitle>
                      <CardDescription>
                        {totalIngredients} ingredient{totalIngredients !== 1 ? 's' : ''} required
                      </CardDescription>
                    </div>
                    {hasMultipleIngredients && (
                      <Badge variant="secondary">
                        <Package className="h-3 w-3 mr-1" />
                        Complex
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recipe.ingredients.map((ingredient, idx) => {
                      const totalNeeded = calculateIngredientTotal(ingredient, guestCount);
                      
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-slate-900">
                              {ingredient.inventory_item_name}
                            </div>
                            <div className="text-sm text-slate-600">
                              {ingredient.quantity_per_serving} {ingredient.unit} per serving
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-purple-600">
                              {totalNeeded}
                            </div>
                            <div className="text-xs text-slate-500">
                              {ingredient.unit} for {guestCount} guests
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Example Calculation */}
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Calculator className="h-4 w-4 text-green-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-green-900">Auto-Deduction Example:</p>
                        <p className="text-green-700 mt-1">
                          When an order with {guestCount} guests and this menu item is marked delivered,
                          the quantities shown above will be automatically deducted from your inventory.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredRecipes.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <ChefHat className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <h3 className="text-lg font-semibold mb-2">No recipes found</h3>
              <p className="text-slate-600">Try adjusting your search</p>
            </CardContent>
          </Card>
        )}

        {/* How to Add Recipes */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How to Add More Recipes</CardTitle>
            <CardDescription>
              Add your menu items to the recipe database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-slate-900 mb-2">Step 1: Open the Service File</h4>
                <code className="block bg-slate-100 p-2 rounded text-sm">
                  src/services/inventoryDeductionService.ts
                </code>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 mb-2">Step 2: Add Your Recipe</h4>
                <pre className="bg-slate-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
{`{
  menu_item_name: "Your Menu Item",
  ingredients: [
    {
      inventory_item_name: "Ingredient Name",
      quantity_per_serving: 0.25,
      unit: "kg"
    }
  ]
}`}
                </pre>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <strong>Important:</strong> The <code>inventory_item_name</code> must match exactly
                  with item names in your inventory system (case-insensitive).
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}