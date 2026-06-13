import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { BookOpen, Search, Loader2, Clock, Users as UsersIcon, ImageOff } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface MenuItem {
  id: string;
  item_name: string | null;
  description: string | null;
  category: string | null;
  base_price: number | null;
  cost_per_unit: number | null;
  is_available: boolean | null;
  active: boolean | null;
  base_servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  dietary_tags: string[] | null;
  allergen_info: string | null;
  image_url: string | null;
  instructions: string | null;
  recipe_name: string | null;
}

interface Ingredient {
  id: string;
  ingredient_name: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
}

const dietaryTone: Record<string, string> = {
  vegan:        "bg-green-100 text-green-800 border-green-200",
  vegetarian:   "bg-green-100 text-green-800 border-green-200",
  halal:        "bg-emerald-100 text-emerald-800 border-emerald-200",
  kosher:       "bg-blue-100 text-blue-800 border-blue-200",
  "gluten-free":"bg-amber-100 text-amber-800 border-amber-200",
  "dairy-free": "bg-amber-100 text-amber-800 border-amber-200",
  "nut-free":   "bg-rose-100 text-rose-800 border-rose-200",
};

export default function KitchenMenuItemsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("item_name", { ascending: true })
        .returns<MenuItem[]>();
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      toast({ title: "Could not load menu", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadIngredients = async (item: MenuItem) => {
    setSelected(item);
    setIngredientsLoading(true);
    setIngredients([]);
    try {
      const { data: recipes } = await supabase
        .from("recipes")
        .select("id")
        .eq("menu_item_id", item.id)
        .returns<{ id: string }[]>();
      const recipeIds = (recipes || []).map((r) => r.id);
      if (recipeIds.length === 0) {
        setIngredients([]);
        return;
      }
      const { data: ings } = await supabase
        .from("recipe_ingredients")
        .select("id, ingredient_name, quantity, unit, notes")
        .in("recipe_id", recipeIds)
        .returns<Ingredient[]>();
      setIngredients(ings || []);
    } catch (e) {
      toast({ title: "Could not load recipe ingredients", variant: "destructive" });
    } finally {
      setIngredientsLoading(false);
    }
  };

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.category) s.add(i.category); });
    return ["all", ...Array.from(s).sort()];
  }, [items]);

  const categoryFiltered = useMemo(() => {
    return category === "all" ? items : items.filter((i) => i.category === category);
  }, [items, category]);

  const filtered = useFuzzyItems(
    categoryFiltered,
    search,
    [
      { key: "item_name" as any, weight: 3 },
      { key: "category" as any, weight: 2 },
      { key: "description" as any, weight: 1 },
      { key: ((i: any) => (i.dietary_tags || []).join(" ")) as any, weight: 1, label: "dietary_tags" },
    ],
    { limit: 0 },
  );

  const grouped = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    filtered.forEach((i) => {
      const k = i.category || "Uncategorised";
      if (!map[k]) map[k] = [];
      map[k].push(i);
    });
    return map;
  }, [filtered]);

  return (
    <>
      <Head><title>Menu items - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-3">
              <BookOpen className="h-7 w-7 text-orange-600" />
              Menu Items
            </h1>
            <p className="text-sm text-slate-600 mt-1">Recipes the kitchen owns, click any dish for ingredients and prep notes</p>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Search by name, category, dietary tag..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading menu...</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="text-center py-16 text-slate-500">
                <BookOpen className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No menu items match the current filter</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([cat, list]) => (
                <div key={cat}>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">{cat}, {list.length}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map((i) => (
                      <button key={i.id} onClick={() => loadIngredients(i)} className="text-left bg-white rounded-lg border border-slate-200 hover:border-orange-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 overflow-hidden">
                        <div className="aspect-[16/9] bg-slate-100 flex items-center justify-center overflow-hidden">
                          {i.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.image_url} alt={i.item_name ?? ""} className="w-full h-full object-cover" />
                          ) : (
                            <ImageOff className="h-8 w-8 text-slate-300" />
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="font-medium text-slate-900 truncate flex-1">{i.item_name}</div>
                            {/* Price chip removed for kitchen staff.
                                Audit (May 2026) classified per-dish
                                client price + margin chip as finance
                                info - belongs to directors/admin only,
                                not the cook reading the prep list. The
                                full margin breakdown still lives on
                                /admin/menu for owners. */}
                          </div>
                          {i.description && <p className="text-xs text-slate-600 line-clamp-2 mb-2">{i.description}</p>}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(i.dietary_tags || []).slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline" className={`text-[10px] ${dietaryTone[t] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>{t}</Badge>
                            ))}
                            {i.base_servings && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1"><UsersIcon className="h-3 w-3" />{i.base_servings}</span>
                            )}
                            {(i.prep_time_minutes || i.cook_time_minutes) && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />{Number(i.prep_time_minutes || 0) + Number(i.cook_time_minutes || 0)}m
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.item_name}</DialogTitle>
            <DialogDescription>{selected?.category ?? ""}{selected?.base_price != null ? `, R ${Number(selected.base_price).toFixed(2)}` : ""}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {selected.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.image_url} alt={selected.item_name ?? ""} className="w-full max-h-60 object-cover rounded-lg" />
              )}
              {selected.description && <p className="text-sm text-slate-700">{selected.description}</p>}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded p-3 text-center">
                  <div className="text-xs text-slate-500">Servings</div>
                  <div className="text-lg font-bold tabular-nums">{selected.base_servings ?? "--"}</div>
                </div>
                <div className="bg-slate-50 rounded p-3 text-center">
                  <div className="text-xs text-slate-500">Prep</div>
                  <div className="text-lg font-bold tabular-nums">{selected.prep_time_minutes ?? "--"}<span className="text-xs font-normal">m</span></div>
                </div>
                <div className="bg-slate-50 rounded p-3 text-center">
                  <div className="text-xs text-slate-500">Cook</div>
                  <div className="text-lg font-bold tabular-nums">{selected.cook_time_minutes ?? "--"}<span className="text-xs font-normal">m</span></div>
                </div>
              </div>
              {(selected.dietary_tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(selected.dietary_tags || []).map((t) => (
                    <Badge key={t} variant="outline" className={`${dietaryTone[t] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>{t}</Badge>
                  ))}
                </div>
              )}
              {selected.allergen_info && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                  <div className="font-semibold text-amber-900 mb-1">Allergens</div>
                  <div className="text-amber-800">{selected.allergen_info}</div>
                </div>
              )}
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                Ingredients
                <InfoTooltip content="The ingredients listed in the recipe for this dish." />
              </h3>
                {ingredientsLoading ? (
                  <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading ingredients...</div>
                ) : ingredients.length === 0 ? (
                  <p className="text-sm text-slate-500">No ingredients defined for this menu item yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded">
                    {ingredients.map((ing) => (
                      <li key={ing.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{ing.ingredient_name}</div>
                          {ing.notes && <div className="text-xs text-slate-500">{ing.notes}</div>}
                        </div>
                        <div className="tabular-nums text-slate-700 flex-shrink-0">{ing.quantity ?? "--"} {ing.unit ?? ""}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selected.instructions && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Instructions</h3>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{selected.instructions}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
