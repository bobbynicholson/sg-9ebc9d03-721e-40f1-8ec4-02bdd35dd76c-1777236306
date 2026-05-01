/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ReconcileSlipDrawer -- the bridge between AI-extracted slip lines
 * and the two systems they need to feed:
 *   1. purchase_receipts + purchase_receipt_items (tax-deductibility log)
 *   2. inventory_items via receiveStock() (stock + batches + transactions)
 *
 * Opens after an operator has scanned a slip on /admin/shopping or
 * /admin/tax-purchases. Each line shows the AI's tax classification
 * (override-able) and an inventory match (typeahead with 'Create new'
 * fallback). The operator confirms; we persist atomically per line.
 *
 * The image is left where the upload handler put it (imports/ bucket).
 * We stamp a signed URL as image_url so the operator can view the
 * slip from /admin/tax-purchases without bucket fiddling.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Save, Trash2, Plus, Loader2, Search, Package, Receipt as ReceiptIcon } from "lucide-react";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { inventoryService } from "@/services/inventoryService";

interface ExtractionLine {
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  tax_category_code?: string | null;
  is_deductible?: boolean | null;
  match_confidence?: number | null;
}

interface Extraction {
  supplier_name: string | null;
  supplier_vat_number: string | null;
  receipt_date: string | null;
  receipt_number: string | null;
  total: number | null;
  subtotal: number | null;
  vat: number | null;
  payment_method: string | null;
  line_items: ExtractionLine[];
}

interface SourceData {
  filename?: string;
  mime?: string;
  bytes?: number;
  storage_path?: string;
}

interface InventoryRef {
  id: string;
  item_name: string;
  unit_of_measure: string | null;
  current_stock: number;
}

interface TaxRule {
  id: string;
  category_code: string;
  display_name: string;
  group_label: string;
  deductibility: "deductible" | "partial" | "non_deductible";
}

interface LineState {
  keep: boolean;
  description: string;
  amount: number;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rule_id: string | null;
  is_deductible: boolean;
  inventory_item_id: string | null;
  inventory_query: string;
  create_new_name: string;
  add_to_stock: boolean;
}

const fmtR = (v: number | null | undefined) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReconcileSlipDrawer({
  open, onClose, onSaved, mappedData, sourceData, companyId, userId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mappedData: Extraction | null;
  sourceData: SourceData | null;
  companyId: string;
  userId: string;
}) {
  const { toast } = useToast();
  const [vendor, setVendor] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [total, setTotal] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [inventory, setInventory] = useState<InventoryRef[]>([]);
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [saving, setSaving] = useState(false);

  // Seed form state from the extraction whenever the drawer opens.
  useEffect(() => {
    if (!open || !mappedData) return;
    setVendor(mappedData.supplier_name || "");
    setReceiptDate(mappedData.receipt_date || new Date().toISOString().slice(0, 10));
    setReceiptNumber(mappedData.receipt_number || "");
    setTotal(mappedData.total != null ? String(mappedData.total) : "");
    setNotes("");
    setLines((mappedData.line_items || []).map((li) => ({
      keep: true,
      description: li.description || "",
      amount: Number(li.line_total ?? li.unit_price ?? 0),
      quantity: Number(li.quantity ?? 1),
      unit: li.unit || "ea",
      unit_price: Number(li.unit_price ?? li.line_total ?? 0),
      tax_rule_id: null, // resolved once rules load (uses tax_category_code)
      is_deductible: li.is_deductible ?? true,
      inventory_item_id: null,
      inventory_query: "",
      create_new_name: "",
      add_to_stock: false,
    })));
  }, [open, mappedData]);

  // Load inventory + rules once the drawer is open.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      const [invRes, rulesRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, item_name, unit_of_measure, current_stock")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("item_name"),
        supabase
          .from("sa_tax_deductibility_rules")
          .select("id, category_code, display_name, group_label, deductibility")
          .eq("is_active", true)
          .order("display_order"),
      ]);
      if (cancelled) return;
      const inv = (invRes.data || []) as InventoryRef[];
      const rs = (rulesRes.data || []) as TaxRule[];
      setInventory(inv);
      setRules(rs);

      // Resolve AI-suggested tax_category_code -> rule id, and try to
      // fuzzy-match each line's description to an inventory item.
      setLines((prev) => prev.map((ln, i) => {
        const aiLine = mappedData?.line_items?.[i];
        const ruleByCode = aiLine?.tax_category_code
          ? rs.find((r) => r.category_code === aiLine.tax_category_code)
          : null;
        const desc = (ln.description || "").toLowerCase();
        const invMatch = inv.find((it) =>
          desc.includes(it.item_name.toLowerCase()) ||
          it.item_name.toLowerCase().includes(desc.split(" ")[0] || "_____"),
        );
        return {
          ...ln,
          tax_rule_id: ruleByCode?.id ?? null,
          is_deductible: ruleByCode ? ruleByCode.deductibility !== "non_deductible" : ln.is_deductible,
          inventory_item_id: invMatch?.id ?? null,
          inventory_query: invMatch?.item_name || ln.description,
          add_to_stock: !!invMatch,
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [open, companyId, mappedData]);

  const setLine = (idx: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSave = async () => {
    if (!companyId || !userId) {
      toast({ title: "Missing session", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // 1) Best-effort signed URL of the slip image so /admin/tax-purchases
      //    can show it. Imports bucket is private, so we sign for ~10 yrs.
      let imagePath: string | null = sourceData?.storage_path || null;
      let imageUrl: string | null = null;
      if (imagePath) {
        try {
          const { data: signed } = await supabase.storage
            .from("imports")
            .createSignedUrl(imagePath, 60 * 60 * 24 * 365 * 10);
          if (signed?.signedUrl) imageUrl = signed.signedUrl;
        } catch { /* non-fatal */ }
      }

      // 2) Create the receipt row.
      const totalNum = total ? Number(total) : null;
      const { data: receipt, error: rcptErr } = await supabase
        .from("purchase_receipts")
        .insert({
          company_id: companyId,
          uploaded_by: userId,
          vendor: vendor.trim() || null,
          receipt_date: receiptDate || null,
          total: totalNum,
          notes: notes.trim() || null,
          image_path: imagePath,
          image_url: imageUrl,
        })
        .select()
        .single();
      if (rcptErr || !receipt) throw new Error(rcptErr?.message || "Couldn't create receipt");
      const receiptId = (receipt as any).id as string;

      // 3) For lines flagged as 'add to stock' but with no existing
      //    inventory_item_id (operator opted into Create-new), insert
      //    the inventory item first so we have an id to reference.
      const kept = lines.filter((l) => l.keep);
      const itemsToInsert: any[] = [];
      const stockReceives: Array<{ itemId: string; qty: number; unitCost: number }> = [];

      for (const ln of kept) {
        let inventoryItemId: string | null = ln.inventory_item_id;

        if (ln.add_to_stock && !inventoryItemId && ln.create_new_name.trim()) {
          const { data: newInv, error: invErr } = await supabase
            .from("inventory_items")
            .insert({
              company_id: companyId,
              item_name: ln.create_new_name.trim(),
              unit_of_measure: ln.unit || "ea",
              current_stock: 0,
              cost_per_unit: ln.unit_price || null,
              category: rules.find((r) => r.id === ln.tax_rule_id)?.group_label || null,
            })
            .select("id")
            .single();
          if (invErr || !newInv) {
            toast({ title: "Couldn't create inventory item", description: invErr?.message, variant: "destructive" });
            continue;
          }
          inventoryItemId = (newInv as any).id;
        }

        const rule = rules.find((r) => r.id === ln.tax_rule_id) || null;

        const willReceive = ln.add_to_stock && !!inventoryItemId && ln.quantity > 0;
        if (willReceive && inventoryItemId) {
          stockReceives.push({ itemId: inventoryItemId, qty: ln.quantity, unitCost: ln.unit_price || 0 });
        }

        itemsToInsert.push({
          receipt_id: receiptId,
          description: ln.description,
          amount: ln.amount,
          is_deductible: ln.is_deductible,
          category: rule?.display_name || null,
          suggested_rule_id: rule?.id || null,
          inventory_item_id: inventoryItemId,
          quantity: ln.quantity || null,
          unit_of_measure: ln.unit || null,
          unit_price: ln.unit_price || null,
          inventory_received_at: willReceive ? new Date().toISOString() : null,
        });
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from("purchase_receipt_items")
          .insert(itemsToInsert);
        if (itemsErr) throw new Error(itemsErr.message);
      }

      // 4) Receive into stock for the flagged lines. Single batched
      //    call so we get one transaction per line.
      if (stockReceives.length > 0) {
        const result = await inventoryService.receiveStock({
          companyId,
          supplierId: null,
          invoiceNumber: receiptNumber || `slip-${receiptId.slice(0, 8)}`,
          receivedDate: receiptDate || new Date().toISOString().slice(0, 10),
          performedBy: userId,
          notes: vendor ? `From ${vendor}` : null,
          lines: stockReceives.map((s) => ({
            itemId: s.itemId,
            qty: s.qty,
            unitCost: s.unitCost || null,
          })),
        });
        if (result.errors.length > 0) {
          toast({
            title: `Receipt saved, ${result.received} of ${stockReceives.length} stock lines failed`,
            description: result.errors.slice(0, 2).join(" · "),
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Slip reconciled",
        description: `${itemsToInsert.length} line${itemsToInsert.length === 1 ? "" : "s"} saved · ${stockReceives.length} into stock`,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message || "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const ruleOptions = useMemo(() => rules, [rules]);

  return (
    <ComposeDrawerHost open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ReceiptIcon className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-bold text-slate-900">Reconcile slip</h2>
        </div>
        <p className="text-sm text-slate-600 -mt-2">
          Confirm each line's tax tag and, if it's something you stock, link it to inventory.
          Lines you tick &lsquo;Add to stock&rsquo; will be received against your inventory at the unit price shown.
        </p>

        {/* Receipt header */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Vendor</label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Receipt date</label>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Receipt #</label>
              <Input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} className="mt-1" placeholder="(optional)" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Total (R)</label>
              <Input type="number" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <div className="space-y-3">
          {lines.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No line items extracted from this slip.</p>
          ) : lines.map((ln, idx) => {
            const matchedRule = rules.find((r) => r.id === ln.tax_rule_id) || null;
            const filteredInventory = inventory.filter((it) =>
              !ln.inventory_query
                ? true
                : it.item_name.toLowerCase().includes(ln.inventory_query.toLowerCase()),
            ).slice(0, 6);
            const ruleTone =
              matchedRule?.deductibility === "deductible" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
              matchedRule?.deductibility === "partial" ? "bg-amber-100 text-amber-700 border-amber-200" :
              matchedRule?.deductibility === "non_deductible" ? "bg-rose-100 text-rose-700 border-rose-200" :
              "bg-slate-100 text-slate-600 border-slate-200";

            return (
              <Card key={idx} className={`border-l-4 ${ln.keep ? "border-l-purple-500" : "border-l-slate-200 opacity-60"}`}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{ln.description || "(no description)"}</p>
                      <p className="text-xs text-slate-500">
                        {fmtR(ln.unit_price)} × {ln.quantity} {ln.unit} = <strong>{fmtR(ln.amount)}</strong>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setLine(idx, { keep: !ln.keep })}
                      title={ln.keep ? "Drop this line" : "Keep this line"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {ln.keep && (
                    <>
                      {/* Tax rule */}
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Tax rule
                        </label>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {matchedRule && (
                            <Badge variant="outline" className={`${ruleTone} border`}>
                              {matchedRule.display_name}
                            </Badge>
                          )}
                          <select
                            value={ln.tax_rule_id ?? ""}
                            onChange={(e) => {
                              const newRule = rules.find((r) => r.id === e.target.value) || null;
                              setLine(idx, {
                                tax_rule_id: newRule?.id || null,
                                is_deductible: newRule ? newRule.deductibility !== "non_deductible" : true,
                              });
                            }}
                            className="text-xs rounded-md border border-slate-200 px-2 py-1 bg-white"
                          >
                            <option value="">— No rule —</option>
                            {ruleOptions.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.group_label} · {r.display_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Inventory match */}
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 flex items-center gap-1">
                          <Package className="w-3 h-3" /> Inventory item
                        </label>
                        <div className="relative mt-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <Input
                            value={ln.inventory_query}
                            onChange={(e) => setLine(idx, { inventory_query: e.target.value, inventory_item_id: null })}
                            placeholder="Search or type a new name"
                            className="pl-8"
                          />
                        </div>
                        {ln.inventory_query && !ln.inventory_item_id && (
                          <div className="mt-1 rounded-lg border border-slate-200 bg-white max-h-40 overflow-y-auto">
                            {filteredInventory.length > 0 ? filteredInventory.map((it) => (
                              <button
                                key={it.id}
                                type="button"
                                onClick={() => setLine(idx, {
                                  inventory_item_id: it.id,
                                  inventory_query: it.item_name,
                                  unit: it.unit_of_measure || ln.unit,
                                })}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center justify-between"
                              >
                                <span>{it.item_name}</span>
                                <span className="text-xs text-slate-500">{it.current_stock} {it.unit_of_measure}</span>
                              </button>
                            )) : (
                              <button
                                type="button"
                                onClick={() => setLine(idx, { create_new_name: ln.inventory_query, add_to_stock: true })}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 text-emerald-700 inline-flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" /> Create &ldquo;{ln.inventory_query}&rdquo;
                              </button>
                            )}
                          </div>
                        )}
                        {ln.create_new_name && !ln.inventory_item_id && (
                          <p className="mt-1 text-[11px] text-emerald-700">
                            Will create new inventory item: <strong>{ln.create_new_name}</strong>
                          </p>
                        )}
                      </div>

                      {/* Add-to-stock + qty/unit/price */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Qty</label>
                          <Input
                            type="number" inputMode="decimal"
                            value={ln.quantity}
                            onChange={(e) => setLine(idx, { quantity: Number(e.target.value) || 0 })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Unit</label>
                          <Input
                            value={ln.unit}
                            onChange={(e) => setLine(idx, { unit: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Unit price (R)</label>
                          <Input
                            type="number" inputMode="decimal"
                            value={ln.unit_price}
                            onChange={(e) => setLine(idx, { unit_price: Number(e.target.value) || 0 })}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={ln.add_to_stock}
                          onChange={(e) => setLine(idx, { add_to_stock: e.target.checked })}
                          disabled={!ln.inventory_item_id && !ln.create_new_name.trim()}
                        />
                        <span>
                          Add to stock
                          {!ln.inventory_item_id && !ln.create_new_name.trim() && (
                            <span className="text-xs text-slate-500 ml-1">(pick or create an inventory item first)</span>
                          )}
                        </span>
                      </label>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 -mx-2 px-2 py-3 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || lines.filter((l) => l.keep).length === 0}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-1.5" /> Save & receive</>}
          </Button>
        </div>
      </div>
    </ComposeDrawerHost>
  );
}
