import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Wrench, Search, AlertTriangle, Loader2, Minus } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { PortalShell, PortalHeader, PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";

const CLEANING_KEYWORDS = [
  "detergent", "cleaner", "soap", "bleach", "sanitiser", "sanitizer",
  "cloth", "glove", "wipe", "mop", "broom", "spray", "polish", "degreaser",
  "cleaning", "disinfect", "scrubb", "rubber", "bin liner", "paper towel",
];

export default function CleaningSuppliesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
      const all = await inventoryService.getInventoryPublic(user.company_id);
      const cleaning = (all || []).filter((i) => {
        const cat = (i.category ?? "").toLowerCase();
        const name = (i.item_name ?? "").toLowerCase();
        if (cat.includes("clean") || cat.includes("consumable")) return true;
        return CLEANING_KEYWORDS.some((kw) => name.includes(kw));
      });
      setItems(cleaning);
    } catch (e) {
      toast({ title: "Could not load supplies", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const preFiltered = useMemo(() => {
    return items.filter((i) => {
      if (belowParOnly) {
        const stock = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        if (stock > min) return false;
      }
      return true;
    });
  }, [items, belowParOnly]);

  const filtered = useFuzzyItems(
    preFiltered,
    search,
    [
      { key: "item_name" as any, weight: 3 },
      { key: "category" as any, weight: 2 },
      { key: "storage_location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const total = items.length;
    const below = items.filter((i) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0)).length;
    const out = items.filter((i) => Number(i.current_stock || 0) <= 0).length;
    return { total, below, out };
  }, [items]);

  const openUse = (i: Inventory) => { setUsingItem(i); setUsedQty(""); setUsedNotes(""); };
  const closeUse = () => { setUsingItem(null); setUsedQty(""); setUsedNotes(""); };

  const saveUsage = async () => {
    if (!usingItem || !user?.id) return;
    const qty = Number(usedQty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast({ title: "Enter a positive quantity", variant: "destructive" });
      return;
    }
    const current = Number(usingItem.current_stock || 0);
    const newStock = Math.max(0, current - qty);
    setSaving(true);
    try {
      await inventoryService.adjustStock(
        usingItem.id, newStock, user.id,
        usedNotes || `Cleaning used ${qty} ${usingItem.unit_of_measure}`,
        "usage",
      );
      toast({ title: "Logged", description: `${usingItem.item_name}: -${qty} ${usingItem.unit_of_measure}` });
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
    if (s <= 0) return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900";
    if (s <= m) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900";
    return "bg-brand-primary/15 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30";
  };
  const label = (i: Inventory) => {
    const s = Number(i.current_stock || 0);
    const m = Number(i.minimum_stock || 0);
    if (s <= 0) return "Out";
    if (s <= m) return "Low";
    return "OK";
  };

  return (
    <>
      <Head><title>Cleaning supplies - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Cleaning supplies"
            subtitle="Detergents, cloths, gloves, low-stock items feed straight to the shopping team"
            icon={Wrench}
          />

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <StatTile label="Total supplies" value={stats.total} hint="On file" />
            <StatTile label="Low stock" value={stats.below} hint="At or below par" />
            <StatTile label="Out of stock" value={stats.out} hint="Run out" />
          </div>

          <PortalCard className="mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input placeholder="Search by name, category, location..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button variant={belowParOnly ? "default" : "outline"} onClick={() => setBelowParOnly((v) => !v)} className={belowParOnly ? "bg-brand-primary hover:bg-brand-primary/90" : ""}>
                <AlertTriangle className="h-4 w-4 mr-2" />Low only
              </Button>
            </div>
          </PortalCard>

          <PortalCard padded={false}>
            {loading ? (
              <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading supplies">
                {[0, 1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <Wrench className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-medium text-slate-700 dark:text-slate-200">No cleaning supplies found</p>
                <p className="text-xs mt-1">Add inventory items with category 'Cleaning' or 'Consumable' to populate this view</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((i) => (
                  <button key={i.id} onClick={() => openUse(i)} className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 dark:text-white truncate">{i.item_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {i.category ?? "--"}
                        {i.storage_location ? `, ${i.storage_location}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge variant="outline" className={tone(i)}>{label(i)}</Badge>
                      <span className="text-right tabular-nums">
                        <span className="text-base font-semibold text-slate-900 dark:text-white">{Number(i.current_stock ?? 0)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400"> {i.unit_of_measure}</span>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">par {Number(i.minimum_stock ?? 0)}</div>
                      </span>
                      <Minus className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </PortalCard>
        </PortalShell>
      </main>

      <Dialog open={!!usingItem} onOpenChange={(o) => !o && closeUse()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log usage</DialogTitle>
            <DialogDescription>{usingItem && `${usingItem.item_name}, ${Number(usingItem.current_stock ?? 0)} ${usingItem.unit_of_measure} on hand`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="qty">Used ({usingItem?.unit_of_measure})</Label>
              <Input id="qty" type="number" min="0" step="any" value={usedQty} onChange={(e) => setUsedQty(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="nt">Reason (optional)</Label>
              <Input id="nt" value={usedNotes} onChange={(e) => setUsedNotes(e.target.value)} placeholder="e.g. shift cleanup, deep clean" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUse} disabled={saving}>Cancel</Button>
            <Button onClick={saveUsage} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Log usage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
