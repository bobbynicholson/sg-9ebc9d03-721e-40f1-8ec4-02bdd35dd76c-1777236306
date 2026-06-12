import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Activity,
  CheckCircle2,
  ClipboardCheck,
  MoreHorizontal,
  X,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { inventoryService } from "@/services/inventoryService";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { usePricingMode } from "@/hooks/usePricingMode";
import { toExVat, toIncVat } from "@/lib/vatMath";
import { useCompanyKitchens } from "@/hooks/useCompanyKitchens";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ReceiveStockDialog } from "@/components/admin/inventory/ReceiveStockDialog";
import { RecentReceiptsPanel } from "@/components/admin/inventory/RecentReceiptsPanel";
import { CycleCountDialog } from "@/components/admin/inventory/CycleCountDialog";
import { WriteOffDialog } from "@/components/admin/inventory/WriteOffDialog";
import { BulkActionsBar } from "@/components/admin/inventory/BulkActionsBar";
import { BulkReassignDialog } from "@/components/admin/inventory/BulkReassignDialog";
import { KeyboardShortcutsDialog } from "@/components/admin/inventory/KeyboardShortcutsDialog";
import { useInventoryViews, type SavedView } from "@/hooks/useInventoryViews";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Bookmark, BookmarkPlus, Keyboard } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { formatLocalDate } from "@/lib/localFormat";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minStock: number;
  maxStock: number;
  costPerUnit: number;
  supplierId: string | null;
  supplierName: string;
  sku: string;
  storageLocation: string;
  storageInstructions: string;
  isPerishable: boolean;
  shelfLifeDays: number | null;
  allergenCodes: string[];
  lastUpdated: string;
}

const CATEGORIES = [
  "Produce",
  "Meat & Poultry",
  "Seafood",
  "Dairy",
  "Dry Goods",
  "Beverages",
  "Condiments",
  "Bakery",
  "Frozen",
  "Cleaning",
  "Equipment",
  "Other",
];

// Reason codes map to inventory_transactions.transaction_type so the audit
// log carries truthful intent instead of every movement reading "adjustment".
type StockReasonKey =
  | "received"
  | "used"
  | "waste"
  | "count"
  | "transfer_out"
  | "return";

interface StockReason {
  key: StockReasonKey;
  label: string;
  helper: string;
  /** Direction of stock change. "absolute" means user enters the new total (count correction). */
  direction: "in" | "out" | "absolute";
  /** Maps to the inventory_transactions.transaction_type enum. */
  transactionType: "adjustment" | "usage" | "waste" | "transfer" | "return";
}

const STOCK_REASONS: StockReason[] = [
  { key: "received",     label: "Received from supplier",  helper: "Delivery arrived. Adds to stock.",          direction: "in",       transactionType: "adjustment" },
  { key: "used",         label: "Used for service",        helper: "Used for an event or prep. Removes stock.", direction: "out",      transactionType: "usage"      },
  { key: "waste",        label: "Waste or spoilage",       helper: "Spoilage, breakage, quality reject.",       direction: "out",      transactionType: "waste"      },
  { key: "count",        label: "Count correction",        helper: "Stock count came back different.",          direction: "absolute", transactionType: "adjustment" },
  { key: "transfer_out", label: "Transfer out",            helper: "Moved to another kitchen or venue.",        direction: "out",      transactionType: "transfer"   },
  { key: "return",       label: "Return to supplier",      helper: "Sent back. Removes stock.",                 direction: "out",      transactionType: "return"     },
];

// Allergens we track on inventory_items so the menu-item save can
// cross-check ingredients against dietary_tags / allergen_codes.
// Mirrors the menuService.ts ALLERGEN_CODES list - kept duplicated
// here to avoid a circular import.
const INVENTORY_ALLERGEN_CODES = [
  "gluten", "dairy", "egg", "peanut", "tree_nut", "soy",
  "fish", "shellfish", "sesame", "celery", "mustard", "sulphite",
];

const emptyForm = {
  item_name: "",
  category: "Other",
  unit_of_measure: "unit",
  current_stock: "",
  minimum_stock: "",
  maximum_stock: "",
  cost_per_unit: "",
  sku: "",
  storage_location: "",
  preferred_supplier_id: "",
  // Branch scoping. "shared" = available to every branch (legacy
  // single-pool behaviour). "<region_id>" = pinned to that branch.
  // Stored as a string here so the UI can use a single Select with
  // a sentinel value; on save we translate to (region_id, is_shared).
  branch_scope: "shared",
  // Allergens this ingredient contains. Empty = not flagged. Used by
  // the menu-item save cross-check ("contains gluten but item is
  // tagged gluten free").
  allergen_codes: [] as string[],
};

interface SupplierOption {
  id: string;
  supplier_name: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 min ago";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 45) return `${diffMin} min ago`;
  if (diffMin < 90) return "1 hour ago";
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hours ago`;
  if (diffHr < 36) return "yesterday";
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} days ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} months ago`;
  return formatLocalDate(iso);
}

function readableTransactionType(t: string): string {
  switch (t) {
    case "adjustment": return "Adjustment";
    case "usage":      return "Used";
    case "waste":      return "Waste";
    case "transfer":   return "Transfer";
    case "return":     return "Return";
    default:           return t;
  }
}

// INV-C (task #188 must-fix, 2026-05-24): renamed from default
// export to a plain function. The default export below is now the
// wrapped ProtectedInventoryPage. Pre-fix the unprotected
// component was the default export - so any logged-in user (kitchen,
// cleaning, sales, even client portal) reached this page despite
// ProtectedInventoryPage being defined - it was orphaned.
function AdminInventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = (user as any)?.company_id ?? null;
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(companyId);
  const userId = user?.id ?? "";
  // Wave 24: tenant-currency aware so "Stock on hand" tile + per-item
  // last-cost sparkline render in the right symbol for non-ZAR tenants.
  const tenantCurrency = useTenantCurrency(companyId);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "below_reorder" | "out" | "expiring">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [outlook, setOutlook] = useState<any[]>([]);
  const [lastActivity, setLastActivity] = useState<{ created_at: string; transaction_type: string; item_name?: string } | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [rowDetail, setRowDetail] = useState<{
    recipes: Array<{ recipe_id: string; recipe_name: string; quantity: number; unit: string }>;
    movements: any[];
    batches: any[];
    costHistory: Array<{ date: string; unit_cost: number }>;
  }>({ recipes: [], movements: [], batches: [], costHistory: [] });
  const [rowDetailLoading, setRowDetailLoading] = useState(false);
  // Suppliers list for the item dialog dropdown - loaded once on mount
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);

  // ── Add ─────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyForm });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // ── Edit ────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // ── Move stock (was Adjust) ─────────────────────────────────────
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<InventoryItem | null>(null);
  const [moveReasonKey, setMoveReasonKey] = useState<StockReasonKey>("received");
  const [moveQty, setMoveQty] = useState("");
  const [moveAbsoluteCount, setMoveAbsoluteCount] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState("");

  // ── Delete ──────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Phase 2 workflows ─────────────────────────────────────────
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffPreSelectedId, setWriteOffPreSelectedId] = useState<string | null>(null);

  // ── Phase 3: multi-select + bulk + saved views + shortcuts ────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);
  const [bulkReassignMode, setBulkReassignMode] = useState<"supplier" | "category">("supplier");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { views: savedViews, addView, removeView } = useInventoryViews(companyId);

  useEffect(() => {
    if (!user?.id) return;
    loadInventory();
    loadOutlook();
    loadLastActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(user as any)?.company_id, refreshSignal]);

  // Phase 24 #6: seed the search box from ?q on mount so the
  // dashboard's RecentInventoryAdjusts rows can deep-link a
  // pre-filtered inventory view. Same isReady guard as
  // /admin/contacts (Phase 23 #7) and /admin/menu (Phase 24 #4).
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    if (q) setSearchTerm(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // ── URL action handler: command palette can deep-link to a flow ──
  // /admin/inventory?action=receive | count | writeoff opens the dialog.
  useEffect(() => {
    const action = router.query.action;
    if (!action || typeof action !== "string") return;
    if (action === "receive") setReceiveOpen(true);
    else if (action === "count") setCountOpen(true);
    else if (action === "writeoff") {
      setWriteOffPreSelectedId(null);
      setWriteOffOpen(true);
    }
    // Strip the query so the action doesn't re-fire on next mount.
    if (router.query.action) {
      const { action: _omit, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.action]);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

      // Esc always works - closes drawers, clears search
      if (e.key === "Escape") {
        if (expandedRowId) { setExpandedRowId(null); return; }
        if (selected.size > 0) { setSelected(new Set()); return; }
        if (searchTerm) { setSearchTerm(""); return; }
        return;
      }

      // The rest only fire when the user isn't typing into a field
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        case "n": case "N":
          e.preventDefault();
          openAdd();
          break;
        case "r": case "R":
          e.preventDefault();
          setReceiveOpen(true);
          break;
        case "c": case "C":
          e.preventDefault();
          setCountOpen(true);
          break;
        case "w": case "W":
          e.preventDefault();
          setWriteOffPreSelectedId(null);
          setWriteOffOpen(true);
          break;
        case "1":
          e.preventDefault();
          setActiveTab("all");
          break;
        case "2":
          e.preventDefault();
          setActiveTab("below_reorder");
          break;
        case "3":
          e.preventDefault();
          setActiveTab("out");
          break;
        case "4":
          e.preventDefault();
          setActiveTab("expiring");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRowId, selected, searchTerm]);

  const loadOutlook = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("inventory_demand_outlook")
      .select("*")
      .eq("company_id", companyId)
      .returns<Record<string, unknown>[]>();
    if (error) { setOutlook([]); return; }
    setOutlook(data || []);
  };

  const loadInventory = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await inventoryService.getInventoryWithSuppliers(companyId);
      const mapped: InventoryItem[] = (rows || []).map((row: any) => ({
        id: row.id,
        name: row.item_name ?? "Unnamed",
        category: row.category ?? "Other",
        quantity: Number(row.current_stock ?? 0),
        unit: row.unit_of_measure ?? "unit",
        minStock: Number(row.minimum_stock ?? 0),
        maxStock: Number(row.maximum_stock ?? 0),
        costPerUnit: Number(row.cost_per_unit ?? 0),
        supplierId: row.preferred_supplier_id ?? null,
        supplierName: row.suppliers?.supplier_name ?? "",
        sku: row.sku ?? "",
        storageLocation: row.storage_location ?? "",
        storageInstructions: row.storage_instructions ?? "",
        isPerishable: Boolean(row.is_perishable),
        shelfLifeDays: row.shelf_life_days ?? null,
        allergenCodes: Array.isArray(row.allergen_codes) ? row.allergen_codes : [],
        lastUpdated: row.updated_at ?? "",
      }));
      setInventory(mapped);
    } catch (err) {
      console.error("Error loading inventory:", err);
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLastActivity = async () => {
    if (!companyId) return;
    const result = await inventoryService.getLastActivity(companyId);
    setLastActivity(result);
  };

  const loadSuppliers = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("supplier_name", { ascending: true });
    if (error) {
      console.warn("Could not load suppliers for picker:", error.message);
      return;
    }
    setSupplierOptions((data || []) as SupplierOption[]);
  }, [companyId]);

  const refreshAll = useCallback(() => {
    loadInventory();
    loadOutlook();
    loadLastActivity();
    loadSuppliers();
    loadWastage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // INV-B (inventory deferred, 2026-05-24): per-row wastage hint.
  // Pre-INV-B operators had to bounce to /admin/stock's wastage card.
  // Now each row gets a small chip when the item has waste in 30d.
  const [wastageByItem, setWastageByItem] = useState<Map<string, number>>(new Map());
  const loadWastage = useCallback(async () => {
    if (!companyId) return;
    const map = await inventoryService.getWastageByItem(companyId, 30);
    setWastageByItem(map);
  }, [companyId]);

  // INV-B: realtime channel. Receive-stock on /admin/shopping or a
  // bulk reassign elsewhere refreshes this page automatically.
  // Debounced 1500ms to absorb the cluster a receive flow fires.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { refreshAll(); }, 1500);
    };
    const channel = supabase
      .channel(`inventory:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_transactions", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId, refreshAll]);

  // ── Row expand: load recipes + movements lazily ────────────────
  const toggleRow = async (item: InventoryItem) => {
    if (expandedRowId === item.id) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(item.id);
    setRowDetail({ recipes: [], movements: [], batches: [], costHistory: [] });
    setRowDetailLoading(true);
    try {
      const [recipes, movements, batches, costHistory] = await Promise.all([
        inventoryService.getRecipesUsingItem(item.id),
        inventoryService.getMovementsForItem(item.id, 10),
        inventoryService.getBatchesForItem(item.id),
        inventoryService.getCostHistoryForItem(item.id, 90),
      ]);
      setRowDetail({ recipes, movements, batches, costHistory });
    } catch (err) {
      console.error("Error loading row detail:", err);
    } finally {
      setRowDetailLoading(false);
    }
  };

  // ── Add handlers ───────────────────────────────────────────────
  const openAdd = () => {
    setAddForm({ ...emptyForm });
    setAddError("");
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    if (!addForm.item_name.trim()) { setAddError("Item name is required."); return; }
    if (!companyId) { setAddError("No company on your profile."); return; }
    setAddSaving(true);
    setAddError("");
    try {
      const branchPick = (addForm as any).branch_scope || "shared";
      await inventoryService.createInventoryItem({
        company_id: companyId,
        item_name: addForm.item_name.trim(),
        category: addForm.category,
        unit_of_measure: addForm.unit_of_measure.trim() || "unit",
        current_stock: addForm.current_stock !== "" ? Number(addForm.current_stock) : 0,
        minimum_stock: addForm.minimum_stock !== "" ? Number(addForm.minimum_stock) : 0,
        maximum_stock: addForm.maximum_stock !== "" ? Number(addForm.maximum_stock) : 0,
        cost_per_unit: addForm.cost_per_unit !== "" ? Number(addForm.cost_per_unit) : 0,
        sku: addForm.sku.trim() || null,
        storage_location: addForm.storage_location.trim() || null,
        preferred_supplier_id: addForm.preferred_supplier_id || null,
        allergen_codes: addForm.allergen_codes.length ? addForm.allergen_codes : null,
        // Schema CHECK constraint: items pinned to a region cannot
        // also be flagged shared. Translate the single-select picker
        // into the (region_id, is_shared) pair the DB expects.
        region_id: branchPick === "shared" ? null : branchPick,
        is_shared: branchPick === "shared",
      } as any);
      setAddOpen(false);
      toast({ title: "Item added", description: addForm.item_name.trim() });
      refreshAll();
    } catch (err: any) {
      setAddError(err?.message ?? "Could not save the item.");
    } finally {
      setAddSaving(false);
    }
  };

  // ── Edit handlers ──────────────────────────────────────────────
  const openEdit = (item: InventoryItem) => {
    setEditTarget(item);
    setEditForm({
      item_name: item.name,
      category: item.category,
      unit_of_measure: item.unit,
      current_stock: String(item.quantity),
      minimum_stock: String(item.minStock),
      maximum_stock: String(item.maxStock),
      cost_per_unit: String(item.costPerUnit),
      sku: item.sku,
      storage_location: item.storageLocation,
      preferred_supplier_id: item.supplierId || "",
      branch_scope: (item as any).region_id
        ? String((item as any).region_id)
        : "shared",
      allergen_codes: item.allergenCodes || [],
    });
    setEditError("");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editForm.item_name.trim()) { setEditError("Item name is required."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      const branchPick = (editForm as any).branch_scope || "shared";
      await inventoryService.updateInventoryItem(editTarget.id, {
        item_name: editForm.item_name.trim(),
        category: editForm.category,
        unit_of_measure: editForm.unit_of_measure.trim() || "unit",
        current_stock: editForm.current_stock !== "" ? Number(editForm.current_stock) : 0,
        minimum_stock: editForm.minimum_stock !== "" ? Number(editForm.minimum_stock) : 0,
        maximum_stock: editForm.maximum_stock !== "" ? Number(editForm.maximum_stock) : 0,
        cost_per_unit: editForm.cost_per_unit !== "" ? Number(editForm.cost_per_unit) : 0,
        sku: editForm.sku.trim() || null,
        storage_location: editForm.storage_location.trim() || null,
        preferred_supplier_id: editForm.preferred_supplier_id || null,
        allergen_codes: editForm.allergen_codes.length ? editForm.allergen_codes : null,
        region_id: branchPick === "shared" ? null : branchPick,
        is_shared: branchPick === "shared",
      } as any);
      setEditOpen(false);
      toast({ title: "Saved", description: editForm.item_name.trim() });
      refreshAll();
    } catch (err: any) {
      setEditError(err?.message ?? "Could not save the item.");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Move stock handlers (the new reason-coded flow) ────────────
  const openMove = (item: InventoryItem) => {
    setMoveTarget(item);
    setMoveReasonKey("received");
    setMoveQty("");
    setMoveAbsoluteCount(String(item.quantity));
    setMoveNote("");
    setMoveError("");
    setMoveOpen(true);
  };

  const moveReason = STOCK_REASONS.find(r => r.key === moveReasonKey)!;

  const computedNewTotal = useMemo(() => {
    if (!moveTarget) return 0;
    if (moveReason.direction === "absolute") {
      const n = Number(moveAbsoluteCount);
      return isNaN(n) ? moveTarget.quantity : n;
    }
    const n = Number(moveQty);
    if (isNaN(n) || moveQty === "") return moveTarget.quantity;
    if (moveReason.direction === "in") return moveTarget.quantity + Math.abs(n);
    return moveTarget.quantity - Math.abs(n);
  }, [moveTarget, moveReason, moveQty, moveAbsoluteCount]);

  const handleMoveSave = async () => {
    if (!moveTarget) return;
    const newTotal = computedNewTotal;

    if (moveReason.direction === "absolute") {
      if (moveAbsoluteCount === "" || isNaN(Number(moveAbsoluteCount))) {
        setMoveError("Enter the actual count.");
        return;
      }
    } else {
      if (moveQty === "" || isNaN(Number(moveQty)) || Number(moveQty) === 0) {
        setMoveError("Enter a quantity greater than zero.");
        return;
      }
    }
    if (newTotal < 0) {
      setMoveError(`Stock cannot go below zero. You have ${moveTarget.quantity} ${moveTarget.unit} on hand.`);
      return;
    }

    const previousStock = moveTarget.quantity;
    const targetItem = moveTarget;

    setMoveSaving(true);
    setMoveError("");
    try {
      const composedNote = moveNote.trim()
        ? `${moveReason.label}: ${moveNote.trim()}`
        : moveReason.label;
      await inventoryService.adjustStock(
        targetItem.id,
        newTotal,
        userId,
        composedNote,
        moveReason.transactionType,
      );
      setMoveOpen(false);
      const delta = newTotal - previousStock;
      const sign = delta >= 0 ? "+" : "";
      toast({
        title: `${moveReason.label}`,
        description: `${targetItem.name}: ${sign}${delta} ${targetItem.unit}. Now ${newTotal} ${targetItem.unit}.`,
        action: (
          <ToastAction
            altText="Undo this stock movement"
            onClick={async () => {
              try {
                await inventoryService.adjustStock(
                  targetItem.id,
                  previousStock,
                  userId,
                  `Undo: ${moveReason.label}`,
                  "adjustment",
                );
                toast({ title: "Reverted", description: `${targetItem.name} back to ${previousStock} ${targetItem.unit}.` });
                refreshAll();
              } catch (e: any) {
                toast({ title: "Could not undo", description: e?.message, variant: "destructive" });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
      refreshAll();
    } catch (err: any) {
      setMoveError(err?.message ?? "Could not update stock.");
    } finally {
      setMoveSaving(false);
    }
  };

  // ── Delete handlers (with undo) ────────────────────────────────
  const openDelete = (item: InventoryItem) => {
    setDeleteTarget(item);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetItem = deleteTarget;
    setDeleteLoading(true);
    try {
      await inventoryService.deleteInventoryItem(targetItem.id);
      setDeleteOpen(false);
      toast({
        title: "Item removed",
        description: `${targetItem.name}. Stock history is kept.`,
        action: (
          <ToastAction
            altText="Restore this item"
            onClick={async () => {
              try {
                await inventoryService.restoreInventoryItem(targetItem.id);
                toast({ title: "Restored", description: targetItem.name });
                refreshAll();
              } catch (e: any) {
                toast({ title: "Could not restore", description: e?.message, variant: "destructive" });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
      refreshAll();
    } catch (err: any) {
      toast({ title: "Could not delete", description: err?.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Phase 3 helpers ────────────────────────────────────────────
  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (visibleIds: string[]) => {
    setSelected(prev => {
      const allSelected = visibleIds.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const result = await inventoryService.bulkDelete(ids, companyId);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      toast({
        title: `${result.deleted} item${result.deleted === 1 ? "" : "s"} removed`,
        description: result.errors.length > 0 ? `Errors: ${result.errors.join("; ")}` : "Stock history is kept.",
      });
      refreshAll();
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // INV-B (inventory deferred, 2026-05-24): bulk mark-perishable.
  // Toggles is_perishable on every selected row in one round trip.
  // The expiry tab + shelf-life reports key off this flag.
  const handleBulkMarkPerishable = async (isPerishable: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const result = await inventoryService.bulkMarkPerishable(ids, isPerishable, companyId);
    setSelected(new Set());
    toast({
      title: `${result.updated} item${result.updated === 1 ? "" : "s"} ${isPerishable ? "flagged perishable" : "no longer perishable"}`,
      description: result.errors.length > 0 ? `Errors: ${result.errors.join("; ")}` : undefined,
    });
    refreshAll();
  };

  const openBulkReassign = (mode: "supplier" | "category") => {
    setBulkReassignMode(mode);
    setBulkReassignOpen(true);
  };

  const handleSaveCurrentView = () => {
    if (!viewName.trim()) return;
    addView(viewName.trim(), { tab: activeTab, search: searchTerm });
    setViewName("");
    setSaveViewOpen(false);
    toast({ title: "View saved", description: viewName.trim() });
  };

  const applySavedView = (v: SavedView) => {
    setActiveTab(v.tab);
    setSearchTerm(v.search);
    setSelected(new Set());
    toast({ title: "View applied", description: v.name });
  };

  const exportCSV = () => {
    // INV-B: added Perishable + Shelf life (days) so the export
    // carries the same data the on-screen Perishable filter relies on.
    const headers = [
      "SKU", "Item name", "Category", "On hand", "Unit", "Reorder point",
      "Par level", "Cost per unit", "Supplier", "Storage location",
      "Perishable", "Shelf life (days)",
    ];
    const escape = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filteredInventory.map(item => [
      item.sku, item.name, item.category, item.quantity, item.unit,
      item.minStock, item.maxStock, item.costPerUnit, item.supplierName, item.storageLocation,
      item.isPerishable ? "Yes" : "No",
      item.shelfLifeDays ?? "",
    ]);
    const csv = [headers, ...rows].map(row => row.map(escape).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${toLocalISO(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${rows.length} item${rows.length === 1 ? "" : "s"} exported to CSV.` });
  };

  // ── Derived data ───────────────────────────────────────────────
  const belowReorderItems = useMemo(
    () => inventory.filter(i => i.quantity <= i.minStock && i.quantity > 0),
    [inventory],
  );
  const outOfStockItems = useMemo(
    () => inventory.filter(i => i.quantity === 0),
    [inventory],
  );
  const belowReorderCount = belowReorderItems.length + outOfStockItems.length;

  const atRiskItems = useMemo(() => {
    return outlook
      .filter((o: any) => ["shortfall", "below_minimum", "low"].includes(o.status))
      .sort((a: any, b: any) => {
        const order: Record<string, number> = { shortfall: 0, below_minimum: 1, low: 2 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
  }, [outlook]);

  // INV-B (inventory deferred, 2026-05-24): expose the cost-data
  // coverage alongside the value so the operator sees whether the
  // R total is a complete picture or a partial roll-up. Pre-INV-B
  // items with no cost_per_unit silently contributed zero and the
  // tile presented as authoritative.
  const stockOnHand = useMemo(() => {
    let value = 0;
    let itemsWithCost = 0;
    for (const item of inventory) {
      if (item.costPerUnit > 0) {
        itemsWithCost += 1;
        value += item.quantity * item.costPerUnit;
      }
    }
    return { value, itemsWithCost, total: inventory.length };
  }, [inventory]);
  const stockOnHandValue = stockOnHand.value;

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return inventory;
    if (activeTab === "below_reorder") return inventory.filter(i => i.quantity <= i.minStock && i.quantity > 0);
    if (activeTab === "out") return inventory.filter(i => i.quantity === 0);
    if (activeTab === "expiring") {
      // Phase 4 wires real per-batch expiry. For now, surface perishable items
      // flagged as such, sorted by shelf life ascending.
      return inventory
        .filter(i => i.isPerishable)
        .sort((a, b) => (a.shelfLifeDays ?? 999) - (b.shelfLifeDays ?? 999));
    }
    return inventory;
  }, [inventory, activeTab]);

  const filteredInventory = useFuzzyItems(
    tabFiltered,
    searchTerm,
    [
      { key: "name" as any, weight: 3 },
      { key: "sku" as any, weight: 2 },
      { key: "category" as any, weight: 2 },
      { key: "supplierName" as any, weight: 2 },
      { key: "storageLocation" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  return (
    <>
      <NoIndexMeta />
      <Head><title>Inventory - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-6 max-w-full">

          {/* Compressed header */}
          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Food &amp; Ingredients</h1>
                <p className="text-sm text-slate-600">
                  Pantry and chiller stock. Levels per item, low-stock alerts, and what each upcoming event will pull.
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {inventory.length} item{inventory.length === 1 ? "" : "s"}
                  {lastActivity && <> · last movement {relativeTime(lastActivity.created_at)}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-slate-500 hover:text-slate-900"
                onClick={refreshAll}
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={openAdd}>
                <Plus className="w-4 h-4" />
                New item
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <MoreHorizontal className="w-4 h-4" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setCountOpen(true)} className="gap-2 cursor-pointer">
                    <ClipboardCheck className="w-4 h-4 text-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Cycle count</p>
                      <p className="text-xs text-slate-500">Count what's on the shelf, post variances</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { setWriteOffPreSelectedId(null); setWriteOffOpen(true); }}
                    className="gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Write off</p>
                      <p className="text-xs text-slate-500">Spoilage, breakage, expiry</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled className="gap-2">
                    <span className="w-4 h-4" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-400">Import CSV</p>
                      <p className="text-xs text-slate-400">Coming in Phase 3</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                onClick={() => setReceiveOpen(true)}
              >
                <Package className="w-4 h-4" />
                Receive
              </Button>
            </div>
          </div>

          {/* Recent receipts that fed inventory - collapsible audit
              trail tying stock movements back to the slip they came from. */}
          <RecentReceiptsPanel companyId={companyId} />

          {/* Stat cards (4 new ones, ordered by what to act on first) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab("below_reorder")}
              className={`text-left rounded-lg border bg-white p-4 shadow-sm hover:shadow transition-all ${
                activeTab === "below_reorder" ? "ring-2 ring-red-200 border-red-300" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  Below reorder
                  <InfoTooltip content="Items at or below their reorder point, including items completely out. Order these next." />
                </p>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{belowReorderCount}</p>
              {/* INV-B: honest split. Pre-INV-B the sub-line read
                  "X fully out" but the tile total mashed below-reorder
                  + out together. Spell out the math so the click
                  destination (below_reorder tab, 19 items) matches
                  the headline (38 = 19 low + 19 out). */}
              <p className="text-xs text-slate-500 mt-1">
                {belowReorderItems.length} low + {outOfStockItems.length} out
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("at-risk-panel");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="text-left rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  At risk 7 days
                  <InfoTooltip content="Items where confirmed bookings will use more than you have on hand in the next seven days." />
                </p>
                <TrendingDown className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{atRiskItems.length}</p>
              <p className="text-xs text-slate-500 mt-1">
                {atRiskItems.length === 0 ? "All covered" : "Click to jump"}
              </p>
            </button>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  Stock on hand
                  <InfoTooltip content="Value of stock on hand at last logged cost. Sum of quantity x cost_per_unit across items with a non-zero cost. Items without cost data don't contribute." />
                </p>
                <Package className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {tenantCurrency.format(stockOnHandValue, 0)}
              </p>
              {/* INV-B: honest "based on N of M items" caveat so the
                  total reads as the partial roll-up it is when cost
                  data is missing. */}
              <p className="text-xs text-slate-500 mt-1">
                at last cost{stockOnHand.itemsWithCost < stockOnHand.total
                  ? ` - ${stockOnHand.itemsWithCost} / ${stockOnHand.total} priced`
                  : ""}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  Last activity
                  <InfoTooltip content="Most recent stock movement on any item. A pulse check that the team is using the system." />
                </p>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {lastActivity ? relativeTime(lastActivity.created_at) : "-"}
              </p>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {lastActivity?.item_name
                  ? `${readableTransactionType(lastActivity.transaction_type)} · ${lastActivity.item_name}`
                  : "no movements yet"}
              </p>
            </div>
          </div>

          {/* INV-B (inventory deferred, 2026-05-24): equipment strip
              removed per the food-only product call. Food and
              equipment are managed by different people, ordered from
              different suppliers, and counted on different cadences -
              mixing them on this page was kitchen-sink design. The
              cross-link is one click via AdminNav -> Equipment. */}

          {/* At risk this week (the most valuable block, now first) */}
          <Card id="at-risk-panel" className="border-0 shadow-sm mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {atRiskItems.length === 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    )}
                    At risk this week
                  </CardTitle>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {atRiskItems.length === 0
                      ? "All covered for the next 7 days against confirmed bookings."
                      : `${atRiskItems.length} item${atRiskItems.length === 1 ? "" : "s"} will run short on confirmed bookings.`}
                  </p>
                </div>
                {atRiskItems.length > 0 && (
                  // Phase 3d shopping sweep: re-pointed from /alerts
                  // (legacy passive table) to /buy-list (canonical
                  // action surface with bulk-add).
                  <Link href="/team-portal/shopping/buy-list">
                    <Button size="sm" variant="outline" className="gap-2">
                      <TrendingDown className="w-4 h-4" />
                      Build shopping list
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            {atRiskItems.length > 0 && (
              <CardContent className="pt-0">
                <AtRiskTable rows={atRiskItems.slice(0, 12)} />
                <p className="text-xs text-slate-500 mt-3">
                  Pulled from confirmed lines over the next 7 days. Updates the moment recipes or stock change.
                </p>
              </CardContent>
            )}
          </Card>

          {/* Search + filter chips + views + export */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm mb-4 p-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search items, suppliers, SKU"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-12 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {/* Phase 25 #6: clear-search affordance. Swap the
                    `/` keyboard hint for the X clear button when
                    there's something to clear, so the right-side
                    region only ever shows one icon. */}
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    /
                  </kbd>
                )}
              </div>

              {/* Views dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Bookmark className="w-4 h-4" />
                    Views
                    {savedViews.length > 0 && (
                      <span className="text-xs text-slate-500 ml-1">({savedViews.length})</span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => setSaveViewOpen(true)} className="gap-2 cursor-pointer">
                    <BookmarkPlus className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium">Save current view</span>
                  </DropdownMenuItem>
                  {savedViews.length > 0 && <DropdownMenuSeparator />}
                  {savedViews.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-500">
                      Save a tab + search combination to jump back to it later.
                    </p>
                  ) : savedViews.map(v => (
                    <div key={v.id} className="flex items-center justify-between hover:bg-slate-50 rounded">
                      <DropdownMenuItem
                        onClick={() => applySavedView(v)}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{v.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {v.tab.replace("_", " ")}{v.search ? ` · "${v.search}"` : ""}
                          </p>
                        </div>
                      </DropdownMenuItem>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeView(v.id); }}
                        className="p-1.5 mr-1 text-slate-400 hover:text-red-600"
                        title="Delete view"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="sm" className="gap-2" disabled title="Coming soon">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV} title="Export current view to CSV">
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-slate-400 hover:text-slate-700"
                onClick={() => setShortcutsOpen(true)}
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeTab === "all"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                All ({inventory.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("below_reorder")}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeTab === "below_reorder"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-red-700 border-red-200 hover:bg-red-50"
                }`}
              >
                Below reorder ({belowReorderItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("out")}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeTab === "out"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Out ({outOfStockItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("expiring")}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  activeTab === "expiring"
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
                }`}
              >
                Perishable
              </button>
            </div>
          </div>

          {/* Bulk actions bar (only when something is selected) */}
          <BulkActionsBar
            selectedCount={selected.size}
            onClearSelection={() => setSelected(new Set())}
            onBulkReassignSupplier={() => openBulkReassign("supplier")}
            onBulkReassignCategory={() => openBulkReassign("category")}
            onBulkDelete={() => setBulkDeleteOpen(true)}
            onBulkMarkPerishable={handleBulkMarkPerishable}
          />

          {/* Dense table */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[28px_28px_minmax(0,2fr)_minmax(0,1fr)_110px_minmax(0,1.4fr)_120px_110px_minmax(0,1fr)_120px] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider items-center">
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  className="accent-emerald-600 cursor-pointer"
                  checked={filteredInventory.length > 0 && filteredInventory.every(i => selected.has(i.id))}
                  ref={cb => {
                    if (cb) {
                      const allSelected = filteredInventory.length > 0 && filteredInventory.every(i => selected.has(i.id));
                      const anySelected = filteredInventory.some(i => selected.has(i.id));
                      cb.indeterminate = anySelected && !allSelected;
                    }
                  }}
                  onChange={() => selectAllVisible(filteredInventory.map(i => i.id))}
                  aria-label="Select all visible"
                />
              </div>
              <div></div>
              <div>Item</div>
              <div>Category</div>
              <div className="text-right">On hand</div>
              <div>Stock level</div>
              <div className="text-right">Reorder / Par</div>
              <div className="text-right">Last cost</div>
              <div>Supplier</div>
              <div className="text-right">Actions</div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading inventory...</p>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                {inventory.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-700 mb-1">Nothing in inventory yet</p>
                    <p className="text-xs text-slate-500 mb-4">Add your first item. Try chicken, butter, or rice.</p>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={openAdd}>
                      <Plus className="w-4 h-4" />
                      Add an item
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No items match this filter.</p>
                )}
              </div>
            ) : (
              filteredInventory.map(item => {
                const isOut = item.quantity === 0;
                const isLow = item.quantity <= item.minStock && !isOut;
                const par = item.maxStock > 0 ? item.maxStock : Math.max(item.minStock * 2, 1);
                const fillPct = Math.min(100, Math.max(0, (item.quantity / par) * 100));
                const reorderTickPct = par > 0 ? Math.min(100, Math.max(0, (item.minStock / par) * 100)) : 0;
                const barColour =
                  isOut ? "bg-red-500" :
                  isLow ? "bg-amber-500" :
                  fillPct >= 75 ? "bg-emerald-500" :
                  "bg-blue-500";
                const leftBorder =
                  isOut ? "border-l-red-500" :
                  isLow ? "border-l-amber-500" :
                  "border-l-transparent";

                const isExpanded = expandedRowId === item.id;

                return (
                  <div key={item.id} className={`border-b border-slate-100 border-l-4 ${leftBorder}`}>
                    {/* Desktop dense row */}
                    <div
                      className={`hidden md:grid grid-cols-[28px_28px_minmax(0,2fr)_minmax(0,1fr)_110px_minmax(0,1.4fr)_120px_110px_minmax(0,1fr)_120px] gap-3 px-4 py-3 items-center transition-colors cursor-pointer ${
                        selected.has(item.id) ? "bg-emerald-50 hover:bg-emerald-100" : "hover:bg-slate-50"
                      }`}
                      onClick={() => toggleRow(item)}
                    >
                      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="accent-emerald-600 cursor-pointer"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Select ${item.name}`}
                        />
                      </div>
                      <div className="flex items-center justify-center text-slate-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                        {(item.sku || item.storageLocation) && (
                          <p className="text-xs text-slate-500 truncate">
                            {item.sku && <span>SKU {item.sku}</span>}
                            {item.sku && item.storageLocation && <span> · </span>}
                            {item.storageLocation && <span>{item.storageLocation}</span>}
                          </p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <Badge variant="outline" className="text-xs font-normal text-slate-600 border-slate-200 bg-slate-50">
                          {item.category}
                        </Badge>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className={`text-sm font-semibold ${isOut ? "text-red-600" : isLow ? "text-amber-700" : "text-slate-900"}`}>
                          {item.quantity}
                        </p>
                        <p className="text-xs text-slate-500">{item.unit}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`absolute left-0 top-0 h-full ${barColour}`}
                            style={{ width: `${fillPct}%` }}
                          />
                          {item.minStock > 0 && reorderTickPct < 100 && (
                            <div
                              className="absolute top-0 h-full w-px bg-slate-400"
                              style={{ left: `${reorderTickPct}%` }}
                              title={`Reorder at ${item.minStock} ${item.unit}`}
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {isOut ? "Out of stock" : isLow ? "Below reorder" : `${Math.round(fillPct)}% of par`}
                        </p>
                      </div>
                      <div className="text-right tabular-nums text-sm text-slate-700">
                        <span className="text-slate-900">{item.minStock}</span>
                        {item.maxStock > 0 && <span className="text-slate-400"> / {item.maxStock}</span>}
                      </div>
                      <div className="text-right tabular-nums text-sm text-slate-700">
                        {/* INV-C (task #188 must-fix, 2026-05-24):
                            tenantCurrency.format() for non-ZAR
                            tenants. Hardcoded `R` rendered the wrong
                            symbol on any non-South African company. */}
                        {item.costPerUnit > 0 ? tenantCurrency.format(item.costPerUnit) : "-"}
                      </div>
                      <div className="min-w-0 text-sm text-slate-700 truncate">
                        {item.supplierName || <span className="text-slate-400">-</span>}
                      </div>
                      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                          title="Move stock"
                          onClick={() => openMove(item)}
                        >
                          <ArrowUpDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                          title="Edit"
                          onClick={() => openEdit(item)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-red-700 hover:bg-red-50"
                          title="Delete"
                          onClick={() => openDelete(item)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Mobile compact card */}
                    <div
                      className="md:hidden p-3 hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleRow(item)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                            <Badge variant="outline" className="text-[10px] font-normal text-slate-600 border-slate-200 bg-slate-50">
                              {item.category}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            <span className={isOut ? "text-red-600 font-semibold" : isLow ? "text-amber-700 font-semibold" : "text-slate-900 font-semibold"}>
                              {item.quantity} {item.unit}
                            </span>
                            <span className="text-slate-400"> · reorder {item.minStock}</span>
                            {item.supplierName && <span> · {item.supplierName}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openMove(item)}>
                            <ArrowUpDown className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded drawer */}
                    {isExpanded && (
                      <div className="bg-slate-50 border-t border-slate-200 px-4 py-4">
                        {rowDetailLoading ? (
                          <p className="text-xs text-slate-500">Loading details...</p>
                        ) : (
                          <div className="space-y-5">
                            {/* Top row: recipes · batches · cost history */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              {/* Recipe usage */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                  In {rowDetail.recipes.length} recipe{rowDetail.recipes.length === 1 ? "" : "s"}
                                </h4>
                                {rowDetail.recipes.length === 0 ? (
                                  <p className="text-xs text-slate-500">Not linked to any recipe yet.</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {rowDetail.recipes.slice(0, 6).map(r => (
                                      <li key={r.recipe_id} className="text-xs text-slate-700 flex justify-between gap-2">
                                        <span className="truncate">{r.recipe_name}</span>
                                        <span className="text-slate-500 tabular-nums whitespace-nowrap">
                                          {r.quantity} {r.unit}
                                        </span>
                                      </li>
                                    ))}
                                    {rowDetail.recipes.length > 6 && (
                                      <li className="text-xs text-slate-500">+ {rowDetail.recipes.length - 6} more</li>
                                    )}
                                  </ul>
                                )}
                              </div>

                              {/* Batches on hand (FIFO order) */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                  Batches on hand
                                  {rowDetail.batches.length > 0 && (
                                    <span className="ml-1 text-slate-400 font-normal">
                                      ({rowDetail.batches.length})
                                    </span>
                                  )}
                                </h4>
                                {rowDetail.batches.length === 0 ? (
                                  <p className="text-xs text-slate-500">
                                    No batch records yet. Receive stock to start tracking expiry per batch.
                                  </p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {rowDetail.batches.slice(0, 5).map((b: any, idx: number) => {
                                      const daysToExpiry = b.expiry_date
                                        ? Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                                        : null;
                                      const expiryTone =
                                        daysToExpiry == null ? "text-slate-400" :
                                        daysToExpiry < 0     ? "text-red-700 font-semibold" :
                                        daysToExpiry <= 7    ? "text-amber-700 font-semibold" :
                                        daysToExpiry <= 30   ? "text-amber-600" :
                                                               "text-emerald-700";
                                      const expiryLabel =
                                        daysToExpiry == null ? "no expiry" :
                                        daysToExpiry < 0     ? `expired ${-daysToExpiry}d ago` :
                                        daysToExpiry === 0   ? "expires today" :
                                        daysToExpiry === 1   ? "expires tomorrow" :
                                                               `${daysToExpiry}d left`;
                                      return (
                                        <li key={b.id} className="text-xs flex items-start justify-between gap-2 border-b border-slate-200 pb-1.5 last:border-b-0">
                                          <div className="min-w-0 flex-1">
                                            <p className="text-slate-700 truncate">
                                              {idx === 0 && (
                                                <span className="inline-block px-1 py-0 text-[9px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 rounded mr-1.5">
                                                  Use first
                                                </span>
                                              )}
                                              {b.batch_number || `Received ${b.received_date}`}
                                            </p>
                                            <p className="text-slate-500 mt-0.5">
                                              {Number(b.quantity).toLocaleString()} {item.unit}
                                              {b.suppliers?.supplier_name && <> · {b.suppliers.supplier_name}</>}
                                            </p>
                                          </div>
                                          <span className={`tabular-nums whitespace-nowrap ${expiryTone}`}>
                                            {expiryLabel}
                                          </span>
                                        </li>
                                      );
                                    })}
                                    {rowDetail.batches.length > 5 && (
                                      <li className="text-xs text-slate-500">+ {rowDetail.batches.length - 5} more</li>
                                    )}
                                  </ul>
                                )}
                              </div>

                              {/* Cost history sparkline */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                  Cost trend (90 days)
                                </h4>
                                {rowDetail.costHistory.length < 2 ? (
                                  <p className="text-xs text-slate-500">
                                    {rowDetail.costHistory.length === 0
                                      ? "No cost data logged yet."
                                      : "Need a second receipt to chart a trend."}
                                  </p>
                                ) : (() => {
                                  const points = rowDetail.costHistory;
                                  const first = points[0].unit_cost;
                                  const last = points[points.length - 1].unit_cost;
                                  const min = Math.min(...points.map(p => p.unit_cost));
                                  const max = Math.max(...points.map(p => p.unit_cost));
                                  const range = max - min || 1;
                                  const w = 200;
                                  const h = 40;
                                  const pad = 2;
                                  const path = points.map((p, i) => {
                                    const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
                                    const y = h - pad - ((p.unit_cost - min) / range) * (h - pad * 2);
                                    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                                  }).join(" ");
                                  const change = first > 0 ? ((last - first) / first) * 100 : 0;
                                  const changeTone =
                                    Math.abs(change) < 1 ? "text-slate-500" :
                                    change > 0 ? "text-red-600" : "text-emerald-700";
                                  const trendStroke = change > 0 ? "#dc2626" : change < 0 ? "#059669" : "#64748b";
                                  return (
                                    <div>
                                      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mb-1">
                                        <path d={path} fill="none" stroke={trendStroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                        <circle
                                          cx={w - pad}
                                          cy={h - pad - ((last - min) / range) * (h - pad * 2)}
                                          r="2"
                                          fill={trendStroke}
                                        />
                                      </svg>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-700 tabular-nums">
                                          {tenantCurrency.format(last)}
                                        </span>
                                        <span className={`tabular-nums font-medium ${changeTone}`}>
                                          {change > 0 ? "+" : ""}{change.toFixed(1)}%
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {points.length} data point{points.length === 1 ? "" : "s"}
                                      </p>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Bottom row: full-width movement history */}
                            <div>
                              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                Recent movements
                              </h4>
                              {rowDetail.movements.length === 0 ? (
                                <p className="text-xs text-slate-500">No movements yet.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {rowDetail.movements.map(m => {
                                    const qty = Number(m.quantity);
                                    const sign = qty > 0 ? "+" : "";
                                    return (
                                      <li key={m.id} className="text-xs flex items-start justify-between gap-3 py-1 border-b border-slate-200 last:border-b-0">
                                        <div className="min-w-0 flex-1">
                                          <span className="font-medium text-slate-700">
                                            {readableTransactionType(m.transaction_type)}
                                          </span>
                                          {m.notes && (
                                            <span className="text-slate-500"> · {m.notes}</span>
                                          )}
                                        </div>
                                        <div className="text-right whitespace-nowrap">
                                          <span className={`tabular-nums font-medium ${qty > 0 ? "text-emerald-700" : "text-red-700"}`}>
                                            {sign}{qty} {item.unit}
                                          </span>
                                          <span className="text-slate-400 ml-2">{relativeTime(m.created_at)}</span>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Storage notes if present */}
                        {(item.storageInstructions || item.isPerishable) && (
                          <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600">
                            {item.isPerishable && (
                              <span className="inline-flex items-center gap-1 mr-3">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Perishable{item.shelfLifeDays ? ` · shelf life ${item.shelfLifeDays}d` : ""}
                              </span>
                            )}
                            {item.storageInstructions && <span>{item.storageInstructions}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Add modal ──────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New item</DialogTitle>
          </DialogHeader>
          <ItemForm form={addForm} setForm={setAddForm} error={addError} suppliers={supplierOptions} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={addSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleAddSave} disabled={addSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {addSaving ? "Saving..." : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit modal ─────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <ItemForm form={editForm} setForm={setEditForm} error={editError} suppliers={supplierOptions} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={editSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleEditSave} disabled={editSaving} className="bg-brand-primary hover:opacity-90">
              {editSaving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Move stock modal (reason-coded) ─────────────────────────── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move stock · {moveTarget?.name}</DialogTitle>
          </DialogHeader>
          {moveTarget && (
            <div className="space-y-4">
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-500">On hand:</span>{" "}
                <span className="font-semibold text-slate-900">
                  {moveTarget.quantity} {moveTarget.unit}
                </span>
              </div>

              <div>
                <Label className="text-sm font-medium">Reason</Label>
                <div className="mt-2 space-y-1.5">
                  {STOCK_REASONS.map(r => (
                    <label
                      key={r.key}
                      className={`flex items-start gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                        moveReasonKey === r.key
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="moveReason"
                        value={r.key}
                        checked={moveReasonKey === r.key}
                        onChange={() => setMoveReasonKey(r.key)}
                        className="mt-0.5 accent-emerald-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{r.label}</p>
                        <p className="text-xs text-slate-500">{r.helper}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {moveReason.direction === "absolute" ? (
                <div>
                  <Label htmlFor="absCount">Actual count on hand</Label>
                  <Input
                    id="absCount"
                    type="number"
                    min="0"
                    value={moveAbsoluteCount}
                    onChange={e => setMoveAbsoluteCount(e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                  {moveAbsoluteCount !== "" && !isNaN(Number(moveAbsoluteCount)) && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      Adjusts by {Number(moveAbsoluteCount) - moveTarget.quantity >= 0 ? "+" : ""}
                      {Number(moveAbsoluteCount) - moveTarget.quantity} {moveTarget.unit}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="moveQty">
                    {moveReason.direction === "in" ? "How much received?" : "How much removed?"}
                  </Label>
                  <Input
                    id="moveQty"
                    type="number"
                    min="0"
                    value={moveQty}
                    onChange={e => setMoveQty(e.target.value)}
                    placeholder={moveReason.direction === "in" ? "e.g. 10" : "e.g. 3"}
                    className="mt-1"
                    autoFocus
                  />
                  {moveQty !== "" && !isNaN(Number(moveQty)) && Number(moveQty) > 0 && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      New total: <span className={`font-semibold ${computedNewTotal < 0 ? "text-red-600" : "text-slate-900"}`}>
                        {computedNewTotal} {moveTarget.unit}
                      </span>
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="moveNote">Note (optional)</Label>
                <Input
                  id="moveNote"
                  value={moveNote}
                  onChange={e => setMoveNote(e.target.value)}
                  placeholder="Invoice number, event name, anything useful"
                  className="mt-1"
                />
              </div>

              {moveError && <p className="text-sm text-red-600">{moveError}</p>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={moveSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleMoveSave} disabled={moveSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {moveSaving ? "Saving..." : "Update stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ─────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            Delete <span className="font-semibold">{deleteTarget?.name}</span>?
            Stock history is kept. The item is removed from lists. You can undo for a few seconds.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteLoading}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receive stock (Phase 2) ────────────────────────────────── */}
      <ReceiveStockDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        companyId={companyId}
        performedBy={userId}
        inventoryOptions={inventory.map(i => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          costPerUnit: i.costPerUnit,
        }))}
        onSaved={(received, invoice) => {
          toast({
            title: "Delivery received",
            description: `${received} line${received === 1 ? "" : "s"} posted${invoice ? ` against ${invoice}` : ""}.`,
          });
          refreshAll();
        }}
      />

      {/* ── Cycle count (Phase 2) ──────────────────────────────────── */}
      <CycleCountDialog
        open={countOpen}
        onOpenChange={setCountOpen}
        companyId={companyId}
        performedBy={userId}
        items={inventory.map(i => ({
          id: i.id,
          name: i.name,
          category: i.category,
          unit: i.unit,
          systemStock: i.quantity,
        }))}
        onSaved={(posted) => {
          toast({
            title: "Cycle count posted",
            description: `${posted} adjustment${posted === 1 ? "" : "s"} written to the audit log.`,
          });
          refreshAll();
        }}
      />

      {/* ── Write off (Phase 2) ────────────────────────────────────── */}
      <WriteOffDialog
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
        performedBy={userId}
        companyId={companyId}
        items={inventory.map(i => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          currentStock: i.quantity,
          costPerUnit: i.costPerUnit,
        }))}
        preSelectedItemId={writeOffPreSelectedId}
        onSaved={(itemName, qty, costImpact) => {
          toast({
            title: "Stock written off",
            description: `${itemName}: ${qty} written off${costImpact > 0 ? ` · ${tenantCurrency.format(costImpact)}` : ""}`,
          });
          refreshAll();
        }}
      />

      {/* ── Bulk reassign (Phase 3) ────────────────────────────────── */}
      <BulkReassignDialog
        open={bulkReassignOpen}
        onOpenChange={setBulkReassignOpen}
        mode={bulkReassignMode}
        itemIds={Array.from(selected)}
        itemNames={inventory.filter(i => selected.has(i.id)).map(i => i.name)}
        companyId={companyId}
        categories={CATEGORIES}
        onSaved={(mode, count, label) => {
          toast({
            title: `${count} item${count === 1 ? "" : "s"} updated`,
            description: mode === "supplier"
              ? `Supplier set to ${label}.`
              : `Category set to ${label}.`,
          });
          setSelected(new Set());
          refreshAll();
        }}
      />

      {/* ── Bulk delete confirm (Phase 3) ──────────────────────────── */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete {selected.size} items?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            Stock history is kept for each. The items disappear from lists. There is no bulk undo.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={bulkDeleteLoading}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteLoading}>
              {bulkDeleteLoading ? "Deleting..." : `Delete ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save view (Phase 3) ────────────────────────────────────── */}
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
              <p className="font-medium mb-0.5">Captures:</p>
              <p>
                Tab: <span className="font-medium">{activeTab.replace("_", " ")}</span>
                {searchTerm && <span> · Search: <span className="font-medium">"{searchTerm}"</span></span>}
              </p>
            </div>
            <div>
              <Label htmlFor="view_name">View name</Label>
              <Input
                id="view_name"
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                placeholder="e.g. Restaurant items low"
                className="mt-1"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveCurrentView} disabled={!viewName.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Keyboard shortcuts help (Phase 3) ──────────────────────── */}
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}

// ── Item form (shared by Add + Edit) ──────────────────────────────
function ItemForm({
  form,
  setForm,
  error,
  suppliers,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  error: string;
  suppliers: SupplierOption[];
}) {
  const pricingMode = usePricingMode();
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="item_name">Item name *</Label>
        <Input
          id="item_name"
          value={form.item_name}
          onChange={e => setForm({ ...form, item_name: e.target.value })}
          placeholder="e.g. Chicken breast"
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="unit_of_measure">Unit</Label>
          <Input
            id="unit_of_measure"
            value={form.unit_of_measure}
            onChange={e => setForm({ ...form, unit_of_measure: e.target.value })}
            placeholder="kg, litre, unit"
            className="mt-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="current_stock">On hand</Label>
          <Input
            id="current_stock"
            type="number"
            min="0"
            value={form.current_stock}
            onChange={e => setForm({ ...form, current_stock: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cost_per_unit">Cost per unit (R) {pricingMode.label}</Label>
          <Input
            id="cost_per_unit"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_per_unit}
            onChange={e => setForm({ ...form, cost_per_unit: e.target.value })}
            placeholder="0.00"
            className="mt-1"
          />
          {Number(form.cost_per_unit) > 0 && (
            <p className="text-[11px] text-slate-500 mt-1">
              {pricingMode.mode === "inc"
                ? `= R${toExVat(Number(form.cost_per_unit), 0.15).toFixed(2)} ex VAT`
                : `= R${toIncVat(Number(form.cost_per_unit), 0.15).toFixed(2)} inc VAT`}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="minimum_stock">Reorder point</Label>
          <Input
            id="minimum_stock"
            type="number"
            min="0"
            value={form.minimum_stock}
            onChange={e => setForm({ ...form, minimum_stock: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="maximum_stock">Par level</Label>
          <Input
            id="maximum_stock"
            type="number"
            min="0"
            value={form.maximum_stock}
            onChange={e => setForm({ ...form, maximum_stock: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            value={form.sku}
            onChange={e => setForm({ ...form, sku: e.target.value })}
            placeholder="optional"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="storage_location">Storage location</Label>
          <Input
            id="storage_location"
            value={form.storage_location}
            onChange={e => setForm({ ...form, storage_location: e.target.value })}
            placeholder="e.g. Walk-in fridge"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="preferred_supplier_id">Preferred supplier</Label>
        <select
          id="preferred_supplier_id"
          value={form.preferred_supplier_id}
          onChange={e => setForm({ ...form, preferred_supplier_id: e.target.value })}
          className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">No preferred supplier</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
        </select>
        {suppliers.length === 0 && (
          <p className="text-[11px] text-slate-500 mt-1">
            No suppliers yet, add them in Shopping &gt; Suppliers, then come back here to link.
          </p>
        )}
      </div>
      {/* Allergen flags. Read by the menu-item save cross-check so the
          system warns when an ingredient contains an allergen the menu
          item is tagged free-of (e.g. gluten-free dish using flour). */}
      <div>
        <Label className="flex items-center gap-1">
          Contains allergens
          <span className="text-[11px] font-normal text-slate-500">(used by menu item warnings)</span>
        </Label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {INVENTORY_ALLERGEN_CODES.map(a => {
            const on = (form.allergen_codes || []).includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => setForm({
                  ...form,
                  allergen_codes: on
                    ? form.allergen_codes.filter(c => c !== a)
                    : [...form.allergen_codes, a],
                })}
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
      <BranchScopePicker form={form} setForm={setForm} />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Branch scoping picker for inventory items. Hides itself for
// single-branch tenants - "shared" is the only sensible value when
// there's nothing to split across.
function BranchScopePicker({
  form,
  setForm,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
}) {
  const { user } = useAuth() as any;
  const { kitchens } = useCompanyKitchens(user?.company_id ?? null);
  const branches = kitchens.filter((k) => k.source === "region");
  if (branches.length <= 1) return null;
  return (
    <div>
      <Label htmlFor="branch_scope">Branch</Label>
      <select
        id="branch_scope"
        value={(form as any).branch_scope || "shared"}
        onChange={(e) => setForm({ ...form, branch_scope: e.target.value } as any)}
        className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        <option value="shared">Shared (every branch can use this)</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name} only</option>
        ))}
      </select>
      <p className="text-[11px] text-slate-500 mt-1">
        Shared items show up in every branch's prep + shopping lists. Pinning to one branch
        keeps it out of the others.
      </p>
    </div>
  );
}

function ProtectedInventoryPage() {
  return (
    // INV2-A (inventory audit, INV2-3): admit region_admin (regional
    // RLS-narrowed view) + sales_admin (read-only context for quotes).
    // INV-C (task #188 must-fix, 2026-05-24): admit OWNER per
    // project_cateringms_owner_dashboard memo - owner is finance-
    // visible and behaves like company_admin.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <AdminInventory />
    </ProtectedRoute>
  );
}

// INV-C: this is now the only default export. The unprotected raw
// component is no longer exported directly.
export default ProtectedInventoryPage;

/**
 * Equipment-catalog summary strip rendered on the Inventory page.
 * Self-contained: fetches equipment + open hire-orders for the
 * current company, renders headline numbers + deep-links to
 * /admin/equipment and /admin/equipment/hire-orders.
 *
 * Slug-aware - the inventory page itself can be loaded via
 * /spit-braai-delivery/admin/inventory and the deep links keep the
 * tenant prefix.
 */
// INV-B: InventoryEquipmentStrip removed - equipment lives on
// /admin/equipment per the food-only product call.

/** At-risk inventory mini-table with sortable columns. Reads the same
 *  rows as the parent page and lets dispatch flick between sort by
 *  shortfall, demand or projected on-hand. */
function AtRiskTable({ rows }: { rows: any[] }) {
  const sortColumns: ColumnDef<any>[] = [
    { key: "item",      accessor: (r) => r.item_name,                          type: "string" },
    { key: "onhand",    accessor: (r) => Number(r.current_stock),              type: "number" },
    { key: "needed",    accessor: (r) => Number(r.demand_next_7_days),         type: "number" },
    { key: "projected", accessor: (r) => Number(r.projected_stock_after_7_days), type: "number" },
    { key: "status",    accessor: (r) => r.status,                             type: "string" },
  ];
  const sorted = useSortable<any>(rows, sortColumns, { defaultKey: "projected", defaultDir: "asc" });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <tr>
            <th className="text-left py-2 pr-3 font-medium">
              <SortHeader sortKey="item" activeKey={sorted.sortKey} activeDir={sorted.sortDir} onToggle={sorted.toggle}>Item</SortHeader>
            </th>
            <th className="text-right py-2 px-3 font-medium">
              <SortHeader sortKey="onhand" activeKey={sorted.sortKey} activeDir={sorted.sortDir} onToggle={sorted.toggle} align="right">On hand</SortHeader>
            </th>
            <th className="text-right py-2 px-3 font-medium">
              <SortHeader sortKey="needed" activeKey={sorted.sortKey} activeDir={sorted.sortDir} onToggle={sorted.toggle} align="right">Needed (7 days)</SortHeader>
            </th>
            <th className="text-right py-2 px-3 font-medium">
              <SortHeader sortKey="projected" activeKey={sorted.sortKey} activeDir={sorted.sortDir} onToggle={sorted.toggle} align="right">Projected on hand</SortHeader>
            </th>
            <th className="text-left py-2 pl-3 font-medium">
              <SortHeader sortKey="status" activeKey={sorted.sortKey} activeDir={sorted.sortDir} onToggle={sorted.toggle}>Status</SortHeader>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.rows.map((r: any) => {
            const tone =
              r.status === "shortfall" ? "bg-red-50 text-red-800 border-red-200" :
              r.status === "below_minimum" ? "bg-amber-50 text-amber-800 border-amber-200" :
              "bg-yellow-50 text-yellow-800 border-yellow-200";
            const projected = Number(r.projected_stock_after_7_days);
            const projectedTone = projected < 0
              ? "text-red-600 font-medium"
              : projected < Number(r.minimum_stock)
                ? "text-amber-600 font-medium"
                : "text-slate-900";
            const statusLabel =
              r.status === "shortfall"      ? "Will run out" :
              r.status === "below_minimum"  ? "Below reorder" :
              r.status === "low"            ? "Low" :
                                              r.status;
            return (
              <tr key={r.inventory_item_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-3 font-medium text-slate-900">{r.item_name}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {Number(r.current_stock).toLocaleString()} <span className="text-slate-400 text-xs">{r.unit_of_measure}</span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                  {Number(r.demand_next_7_days).toLocaleString()}
                </td>
                <td className={`py-2 px-3 text-right tabular-nums ${projectedTone}`}>
                  {projected.toLocaleString()}
                </td>
                <td className="py-2 pl-3">
                  <Badge variant="outline" className={`${tone} border`}>
                    {statusLabel}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
