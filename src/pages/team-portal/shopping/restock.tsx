/**
 * /team-portal/shopping/restock - proactive stock top-ups.
 *
 * The other buying surfaces (Buy list, Active shop) are ORDER-driven:
 * an order lands, demand is computed, a shopper buys against it. This
 * page is the other half - the shopper looking at the shelf, noticing a
 * recurring item is low, and buying it for stock off their own
 * judgement, with NO order attached.
 *
 * Suggestions are par-driven (current_stock <= minimum_stock, the exact
 * rule inventoryService.getLowStockItems uses, so "low" means the same
 * thing here as on Inventory and Buy list). Buying pushes the stock
 * straight into inventory_items via the canonical receiveStock path, so
 * the count updates everywhere at once with no divergent write. See
 * proactiveRestockService + memory project_shopping_proactive_restock.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
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
import {
  PackagePlus,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShoppingBasket,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { supabase } from "@/integrations/supabase/client";
import { inventoryService } from "@/services/inventoryService";
import {
  proactiveRestockService,
  type RestockSuggestion,
} from "@/services/shopping/proactiveRestockService";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";

function ShoppingRestockPageInner() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id || (user as any)?.company_id;
  const tenantCurrency = useTenantCurrency(companyId ?? null);

  const [rows, setRows] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplier_name: string }>>([]);

  // Buy modal state.
  const [buying, setBuying] = useState<RestockSuggestion | null>(null);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplierId, setSupplierId] = useState<string>("none");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    if (!companyId) return;
    try {
      const data = await proactiveRestockService.getSuggestions(companyId);
      setRows(data);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    }
  };

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadRows();
      // Suppliers for the buy modal's picker. Enrichment only - a
      // failure here just leaves the picker empty, never blocks a buy.
      try {
        const s = await inventoryService.getSuppliersForCompany(companyId);
        if (!cancelled) setSuppliers(s);
      } catch { /* non-fatal */ }
      if (!cancelled) setLoading(false);
    })();

    // Realtime: any inventory_items change for this company re-derives
    // the low-stock list (stock received, par edited, item added). The
    // low-stock rule lives server-side in getLowStockItems, so we just
    // re-fetch rather than mutate in place. Unique per-mount channel
    // suffix - a fixed name collides on fast remounts (repo bug class).
    const sb = supabase as any;
    const channel = sb
      .channel(`restock:${companyId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` },
        () => { void loadRows(); },
      )
      .subscribe();

    // Polled fallback for realtime reconnects / server-side bulk writes.
    const t = setInterval(() => { void loadRows(); }, 60_000);

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      r.itemName.toLowerCase().includes(term) ||
      (r.category || "").toLowerCase().includes(term));
  }, [rows, search]);

  // Estimated spend to bring every low item back up to its par level.
  const estToPar = useMemo(
    () => rows.reduce((acc, r) => acc + r.suggestedQty * r.costPerUnit, 0),
    [rows],
  );

  const openBuy = (row: RestockSuggestion) => {
    setBuying(row);
    setQty(String(row.suggestedQty || ""));
    setUnitCost(row.costPerUnit > 0 ? String(row.costPerUnit) : "");
    setSupplierId(row.preferredSupplierId || "none");
    setInvoiceNumber("");
    setNotes("");
    setReceiptFile(null);
  };

  const closeBuy = () => {
    if (saving) return;
    setBuying(null);
  };

  const lineTotal = useMemo(() => {
    const q = Number(qty) || 0;
    const c = Number(unitCost) || 0;
    return q > 0 && c > 0 ? q * c : 0;
  }, [qty, unitCost]);

  const confirmBuy = async () => {
    if (!buying || !companyId || !user?.id) return;
    const q = Number(qty) || 0;
    if (q <= 0) {
      toast({ title: "Enter a quantity", description: "How many units did you buy?", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Upload the receipt first (best-effort). A failed upload still
      // lets the buy through - the stock is physically in the building.
      let receipt: { path: string; url: string | null } | null = null;
      if (receiptFile) {
        receipt = await proactiveRestockService.uploadReceipt(companyId, receiptFile);
        if (!receipt) {
          toast({ title: "Receipt didn't upload", description: "Saving the stock anyway - you can re-file the receipt later.", });
        }
      }

      const chosenSupplier = suppliers.find(s => s.id === supplierId) || null;
      const result = await proactiveRestockService.purchase({
        companyId,
        performedBy: user.id,
        itemId: buying.id,
        itemName: buying.itemName,
        unit: buying.unit,
        qty: q,
        unitCost: unitCost ? Number(unitCost) : null,
        supplierId: supplierId === "none" ? null : supplierId,
        supplierName: chosenSupplier?.supplier_name ?? null,
        invoiceNumber: invoiceNumber.trim() || null,
        notes: notes.trim() || null,
        receipt,
      });

      if (!result.ok) {
        toast({
          title: "Couldn't add stock",
          description: result.errors[0] || "Please try again.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      toast({
        title: "Stock added",
        description: `${q} ${buying.unit} of ${buying.itemName} is now on hand.`,
      });
      setBuying(null);
      await loadRows();
    } catch (e: any) {
      toast({
        title: "Something went wrong",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const meta = loaded ? (
    <>
      <span className={SHOPPING_HERO_CHIP}>
        <AlertCircle className="h-3 w-3" />
        {rows.length} low item{rows.length === 1 ? "" : "s"}
      </span>
      {estToPar > 0 && (
        <span className={SHOPPING_HERO_CHIP}>
          <ShoppingBasket className="h-3 w-3" />
          {tenantCurrency.format(estToPar, 0)} to top up
        </span>
      )}
    </>
  ) : null;

  return (
    <ShoppingPageShell
      pageTitle="Restock - Shopping"
      heading="Restock"
      subheading="Top up low par-level stock off your own judgement - no order needed. Buying adds it straight to inventory."
      icon={PackagePlus}
      width="wide"
      meta={meta}
      headerAction={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { void loadRows(); }}
          className="gap-1.5"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      }
    >
      {loading && !loaded ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading low-stock items...
        </div>
      ) : loadError ? (
        <PortalCard padded={false} className="border-rose-200 dark:border-rose-900">
          <div className="p-6 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-3" />
            <p className="font-semibold text-rose-700 dark:text-rose-300">Couldn't load restock suggestions</p>
            <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => { void loadRows(); }}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        </PortalCard>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatTile
              icon={AlertCircle}
              label="Low items"
              value={String(rows.length)}
              hint="At or below par level"
            />
            <StatTile
              icon={ShoppingBasket}
              label="Est. cost to top up"
              value={estToPar > 0 ? tenantCurrency.format(estToPar, 0) : "--"}
              hint="Bring every low item back to par"
            />
          </div>

          <PortalCard>
            <PortalCardHeader title="Low par-level stock" />
            <p className="-mt-2 mb-4 text-sm text-muted-foreground">
              Items at or below their minimum. Buy for stock and it lands in inventory right away.
            </p>
            <div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items or category..."
                  className="pl-9"
                />
              </div>

              {visible.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-8 w-8 text-brand-primary mx-auto mb-3" />
                  <p className="font-semibold">
                    {rows.length === 0 ? "Everything's above par" : "No matches"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {rows.length === 0
                      ? "No items are sitting below their minimum stock right now."
                      : "Try a different search term."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {visible.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 sm:p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{r.itemName}</span>
                          {r.category && (
                            <Badge variant="outline" className="text-[11px]">{r.category}</Badge>
                          )}
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 text-[11px]">
                            {r.currentStock} / {r.minimumStock} {r.unit}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Suggested buy: <span className="font-medium text-foreground">{r.suggestedQty} {r.unit}</span>
                          {r.costPerUnit > 0 && <> · ~{tenantCurrency.format(r.suggestedQty * r.costPerUnit)}</>}
                        </p>
                      </div>
                      <Button size="sm" className="gap-1.5 shrink-0" onClick={() => openBuy(r)}>
                        <ShoppingBasket className="h-4 w-4" />
                        Buy for stock
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PortalCard>
        </div>
      )}

      {/* Buy-for-stock modal. */}
      <Dialog open={!!buying} onOpenChange={(o) => { if (!o) closeBuy(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buy for stock</DialogTitle>
            <DialogDescription>
              {buying
                ? `${buying.itemName} - currently ${buying.currentStock} ${buying.unit} on hand (par ${buying.minimumStock}). This adds straight to inventory, no order needed.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="restock-qty">Quantity ({buying?.unit})</Label>
                <Input
                  id="restock-qty"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="restock-cost">Unit cost ({tenantCurrency.symbol})</Label>
                <Input
                  id="restock-cost"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>

            {lineTotal > 0 && (
              <p className="text-sm text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{tenantCurrency.format(lineTotal)}</span>
              </p>
            )}

            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="No supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Adding a supplier + cost raises a payable so finance can settle it.
              </p>
            </div>

            <div>
              <Label htmlFor="restock-invoice">Invoice / reference</Label>
              <Input
                id="restock-invoice"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="optional"
              />
            </div>

            <div>
              <Label htmlFor="restock-receipt" className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" /> Receipt photo
              </Label>
              <Input
                id="restock-receipt"
                type="file"
                accept="image/*"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              {receiptFile && (
                <p className="text-[11px] text-muted-foreground mt-1 truncate">Attached: {receiptFile.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="restock-notes">Notes</Label>
              <Input
                id="restock-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeBuy} disabled={saving}>Cancel</Button>
            <Button onClick={() => { void confirmBuy(); }} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? "Adding..." : "Add to stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ShoppingPageShell>
  );
}

export default function ShoppingRestockPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingRestockPageInner />
    </ProtectedRoute>
  );
}
