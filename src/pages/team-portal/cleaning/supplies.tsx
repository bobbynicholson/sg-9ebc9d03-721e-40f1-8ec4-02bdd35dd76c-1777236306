import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Wrench, Search, AlertTriangle, Loader2, Minus, RefreshCw } from "lucide-react";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

const CLEANING_KEYWORDS = [
  "detergent", "cleaner", "soap", "bleach", "sanitiser", "sanitizer",
  "cloth", "glove", "wipe", "mop", "broom", "spray", "polish", "degreaser",
  "cleaning", "disinfect", "scrubb", "rubber", "bin liner", "paper towel",
];

function CleaningSuppliesPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  // First successful load done: skeleton only before it, and realtime
  // refreshes swap data in place instead of blanking the list.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [belowParOnly, setBelowParOnly] = useState(false);

  const [usingItem, setUsingItem] = useState<Inventory | null>(null);
  const [usedQty, setUsedQty] = useState<string>("");
  const [usedNotes, setUsedNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  useEffect(() => {
    if (!user?.company_id) return;
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-supplies-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${user.company_id}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    if (!loaded) setLoading(true);
    try {
      const all = await inventoryService.getInventoryPublic(user.company_id);
      const cleaning = (all || []).filter((i) => {
        const cat = (i.category ?? "").toLowerCase();
        const name = (i.item_name ?? "").toLowerCase();
        if (cat.includes("clean") || cat.includes("consumable")) return true;
        return CLEANING_KEYWORDS.some((kw) => name.includes(kw));
      });
      setItems(cleaning);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Recovery card owns this state; never show an empty supplies
      // list for a failed load.
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
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
    if (!usingItem || !user?.id || saving) return;
    const qty = Number(usedQty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast({ title: "Enter a positive quantity", variant: "destructive" });
      return;
    }
    const current = Number(usingItem.current_stock || 0);
    if (qty > current) {
      toast({
        title: "Not enough stock on hand",
        description: `${usingItem.item_name} has ${current} ${usingItem.unit_of_measure || ""} available.`,
        variant: "destructive",
      });
      return;
    }
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
      void load();
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

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <CleaningPageShell
        pageTitle="Cleaning supplies - CateringMS"
        heading="Cleaning supplies"
        subheading={
          chipsReady
            ? stats.below > 0
              ? `${stats.below} of ${stats.total} supplies at or below par, low stock feeds straight to the shopping team.`
              : `All ${stats.total} supplies above par, nothing needs reordering.`
            : "Detergents, cloths, gloves, low-stock items feed straight to the shopping team."
        }
        icon={Wrench}
        meta={
          chipsReady ? (
            <>
              <span className={CLEANING_HERO_CHIP}>
                <Wrench className="h-3 w-3" />
                {stats.total} supplies
              </span>
              <span className={CLEANING_HERO_CHIP}>
                <span className={cn("h-1.5 w-1.5 rounded-full", stats.below > 0 ? "bg-amber-400" : "bg-emerald-400")} />
                {stats.below > 0 ? `${stats.below} low` : "None low"}
              </span>
              {stats.out > 0 && (
                <span className={CLEANING_HERO_CHIP}>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  {stats.out} out of stock
                </span>
              )}
            </>
          ) : undefined
        }
      >
        {/* Recovery card: the load failed. Never dress a failed load up
            as an empty supplies list. */}
        {loadError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load the supplies list</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
            <Button
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="bg-brand-primary hover:opacity-90 text-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatTile label="Total supplies" value={chipsReady ? stats.total : "--"} hint="On file" />
          <StatTile label="Low stock" value={chipsReady ? stats.below : "--"} hint="At or below par" />
          <StatTile label="Out of stock" value={chipsReady ? stats.out : "--"} hint="Run out" />
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
          {showSkeleton ? (
            <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading supplies">
              {[0, 1, 2, 3, 4].map((n) => (
                <div key={n} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          ) : loadError && items.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              The supplies list is unavailable right now. Use Retry above to reload it.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-6 text-slate-500 dark:text-slate-400">
              <Wrench className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-700 dark:text-slate-200">{belowParOnly || search ? "No supplies match this filter" : "No cleaning supplies found"}</p>
              <p className="text-xs mt-1">{belowParOnly || search ? "Clear the filter to see the full cleaning stock list" : "Add inventory items with category 'Cleaning' or 'Consumable' to populate this view"}</p>
              {(belowParOnly || search) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => { setSearch(""); setBelowParOnly(false); }}
                >
                  Clear filters
                </Button>
              )}
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
      </CleaningPageShell>

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

export default function CleaningSuppliesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLEANING_MANAGER, UserRole.CLEANING_STAFF, UserRole.ADMIN]}>
      <CleaningSuppliesPageInner />
    </ProtectedRoute>
  );
}
