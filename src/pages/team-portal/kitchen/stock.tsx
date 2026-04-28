import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Package, Search, AlertTriangle, Minus, Loader2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";

export default function KitchenStockPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [belowParOnly, setBelowParOnly] = useState(false);

  const [usingItem, setUsingItem] = useState<Inventory | null>(null);
  const [usedQty, setUsedQty] = useState<string>("");
  const [usedNotes, setUsedNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const data = await inventoryService.getInventory(user.company_id);
      setItems(data);
    } catch (e) {
      toast({ title: "Could not load stock", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.category) s.add(i.category); });
    return ["all", ...Array.from(s).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (belowParOnly) {
        const stock = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        if (stock > min) return false;
      }
      if (term) {
        const hay = `${i.item_name ?? ""} ${i.sku ?? ""} ${i.category ?? ""} ${i.storage_location ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, search, category, belowParOnly]);

  const stats = useMemo(() => {
    const total = items.length;
    const below = items.filter((i) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0)).length;
    const out = items.filter((i) => Number(i.current_stock || 0) <= 0).length;
    return { total, below, out };
  }, [items]);

  const openUse = (item: Inventory) => { setUsingItem(item); setUsedQty(""); setUsedNotes(""); };
  const closeUse = () => { setUsingItem(null); setUsedQty(""); setUsedNotes(""); };

  const saveUsage = async () => {
    if (!usingItem || !user?.id) return;
    const qty = Number(usedQty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast({ title: "Enter a positive quantity used", variant: "destructive" });
      return;
    }
    const current = Number(usingItem.current_stock || 0);
    const newStock = Math.max(0, current - qty);
    setSaving(true);
    try {
      await inventoryService.adjustStock(
        usingItem.id, newStock, user.id,
        usedNotes || `Kitchen used ${qty} ${usingItem.unit_of_measure}`,
      );
      toast({ title: "Stock updated", description: `${usingItem.item_name}: -${qty} ${usingItem.unit_of_measure}` });
      closeUse();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tone = (i: Inventory) => {
    const s = Number(i.current_stock || 0);
    const m = Number(i.minimum_stock || 0);
    if (s <= 0) return "bg-rose-100 text-rose-700 border-rose-200";
    if (s <= m) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  };
  const label = (i: Inventory) => {
    const s = Number(i.current_stock || 0);
    const m = Number(i.minimum_stock || 0);
    if (s <= 0) return "Out";
    if (s <= m) return "Below par";
    return "OK";
  };

  return (
    <>
      <Head><title>Kitchen Stock - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent flex items-center gap-3">
              <Package className="h-7 w-7 text-orange-600" />
              Kitchen Stock
            </h1>
            <p className="text-sm text-slate-600 mt-1">What you have on hand right now -- click any item to log what you used</p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Total items<InfoTooltip content="Every active line on inventory_items for this company. Source: inventoryService.getInventory()." /></p><p className="text-2xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Below par<InfoTooltip content="Items where current_stock is at or below minimum_stock. These need re-ordering." /></p><p className="text-2xl font-bold tabular-nums text-amber-600">{stats.below}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Out of stock<InfoTooltip content="Items where current_stock is zero or less. Cannot fulfil orders that need them." /></p><p className="text-2xl font-bold tabular-nums text-rose-600">{stats.out}</p></CardContent></Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Search by name, SKU, category..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant={belowParOnly ? "default" : "outline"} onClick={() => setBelowParOnly((v) => !v)} className={belowParOnly ? "bg-amber-500 hover:bg-amber-600" : ""}>
                <AlertTriangle className="h-4 w-4 mr-2" />Below par
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading stock...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Package className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No items match the current filter</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map((i) => (
                    <button key={i.id} onClick={() => openUse(i)} className="w-full text-left p-4 hover:bg-slate-50 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{i.item_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {i.category ?? "--"}
                          {i.storage_location ? ` -- ${i.storage_location}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Badge variant="outline" className={tone(i)}>{label(i)}</Badge>
                        <span className="text-right tabular-nums">
                          <span className="font-semibold text-base">{Number(i.current_stock ?? 0)}</span>
                          <span className="text-xs text-slate-500"> {i.unit_of_measure}</span>
                          <div className="text-[11px] text-slate-400">par {Number(i.minimum_stock ?? 0)}</div>
                        </span>
                        <Minus className="h-4 w-4 text-slate-400" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!usingItem} onOpenChange={(o) => !o && closeUse()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log usage</DialogTitle>
            <DialogDescription>
              {usingItem && `${usingItem.item_name} -- ${Number(usingItem.current_stock ?? 0)} ${usingItem.unit_of_measure} on hand`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="qty">Used ({usingItem?.unit_of_measure})</Label>
              <Input id="qty" type="number" min="0" step="any" value={usedQty} onChange={(e) => setUsedQty(e.target.value)} autoFocus placeholder="e.g. 2.5" />
            </div>
            <div>
              <Label htmlFor="notes">Reason (optional)</Label>
              <Input id="notes" placeholder="e.g. lunch service, prep for tomorrow" value={usedNotes} onChange={(e) => setUsedNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUse} disabled={saving}>Cancel</Button>
            <Button onClick={saveUsage} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving</> : "Log usage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
