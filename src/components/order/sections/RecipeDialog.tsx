/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: inline recipe viewer. Opened from the Kitchen section's
 * per-item Recipe button. Lazily fetches the recipe + ingredient
 * lines for a menu_item_id and renders them in a dialog so the
 * chef doesn't lose their place in the order doc.
 *
 * Ingredients are scaled live by the order's serving multiplier:
 * (order quantity / recipe base_servings). The chef sees the
 * actual amounts they need to weigh out for this order, not the
 * base-servings template.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, BookOpen, AlertCircle } from "lucide-react";
import { recipeBatchesForOrderLine } from "@/lib/recipeScaling";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItemId: string | null;
  itemName: string;
  /** Order quantity for this line - drives ingredient scaling. */
  orderQuantity: number;
}

interface RecipeRow {
  id: string;
  recipe_name: string;
  base_servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  instructions: string | null;
}

interface IngredientRow {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

export function RecipeDialog({ open, onOpenChange, menuItemId, itemName, orderQuantity }: Props) {
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeRow | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [notFound, setNotFound] = useState(false);
  // Package items (whole spit braai) sell one FULL batch per order unit,
  // so the chef must not see the ingredients divided by base servings.
  const [soldAsPackage, setSoldAsPackage] = useState(false);

  useEffect(() => {
    if (!open || !menuItemId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setRecipe(null);
      setIngredients([]);
      setSoldAsPackage(false);
      try {
        const { data: mi } = await (supabase as any)
          .from("menu_items")
          .select("sold_as_package")
          .eq("id", menuItemId)
          .maybeSingle();
        if (!cancelled) setSoldAsPackage(!!mi?.sold_as_package);
        const { data: rec, error: recErr } = await (supabase as any)
          .from("recipes")
          .select("id, recipe_name, base_servings, prep_time_minutes, cook_time_minutes, instructions")
          .eq("menu_item_id", menuItemId)
          .maybeSingle();
        if (recErr) throw recErr;
        if (cancelled) return;
        if (!rec) { setNotFound(true); return; }
        setRecipe(rec as RecipeRow);
        const { data: ings, error: ingErr } = await (supabase as any)
          .from("recipe_ingredients")
          .select("id, ingredient_name, quantity, unit, notes")
          .eq("recipe_id", rec.id)
          .order("ingredient_name", { ascending: true });
        if (ingErr) throw ingErr;
        if (!cancelled) setIngredients((ings || []) as IngredientRow[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadRecipeDialog", menuItemId } });
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, menuItemId]);

  // Scale factor - how many "base-servings batches" we need to make
  // to cover this order line. Package items count whole batches per
  // ordered unit (1 x spit braai = 1 whole lamb, never 1/25th).
  const scale = recipe
    ? recipeBatchesForOrderLine({
        orderQuantity,
        baseServings: recipe.base_servings,
        soldAsPackage,
      }) || 1
    : 1;
  const showScaling = recipe && recipe.base_servings > 0 && Math.abs(scale - 1) > 0.0001;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-orange-600" />
            {itemName}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading recipe..."
              : recipe
                ? `${recipe.recipe_name}${recipe.base_servings ? ` · base ${recipe.base_servings} servings` : ""}`
                : "Recipe details"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
          </div>
        ) : notFound || !recipe ? (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">No recipe stored</p>
              <p className="text-xs text-amber-800 mt-0.5">
                This menu item doesn't have a recipe with ingredients and method yet. Add one on the menu page so it's available next time.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Scaling banner - the headline intel for the chef */}
            <div className="flex items-center gap-3 p-3 rounded-md bg-orange-50 border border-orange-200">
              <div className="text-3xl font-bold text-orange-700 tabular-nums">
                ×{scale.toFixed(scale < 1 ? 2 : 1).replace(/\.0+$/, "")}
              </div>
              <div className="text-sm">
                <p className="font-semibold text-orange-900">
                  Make {orderQuantity} {orderQuantity === 1 ? "serving" : "servings"}
                </p>
                <p className="text-xs text-orange-800">
                  Recipe base: {recipe.base_servings}
                  {recipe.prep_time_minutes ? ` · Prep ${recipe.prep_time_minutes}min` : ""}
                  {recipe.cook_time_minutes ? ` · Cook ${recipe.cook_time_minutes}min` : ""}
                </p>
              </div>
            </div>

            {/* Ingredient list with scaled quantities */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                Ingredients {showScaling && <span className="text-orange-700 normal-case tracking-normal font-normal">(scaled for this order)</span>}
              </h3>
              {ingredients.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No ingredients listed on this recipe.</p>
              ) : (
                <ul className="space-y-1">
                  {ingredients.map((ing) => {
                    const scaledQty = ing.quantity * scale;
                    return (
                      <li key={ing.id} className="flex items-baseline gap-3 p-2 rounded border border-slate-200 bg-white">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0 min-w-[5rem]">
                          {scaledQty.toLocaleString("en-ZA", { maximumFractionDigits: 2 })} {ing.unit}
                        </span>
                        <span className="text-sm text-slate-800 flex-1">{ing.ingredient_name}</span>
                        {ing.notes && (
                          <span className="text-xs text-slate-500 italic">{ing.notes}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Method / instructions */}
            {recipe.instructions && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Method</h3>
                <div className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-3 leading-relaxed">
                  {recipe.instructions}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
