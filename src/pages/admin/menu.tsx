/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useRef } from "react";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortMenu } from "@/components/ui/sort-menu";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BookOpen, Plus, Pencil, Archive, ArchiveRestore, Search, Image as ImageIcon,
  ChefHat, Trash2, AlertTriangle, ChevronDown, ChevronUp, Package, Loader2,
  Upload, X, ShoppingBag, Download, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav } from "@/components/admin/AdminNav";
import { AllergenReviewBadge } from "@/components/admin/AllergenReviewBadge";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { usePricingMode } from "@/hooks/usePricingMode";
import { toExVat, toIncVat } from "@/lib/vatMath";
import { useToast } from "@/hooks/use-toast";
import {
  menuService,
  computeRecipeCost,
  MENU_CATEGORIES,
  DIETARY_TAGS,
  ALLERGEN_CODES,
  DEFAULT_UNITS,
  type MenuItemWithRecipeSummary,
  type RecipeIngredientRow,
} from "@/services/menuService";

// ── Local form types ────────────────────────────────────────────────────

interface ItemDraft {
  item_name: string;
  category: string;
  description: string;
  base_price: string;
  image_url: string;
  dietary_tags: string[];
  allergen_codes: string[];
  requires_advance_notice_hours: string;
  is_available: boolean;
  // Buy-and-sell: when true, this menu item is bought-in (no recipe).
  // 1 portion = 1 unit of linked_inventory_item_id, so the shopping
  // dashboard counts menu-item units instead of recipe ingredients.
  is_buy_and_sell: boolean;
  linked_inventory_item_id: string | null;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
const IMAGE_BUCKET = "menu-images";
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface RecipeDraft {
  enabled: boolean;
  base_servings: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  instructions: string;
  ingredients: Array<RecipeIngredientRow & { _key: string }>;
}

const EMPTY_ITEM: ItemDraft = {
  item_name: "",
  category: "Mains",
  description: "",
  base_price: "",
  image_url: "",
  dietary_tags: [],
  allergen_codes: [],
  requires_advance_notice_hours: "0",
  is_available: true,
  is_buy_and_sell: false,
  linked_inventory_item_id: null,
};

const EMPTY_RECIPE: RecipeDraft = {
  enabled: false,
  base_servings: "10",
  prep_time_minutes: "",
  cook_time_minutes: "",
  instructions: "",
  ingredients: [],
};

let _ingKeyCounter = 0;
const newKey = () => `ing-${++_ingKeyCounter}`;

function MenuPage() {
  const { profile } = useAuth();
  const pricingMode = usePricingMode();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MenuItemWithRecipeSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  // Phase 26 #7: "/" or Cmd-F focuses the search input.
  // Phase 29 #4: "n" opens the Add menu item dialog.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Phase 24 #4: seed the search box from ?q so the dashboard's
  // MenuTopSellers widget can deep-link a pre-filtered menu view.
  // Same pattern as Phase 23 #7 on /admin/contacts.
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(EMPTY_RECIPE);
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<MenuItemWithRecipeSummary | null>(null);

  // Inventory pool for the recipe-builder picker -- fetched once when the
  // page mounts so the autocomplete doesn't lag on each new ingredient row.
  const [inventoryPool, setInventoryPool] = useState<Array<{
    id: string; item_name: string; unit_of_measure: string;
    category: string | null; cost_per_unit: number | null; current_stock: number | null;
    allergen_codes: string[] | null;
  }>>([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [list, inv] = await Promise.all([
        menuService.list(companyId, /* includeArchived */ true),
        menuService.listInventoryItemsForPicker(companyId),
      ]);
      setItems(list);
      setInventoryPool(inv);
    } catch (e: any) {
      toast({ title: "Could not load menu", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // ── Filtering ────────────────────────────────────────────────────────

  const visibleRaw = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
      .filter(i => showArchived ? true : !i.deleted_at)
      .filter(i => filterCategory === "all" || (i.category || "").toLowerCase() === filterCategory.toLowerCase())
      .filter(i => !term
        || i.item_name.toLowerCase().includes(term)
        || (i.category || "").toLowerCase().includes(term)
        || (i.description || "").toLowerCase().includes(term)
      );
  }, [items, showArchived, search, filterCategory]);

  // Sortable columns exposed via the SortMenu (the menu page is a
  // card grid grouped by category, so a click-to-sort header doesn't
  // fit). Default name ascending.
  const menuSortColumns: ColumnDef<MenuItemWithRecipeSummary>[] = useMemo(() => [
    { key: "name",     accessor: (i) => i.item_name,                             type: "string" },
    { key: "category", accessor: (i) => i.category || "",                        type: "string" },
    { key: "price",    accessor: (i) => Number(i.base_price || 0),               type: "number" },
    { key: "cost",     accessor: (i) => Number((i.cost as any)?.cost_per_serving || 0), type: "number" },
    { key: "margin",   accessor: (i) => {
      const price = Number(i.base_price || 0);
      const cost  = Number((i.cost as any)?.cost_per_serving || 0);
      if (price <= 0) return -1;
      return ((price - cost) / price) * 100;
    }, type: "number" },
  ], []);
  const menuSort = useSortable<MenuItemWithRecipeSummary>(visibleRaw, menuSortColumns, { defaultKey: "name", defaultDir: "asc" });
  const visible = menuSort.rows;

  const grouped = useMemo(() => {
    const m = new Map<string, MenuItemWithRecipeSummary[]>();
    for (const it of visible) {
      const key = it.category || "Other";
      const arr = m.get(key) || [];
      arr.push(it);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  // Stat strip + cost rollup across the menu. Active items only -- archived
  // items don't count towards the average margin.
  const stats = useMemo(() => {
    const active = items.filter(i => !i.deleted_at);
    const withCost = active.filter(i => i.cost && i.cost.contributing > 0);
    const withMargin = withCost.filter(i => Number(i.base_price || 0) > 0);
    const incompleteCost = active.filter(i => i.cost && (i.cost.free_text > 0 || i.cost.missing_cost > 0));
    const avgMarginPct = withMargin.length === 0 ? null : (() => {
      let total = 0;
      for (const i of withMargin) {
        const price = Number(i.base_price || 0);
        const cost = i.cost!.cost_per_serving;
        total += ((price - cost) / price) * 100;
      }
      return total / withMargin.length;
    })();
    return {
      total: active.length,
      withRecipe: active.filter(i => i.recipe_id !== null).length,
      missingRecipe: active.filter(i => i.recipe_id === null).length,
      withCost: withCost.length,
      incompleteCost: incompleteCost.length,
      avgMarginPct,
    };
  }, [items]);

  // Lookup map of inventory cost per id -- shared by the live cost preview
  // in the recipe builder dialog.
  const inventoryCostById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const inv of inventoryPool) m.set(inv.id, inv.cost_per_unit);
    return m;
  }, [inventoryPool]);

  // Categories present in real data, plus the canonical list -- so legacy
  // "main" / "Mains" both appear in the filter without losing rows.
  const categoryOptions = useMemo(() => {
    const realCats = new Set<string>();
    for (const i of items) if (i.category) realCats.add(i.category);
    const all = new Set<string>([...MENU_CATEGORIES, ...Array.from(realCats)]);
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // ── Dialog open / close ─────────────────────────────────────────────

  const openAdd = () => {
    setEditTargetId(null);
    setItemDraft(EMPTY_ITEM);
    setRecipeDraft({ ...EMPTY_RECIPE, ingredients: [] });
    setError("");
    setDialogOpen(true);
  };

  const openEdit = async (it: MenuItemWithRecipeSummary) => {
    setEditTargetId(it.id);
    setError("");
    setDialogOpen(true);
    // Pre-fill with the row we have, then load the recipe + ingredients.
    setItemDraft({
      item_name: it.item_name || "",
      category: it.category || "Mains",
      description: it.description || "",
      base_price: it.base_price != null ? String(it.base_price) : "",
      image_url: it.image_url || "",
      dietary_tags: it.dietary_tags || [],
      allergen_codes: it.allergen_codes || [],
      requires_advance_notice_hours: it.requires_advance_notice_hours != null
        ? String(it.requires_advance_notice_hours) : "0",
      is_available: it.is_available !== false,
      is_buy_and_sell: !!(it as any).is_buy_and_sell,
      linked_inventory_item_id: (it as any).linked_inventory_item_id ?? null,
    });
    setRecipeDraft({ ...EMPTY_RECIPE, ingredients: [] });
    const full = await menuService.getFull(it.id);
    if (full?.recipe) {
      setRecipeDraft({
        enabled: true,
        base_servings: String(full.recipe.base_servings),
        prep_time_minutes: full.recipe.prep_time_minutes != null ? String(full.recipe.prep_time_minutes) : "",
        cook_time_minutes: full.recipe.cook_time_minutes != null ? String(full.recipe.cook_time_minutes) : "",
        instructions: full.recipe.instructions || "",
        ingredients: full.ingredients.map(r => ({ ...r, _key: newKey() })),
      });
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditTargetId(null);
    setItemDraft(EMPTY_ITEM);
    setRecipeDraft(EMPTY_RECIPE);
    setError("");
  };

  // ── Image upload (3 MB cap, JPEG / PNG / WebP) ───────────────────────

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (file: File) => {
    if (!companyId) return;
    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      toast({
        title: "Unsupported image type",
        description: "JPEG, PNG and WebP only.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({
        title: "Image too large",
        description: `${(file.size / 1024 / 1024).toFixed(1)} MB. Cap is 3 MB per image.`,
        variant: "destructive",
      });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = (file.type.split("/")[1] || "jpg").toLowerCase();
      const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
      setItemDraft((d) => ({ ...d, image_url: pub.publicUrl }));
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload the image.",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const clearImage = () => setItemDraft((d) => ({ ...d, image_url: "" }));

  // ── Allergen / dietary cross-check ────────────────────────────────────
  // Builds a list of human-readable conflicts between the menu item's
  // dietary_tags / allergen_codes and the allergen_codes on its
  // linked-to-inventory ingredients. Empty array = no conflicts.
  const allergenConflicts = useMemo(() => {
    if (!recipeDraft.enabled || recipeDraft.ingredients.length === 0) return [];
    const tags = new Set(itemDraft.dietary_tags);
    const declaredAllergens = new Set(itemDraft.allergen_codes);
    // Map dietary tag -> allergen code that would contradict it.
    const tagConflicts: Array<{ tag: string; allergen: string }> = [
      { tag: "gluten_free", allergen: "gluten" },
      { tag: "dairy_free", allergen: "dairy" },
      { tag: "nut_free", allergen: "peanut" },
      { tag: "nut_free", allergen: "tree_nut" },
      { tag: "vegan", allergen: "dairy" },
      { tag: "vegan", allergen: "egg" },
      { tag: "vegan", allergen: "fish" },
      { tag: "vegan", allergen: "shellfish" },
      { tag: "vegetarian", allergen: "fish" },
      { tag: "vegetarian", allergen: "shellfish" },
    ];
    const issues: string[] = [];
    for (const ing of recipeDraft.ingredients) {
      if (!ing.inventory_item_id) continue;
      const inv = inventoryPool.find((i) => i.id === ing.inventory_item_id);
      const invAllergens = inv?.allergen_codes || [];
      if (invAllergens.length === 0) continue;
      for (const a of invAllergens) {
        // 1. Dietary-tag contradictions ("gluten_free" + ingredient with gluten)
        for (const c of tagConflicts) {
          if (tags.has(c.tag) && c.allergen === a) {
            issues.push(`"${ing.ingredient_name}" contains ${a} but the menu item is tagged ${c.tag.replace(/_/g, " ")}`);
          }
        }
        // 2. Undeclared allergens (ingredient has gluten but the item
        //    isn't tagged "gluten" in allergen_codes)
        if (!declaredAllergens.has(a)) {
          issues.push(`"${ing.ingredient_name}" contains ${a}. Add ${a} to the allergen codes so the kitchen warns customers`);
        }
      }
    }
    // Dedup -- the same warning can fire on multiple ingredients
    return Array.from(new Set(issues));
  }, [itemDraft.dietary_tags, itemDraft.allergen_codes, recipeDraft.enabled, recipeDraft.ingredients, inventoryPool]);

  const [allergenConfirmOpen, setAllergenConfirmOpen] = useState(false);

  // ── Save ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!companyId) return;
    setError("");

    if (!itemDraft.item_name.trim()) {
      setError("Item name is required");
      return;
    }
    const price = Number(itemDraft.base_price);
    if (isNaN(price) || price < 0) {
      setError("Base price must be a positive number");
      return;
    }
    const noticeH = Number(itemDraft.requires_advance_notice_hours || 0);
    if (isNaN(noticeH) || noticeH < 0) {
      setError("Advance notice hours must be 0 or more");
      return;
    }

    if (itemDraft.is_buy_and_sell) {
      if (!itemDraft.linked_inventory_item_id) {
        setError("Buy-and-sell items need a linked inventory item so shopping forecasts know what to count.");
        return;
      }
      // Buy-and-sell items don't have a recipe -- the recipe block is
      // hidden when the toggle is on, but be defensive.
    } else if (recipeDraft.enabled) {
      const baseS = Number(recipeDraft.base_servings);
      if (isNaN(baseS) || baseS < 1) {
        setError("Recipe needs a base serving count of at least 1");
        return;
      }
      for (const ing of recipeDraft.ingredients) {
        if (!ing.ingredient_name.trim()) {
          setError("Every ingredient row needs a name");
          return;
        }
        if (isNaN(ing.quantity) || ing.quantity <= 0) {
          setError(`Quantity for "${ing.ingredient_name}" must be greater than zero`);
          return;
        }
        if (!ing.unit.trim()) {
          setError(`Unit for "${ing.ingredient_name}" is required`);
          return;
        }
      }
    }

    // Allergen cross-check -- ask the operator to confirm before saving
    // when the recipe ingredients contradict the menu item's dietary
    // tags or carry undeclared allergens. Operator can still proceed
    // (false positives happen, e.g. a "may contain" flag), but they
    // see the warning first.
    if (!allergenConfirmOpen && allergenConflicts.length > 0) {
      setAllergenConfirmOpen(true);
      return;
    }
    setAllergenConfirmOpen(false);

    setSaving(true);
    try {
      // 1. Upsert the menu item
      const itemPayload: any = {
        company_id: companyId,
        item_name: itemDraft.item_name.trim(),
        category: itemDraft.category || null,
        description: itemDraft.description.trim() || null,
        base_price: price,
        image_url: itemDraft.image_url.trim() || null,
        dietary_tags: itemDraft.dietary_tags.length ? itemDraft.dietary_tags : null,
        allergen_codes: itemDraft.allergen_codes.length ? itemDraft.allergen_codes : null,
        requires_advance_notice_hours: noticeH,
        is_available: itemDraft.is_available,
        active: itemDraft.is_available,
        is_buy_and_sell: itemDraft.is_buy_and_sell,
        linked_inventory_item_id: itemDraft.is_buy_and_sell
          ? itemDraft.linked_inventory_item_id
          : null,
        // Phase 2 #7: saving the menu item IS the allergen review --
        // the staffer just confirmed the codes, dietary tags, etc.
        // Stamp the review state so AllergenReviewBadge stops nagging.
        // allergens_reviewed_by is set to the logged-in user.
        allergens_reviewed_at: new Date().toISOString(),
        allergens_reviewed_by: (profile as any)?.id ?? null,
      };
      if (editTargetId) itemPayload.id = editTargetId;
      // Mirror useful recipe fields onto menu_items so the kitchen menu
      // page (which reads menu_items only for prep/cook times) keeps
      // working without a join. Skipped for buy-and-sell items.
      if (!itemDraft.is_buy_and_sell && recipeDraft.enabled) {
        itemPayload.base_servings = Number(recipeDraft.base_servings);
        if (recipeDraft.prep_time_minutes) itemPayload.prep_time_minutes = Number(recipeDraft.prep_time_minutes);
        if (recipeDraft.cook_time_minutes) itemPayload.cook_time_minutes = Number(recipeDraft.cook_time_minutes);
        if (recipeDraft.instructions) itemPayload.instructions = recipeDraft.instructions.trim();
      }
      const saved = await menuService.upsertMenuItem(itemPayload);

      // 2. Save the recipe + ingredients (or wipe if disabled / buy-and-sell)
      if (!itemDraft.is_buy_and_sell && recipeDraft.enabled) {
        await menuService.saveRecipe({
          companyId,
          menuItemId: saved.id,
          menuItemName: saved.item_name,
          recipe: {
            base_servings: Number(recipeDraft.base_servings),
            prep_time_minutes: recipeDraft.prep_time_minutes ? Number(recipeDraft.prep_time_minutes) : null,
            cook_time_minutes: recipeDraft.cook_time_minutes ? Number(recipeDraft.cook_time_minutes) : null,
            instructions: recipeDraft.instructions.trim() || null,
          },
          ingredients: recipeDraft.ingredients.map(({ _key, ...rest }) => rest),
        });
      } else {
        await menuService.saveRecipe({
          companyId,
          menuItemId: saved.id,
          menuItemName: saved.item_name,
          recipe: null,
          ingredients: [],
        });
      }

      toast({
        title: editTargetId ? "Menu item updated" : "Menu item added",
        description: saved.item_name,
      });
      closeDialog();
      load();
    } catch (e: any) {
      setError(e?.message || "Could not save, check your inputs.");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      await menuService.archiveMenuItem(archiveTarget.id);
      toast({ title: "Menu item archived", description: archiveTarget.item_name });
      setArchiveTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Could not archive", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (it: MenuItemWithRecipeSummary) => {
    setSaving(true);
    try {
      await menuService.restoreMenuItem(it.id);
      toast({ title: "Restored", description: it.item_name });
      load();
    } catch (e: any) {
      toast({ title: "Could not restore", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Recipe builder helpers ──────────────────────────────────────────

  const addIngredientRow = (fromInventoryId?: string) => {
    const fromInv = fromInventoryId ? inventoryPool.find(i => i.id === fromInventoryId) : null;
    setRecipeDraft(d => ({
      ...d,
      ingredients: [
        ...d.ingredients,
        {
          _key: newKey(),
          ingredient_name: fromInv ? fromInv.item_name : "",
          quantity: 0,
          unit: fromInv ? fromInv.unit_of_measure : "g",
          inventory_item_id: fromInv ? fromInv.id : null,
          notes: null,
        },
      ],
    }));
  };

  const updateIngredient = (key: string, patch: Partial<RecipeIngredientRow>) => {
    setRecipeDraft(d => ({
      ...d,
      ingredients: d.ingredients.map(ing => ing._key === key ? { ...ing, ...patch } : ing),
    }));
  };

  const removeIngredient = (key: string) => {
    setRecipeDraft(d => ({
      ...d,
      ingredients: d.ingredients.filter(ing => ing._key !== key),
    }));
  };

  const handleIngredientNamePicker = (key: string, value: string) => {
    // If value matches an inventory item exactly (case-insensitive), link
    // it. Otherwise leave as a free-text ingredient.
    const lower = value.toLowerCase();
    const match = inventoryPool.find(i => i.item_name.toLowerCase() === lower);
    if (match) {
      updateIngredient(key, {
        ingredient_name: match.item_name,
        unit: match.unit_of_measure,
        inventory_item_id: match.id,
      });
    } else {
      updateIngredient(key, {
        ingredient_name: value,
        inventory_item_id: null,
      });
    }
  };

  // Multi-select toggles
  const toggleArrayValue = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <Head><title>Menu, CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Menu
                  <InfoTooltip content="Build the dishes your kitchen cooks. Each menu item can have a recipe attached, the recipe lists ingredients and links each one to the inventory item it consumes.\n\nThe kitchen tablet sees these recipes when cooking, and the prep flywheel uses them to project ingredient demand and surface shortfalls before they hit." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Add menu items and build their recipes. Kitchen, dispatch and shopping read from this list.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {/* Phase 28 #2: manual refresh. The catalogue loads
                  once on mount; the kitchen lead who has just
                  added an item from another tab needs to pull
                  the new row without a hard reload. */}
              <Button
                variant="outline"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 19 #9: menu CSV export. Kitchen leads and
                  costing reviewers regularly want a flat snapshot of
                  the price list + cost + margin to bring into pricing
                  reviews or PDF rate-card builds outside the app. */}
              <Button
                variant="outline"
                onClick={() => {
                  if (visible.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust filters until at least one item is visible." });
                    return;
                  }
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = ["Item", "Category", "Price", "Cost per serving", "Margin %", "Archived"];
                  const lines = [headers.join(",")];
                  for (const it of visible) {
                    const price = Number(it.base_price || 0);
                    const cost = Number((it.cost as any)?.cost_per_serving || 0);
                    const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : "";
                    lines.push([
                      esc(it.item_name),
                      esc(it.category || ""),
                      esc(price.toFixed(2)),
                      esc(cost.toFixed(2)),
                      esc(margin),
                      esc((it as any).is_archived ? "yes" : "no"),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `menu-${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
              <Button onClick={openAdd} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                <Plus className="w-4 h-4 mr-2" />Add menu item
              </Button>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Active items</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">With recipe</p>
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">{stats.withRecipe}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                  Avg margin
                  <InfoTooltip content="Average gross margin across menu items that have BOTH a costed recipe and a base price.\n\nMargin = (base_price - cost_per_serving) / base_price.\n\nOwner-only, the kitchen surface never sees these numbers." />
                </p>
                <p className={`text-2xl font-bold tabular-nums ${
                  stats.avgMarginPct == null ? "text-slate-400" :
                  stats.avgMarginPct < 30 ? "text-red-700" :
                  stats.avgMarginPct < 50 ? "text-amber-700" :
                                            "text-emerald-700"
                }`}>
                  {stats.avgMarginPct == null ? "--" : `${stats.avgMarginPct.toFixed(0)}%`}
                </p>
                {stats.avgMarginPct == null && <p className="text-[11px] text-slate-500 mt-1">Need recipes + costs</p>}
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-sm ${stats.incompleteCost > 0 ? "bg-amber-50" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                  Cost incomplete
                  {stats.incompleteCost > 0 && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${stats.incompleteCost > 0 ? "text-amber-700" : "text-slate-900"}`}>
                  {stats.incompleteCost}
                </p>
                {stats.incompleteCost > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">Free-text or rate-less ingredients</p>
                )}
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-sm ${stats.missingRecipe > 0 ? "bg-amber-50" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                  Missing recipe
                  {stats.missingRecipe > 0 && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${stats.missingRecipe > 0 ? "text-amber-700" : "text-slate-900"}`}>
                  {stats.missingRecipe}
                </p>
                {stats.missingRecipe > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">No ingredient list, prep flywheel can't project demand</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category or description... (press /)"
                className="pl-9 pr-9"
              />
              {/* Phase 25 #5: clear-search affordance. */}
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">All categories</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-2 px-3 rounded-md border border-slate-200 bg-white">
              <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="archived" className="text-sm text-slate-700 cursor-pointer select-none">Show archived</Label>
            </div>
            <SortMenu
              activeKey={menuSort.sortKey}
              activeDir={menuSort.sortDir}
              onPick={menuSort.setSort}
              options={[
                { key: "name",     dir: "asc",  label: "Name (A to Z)" },
                { key: "name",     dir: "desc", label: "Name (Z to A)" },
                { key: "category", dir: "asc",  label: "Category (A to Z)" },
                { key: "price",    dir: "desc", label: "Price (high to low)" },
                { key: "price",    dir: "asc",  label: "Price (low to high)" },
                { key: "cost",     dir: "desc", label: "Cost (high to low)" },
                { key: "margin",   dir: "desc", label: "Best margin" },
                { key: "margin",   dir: "asc",  label: "Worst margin" },
              ]}
            />
          </div>

          {/* List */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm flex items-center justify-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading menu...
            </div>
          ) : grouped.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <EmptyState
                  inCard
                  icon={BookOpen}
                  title={items.length === 0 ? "No menu items yet" : "No matches"}
                  description={
                    items.length === 0
                      ? "Add your first menu item to start building your kitchen's catalogue."
                      : "Try a different search or category filter."
                  }
                  cta={items.length === 0 ? { label: "Add your first menu item", onClick: openAdd } : undefined}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {grouped.map(([cat, list]) => (
                <div key={cat}>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">{cat}, {list.length}</h2>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-0">
                      <ul className="divide-y divide-slate-100">
                        {list.map(it => {
                          const archived = !!it.deleted_at;
                          return (
                            <li key={it.id} className={`p-3 sm:p-4 flex items-center gap-3 ${archived ? "opacity-60" : ""}`}>
                              <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                                {it.image_url
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={it.image_url} alt={it.item_name} className="w-full h-full object-cover" />
                                  : <ImageIcon className="w-5 h-5 text-slate-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 truncate">{it.item_name}</span>
                                  {archived && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500">Archived</Badge>}
                                  {it.recipe_id ? (
                                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                      <ChefHat className="w-2.5 h-2.5 mr-0.5" />Recipe x{it.recipe_ingredient_count}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">No recipe</Badge>
                                  )}
                                  {/* Phase 2 #7: allergen review state. Surfaces
                                      the P0-15 data column so unreviewed items
                                      are visible at a glance. Only renders the
                                      amber unreviewed warning -- a green
                                      "reviewed" badge on every row would
                                      drown the layout. */}
                                  <AllergenReviewBadge
                                    reviewedAt={(it as any).allergens_reviewed_at ?? null}
                                    compact
                                    hideWhenReviewed
                                  />
                                </div>
                                {it.description && (
                                  <p className="text-xs text-slate-500 truncate mt-0.5">{it.description}</p>
                                )}
                              </div>
                              {/* Cost + margin column. Owner-only because the
                                  whole page is admin-gated, but explicit here
                                  so we never accidentally render it on a
                                  shared component. */}
                              <div className="text-right hidden md:block">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Cost / serv</div>
                                {it.cost && it.cost.contributing > 0 ? (
                                  <>
                                    <div className="font-semibold text-slate-900 tabular-nums">R {it.cost.cost_per_serving.toFixed(2)}</div>
                                    {(it.cost.free_text > 0 || it.cost.missing_cost > 0) && (
                                      <div className="text-[10px] text-amber-700 inline-flex items-center gap-0.5">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        partial
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-xs text-slate-400">--</div>
                                )}
                              </div>
                              <div className="text-right hidden sm:block">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Price / margin</div>
                                <div className="font-semibold text-slate-900 tabular-nums">R {Number(it.base_price || 0).toFixed(2)}</div>
                                {it.cost && it.cost.contributing > 0 && Number(it.base_price || 0) > 0 ? (() => {
                                  const price = Number(it.base_price || 0);
                                  const cost = it.cost.cost_per_serving;
                                  const margin = price - cost;
                                  const pct = (margin / price) * 100;
                                  const tone = pct < 30 ? "text-red-700" : pct < 50 ? "text-amber-700" : "text-emerald-700";
                                  return (
                                    <div className={`text-[10px] tabular-nums font-medium ${tone}`}>
                                      {margin >= 0 ? "+" : ""}R {margin.toFixed(2)} ({pct.toFixed(0)}%)
                                    </div>
                                  );
                                })() : null}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button variant="outline" size="sm" onClick={() => openEdit(it)}>
                                  <Pencil className="w-3 h-3 mr-1" />Edit
                                </Button>
                                {archived ? (
                                  <Button variant="outline" size="sm" onClick={() => handleRestore(it)} disabled={saving}>
                                    <ArchiveRestore className="w-3 h-3 mr-1" />Restore
                                  </Button>
                                ) : (
                                  <Button variant="outline" size="sm" onClick={() => setArchiveTarget(it)} className="text-red-700 border-red-200 hover:bg-red-50">
                                    <Archive className="w-3 h-3 mr-1" />Archive
                                  </Button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
        <Footer />
      </main>

      {/* ── Add / Edit dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTargetId ? "Edit menu item" : "Add menu item"}</DialogTitle>
            <DialogDescription>
              Save the basics first. The recipe block at the bottom is optional, add it when you know the ingredients,
              and the kitchen flywheel will start projecting demand and shortfalls automatically.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Item details */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Item details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Name *</Label>
                <Input
                  value={itemDraft.item_name}
                  onChange={(e) => setItemDraft({ ...itemDraft, item_name: e.target.value })}
                  placeholder="e.g. Lamb Spit (200g)"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Category</Label>
                <select
                  value={itemDraft.category}
                  onChange={(e) => setItemDraft({ ...itemDraft, category: e.target.value })}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  {MENU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Base price (R) {pricingMode.label} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemDraft.base_price}
                  onChange={(e) => setItemDraft({ ...itemDraft, base_price: e.target.value })}
                  placeholder="180.00"
                />
                {/* Live preview of the opposite-mode figure so the
                    operator can sanity-check both numbers without
                    reaching for a calculator. Hidden when the field
                    is empty or zero. */}
                {Number(itemDraft.base_price) > 0 && (
                  <p className="text-[11px] text-slate-500">
                    {pricingMode.mode === "inc"
                      ? `= R${toExVat(Number(itemDraft.base_price), 0.15).toFixed(2)} ex VAT`
                      : `= R${toIncVat(Number(itemDraft.base_price), 0.15).toFixed(2)} inc VAT`}
                  </p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={itemDraft.description}
                  onChange={(e) => setItemDraft({ ...itemDraft, description: e.target.value })}
                  placeholder="Short description for the menu and quotes"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  Photo
                  <InfoTooltip content="JPEG, PNG or WebP. 3 MB cap. Stored on the menu-images bucket and served via a public URL." />
                </Label>
                {itemDraft.image_url ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={itemDraft.image_url}
                      alt="Menu item"
                      className="w-14 h-14 object-cover rounded border border-slate-200"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Replace
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f);
                          e.target.value = "";
                        }}
                        disabled={uploadingImage}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearImage}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs text-slate-600">
                    {uploadingImage ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Click to upload (JPEG / PNG / WebP, max 3 MB)</>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                        e.target.value = "";
                      }}
                      disabled={uploadingImage}
                    />
                  </label>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Advance notice (hours)</Label>
                <Input
                  type="number"
                  min="0"
                  value={itemDraft.requires_advance_notice_hours}
                  onChange={(e) => setItemDraft({ ...itemDraft, requires_advance_notice_hours: e.target.value })}
                  placeholder="0"
                />
              </div>

              {/* Dietary tags */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Dietary tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DIETARY_TAGS.map(t => {
                    const on = itemDraft.dietary_tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setItemDraft({ ...itemDraft, dietary_tags: toggleArrayValue(itemDraft.dietary_tags, t) })}
                        className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                          on
                            ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >{t.replace(/_/g, " ")}</button>
                    );
                  })}
                </div>
              </div>

              {/* Allergen codes */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1">
                  Allergen codes
                  <InfoTooltip content="The kitchen Mark Ready dialog cross-checks these codes against the customer's stated dietary requirements and warns before the order leaves." />
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALLERGEN_CODES.map(a => {
                    const on = itemDraft.allergen_codes.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setItemDraft({ ...itemDraft, allergen_codes: toggleArrayValue(itemDraft.allergen_codes, a) })}
                        className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                          on
                            ? "bg-red-100 text-red-700 border-red-300"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >{a.replace(/_/g, " ")}</button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                <Switch
                  id="is_available"
                  checked={itemDraft.is_available}
                  onCheckedChange={(v) => setItemDraft({ ...itemDraft, is_available: v })}
                />
                <Label htmlFor="is_available" className="cursor-pointer select-none">Available for new orders</Label>
              </div>
            </div>
          </div>

          {/* Buy-and-sell block. When enabled, the menu item is bought-in
              (no recipe) and 1 portion = 1 unit of the linked inventory
              item -- shopping forecasts count menu-item units instead of
              recipe ingredients. Mutually exclusive with the recipe block. */}
          <div className="space-y-3 border-t pt-4">
            <button
              type="button"
              onClick={() => setItemDraft({ ...itemDraft, is_buy_and_sell: !itemDraft.is_buy_and_sell })}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Buy-and-sell item
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {itemDraft.is_buy_and_sell
                    ? "Bought-in, no recipe. Shopping counts menu-item units instead of ingredients."
                    : "Toggle on if this is a bought-in item (e.g. canned drink, off-the-shelf dessert)."}
                </p>
              </div>
              <Switch
                checked={itemDraft.is_buy_and_sell}
                onCheckedChange={(v) => setItemDraft({ ...itemDraft, is_buy_and_sell: v })}
                onClick={(e) => e.stopPropagation()}
              />
            </button>

            {itemDraft.is_buy_and_sell && (
              <div className="space-y-1.5 pl-1">
                <Label className="flex items-center gap-1">
                  Linked inventory item *
                  <InfoTooltip content="The inventory item that 1 portion of this menu item consumes. Shopping forecasts use this to count menu-item units against on-hand stock." />
                </Label>
                <Input
                  list="buy-sell-inventory-list"
                  value={
                    itemDraft.linked_inventory_item_id
                      ? inventoryPool.find(i => i.id === itemDraft.linked_inventory_item_id)?.item_name || ""
                      : ""
                  }
                  onChange={(e) => {
                    const match = inventoryPool.find(i => i.item_name === e.target.value);
                    setItemDraft({ ...itemDraft, linked_inventory_item_id: match?.id ?? null });
                  }}
                  placeholder="Type to search inventory..."
                />
                <datalist id="buy-sell-inventory-list">
                  {inventoryPool.map(i => (
                    <option key={i.id} value={i.item_name}>
                      {i.unit_of_measure} {i.cost_per_unit ? `· R${i.cost_per_unit}` : ""}
                    </option>
                  ))}
                </datalist>
                {itemDraft.linked_inventory_item_id ? (
                  <p className="text-[11px] text-emerald-700">Linked. 1 portion will count as 1 unit on shopping.</p>
                ) : (
                  <p className="text-[11px] text-amber-700">Pick an inventory item or save will fail.</p>
                )}
              </div>
            )}
          </div>

          {/* Recipe block, hidden for buy-and-sell items */}
          {!itemDraft.is_buy_and_sell && (
          <div className="space-y-3 border-t pt-4">
            <button
              type="button"
              onClick={() => setRecipeDraft(d => ({ ...d, enabled: !d.enabled }))}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recipe + ingredients</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {recipeDraft.enabled
                    ? "Recipe attached, the kitchen flywheel will use this for prep tasks and demand projection"
                    : "Optional. Add later if you don't have the ingredients in front of you yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={recipeDraft.enabled}
                  onCheckedChange={(v) => setRecipeDraft(d => ({ ...d, enabled: v }))}
                  onClick={(e) => e.stopPropagation()}
                />
                {recipeDraft.enabled
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {recipeDraft.enabled && (
              <div className="space-y-3 pl-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Base servings *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={recipeDraft.base_servings}
                      onChange={(e) => setRecipeDraft({ ...recipeDraft, base_servings: e.target.value })}
                      placeholder="10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prep time (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={recipeDraft.prep_time_minutes}
                      onChange={(e) => setRecipeDraft({ ...recipeDraft, prep_time_minutes: e.target.value })}
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cook time (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={recipeDraft.cook_time_minutes}
                      onChange={(e) => setRecipeDraft({ ...recipeDraft, cook_time_minutes: e.target.value })}
                      placeholder="120"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Cooking notes</Label>
                  <Textarea
                    rows={2}
                    value={recipeDraft.instructions}
                    onChange={(e) => setRecipeDraft({ ...recipeDraft, instructions: e.target.value })}
                    placeholder="Steps the kitchen should follow"
                  />
                </div>

                {/* Ingredient rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1">
                      Ingredients
                      <InfoTooltip content="Type to search your inventory, exact matches link the ingredient to the inventory item, so the kitchen flywheel can deduct stock and project demand. Free-text ingredients are still saved but won't auto-deduct." />
                    </Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addIngredientRow()}>
                      <Plus className="w-3 h-3 mr-1" />Add ingredient
                    </Button>
                  </div>

                  {/* Live cost preview, recomputes every render off the
                      draft + the inventory cost map. Fast since both are
                      already in memory. */}
                  {(() => {
                    const liveCost = computeRecipeCost(
                      Number(recipeDraft.base_servings) || 0,
                      recipeDraft.ingredients,
                      inventoryCostById,
                    );
                    if (!liveCost || liveCost.contributing === 0) {
                      return recipeDraft.ingredients.length > 0 ? (
                        <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                          Link ingredients to inventory items with a cost set to see a per-serving cost preview.
                        </div>
                      ) : null;
                    }
                    const price = Number(itemDraft.base_price) || 0;
                    const margin = price > 0 ? price - liveCost.cost_per_serving : null;
                    const pct = price > 0 ? (margin! / price) * 100 : null;
                    const tone = pct == null ? "text-slate-700"
                      : pct < 30 ? "text-red-700"
                      : pct < 50 ? "text-amber-700"
                      : "text-emerald-700";
                    return (
                      <div className="rounded-md bg-emerald-50/60 border border-emerald-200 px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-slate-700">
                          Per-serving cost:{" "}
                          <span className="font-bold tabular-nums text-slate-900">R {liveCost.cost_per_serving.toFixed(2)}</span>
                        </span>
                        <span className="text-slate-700">
                          Recipe total:{" "}
                          <span className="font-bold tabular-nums text-slate-900">R {liveCost.total_cost.toFixed(2)}</span>
                        </span>
                        {margin != null && pct != null && (
                          <span className={tone}>
                            Margin{" "}
                            <span className="font-bold tabular-nums">
                              {margin >= 0 ? "+" : ""}R {margin.toFixed(2)} ({pct.toFixed(0)}%)
                            </span>
                          </span>
                        )}
                        {(liveCost.free_text > 0 || liveCost.missing_cost > 0) && (
                          <span className="text-amber-700 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {liveCost.free_text > 0 && `${liveCost.free_text} free-text`}
                            {liveCost.free_text > 0 && liveCost.missing_cost > 0 && ", "}
                            {liveCost.missing_cost > 0 && `${liveCost.missing_cost} missing cost`}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {recipeDraft.ingredients.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500 bg-slate-50 rounded-md border border-dashed border-slate-200">
                      No ingredients yet. Add a row above.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {recipeDraft.ingredients.map((ing) => (
                        <div key={ing._key} className="grid grid-cols-12 gap-1.5 items-start">
                          <div className="col-span-12 sm:col-span-5 space-y-0.5">
                            <Input
                              value={ing.ingredient_name}
                              onChange={(e) => handleIngredientNamePicker(ing._key, e.target.value)}
                              list={`inv-list-${ing._key}`}
                              placeholder="Ingredient name (type to search inventory)"
                              className="text-sm"
                            />
                            <datalist id={`inv-list-${ing._key}`}>
                              {inventoryPool.map(p => (
                                <option key={p.id} value={p.item_name}>{p.item_name} ({p.unit_of_measure})</option>
                              ))}
                            </datalist>
                            {ing.inventory_item_id ? (
                              <span className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
                                <Package className="w-2.5 h-2.5" />Linked to inventory
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Free-text, won't auto-deduct stock</span>
                            )}
                          </div>
                          <div className="col-span-5 sm:col-span-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={ing.quantity || ""}
                              onChange={(e) => updateIngredient(ing._key, { quantity: Number(e.target.value) || 0 })}
                              placeholder="Qty per serving"
                              className="text-sm"
                            />
                          </div>
                          <div className="col-span-4 sm:col-span-2">
                            <Input
                              value={ing.unit}
                              onChange={(e) => updateIngredient(ing._key, { unit: e.target.value })}
                              list="unit-list"
                              placeholder="unit"
                              className="text-sm"
                            />
                            <datalist id="unit-list">
                              {DEFAULT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </datalist>
                          </div>
                          <div className="col-span-2 sm:col-span-2">
                            <Input
                              value={ing.notes ?? ""}
                              onChange={(e) => updateIngredient(ing._key, { notes: e.target.value })}
                              placeholder="Notes"
                              className="text-sm"
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeIngredient(ing._key)}
                              className="text-red-600 hover:bg-red-50"
                              aria-label="Remove ingredient"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Saving</> : (editTargetId ? "Save changes" : "Add menu item")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allergen / dietary cross-check confirm. Fires when ingredient
          inventory carries an allergen the menu item either contradicts
          (e.g. tagged "gluten free" but contains gluten) or hasn't
          declared on its allergen_codes. Operator can still proceed --
          some flags are intentional ("may contain") -- but they see the
          warnings first. */}
      <AlertDialog open={allergenConfirmOpen} onOpenChange={setAllergenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Allergen check
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-sm text-slate-700">The recipe ingredients carry allergen flags that may conflict with this menu item:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 max-h-60 overflow-auto bg-amber-50 border border-amber-200 rounded-md p-3">
                  {allergenConflicts.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
                <p className="text-xs text-slate-500">Save anyway if these are intentional (e.g. "may contain" precautions).</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAllergenConfirmOpen(false)}>Go back and fix</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setAllergenConfirmOpen(false); handleSave(); }} className="bg-amber-600 hover:bg-amber-700">
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirm */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.item_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The dish disappears from the live menu and won't be addable to new quotes. Existing orders aren't affected.
              You can restore it anytime by toggling "Show archived".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-red-600 hover:bg-red-700">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}

export default MenuPage;
