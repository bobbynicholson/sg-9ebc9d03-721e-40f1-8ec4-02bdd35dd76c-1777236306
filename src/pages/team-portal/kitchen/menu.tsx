import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { BookOpen, Loader2, Clock, Users as UsersIcon, ImageOff, RefreshCw, AlertTriangle, LayoutGrid } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenPageShell, KITCHEN_HERO_CHIP } from "@/components/kitchen/KitchenPageShell";
import { AdminSearchField } from "@/components/admin/AdminControlSurface";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";

const ROUTE = "/team-portal/kitchen/menu";

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

// A dish is "off menu" when the office has retired it or flagged it
// unavailable. The kitchen still needs the recipe (an old order might
// carry it), just with a clear marker so nobody preps it for new work.
const isOffMenu = (i: MenuItem) => i.active === false || i.is_available === false;

function KitchenMenuItemsPageInner() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Command-centre restructure (2026-07-02): load failures now surface
  // as a Retry card instead of a toast over an empty grid that read as
  // "you have no recipes".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [ingredientsError, setIngredientsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    setLoadError(null);
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
      setHasLoaded(true);
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "loadMenu", companyId: user.company_id } });
      setLoadError(e?.message || "We couldn't load the recipe library.");
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, load]);

  useEffect(() => {
    if (!user?.company_id) return;
    // Per-mount channel suffix: a fixed name collides when the same
    // chef has this page in two tabs (second subscribe on an identical
    // topic can silently fail and that tab goes stale).
    const channel = supabase
      .channel(`kitchen-menu-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items", filter: `company_id=eq.${user.company_id}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.company_id, load]);

  // Race guard: two quick card taps used to let the SLOWER response
  // land last and overwrite the open dish's ingredient list with the
  // other dish's ingredients - an allergen hazard on a kitchen page.
  // Only the latest request may write state.
  const ingredientsReqRef = useRef(0);
  const loadIngredients = async (item: MenuItem) => {
    const req = ++ingredientsReqRef.current;
    setSelected(item);
    setIngredientsLoading(true);
    setIngredientsError(null);
    setIngredients([]);
    try {
      // Errors were previously swallowed here (no `error` destructure),
      // so a failed fetch rendered "No ingredients defined" - dangerously
      // wrong when the chef is checking for allergens.
      const { data: recipes, error: recipesError } = await supabase
        .from("recipes")
        .select("id")
        .eq("menu_item_id", item.id)
        .returns<{ id: string }[]>();
      if (recipesError) throw recipesError;
      const recipeIds = (recipes || []).map((r) => r.id);
      if (recipeIds.length === 0) {
        if (req === ingredientsReqRef.current) setIngredients([]);
        return;
      }
      const { data: ings, error: ingsError } = await supabase
        .from("recipe_ingredients")
        .select("id, ingredient_name, quantity, unit, notes")
        .in("recipe_id", recipeIds)
        .returns<Ingredient[]>();
      if (ingsError) throw ingsError;
      if (req === ingredientsReqRef.current) setIngredients(ings || []);
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "loadIngredients", companyId: user?.company_id } });
      if (req === ingredientsReqRef.current) {
        setIngredientsError(e?.message || "We couldn't load the ingredient list.");
      }
    } finally {
      if (req === ingredientsReqRef.current) setIngredientsLoading(false);
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

  // Every number shown in the hero chips / stat tiles derives from the
  // one `items` array the grid renders. No separate count queries.
  const stats = useMemo(() => {
    const total = items.length;
    const cats = categories.length - 1; // minus the "all" sentinel
    const allergenFlagged = items.filter(
      (i) => (i.allergen_codes && i.allergen_codes.length > 0) || !!i.allergen_info,
    ).length;
    const offMenu = items.filter(isOffMenu).length;
    return { total, cats, allergenFlagged, offMenu };
  }, [items, categories]);

  // Chips/subheading only speak once the library has loaded without
  // error. Not gated on `loading`: the realtime sub re-runs load() on
  // menu edits and blanking the hero for each background refresh would
  // make the page strobe. Skeletons only before the FIRST load.
  const loaded = hasLoaded && !loadError;
  const firstLoad = loading && !hasLoaded;

  return (
    <>
      <KitchenPageShell
        pageTitle="Recipes - CateringMS"
        heading="Recipes"
        subheading={
          loadError
            ? "Kitchen-owned dishes with ingredients, dietary tags, and prep notes."
            : !loaded
              ? "Loading the recipe library..."
              : items.length === 0
                ? "No dishes in the library yet. They show up here as soon as the office adds them."
                : `${stats.total} dish${stats.total === 1 ? "" : "es"} across ${stats.cats} categor${stats.cats === 1 ? "y" : "ies"}. Open a dish to check ingredients and allergens before production starts.`
        }
        icon={BookOpen}
        headerAction={
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refresh
          </Button>
        }
        meta={
          loaded ? (
            <>
              <span className={KITCHEN_HERO_CHIP}>
                <BookOpen className="h-3 w-3" />
                {stats.total} dish{stats.total === 1 ? "" : "es"}
              </span>
              <span className={KITCHEN_HERO_CHIP}>
                <LayoutGrid className="h-3 w-3" />
                {stats.cats} categor{stats.cats === 1 ? "y" : "ies"}
              </span>
              <span className={KITCHEN_HERO_CHIP}>
                <AlertTriangle className="h-3 w-3" />
                {stats.allergenFlagged} with allergen info
              </span>
              {stats.offMenu > 0 && (
                <span className={KITCHEN_HERO_CHIP}>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {stats.offMenu} off menu
                </span>
              )}
            </>
          ) : undefined
        }
      >
        {/* Recovery card: the library load failed. Pre-restructure this
            state rendered as a toast plus an empty "no items match"
            grid. */}
        {loadError ? (
          <PortalCard className="border-rose-200 dark:border-rose-900">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the recipe library</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="bg-brand-primary hover:opacity-90 text-white"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </PortalCard>
        ) : (
          <>
            {/* First-screen stat band. Skeletons while the first load is
                in flight so the tiles never flash misleading zeros. */}
            {firstLoad ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <StatTile
                  icon={BookOpen}
                  label="Dishes"
                  value={stats.total}
                  hint="Recipes the kitchen owns"
                />
                <StatTile
                  icon={LayoutGrid}
                  label="Categories"
                  value={stats.cats}
                  hint="Menu sections in the library"
                />
                <StatTile
                  icon={AlertTriangle}
                  label={<span className="flex items-center gap-1">Allergen info<InfoTooltip content="Dishes with allergen codes or notes captured.\n\nDishes without any may still contain allergens, check with the office." /></span>}
                  value={stats.allergenFlagged}
                  hint={`of ${stats.total} dishes covered`}
                />
                <StatTile
                  icon={ImageOff}
                  label="Off menu"
                  value={stats.offMenu}
                  hint="Retired or unavailable dishes"
                />
              </div>
            )}

            {/* Toolbar: search + category in one card. */}
            <PortalCard className="mb-6 flex flex-col gap-3 sm:flex-row" padded>
              <AdminSearchField
                value={search}
                onChange={setSearch}
                placeholder="Search by name, category, dietary tag..."
                className="flex-1"
              />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 w-full sm:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
              </Select>
            </PortalCard>

            {firstLoad ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true" aria-label="Loading menu">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-56 rounded-2xl border border-slate-200/80 bg-white shadow-sm animate-pulse motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900" />
                ))}
              </div>
            ) : items.length === 0 ? (
              // True-empty state: nothing in the library at all. Point at
              // where dishes get created rather than implying a filter
              // problem.
              <PortalCard padded={false}>
                <div className="py-16 px-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <BookOpen className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">No dishes in the recipe library yet</p>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    Dishes are created by the office team under Admin, Catalogue, Menu. As soon as one is added it appears here with its recipe, dietary tags and allergens.
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-4">
                    <Link href={withSlug("/admin/menu")}>Open menu admin</Link>
                  </Button>
                </div>
              </PortalCard>
            ) : filtered.length === 0 ? (
              <PortalCard padded={false}>
                <div className="py-16 px-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <BookOpen className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">No menu items match the current filter</p>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">Try a different category or clear the search to see the full recipe library.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    onClick={() => { setSearch(""); setCategory("all"); }}
                  >
                    Clear filters
                  </Button>
                </div>
              </PortalCard>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([cat, list]) => (
                  <div key={cat}>
                    <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-1">{cat} ({list.length})</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {list.map((i) => (
                        <button key={i.id} onClick={() => loadIngredients(i)} className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)] hover:border-brand-primary/40 dark:hover:border-brand-primary/40 hover:-translate-y-0.5 transition-[box-shadow,border-color,transform] duration-200 ease-standard motion-reduce:transform-none motion-reduce:transition-none overflow-hidden">
                          <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                            {i.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={i.image_url} alt={i.item_name ?? ""} loading="lazy" className="w-full h-full object-cover" />
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
                              {isOffMenu(i) && (
                                <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900">
                                  Off menu
                                </Badge>
                              )}
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
          </>
        )}
      </KitchenPageShell>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.item_name}
              {selected && isOffMenu(selected) && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-900">
                  Off menu
                </Badge>
              )}
            </DialogTitle>
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
                ) : ingredientsError ? (
                  // Never present a failed ingredient load as "no
                  // ingredients" - a chef checking allergens must know
                  // the list is missing, not empty.
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900 dark:bg-rose-950/30">
                    <p className="text-sm text-rose-800 dark:text-rose-200 font-medium">Couldn&apos;t load the ingredient list</p>
                    <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5">{ingredientsError} Don&apos;t assume the dish has no ingredients or allergens.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={ingredientsLoading}
                      onClick={() => void loadIngredients(selected)}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Retry
                    </Button>
                  </div>
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

export default function KitchenMenuItemsPage() {
  // Admit the full admin set alongside kitchen roles so an admin
  // view-switching into the kitchen portal isn't bounced (middleware
  // already lets them through to /team-portal/kitchen).
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.KITCHEN_MANAGER,
      UserRole.KITCHEN_STAFF,
      UserRole.ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.OWNER,
      UserRole.REGION_ADMIN,
      UserRole.SUPER_ADMIN,
    ]}>
      <KitchenMenuItemsPageInner />
    </ProtectedRoute>
  );
}
