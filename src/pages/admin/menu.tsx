/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useRef } from "react";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortMenu } from "@/components/ui/sort-menu";
import { toLocalISO } from "@/lib/localDate";
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
  Upload, X, ShoppingBag, Download, RefreshCw, Sparkles, Copy, CheckSquare,
  Square, TrendingUp, Camera,
} from "lucide-react";
import { captureException } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav } from "@/components/admin/AdminNav";
import { AllergenReviewBadge } from "@/components/admin/AllergenReviewBadge";
import { MenuTopSellersWidget } from "@/components/admin/MenuTopSellersWidget";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
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
  NON_FOOD_CATEGORIES,
  DIETARY_TAGS,
  ALLERGEN_CODES,
  DEFAULT_UNITS,
  suggestedPrice,
  type MenuItemWithRecipeSummary,
  type RecipeIngredientRow,
} from "@/services/menuService";

// ── Local form types ────────────────────────────────────────────────────

interface ItemDraft {
  item_name: string;
  category: string;
  description: string;
  base_price: string;
  /**
   * Per-unit COGS for this menu item. Owner-only field; staff
   * roles never see it (Skylight finance-visibility rule).
   * Drives the Cashflow Forecast Card, the Profit Margin tile,
   * and the per-order COGS panel on the Order Details modal.
   * See docs/audits/cashflow-cost-mapping-plan.md.
   */
  cost_per_unit: string;
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
  // Wave 67 Phase C: outsource fulfilment. When fulfilment_type is
  // 'outsourced' or 'hybrid', the menu item is partly/fully fulfilled
  // by an external provider on the day. Drives auto-assignment of
  // outsource_assignments rows when this item is added to an order.
  fulfilment_type: "in_house" | "outsourced" | "hybrid";
  default_outsource_provider_id: string | null;
  outsource_unit_cost: string;
  outsource_lead_hours: string;
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
  cost_per_unit: "",
  image_url: "",
  dietary_tags: [],
  allergen_codes: [],
  requires_advance_notice_hours: "0",
  is_available: true,
  is_buy_and_sell: false,
  linked_inventory_item_id: null,
  fulfilment_type: "in_house",
  default_outsource_provider_id: null,
  outsource_unit_cost: "",
  outsource_lead_hours: "",
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
  // Skylight finance-visibility rule: cost_per_unit is owner/admin
  // only. Kitchen and shopping roles can edit the menu (item name,
  // description, recipes) but never see the cost number.
  const role = String(
    (profile as any)?.active_role || (profile as any)?.role || "",
  ).toLowerCase();
  const canSeeCost =
    role === "owner" || role === "company_admin" || role === "admin" || role === "super_admin";

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
  // OFR-B (offering deferred, 2026-05-24): gap-filter from
  // /admin/offering deep-link. Same vocab the equipment page uses.
  // "missing-photo" filters to rows without an image_url, "missing-
  // price" to rows where base_price is null/0.
  const [gapFilter, setGapFilter] = useState<"none" | "missing-photo" | "missing-price">("none");
  useEffect(() => {
    if (!router.isReady) return;
    const f = typeof router.query.filter === "string" ? router.query.filter : "";
    if (f === "missing-photo" || f === "missing-price") setGapFilter(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.filter]);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(EMPTY_RECIPE);
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<MenuItemWithRecipeSummary | null>(null);

  // Wave 70.2 - recipe-completeness chip quick-edit.
  // The chip on the menu list flags how many of the 4 backplanning
  // fields are populated (prep / cook / base servings / notice
  // hours). Clicking it pops this mini-dialog with just those 4
  // fields so an operator can fix the amber/rose state in 5 seconds
  // without opening the full menu-item editor. Updates both the
  // menu_items denormalised columns and, when a recipe row exists,
  // the recipe row itself so a later full edit doesn't clobber the
  // values.
  const [timingTarget, setTimingTarget] = useState<MenuItemWithRecipeSummary | null>(null);
  const [timingDraft, setTimingDraft] = useState<{
    prep_time_minutes: string;
    cook_time_minutes: string;
    base_servings: string;
    requires_advance_notice_hours: string;
  }>({ prep_time_minutes: "", cook_time_minutes: "", base_servings: "", requires_advance_notice_hours: "" });
  const [timingSaving, setTimingSaving] = useState(false);

  const openTimingEdit = (it: MenuItemWithRecipeSummary) => {
    setTimingTarget(it);
    setTimingDraft({
      prep_time_minutes: (it as any).prep_time_minutes != null ? String((it as any).prep_time_minutes) : "",
      cook_time_minutes: (it as any).cook_time_minutes != null ? String((it as any).cook_time_minutes) : "",
      base_servings: (it as any).base_servings != null ? String((it as any).base_servings) : "",
      requires_advance_notice_hours: it.requires_advance_notice_hours != null
        ? String(it.requires_advance_notice_hours) : "0",
    });
  };

  const saveTimingEdit = async () => {
    if (!timingTarget || !companyId) return;
    setTimingSaving(true);
    try {
      const prep = timingDraft.prep_time_minutes ? Number(timingDraft.prep_time_minutes) : null;
      const cook = timingDraft.cook_time_minutes ? Number(timingDraft.cook_time_minutes) : null;
      const base = timingDraft.base_servings ? Number(timingDraft.base_servings) : null;
      const notice = Number(timingDraft.requires_advance_notice_hours || 0);

      // 1. Update the menu_item denormalised columns. Direct PATCH
      //    via the supabase client - upsertMenuItem requires the
      //    full row shape; we only want to touch the 4 columns.
      const itemPatch: any = {
        requires_advance_notice_hours: notice,
      };
      if (prep != null) itemPatch.prep_time_minutes = prep;
      if (cook != null) itemPatch.cook_time_minutes = cook;
      if (base != null) itemPatch.base_servings = base;
      const { error: itemErr } = await (supabase as any)
        .from("menu_items")
        .update(itemPatch)
        .eq("id", timingTarget.id);
      if (itemErr) throw itemErr;

      // 2. If a recipe row exists, mirror the prep / cook / base
      //    so the next full-dialog save doesn't overwrite us.
      if (timingTarget.recipe_id) {
        const recipePatch: any = {};
        if (prep != null) recipePatch.prep_time_minutes = prep;
        if (cook != null) recipePatch.cook_time_minutes = cook;
        if (base != null) recipePatch.base_servings = base;
        if (Object.keys(recipePatch).length > 0) {
          const { error: rErr } = await (supabase as any)
            .from("recipes")
            .update(recipePatch)
            .eq("id", timingTarget.recipe_id);
          if (rErr) throw rErr;
        }
      }

      toast({ title: "Timing saved", description: `${timingTarget.item_name} prep timing updated.` });
      setTimingTarget(null);
      await load();
    } catch (e: any) {
      toast({ title: "Couldn't save timing", description: e?.message, variant: "destructive" });
    } finally {
      setTimingSaving(false);
    }
  };

  // Inventory pool for the recipe-builder picker - fetched once when the
  // page mounts so the autocomplete doesn't lag on each new ingredient row.
  const [inventoryPool, setInventoryPool] = useState<Array<{
    id: string; item_name: string; unit_of_measure: string;
    category: string | null; cost_per_unit: number | null; current_stock: number | null;
    allergen_codes: string[] | null;
  }>>([]);
  // Wave 67 Phase C - outsource provider pool for the fulfilment
  // picker. Loaded alongside inventory in the same Promise.all so the
  // dialog opens with both ready. Active-only since the admin
  // shouldn't be assigning new orders to a deactivated provider.
  const [providerPool, setProviderPool] = useState<Array<{
    id: string; provider_name: string; default_rate: number | null;
    default_rate_type: string; provider_roles: string[];
  }>>([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [list, inv, providersRes] = await Promise.all([
        menuService.list(companyId, /* includeArchived */ true),
        menuService.listInventoryItemsForPicker(companyId),
        (supabase as any)
          .from("outsource_providers")
          .select("id, provider_name, default_rate, default_rate_type, provider_roles")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("provider_name", { ascending: true }),
      ]);
      setItems(list);
      setInventoryPool(inv);
      setProviderPool((providersRes?.data || []) as typeof providerPool);
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "load", companyId } });
      toast({ title: "Could not load menu", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // OFR-B (offering deferred, 2026-05-24): honour ?item=<id> from
  // /admin/offering's Top-3 / Never-quoted deep-links. Once the
  // item list loads, find the row and open the edit drawer on it.
  // Single-fire flag so a manual close doesn't immediately re-open.
  const [didOpenFromQuery, setDidOpenFromQuery] = useState(false);
  useEffect(() => {
    if (didOpenFromQuery) return;
    if (!router.isReady) return;
    const id = typeof router.query.item === "string" ? router.query.item : "";
    if (!id || items.length === 0) return;
    const target = items.find((i) => i.id === id);
    if (!target) return;
    setDidOpenFromQuery(true);
    void openEdit(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.item, items.length]);

  // ── Filtering ────────────────────────────────────────────────────────

  const visibleRaw = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items
      .filter(i => showArchived ? true : !i.deleted_at)
      .filter(i => filterCategory === "all" || (i.category || "").toLowerCase() === filterCategory.toLowerCase())
      // OFR-B: gap-filter from /admin/offering deep-link.
      .filter(i => gapFilter === "none"
        || (gapFilter === "missing-photo" && !i.image_url)
        || (gapFilter === "missing-price" && (!i.base_price || Number(i.base_price) <= 0))
      )
      .filter(i => !term
        || i.item_name.toLowerCase().includes(term)
        || (i.category || "").toLowerCase().includes(term)
        || (i.description || "").toLowerCase().includes(term)
      );
  }, [items, showArchived, search, filterCategory, gapFilter]);

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

  // Stat strip + cost rollup across the menu. Active items only - archived
  // items don't count towards the average margin.
  const stats = useMemo(() => {
    const active = items.filter(i => !i.deleted_at);
    // MNU-B: non-food rows (Service / Equipment categories, plus
    // outsourced or buy-and-sell items) don't need recipes or cost
    // numbers. Excluding them from the "Missing recipe" / "Cost
    // incomplete" counts kills the Waiter / Server false positive
    // that dragged a real signal into noise pre-MNU-B.
    const needsRecipe = (i: MenuItemWithRecipeSummary): boolean => {
      const cat = (i.category || "").trim();
      if (NON_FOOD_CATEGORIES.has(cat)) return false;
      if ((i as any).is_buy_and_sell) return false;
      if ((i as any).fulfilment_type === "outsourced") return false;
      return true;
    };
    const foodActive = active.filter(needsRecipe);
    const withCost = active.filter(i => i.cost && i.cost.contributing > 0);
    const withMargin = withCost.filter(i => Number(i.base_price || 0) > 0);
    const incompleteCost = foodActive.filter(i => i.cost && (i.cost.free_text > 0 || i.cost.missing_cost > 0));
    // MNU-B: keep raw mean for the tooltip, but the headline uses
    // the median - one R5250 spit-on-site outlier shouldn't drag
    // the whole catalogue's avg from ~40% to 54%.
    const pcts = withMargin
      .map(i => ((Number(i.base_price || 0) - i.cost!.cost_per_serving) / Number(i.base_price || 1)) * 100)
      .sort((a, b) => a - b);
    const meanMarginPct = pcts.length === 0 ? null : pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const medianMarginPct = pcts.length === 0 ? null
      : pcts.length % 2 === 1 ? pcts[Math.floor(pcts.length / 2)]
      : (pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2;
    // MNU-B: items with margin > 85% are usually services priced
    // separately to the food (chef-on-site, venue hire) where the
    // cost column is intentionally food-only. Flag them in a chip
    // so the operator knows to check the line is intentional.
    const highMarginItems = withMargin.filter(i => {
      const p = Number(i.base_price || 0);
      const c = i.cost!.cost_per_serving;
      return p > 0 && (p - c) / p > 0.85;
    });
    // MNU-B: per-category margin breakdown for the tooltip.
    const marginByCategory: Record<string, { mean: number; n: number }> = {};
    for (const i of withMargin) {
      const cat = (i.category || "Other").trim();
      const pct = ((Number(i.base_price || 0) - i.cost!.cost_per_serving) / Number(i.base_price || 1)) * 100;
      const cur = marginByCategory[cat] || { mean: 0, n: 0 };
      marginByCategory[cat] = { mean: (cur.mean * cur.n + pct) / (cur.n + 1), n: cur.n + 1 };
    }
    // MNU-B: photo coverage. /admin/offering already surfaces this
    // at the catalogue summary level, but the menu page itself needs
    // it inline so the operator can act without bouncing.
    const missingPhoto = active.filter(i => !i.image_url).length;
    return {
      total: active.length,
      withRecipe: active.filter(i => i.recipe_id !== null && needsRecipe(i)).length,
      missingRecipe: foodActive.filter(i => i.recipe_id === null).length,
      withCost: withCost.length,
      incompleteCost: incompleteCost.length,
      // Headline value is median; legacy callers still get avgMarginPct
      // which now maps to median to keep the tile honest. Mean lives
      // separately for the tooltip.
      avgMarginPct: medianMarginPct,
      meanMarginPct,
      medianMarginPct,
      highMarginCount: highMarginItems.length,
      marginByCategory,
      missingPhoto,
      photoCoveragePct: active.length > 0 ? Math.round(((active.length - missingPhoto) / active.length) * 100) : 0,
    };
  }, [items]);

  // Lookup map of inventory cost per id - shared by the live cost preview
  // in the recipe builder dialog.
  const inventoryCostById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const inv of inventoryPool) m.set(inv.id, inv.cost_per_unit);
    return m;
  }, [inventoryPool]);

  // ── MNU-B (menu deferred, 2026-05-24): bulk ops + selection ────────
  //
  // Selection lives at the page level so the toolbar can persist as
  // the operator scrolls. Action handlers gate on selection length so
  // an accidental click on Archive with nothing selected is a no-op.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<null | "archive" | "category" | "price" | "allergens">(null);
  const [bulkCategoryValue, setBulkCategoryValue] = useState<string>("Mains");
  const [bulkPricePct, setBulkPricePct] = useState<string>("5");

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const runBulkArchive = async () => {
    if (!companyId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await menuService.bulkArchive(companyId, Array.from(selectedIds));
      if (!res.ok) throw new Error(res.error);
      toast({ title: `Archived ${res.count} item${res.count === 1 ? "" : "s"}` });
      clearSelection();
      setBulkDialog(null);
      await load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "bulk-archive", companyId } });
      toast({ title: "Bulk archive failed", description: e?.message, variant: "destructive" });
    } finally { setBulkBusy(false); }
  };
  const runBulkCategory = async () => {
    if (!companyId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await menuService.bulkUpdateCategory(companyId, Array.from(selectedIds), bulkCategoryValue);
      if (!res.ok) throw new Error(res.error);
      toast({ title: `Moved ${res.count} item${res.count === 1 ? "" : "s"} to ${bulkCategoryValue}` });
      clearSelection();
      setBulkDialog(null);
      await load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "bulk-category", companyId } });
      toast({ title: "Bulk category change failed", description: e?.message, variant: "destructive" });
    } finally { setBulkBusy(false); }
  };
  const runBulkPrice = async () => {
    if (!companyId || selectedIds.size === 0) return;
    const pct = Number(bulkPricePct);
    if (!Number.isFinite(pct)) {
      toast({ title: "Enter a percentage", variant: "destructive" });
      return;
    }
    setBulkBusy(true);
    try {
      const res = await menuService.bulkAdjustPrice(
        companyId, Array.from(selectedIds), pct,
        (profile as any)?.id || null,
      );
      if (!res.ok) throw new Error(res.error);
      toast({
        title: `Adjusted ${res.count} price${res.count === 1 ? "" : "s"} by ${pct >= 0 ? "+" : ""}${pct}%`,
        description: "Original prices logged to history.",
      });
      clearSelection();
      setBulkDialog(null);
      await load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "bulk-price", companyId } });
      toast({ title: "Bulk price adjust failed", description: e?.message, variant: "destructive" });
    } finally { setBulkBusy(false); }
  };
  const runBulkAllergens = async () => {
    if (!companyId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await menuService.bulkMarkAllergensReviewed(
        companyId, Array.from(selectedIds),
        (profile as any)?.id || null,
      );
      if (!res.ok) throw new Error(res.error);
      toast({ title: `Marked allergens reviewed on ${res.count} item${res.count === 1 ? "" : "s"}` });
      clearSelection();
      setBulkDialog(null);
      await load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "bulk-allergens", companyId } });
      toast({ title: "Bulk allergen review failed", description: e?.message, variant: "destructive" });
    } finally { setBulkBusy(false); }
  };

  const handleDuplicateItem = async (it: MenuItemWithRecipeSummary) => {
    if (!companyId) return;
    try {
      const res = await menuService.duplicateItem(companyId, it.id, (profile as any)?.id || null);
      if (!res.ok || !res.newId) throw new Error(res.error || "Duplicate failed");
      toast({
        title: "Item duplicated",
        description: `"${it.item_name} (copy)" created. Edit it to set the new name + price.`,
      });
      await load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "duplicate", companyId } });
      toast({ title: "Couldn't duplicate", description: e?.message, variant: "destructive" });
    }
  };

  // MNU-B: drag-drop photo onto a row. Upload to the menu-images
  // bucket then patch the item's image_url. Reuses the same bucket
  // + path shape the edit dialog uses.
  const handleDropPhoto = async (it: MenuItemWithRecipeSummary, file: File) => {
    if (!companyId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images please", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image too large", description: "3 MB max.", variant: "destructive" });
      return;
    }
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${companyId}/${it.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(IMAGE_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
      const { error: patchErr } = await (supabase as any)
        .from("menu_items").update({ image_url: publicUrl }).eq("id", it.id);
      if (patchErr) throw patchErr;
      toast({ title: "Photo updated", description: it.item_name });
      await load();
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/menu", step: "drop-photo", companyId } });
      toast({ title: "Photo upload failed", description: e?.message, variant: "destructive" });
    }
  };

  // MNU-B: realtime channel. A photo upload from another tab, a bulk
  // price adjust elsewhere - this page picks it up without a manual
  // Refresh. Debounced 1500ms to avoid storming on a bulk update.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 1500);
    };
    const channel = supabase
      .channel(`menu:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Categories present in real data, plus the canonical list - so legacy
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
      cost_per_unit: (it as any).cost_per_unit != null ? String((it as any).cost_per_unit) : "",
      image_url: it.image_url || "",
      dietary_tags: it.dietary_tags || [],
      allergen_codes: it.allergen_codes || [],
      requires_advance_notice_hours: it.requires_advance_notice_hours != null
        ? String(it.requires_advance_notice_hours) : "0",
      is_available: it.is_available !== false,
      is_buy_and_sell: !!(it as any).is_buy_and_sell,
      linked_inventory_item_id: (it as any).linked_inventory_item_id ?? null,
      // Wave 67 Phase C - seed outsource fields off the menu_item row.
      fulfilment_type: ((it as any).fulfilment_type as ItemDraft["fulfilment_type"]) || "in_house",
      default_outsource_provider_id: (it as any).default_outsource_provider_id ?? null,
      outsource_unit_cost: (it as any).outsource_unit_cost != null ? String((it as any).outsource_unit_cost) : "",
      outsource_lead_hours: (it as any).outsource_lead_hours != null ? String((it as any).outsource_lead_hours) : "",
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
    // Dedup - the same warning can fire on multiple ingredients
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
    // MNU-B: warn (not block) when the trimmed name matches an
    // existing active item. Two "Crockery & Cutlery" rows pre-MNU-B
    // had no signal. We don't enforce uniqueness because legitimate
    // variants exist (Standard / Premium), but the operator should
    // see they're about to create a twin and confirm.
    if (!editTargetId) {
      const dupId = await menuService.findDuplicateName(companyId, itemDraft.item_name);
      if (dupId) {
        const proceed = window.confirm(
          `Another active item with the name "${itemDraft.item_name.trim()}" already exists. ` +
          `Create this one anyway? Consider appending a variant suffix like " (Premium)" so the kitchen and dispatch can tell them apart.`,
        );
        if (!proceed) return;
      }
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
      // Buy-and-sell items don't have a recipe - the recipe block is
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

    // Allergen cross-check - ask the operator to confirm before saving
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
        // Skylight finance-visibility rule: only write the cost
        // field when the editor is owner/admin. A staff member
        // editing other fields on the same item must not blank the
        // cost out by submitting an empty string back. Persist null
        // only when the field was explicitly cleared by a permitted
        // role.
        ...(canSeeCost
          ? {
              cost_per_unit: itemDraft.cost_per_unit.trim() === ""
                ? null
                : Number(itemDraft.cost_per_unit),
            }
          : {}),
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
        // Wave 67 Phase C - outsource fulfilment persistence.
        // Setting fulfilment_type back to 'in_house' clears the
        // provider link so a future outsourced flip doesn't inherit
        // a stale default.
        fulfilment_type: itemDraft.fulfilment_type,
        default_outsource_provider_id: itemDraft.fulfilment_type === "in_house"
          ? null
          : (itemDraft.default_outsource_provider_id || null),
        outsource_unit_cost: itemDraft.fulfilment_type === "in_house"
          ? null
          : (itemDraft.outsource_unit_cost.trim() ? Number(itemDraft.outsource_unit_cost) : null),
        outsource_lead_hours: itemDraft.fulfilment_type === "in_house"
          ? null
          : (itemDraft.outsource_lead_hours.trim() ? parseInt(itemDraft.outsource_lead_hours, 10) : null),
        // Phase 2 #7: saving the menu item IS the allergen review;
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
      <Head><title>Menu - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-full">

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
                  // MNU-B: BOM for Excel-ZA, both VAT views, allergen
                  // review state + recipe completeness so the export
                  // is a real catalogue health snapshot, not just
                  // name+price.
                  const headers = [
                    "Item", "Category", "Price (ex VAT)", "Price (inc VAT)",
                    "Cost per serving", "Margin %", "Has recipe",
                    "Allergens reviewed", "Has photo", "Archived",
                  ];
                  const lines = [headers.join(",")];
                  for (const it of visible) {
                    const price = Number(it.base_price || 0);
                    const cost = Number((it.cost as any)?.cost_per_serving || 0);
                    const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : "";
                    // MNU-B: base_price is stored in whichever mode the
                    // tenant operates in. Compute the other view at
                    // 15% so the CSV has both columns.
                    const isInc = pricingMode.mode === "inc";
                    const exVat = isInc ? toExVat(price, 0.15) : price;
                    const incVat = isInc ? price : toIncVat(price, 0.15);
                    lines.push([
                      esc(it.item_name),
                      esc(it.category || ""),
                      esc(exVat.toFixed(2)),
                      esc(incVat.toFixed(2)),
                      esc(cost.toFixed(2)),
                      esc(margin),
                      esc(it.recipe_id ? "yes" : "no"),
                      esc((it as any).allergens_reviewed_at ? "yes" : "no"),
                      esc(it.image_url ? "yes" : "no"),
                      esc(it.deleted_at ? "yes" : "no"),
                    ].join(","));
                  }
                  // MNU-B: UTF-8 BOM so Excel-ZA renders ZAR + accents.
                  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `menu-${toLocalISO(new Date())}.csv`;
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

          {/* Stat strip - MNU-B widened to 6 tiles. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
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
                  Median margin
                  <InfoTooltip content={(() => {
                    const lines: string[] = [];
                    lines.push("Median gross margin across menu items that have BOTH a costed recipe and a base price.");
                    lines.push("");
                    lines.push("Median (not mean) so an outlier - chef-on-site service line priced at 95%+ margin - doesn't drag the headline up.");
                    if (stats.meanMarginPct != null && stats.medianMarginPct != null) {
                      lines.push("");
                      lines.push(`Median: ${stats.medianMarginPct.toFixed(0)}%`);
                      lines.push(`Mean: ${stats.meanMarginPct.toFixed(0)}%`);
                    }
                    const cats = Object.entries(stats.marginByCategory).sort((a, b) => b[1].mean - a[1].mean);
                    if (cats.length > 0) {
                      lines.push("");
                      lines.push("By category (mean):");
                      for (const [cat, v] of cats) {
                        lines.push(`  ${cat}: ${v.mean.toFixed(0)}% (n=${v.n})`);
                      }
                    }
                    lines.push("");
                    lines.push("Owner-only, the kitchen surface never sees these numbers.");
                    return lines.join("\n");
                  })()} />
                </p>
                <p className={`text-2xl font-bold tabular-nums ${
                  stats.medianMarginPct == null ? "text-slate-400" :
                  stats.medianMarginPct < 30 ? "text-red-700" :
                  stats.medianMarginPct < 50 ? "text-amber-700" :
                                               "text-emerald-700"
                }`}>
                  {stats.medianMarginPct == null ? "-" : `${stats.medianMarginPct.toFixed(0)}%`}
                </p>
                {stats.medianMarginPct == null && <p className="text-[11px] text-slate-500 mt-1">Need recipes + costs</p>}
                {stats.highMarginCount > 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">
                    {stats.highMarginCount} item{stats.highMarginCount === 1 ? "" : "s"} {">"} 85% - check pricing
                  </p>
                )}
              </CardContent>
            </Card>
            {/* MNU-B: photo coverage tile. Matches the equivalent
                surface on /admin/offering and tells the operator
                where to focus the next photoshoot. */}
            <Card className={`border-0 shadow-sm ${stats.missingPhoto > 0 ? "bg-amber-50" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1">
                  Photo coverage
                  {stats.missingPhoto > 0 && <Camera className="w-3 h-3 text-amber-600" />}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${
                  stats.photoCoveragePct >= 90 ? "text-emerald-700" :
                  stats.photoCoveragePct >= 60 ? "text-amber-700" :
                  "text-rose-700"
                }`}>
                  {stats.photoCoveragePct}%
                </p>
                {stats.missingPhoto > 0 && (
                  <p className="text-[10px] text-amber-700 mt-1 tabular-nums">{stats.missingPhoto} missing</p>
                )}
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

          {/* MNU-B: bulk action toolbar. Surfaces when N rows are
              selected. Operator can archive, change category, bump
              prices by %, or mark allergens reviewed in one go.
              Sticks to the top of the list area so the buttons stay
              reachable as the list scrolls. */}
          {selectedIds.size > 0 && (
            <div className="sticky top-0 z-10 mb-4 rounded-lg bg-slate-900 text-white shadow-lg p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <button onClick={clearSelection} className="text-xs underline opacity-70 hover:opacity-100">Clear</button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setBulkDialog("allergens")} className="gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" /> Mark allergens reviewed
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setBulkDialog("category")} className="gap-1.5">
                  Change category
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setBulkDialog("price")} className="gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Adjust price %
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkDialog("archive")} className="gap-1.5">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </Button>
              </div>
            </div>
          )}

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
                          const isSelected = selectedIds.has(it.id);
                          return (
                            <li key={it.id} className={`p-3 sm:p-4 flex items-center gap-3 ${archived ? "opacity-60" : ""} ${isSelected ? "bg-blue-50/40" : ""}`}>
                              {/* MNU-B: selection checkbox for bulk
                                  operations. Stays in the gutter so the
                                  layout doesn't shift when toggled. */}
                              <button
                                type="button"
                                onClick={() => toggleSelect(it.id)}
                                className="text-slate-400 hover:text-blue-700 shrink-0"
                                title={isSelected ? "Deselect" : "Select for bulk action"}
                                aria-label={isSelected ? "Deselect item" : "Select item"}
                              >
                                {isSelected
                                  ? <CheckSquare className="w-4 h-4 text-blue-600" />
                                  : <Square className="w-4 h-4" />}
                              </button>
                              {/* MNU-B: drag-drop photo upload onto
                                  the thumbnail. Drop an image here to
                                  set the row's image_url without
                                  opening the edit dialog. */}
                              <div
                                className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border-2 border-dashed border-transparent hover:border-blue-300 transition-colors"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-400"); }}
                                onDragLeave={(e) => { e.currentTarget.classList.remove("border-blue-400"); }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.remove("border-blue-400");
                                  const f = e.dataTransfer.files?.[0];
                                  if (f) void handleDropPhoto(it, f);
                                }}
                                title={it.image_url ? "Drop a new image to replace" : "Drop an image here, or open Edit to upload"}
                              >
                                {it.image_url
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={it.image_url} alt={it.item_name} className="w-full h-full object-cover" />
                                  : <ImageIcon className="w-5 h-5 text-slate-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 truncate">{it.item_name}</span>
                                  {archived && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500">Archived</Badge>}
                                  {/* MNU-B: suppress "No recipe" amber on
                                      non-food categories (Service /
                                      Equipment) and on buy-and-sell /
                                      outsourced items. Pre-MNU-B Waiter
                                      / Server got nagged for a recipe
                                      it correctly didn't have. */}
                                  {(() => {
                                    const cat = (it.category || "").trim();
                                    const isNonFood = NON_FOOD_CATEGORIES.has(cat);
                                    const isBuySell = !!(it as any).is_buy_and_sell;
                                    const ftype = (it as any).fulfilment_type;
                                    if (it.recipe_id) {
                                      return (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                          <ChefHat className="w-2.5 h-2.5 mr-0.5" />Recipe x{it.recipe_ingredient_count}
                                        </Badge>
                                      );
                                    }
                                    if (isNonFood || isBuySell || ftype === "outsourced") {
                                      // Non-food items: no nag. The
                                      // category chip itself is enough
                                      // signal.
                                      return null;
                                    }
                                    return (
                                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">No recipe</Badge>
                                    );
                                  })()}
                                  {/* Wave 66.9 Phase 3 - recipe-completeness chip.
                                      Counts how many of the four backplanning
                                      fields are populated (prep_time_minutes,
                                      cook_time_minutes, base_servings,
                                      requires_advance_notice_hours). Surfaces
                                      a single chip on the row so the operator
                                      sees at a glance which items the kitchen
                                      ticket can fully backplan. Hidden for
                                      buy-and-sell + fully-outsourced items
                                      (those don't need the timing data). */}
                                  {(() => {
                                    const isBuySell = !!(it as any).is_buy_and_sell;
                                    const ftype = (it as any).fulfilment_type;
                                    if (isBuySell || ftype === "outsourced") return null;
                                    const fields = [
                                      (it as any).prep_time_minutes,
                                      (it as any).cook_time_minutes,
                                      (it as any).base_servings,
                                      (it as any).requires_advance_notice_hours,
                                    ];
                                    const filled = fields.filter((f) => f != null && Number(f) >= 0 && String(f) !== "").length;
                                    const total = fields.length;
                                    const tone =
                                      filled === total ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                      filled >= 2 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                      "bg-rose-50 text-rose-700 border-rose-200";
                                    const label = filled === total
                                      ? "Prep timing complete"
                                      : `Prep timing ${filled}/${total}`;
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => openTimingEdit(it)}
                                        title={`Backplanning fields filled: prep_time_minutes, cook_time_minutes, base_servings, requires_advance_notice_hours. Kitchen ticket can ${filled === total ? "fully backplan" : "only partially backplan"} this item. Click to edit.`}
                                        className="inline-flex"
                                      >
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] ${tone} cursor-pointer hover:opacity-80 transition-opacity`}
                                        >
                                          {label}
                                          <Pencil className="w-2.5 h-2.5 ml-1 opacity-60" />
                                        </Badge>
                                      </button>
                                    );
                                  })()}
                                  {/* Wave 66.9 Phase 3 - outsourced fulfilment chip
                                      so admin sees at-a-glance which items
                                      route to external providers. */}
                                  {((it as any).fulfilment_type === "outsourced" || (it as any).fulfilment_type === "hybrid") && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                                      title={`Fulfilment: ${(it as any).fulfilment_type}. Outsource assignment auto-mints on order creation.`}
                                    >
                                      {(it as any).fulfilment_type === "outsourced" ? "Outsourced" : "Hybrid"}
                                    </Badge>
                                  )}
                                  {/* Phase 2 #7: allergen review state. Surfaces
                                      the P0-15 data column so unreviewed items
                                      are visible at a glance. Only renders the
                                      amber unreviewed warning - a green
                                      "reviewed" badge on every row would
                                      drown the layout. */}
                                  {/* MNU-B: wrap the unreviewed-allergen
                                      badge in a button so a tap opens
                                      the edit dialog. Mirrors the
                                      prep-timing chip pattern. */}
                                  <button
                                    type="button"
                                    onClick={() => openEdit(it)}
                                    className="inline-flex"
                                    title="Review allergens for this item"
                                  >
                                    <AllergenReviewBadge
                                      reviewedAt={(it as any).allergens_reviewed_at ?? null}
                                      compact
                                      hideWhenReviewed
                                    />
                                  </button>
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
                                  <div className="text-xs text-slate-400">-</div>
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
                                {/* MNU-B: duplicate-item shortcut.
                                    Use case: "Crockery & Cutlery"
                                    variants (Standard / Premium) where
                                    the operator wants a near-identical
                                    row with a price tweak. Clones the
                                    recipe + ingredients. */}
                                {!archived && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDuplicateItem(it)}
                                    title="Duplicate this item with all its fields and recipe"
                                  >
                                    <Copy className="w-3 h-3 mr-1" />Duplicate
                                  </Button>
                                )}
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

          {/* MNU-C (2026-05-24): top-sellers widget moved to the
              bottom of the page per Bobby's owner brief. The stat
              strip + filter bar are what the operator works in;
              the historical "what's pulling" view belongs as a
              footer card, not above the fold. Wave 70.57 moved it
              here from /admin/dashboard; MNU-C demotes it within
              this page. Self-hides on a tenant with no confirmed
              orders in the last 30 days. */}
          {companyId ? (
            <div className="mt-6">
              <WidgetErrorBoundary label="Menu top sellers">
                <MenuTopSellersWidget companyId={companyId} />
              </WidgetErrorBoundary>
            </div>
          ) : null}
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
                {/* Cost per unit (Skylight finance-visibility rule:
                    owner / admin only). Drives the Profit Margin
                    tile + Cashflow Forecast Card. Snapshotted onto
                    order_items at quote-accept so a later edit
                    doesn't retroactively change history. */}
                {canSeeCost && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <Label className="flex items-center gap-1 text-xs text-slate-600">
                      Cost per unit (R)
                      <InfoTooltip content="Per-unit COGS for this menu item - food cost, packaging, anything you spend to deliver one serving. Owner / admin only; staff never see this number. Drives the Profit Margin tile + Cashflow Forecast on /admin/financial-dashboard. Saved at quote-accept time so historical reports stay stable." />
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={itemDraft.cost_per_unit}
                      onChange={(e) => setItemDraft({ ...itemDraft, cost_per_unit: e.target.value })}
                      placeholder="e.g. 65.00"
                      className="text-sm"
                    />
                    {Number(itemDraft.base_price) > 0 && Number(itemDraft.cost_per_unit) > 0 && (() => {
                      const price = Number(itemDraft.base_price);
                      const cost = Number(itemDraft.cost_per_unit);
                      const margin = ((price - cost) / price) * 100;
                      const tone = margin >= 60 ? "text-emerald-700"
                        : margin >= 30 ? "text-amber-700"
                        : "text-red-700";
                      return (
                        <p className={`text-[11px] ${tone}`}>
                          Margin {margin.toFixed(1)}% (R{(price - cost).toFixed(2)} per unit)
                        </p>
                      );
                    })()}
                  </div>
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
              item - shopping forecasts count menu-item units instead of
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

          {/* Wave 67 Phase C - Outsource fulfilment block. Sits
              between buy-and-sell and recipe so the operator reads
              the three "who actually makes/serves this" choices in
              one flow:
                in_house   -> we make it (recipe applies)
                outsourced -> external provider fulfils end-to-end
                              (Lamb Spit on-site chef, florist
                              delivers flowers, photographer)
                hybrid     -> we provide the goods, they fulfil
                              on the day (we prep salads, they cook
                              the spit at the venue)
              When set to outsourced/hybrid the operator picks a
              default provider, expected unit cost, and minimum lead
              hours. These wire through to Phase D (per-order
              assignment row + comms) and Phase E (timeline + COGS). */}
          {!itemDraft.is_buy_and_sell && (
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Fulfilment
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {itemDraft.fulfilment_type === "in_house"
                  ? "Made by your kitchen. Recipe + prep tasks apply normally."
                  : itemDraft.fulfilment_type === "outsourced"
                    ? "Fulfilled end-to-end by an external provider. They'll get a request per order with magic-link accept."
                    : "You provide the goods; an external provider serves / cooks on the day. Recipe + provider both apply."}
              </p>
            </div>

            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm w-full">
              {(["in_house", "outsourced", "hybrid"] as const).map((value) => {
                const label = value === "in_house" ? "In-house" : value === "outsourced" ? "Outsourced" : "Hybrid";
                const active = itemDraft.fulfilment_type === value;
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setItemDraft({ ...itemDraft, fulfilment_type: value })}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition border-l first:border-l-0 border-slate-200 ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {itemDraft.fulfilment_type !== "in_house" && (
              <div className="space-y-3 pl-1">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    Default provider
                    <InfoTooltip content="When this item lands on an order, this provider is auto-suggested. Operator can override per-order in the assignment dialog (Phase D)." />
                  </Label>
                  {providerPool.length === 0 ? (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                      No outsource providers on file yet.{" "}
                      <a
                        href="/admin/outsource-providers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        Add one here
                      </a>{" "}
                      then come back and pick them.
                    </div>
                  ) : (
                    <select
                      value={itemDraft.default_outsource_provider_id || ""}
                      onChange={(e) =>
                        setItemDraft({
                          ...itemDraft,
                          default_outsource_provider_id: e.target.value || null,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white"
                    >
                      <option value="">No default - pick per order</option>
                      {providerPool.map((p) => {
                        const rateBit = p.default_rate != null
                          ? ` · R${Number(p.default_rate).toLocaleString("en-ZA")} ${p.default_rate_type.replace("_", " ")}`
                          : "";
                        const rolesBit = p.provider_roles?.length
                          ? ` · ${p.provider_roles.slice(0, 2).join(", ")}`
                          : "";
                        return (
                          <option key={p.id} value={p.id}>
                            {p.provider_name}{rolesBit}{rateBit}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      Expected cost (R)
                      <InfoTooltip content="What you typically pay the provider for this item (per event / per hour / per guest depending on the provider's rate type). Surfaces on the quote builder so the operator sees margin live." />
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={itemDraft.outsource_unit_cost}
                      onChange={(e) => setItemDraft({ ...itemDraft, outsource_unit_cost: e.target.value })}
                      placeholder="e.g. 1500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      Lead time (hours)
                      <InfoTooltip content="Minimum notice this provider needs. Used by the readiness chip and quote acceptance soft-block when an order's event is closer than this." />
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={itemDraft.outsource_lead_hours}
                      onChange={(e) => setItemDraft({ ...itemDraft, outsource_lead_hours: e.target.value })}
                      placeholder="e.g. 48"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Recipe block, hidden for buy-and-sell items.
              For hybrid items the recipe still applies (we make some
              of it) - only fully outsourced items skip the recipe
              section to keep the form focused. */}
          {!itemDraft.is_buy_and_sell && itemDraft.fulfilment_type !== "outsourced" && (
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
          declared on its allergen_codes. Operator can still proceed;
          some flags are intentional ("may contain") - but they see the
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
      {/* Wave 70.2 - recipe-completeness chip quick-edit dialog.
          Four fields, save updates menu_items + recipe (if present)
          so the chip flips green right away. */}
      <Dialog open={!!timingTarget} onOpenChange={(open) => { if (!open) setTimingTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit prep timing</DialogTitle>
            <DialogDescription>
              {timingTarget?.item_name}. Fill these so the kitchen ticket can backplan when to start cooking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t_prep">Prep time (min)</Label>
                <Input
                  id="t_prep"
                  type="number"
                  min="0"
                  step="1"
                  value={timingDraft.prep_time_minutes}
                  onChange={(e) => setTimingDraft({ ...timingDraft, prep_time_minutes: e.target.value })}
                  placeholder="20"
                />
                <p className="text-[10px] text-slate-500">Active hands-on time.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t_cook">Cook time (min)</Label>
                <Input
                  id="t_cook"
                  type="number"
                  min="0"
                  step="1"
                  value={timingDraft.cook_time_minutes}
                  onChange={(e) => setTimingDraft({ ...timingDraft, cook_time_minutes: e.target.value })}
                  placeholder="45"
                />
                <p className="text-[10px] text-slate-500">Oven / stove time.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t_base">Base servings</Label>
                <Input
                  id="t_base"
                  type="number"
                  min="1"
                  step="1"
                  value={timingDraft.base_servings}
                  onChange={(e) => setTimingDraft({ ...timingDraft, base_servings: e.target.value })}
                  placeholder="10"
                />
                <p className="text-[10px] text-slate-500">Portions per recipe yield.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t_notice">Advance notice (hours)</Label>
                <Input
                  id="t_notice"
                  type="number"
                  min="0"
                  step="1"
                  value={timingDraft.requires_advance_notice_hours}
                  onChange={(e) => setTimingDraft({ ...timingDraft, requires_advance_notice_hours: e.target.value })}
                  placeholder="0"
                />
                <p className="text-[10px] text-slate-500">Lead time before service.</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Saving updates the menu item and, when a recipe exists, the recipe row too - so the chip flips green and the next full edit doesn't clobber these numbers.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimingTarget(null)}>Cancel</Button>
            <Button onClick={saveTimingEdit} disabled={timingSaving} className="gap-1.5">
              {timingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {timingSaving ? "Saving" : "Save timing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* MNU-B: bulk action dialogs. One Dialog per action - keeps
          the confirm content focused. Each one only renders when
          the matching bulkDialog kind is set. */}
      <Dialog open={bulkDialog === "archive"} onOpenChange={(o) => !o && setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              They'll disappear from the live menu and stop appearing on new quotes. Existing orders aren't affected. You can restore them later via "Show archived".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={runBulkArchive} disabled={bulkBusy} className="bg-red-600 hover:bg-red-700">
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Archive className="w-4 h-4 mr-1.5" />}
              Archive {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkDialog === "category"} onOpenChange={(o) => !o && setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change category on {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Pick the new category. Kitchen / shopping / dispatch all read from this list.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="bulk_cat">Category</Label>
            <select
              id="bulk_cat"
              value={bulkCategoryValue}
              onChange={(e) => setBulkCategoryValue(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {MENU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={runBulkCategory} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkDialog === "price"} onOpenChange={(o) => !o && setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust price on {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Positive number = increase, negative = decrease. Rounded to 2 decimals. Original prices land in the per-item history so you can roll back.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="bulk_pct">Percentage change</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="bulk_pct"
                type="number"
                step="0.1"
                value={bulkPricePct}
                onChange={(e) => setBulkPricePct(e.target.value)}
                placeholder="e.g. 5 for +5%, -10 for a sale"
                className="flex-1"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Items with a NULL or zero base_price are skipped - "increase R 0 by X%" is nonsense.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={runBulkPrice} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <TrendingUp className="w-4 h-4 mr-1.5" />}
              Apply {bulkPricePct ? `${Number(bulkPricePct) >= 0 ? "+" : ""}${bulkPricePct}%` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkDialog === "allergens"} onOpenChange={(o) => !o && setBulkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark allergens reviewed on {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              Stamps the reviewed-at timestamp on each item. Only confirm after you've actually checked the allergen codes - this is the operator's signature that the data is right.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={runBulkAllergens} disabled={bulkBusy}>
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckSquare className="w-4 h-4 mr-1.5" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}

export default MenuPage;
