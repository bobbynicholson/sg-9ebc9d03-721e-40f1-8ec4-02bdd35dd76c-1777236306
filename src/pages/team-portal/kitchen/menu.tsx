import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
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
import { PortalShell, PortalHeader, PortalCard,
  PageWorkbench,
} from "@/components/portal/ui";

interface MenuItem {
  id: string;
  item_name: string | null;
  description: string | null;
  category: string | null;
  is_available: boolean | null;
  active: boolean | null;
  base_servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  dietary_tags: string[] | null;
  allergen_codes: string[] | null;
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

// Dietary tags are informational labels, not status, so they read as
// quiet neutral chips. The default fallback below catches anything not
// listed here with the same neutral slate treatment.
const NEUTRAL_TAG = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
const dietaryTone: Record<string, string> = {
  vegan:        NEUTRAL_TAG,
  vegetarian:   NEUTRAL_TAG,
  halal:        NEUTRAL_TAG,
  kosher:       NEUTRAL_TAG,
  "gluten-free":NEUTRAL_TAG,
  "dairy-free": NEUTRAL_TAG,
  "nut-free":   NEUTRAL_TAG,
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
        .select(`
          id, item_name, description, category, is_available, active,
          base_servings, prep_time_minutes, cook_time_minutes,
          dietary_tags, allergen_codes, allergen_info, image_url,
          instructions, recipe_name
        `)
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
      <Head><title>Recipes - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Recipes"
            subtitle="Kitchen-owned dishes with ingredients, dietary tags, and prep notes. Open a dish before production starts."
            icon={BookOpen}
          />
          <PageWorkbench />

          <PortalCard className="mb-6 flex flex-col gap-3 sm:flex-row" padded>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input placeholder="Search by name, category, dietary tag..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
            </Select>
          </PortalCard>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true" aria-label="Loading menu">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-56 rounded-2xl border border-slate-200/80 bg-white shadow-sm animate-pulse motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <PortalCard padded={false}>
              <div className="py-16 px-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <BookOpen className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">No menu items match the current filter</p>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">Try a different category or clear the search to see the full recipe library.</p>
              </div>
            </PortalCard>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([cat, list]) => (
                <div key={cat}>
                  <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-1">{cat}, {list.length}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map((i) => (
                      <button key={i.id} onClick={() => loadIngredients(i)} className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)] hover:border-brand-primary/40 dark:hover:border-brand-primary/40 hover:-translate-y-0.5 transition-[box-shadow,border-color,transform] duration-200 ease-standard motion-reduce:transform-none motion-reduce:transition-none overflow-hidden">
                        <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                          {i.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.image_url} alt={i.item_name ?? ""} className="w-full h-full object-cover" />
                          ) : (
                            <ImageOff className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="font-medium text-slate-900 dark:text-white truncate flex-1">{i.item_name}</div>
                            {/* Price chip removed for kitchen staff.
                                Audit (May 2026) classified per-dish
                                client price + margin chip as finance
                                info - belongs to directors/admin only,
                                not the cook reading the prep list. The
                                full margin breakdown still lives on
                                /admin/menu for owners. */}
                          </div>
                          {i.description && <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">{i.description}</p>}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(i.dietary_tags || []).slice(0, 3).map((t) => (
                              <Badge key={t} variant="outline" className={`text-[10px] ${dietaryTone[t] ?? NEUTRAL_TAG}`}>{t}</Badge>
                            ))}
                            {i.base_servings && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><UsersIcon className="h-3 w-3" />{i.base_servings}</span>
                            )}
                            {(i.prep_time_minutes || i.cook_time_minutes) && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
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
        </PortalShell>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.item_name}</DialogTitle>
            <DialogDescription>{selected?.category || "Recipe details"}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {selected.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.image_url} alt={selected.item_name ?? ""} className="w-full max-h-60 object-cover rounded-lg" />
              )}
              {selected.description && <p className="text-sm text-slate-700 dark:text-slate-300">{selected.description}</p>}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Servings</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{selected.base_servings ?? "--"}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Prep</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{selected.prep_time_minutes ?? "--"}<span className="text-xs font-normal">m</span></div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Cook</div>
                  <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{selected.cook_time_minutes ?? "--"}<span className="text-xs font-normal">m</span></div>
                </div>
              </div>
              {(selected.dietary_tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(selected.dietary_tags || []).map((t) => (
                    <Badge key={t} variant="outline" className={`${dietaryTone[t] ?? NEUTRAL_TAG}`}>{t}</Badge>
                  ))}
                </div>
              )}
              {((selected.allergen_codes && selected.allergen_codes.length > 0) || selected.allergen_info) && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Allergens</div>
                  {selected.allergen_codes && selected.allergen_codes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.allergen_codes.map((code) => (
                        <Badge key={code} variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200 capitalize">{code}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-amber-800 dark:text-amber-300">{selected.allergen_info}</div>
                  )}
                </div>
              )}
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5 text-slate-900 dark:text-white">
                Ingredients
                <InfoTooltip content="The ingredients listed in the recipe for this dish." />
              </h3>
                {ingredientsLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Loading ingredients...</div>
                ) : ingredients.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No ingredients defined for this menu item yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {ingredients.map((ing) => (
                      <li key={ing.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white truncate">{ing.ingredient_name}</div>
                          {ing.notes && <div className="text-xs text-slate-500 dark:text-slate-400">{ing.notes}</div>}
                        </div>
                        <div className="tabular-nums text-slate-700 dark:text-slate-300 flex-shrink-0">{ing.quantity ?? "--"} {ing.unit ?? ""}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selected.instructions && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 text-slate-900 dark:text-white">Instructions</h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{selected.instructions}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
