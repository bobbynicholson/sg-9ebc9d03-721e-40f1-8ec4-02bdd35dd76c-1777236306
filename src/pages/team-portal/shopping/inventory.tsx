import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Warehouse, Search, AlertTriangle, Pencil, Loader2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";

export default function ShoppingInventoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [belowParOnly, setBelowParOnly] = useState(false);

  const [editing, setEditing] = useState<Inventory | null>(null);
  const [newStock, setNewStock] = useState<string>("");
  const [adjustNotes, setAdjustNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    loadInventory();
  }, [user?.company_id]);

  const loadInventory = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const data = await inventoryService.getInventory(user.company_id);
      setItems(data);
    } catch (e) {
      console.error("Error loading inventory:", e);
      toast({ title: "Could not load inventory", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.category) set.add(i.category); });
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  // Apply non-search filters first, then fuzzy-rank.
  const preFilteredItems = useMemo(() => {
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (belowParOnly) {
        const stock = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        if (stock > min) return false;
      }
      return true;
    });
  }, [items, category, belowParOnly]);

  const filtered = useFuzzyItems(
    preFilteredItems,
    search,
    [
      { key: "item_name" as any, weight: 3 },
      { key: "sku" as any, weight: 2 },
      { key: "category" as any, weight: 2 },
      { key: "storage_location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const total = items.length;
    const below = items.filter((i) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0)).length;
    const out = items.filter((i) => Number(i.current_stock || 0) <= 0).length;
    const valueR = items.reduce((sum, i) => sum + (Number(i.current_stock || 0) * Number(i.cost_per_unit || 0)), 0);
    return { total, below, out, valueR };
  }, [items]);

  const openEdit = (item: Inventory) => {
    setEditing(item);
    setNewStock(String(item.current_stock ?? 0));
    setAdjustNotes("");
  };

  const closeEdit = () => {
    setEditing(null);
    setNewStock("");
    setAdjustNotes("");
  };

  const saveAdjustment = async () => {
    if (!editing || !user?.id) return;
    const target = Number(newStock);
    if (Number.isNaN(target) || target < 0) {
      toast({ title: "Invalid stock value", description: "Enter a non-negative number.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await inventoryService.adjustStock(editing.id, target, user.id, adjustNotes || undefined);
      toast({ title: "Stock updated", description: `${editing.item_name} -> ${target} ${editing.unit_of_measure}` });
      closeEdit();
      loadInventory();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const stockTone = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    if (stock <= 0) return "bg-rose-100 text-rose-700 border-rose-200";
    if (stock <= min) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  };

  const stockLabel = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    if (stock <= 0) return "Out of stock";
    if (stock <= min) return "Below par";
    return "In stock";
  };

  return (
    <>
      <Head>
        <title>Current Stock - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-screen-2xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent flex items-center gap-3">
                <Warehouse className="h-7 w-7 text-emerald-600" />
                Current Stock
              </h1>
              <p className="text-sm text-slate-600 mt-1">Live inventory levels, click any row to adjust stock with an audit entry</p>
            </div>
            {/* Phase 5 #5: one-click 'draft a reorder list' from
                every below-par inventory item. Lands a draft
                shopping_lists row the operator can edit before
                assigning. Hidden when there's nothing to reorder. */}
            {stats.below > 0 && (
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700 self-start sm:self-auto"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/admin/inventory/draft-reorder", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    const j = await res.json().catch(() => ({}));
                    if (!res.ok || !j.ok) {
                      throw new Error(j?.error || "Could not draft reorder");
                    }
                    toast({
                      title: "Reorder draft created",
                      description: `${j.item_count} item${j.item_count === 1 ? "" : "s"} on the list. Review supplier + quantity before assigning.`,
                    });
                    if (j.list_id) {
                      window.location.href = `/admin/shopping?listId=${j.list_id}`;
                    }
                  } catch (e: any) {
                    toast({
                      title: "Could not draft reorder",
                      description: e?.message || "Try again",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Draft reorder ({stats.below})
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600 flex items-center gap-1">Total items <InfoTooltip content="Number of active inventory lines on the books for your company." /></p>
                <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600 flex items-center gap-1">Below par <InfoTooltip content="Items at or below their minimum stock level.\n\nThese are the things to put on the next shopping run." /></p>
                <p className="text-2xl font-bold tabular-nums text-amber-600">{stats.below}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600 flex items-center gap-1">Out of stock <InfoTooltip content="Items that have run out completely.\n\nYou cannot fulfil orders that need these until they're restocked." /></p>
                <p className="text-2xl font-bold tabular-nums text-rose-600">{stats.out}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600 flex items-center gap-1">Stock value <InfoTooltip content="Total value of every item currently sitting in stock, based on the last known cost per unit." /></p>
                <p className="text-2xl font-bold tabular-nums">R {stats.valueR.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filter</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name, SKU, category, location..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={belowParOnly ? "default" : "outline"}
                onClick={() => setBelowParOnly((v) => !v)}
                className={belowParOnly ? "bg-amber-500 hover:bg-amber-600" : ""}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Below par only
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading inventory...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Warehouse className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No items match the current filter</p>
                  <p className="text-xs mt-1">Try clearing the search or category filter</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600">
                        <tr>
                          <th className="px-4 py-3"><span className="inline-flex items-center gap-1">Item <InfoTooltip content="The item's name and SKU code." /></span></th>
                          <th className="px-4 py-3"><span className="inline-flex items-center gap-1">Category <InfoTooltip content="Category used to group similar items together." /></span></th>
                          <th className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1">Stock <InfoTooltip content="How much of this item is sitting in stock right now." /></span></th>
                          <th className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1">Min <InfoTooltip content="The minimum level for this item.\n\nOnce stock dips below this, it's time to reorder." /></span></th>
                          <th className="px-4 py-3"><span className="inline-flex items-center gap-1">Status <InfoTooltip content="Quick read on the item: out of stock, below par, or in stock." /></span></th>
                          <th className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1">Cost / unit <InfoTooltip content="The last price you paid per unit.\n\nUsed to work out the total value of stock on hand." /></span></th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((i) => (
                          <tr key={i.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{i.item_name}</div>
                              {i.sku && <div className="text-xs text-slate-500">SKU {i.sku}</div>}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{i.category ?? "--"}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">
                              {Number(i.current_stock ?? 0)} <span className="text-xs font-normal text-slate-500">{i.unit_of_measure}</span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">{Number(i.minimum_stock ?? 0)}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={stockTone(i)}>{stockLabel(i)}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                              {i.cost_per_unit ? `R ${Number(i.cost_per_unit).toFixed(2)}` : "--"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(i)}>
                                <Pencil className="h-4 w-4 mr-1" /> Adjust
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {filtered.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => openEdit(i)}
                        className="w-full text-left p-4 hover:bg-slate-50 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 truncate">{i.item_name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{i.category ?? "--"}{i.sku ? `, SKU ${i.sku}` : ""}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className={stockTone(i)}>{stockLabel(i)}</Badge>
                            <span className="text-sm tabular-nums">
                              <span className="font-semibold">{Number(i.current_stock ?? 0)}</span>
                              <span className="text-slate-500"> / {Number(i.minimum_stock ?? 0)} {i.unit_of_measure}</span>
                            </span>
                          </div>
                        </div>
                        <Pencil className="h-4 w-4 text-slate-400 mt-1" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        <Footer />
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {editing && `${editing.item_name}, currently ${Number(editing.current_stock ?? 0)} ${editing.unit_of_measure}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="newStock">New stock level ({editing?.unit_of_measure})</Label>
              <Input
                id="newStock"
                type="number"
                min="0"
                step="any"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="notes">Reason (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g. spoilage, recount, supplier delivery"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancel</Button>
            <Button onClick={saveAdjustment} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving</> : "Save adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
