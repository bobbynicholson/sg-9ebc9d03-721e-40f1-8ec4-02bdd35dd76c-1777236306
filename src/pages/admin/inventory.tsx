import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
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
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { inventoryService } from "@/services/inventoryService";
import { useAuth } from "@/contexts/AuthContext";
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
import { CycleCountDialog } from "@/components/admin/inventory/CycleCountDialog";
import { WriteOffDialog } from "@/components/admin/inventory/WriteOffDialog";
import { BulkActionsBar } from "@/components/admin/inventory/BulkActionsBar";
import { BulkReassignDialog } from "@/components/admin/inventory/BulkReassignDialog";
import { KeyboardShortcutsDialog } from "@/components/admin/inventory/KeyboardShortcutsDialog";
import { useInventoryViews, type SavedView } from "@/hooks/useInventoryViews";
import { Bookmark, BookmarkPlus, Keyboard } from "lucide-react";

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
};

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
  return new Date(iso).toLocaleDateString();
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

export default function AdminInventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = (user as any)?.company_id ?? null;
  const userId = user?.id ?? "";

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
  }>({ recipes: [], movements: [] });
  const [rowDetailLoading, setRowDetailLoading] = useState(false);

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
  }, [(user as any)?.company_id]);

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

      // Esc always works -- closes drawers, clears search
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

  const refreshAll = useCallback(() => {
    loadInventory();
    loadOutlook();
    loadLastActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ── Row expand: load recipes + movements lazily ────────────────
  const toggleRow = async (item: InventoryItem) => {
    if (expandedRowId === item.id) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(item.id);
    setRowDetail({ recipes: [], movements: [] });
    setRowDetailLoading(true);
    try {
      const [recipes, movements] = await Promise.all([
        inventoryService.getRecipesUsingItem(item.id),
        inventoryService.getMovementsForItem(item.id, 10),
      ]);
      setRowDetail({ recipes, movements });
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
      });
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
      });
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
      const result = await inventoryService.bulkDelete(ids);
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
    const headers = ["SKU", "Item name", "Category", "On hand", "Unit", "Reorder point", "Par level", "Cost per unit", "Supplier", "Storage location"];
    const escape = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = filteredInventory.map(item => [
      item.sku, item.name, item.category, item.quantity, item.unit,
      item.minStock, item.maxStock, item.costPerUnit, item.supplierName, item.storageLocation,
    ]);
    const csv = [headers, ...rows].map(row => row.map(escape).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const stockOnHandValue = useMemo(
    () => inventory.reduce((sum, item) => sum + item.quantity * item.costPerUnit, 0),
    [inventory],
  );

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
      <Head><title>Inventory - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 max-w-screen-2xl">

          {/* Compressed header */}
          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Inventory</h1>
                <p className="text-sm text-slate-500">
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
                  <InfoTooltip content="Items at or below their reorder point. Order these next." />
                </p>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{belowReorderCount}</p>
              <p className="text-xs text-slate-500 mt-1">
                {outOfStockItems.length > 0 ? `${outOfStockItems.length} fully out` : "Click to filter"}
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
                  <InfoTooltip content="Value of stock on hand at last cost. Sum of quantity × cost per unit across all items." />
                </p>
                <Package className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                R{stockOnHandValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">at last cost</p>
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
                {lastActivity ? relativeTime(lastActivity.created_at) : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {lastActivity?.item_name
                  ? `${readableTransactionType(lastActivity.transaction_type)} · ${lastActivity.item_name}`
                  : "no movements yet"}
              </p>
            </div>
          </div>

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
                  <Link href="/team-portal/shopping/alerts">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2 pr-3 font-medium">Item</th>
                        <th className="text-right py-2 px-3 font-medium">On hand</th>
                        <th className="text-right py-2 px-3 font-medium">Needed (7 days)</th>
                        <th className="text-right py-2 px-3 font-medium">Projected on hand</th>
                        <th className="text-left py-2 pl-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atRiskItems.slice(0, 12).map((r: any) => {
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
                <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  /
                </kbd>
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
                        {item.costPerUnit > 0 ? `R${item.costPerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                      </div>
                      <div className="min-w-0 text-sm text-slate-700 truncate">
                        {item.supplierName || <span className="text-slate-400">—</span>}
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

                            {/* Movement history */}
                            <div className="md:col-span-2">
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
          <ItemForm form={addForm} setForm={setAddForm} error={addError} />
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
          <ItemForm form={editForm} setForm={setEditForm} error={editError} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={editSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleEditSave} disabled={editSaving} className="bg-blue-600 hover:bg-blue-700">
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
            description: `${itemName}: ${qty} written off${costImpact > 0 ? ` · R${costImpact.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}`,
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
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  error: string;
}) {
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
          <Label htmlFor="cost_per_unit">Cost per unit (R)</Label>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ProtectedInventoryPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AdminInventory />
    </ProtectedRoute>
  );
}
