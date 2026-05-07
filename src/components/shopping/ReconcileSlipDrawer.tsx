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
import { toLocalISO } from "@/lib/localDate";

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

const EMPTY_LINE: LineState = {
  keep: true,
  description: "",
  amount: 0,
  quantity: 1,
  unit: "ea",
  unit_price: 0,
  tax_rule_id: null,
  is_deductible: true,
  inventory_item_id: null,
  inventory_query: "",
  create_new_name: "",
  add_to_stock: false,
};

const fmtR = (v: number | null | undefined) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReconcileSlipDrawer({
  open, onClose, onSaved, mappedData, sourceData, companyId, userId, manualMode, existingReceiptId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mappedData: Extraction | null;
  sourceData: SourceData | null;
  companyId: string;
  userId: string;
  /** True when the operator is keying a slip in by hand instead of
   *  scanning. Drawer starts blank and exposes Add-line + vendor
   *  autocomplete from past receipts. */
  manualMode?: boolean;
  /** When set, the drawer is rescanning an existing purchase_receipts
   *  row. Save updates the existing row's header fields and inserts
   *  the new line items into it instead of creating a new receipt. */
  existingReceiptId?: string;
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
  // Memory: vendors + descriptions seen on past receipts in this
  // company. Powers the typeaheads in manual mode and improves
  // suggestion quality on every fresh slip.
  const [pastVendors, setPastVendors] = useState<string[]>([]);
  const [pastDescriptions, setPastDescriptions] = useState<string[]>([]);

  // Seed form state whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    if (manualMode || !mappedData) {
      // Manual mode (or no extraction available): blank slate, one
      // empty line ready for input.
      setVendor("");
      setReceiptDate(toLocalISO(new Date()));
      setReceiptNumber("");
      setTotal("");
      setNotes("");
      setLines([{ ...EMPTY_LINE }]);
      return;
    }
    setVendor(mappedData.supplier_name || "");
    setReceiptDate(mappedData.receipt_date || toLocalISO(new Date()));
    setReceiptNumber(mappedData.receipt_number || "");
    setTotal(mappedData.total != null ? String(mappedData.total) : "");
    setNotes("");
    setLines((mappedData.line_items || []).map((li) => {
      // The rescan API now returns three optional carryovers per line:
      //   existing_inventory_item_id, existing_suggested_rule_id,
      //   existing_is_draft
      // Populated either from the operator's previous mapping (memory)
      // or from a draft that was already persisted on a prior visit.
      // We honour them as the starting point so reopening the drawer
      // shows exactly what was last on screen.
      const li2 = li as any;
      return {
        keep: true,
        description: li.description || "",
        amount: Number(li.line_total ?? li.unit_price ?? 0),
        quantity: Number(li.quantity ?? 1),
        unit: li.unit || "ea",
        unit_price: Number(li.unit_price ?? li.line_total ?? 0),
        tax_rule_id: li2.existing_suggested_rule_id ?? null,
        is_deductible: li.is_deductible ?? true,
        inventory_item_id: li2.existing_inventory_item_id ?? null,
        inventory_query: "",
        create_new_name: "",
        add_to_stock: !!li2.existing_inventory_item_id,
      };
    }));
  }, [open, mappedData, manualMode]);

  // Load inventory + rules + past-vendor/description memory.
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      const [invRes, rulesRes, vendorsRes, descsRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, item_name, unit_of_measure, current_stock")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("item_name"),
        supabase
          .from("sa_tax_deductibility_rules")
          .select("id, category_code, display_name, group_label, deductibility, match_keywords")
          .eq("is_active", true)
          .order("display_order"),
        // Last 200 receipts -- gives us the recent-vendor list so the
        // operator doesn't keep retyping "Pick n Pay" or "Makro".
        supabase
          .from("purchase_receipts")
          .select("vendor")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .not("vendor", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        // Recent line descriptions from this tenant -- useful as auto-
        // suggestions when the operator starts typing a description.
        (supabase as any)
          .from("purchase_receipt_items")
          .select("description, purchase_receipts!inner(company_id, deleted_at)")
          .eq("purchase_receipts.company_id", companyId)
          .is("purchase_receipts.deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (cancelled) return;
      const inv = (invRes.data || []) as InventoryRef[];
      const rs = (rulesRes.data || []) as unknown as (TaxRule & { match_keywords: string[] })[];
      setInventory(inv);
      setRules(rs as any);
      // Dedupe vendor / description memory, ordered by recency.
      const vendorSet = new Set<string>();
      (vendorsRes.data || []).forEach((r: any) => { if (r.vendor) vendorSet.add(r.vendor); });
      setPastVendors(Array.from(vendorSet).slice(0, 30));
      const descSet = new Set<string>();
      (descsRes.data || []).forEach((r: any) => { if (r.description) descSet.add(r.description); });
      setPastDescriptions(Array.from(descSet).slice(0, 100));

      // Resolve AI-suggested tax_category_code -> rule id, and try to
      // fuzzy-match each line's description to an inventory item --
      // but only when the line doesn't already have a tax_rule_id /
      // inventory_item_id from the rescan API (memory carryover or
      // existing draft). Honouring the prior choice trumps re-deriving
      // a fresh fuzzy match every time.
      setLines((prev) => prev.map((ln, i) => {
        const aiLine = mappedData?.line_items?.[i];
        const desc = (ln.description || "").toLowerCase();

        let nextRuleId = ln.tax_rule_id;
        let nextIsDeductible = ln.is_deductible;
        if (!nextRuleId) {
          const ruleByCode = aiLine?.tax_category_code
            ? rs.find((r) => r.category_code === aiLine.tax_category_code)
            : null;
          if (ruleByCode) {
            nextRuleId = ruleByCode.id;
            nextIsDeductible = ruleByCode.deductibility !== "non_deductible";
          }
        }

        let nextInvId = ln.inventory_item_id;
        let nextInvQuery = ln.inventory_query;
        let nextAddToStock = ln.add_to_stock;
        if (!nextInvId) {
          const invMatch = inv.find((it) =>
            desc.includes(it.item_name.toLowerCase()) ||
            it.item_name.toLowerCase().includes(desc.split(" ")[0] || "_____"),
          );
          if (invMatch) {
            nextInvId = invMatch.id;
            nextInvQuery = invMatch.item_name;
            nextAddToStock = true;
          } else {
            nextInvQuery = nextInvQuery || ln.description;
          }
        } else {
          // Carryover gave us an id -- look up the name for the input.
          const matched = inv.find((it) => it.id === nextInvId);
          if (matched) nextInvQuery = matched.item_name;
        }

        return {
          ...ln,
          tax_rule_id: nextRuleId,
          is_deductible: nextIsDeductible,
          inventory_item_id: nextInvId,
          inventory_query: nextInvQuery,
          add_to_stock: nextAddToStock,
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [open, companyId, mappedData]);

  const setLine = (idx: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  /** Local keyword match from description -> rule. Used in manual mode
   *  where there's no AI suggestion. Picks the rule with the most
   *  keyword hits in the description, ties broken by display_order. */
  const suggestRuleFromDescription = (desc: string): TaxRule | null => {
    const d = desc.toLowerCase();
    if (!d) return null;
    let best: TaxRule | null = null;
    let bestScore = 0;
    for (const r of rules) {
      const kws = (r as any).match_keywords as string[] | undefined;
      if (!kws) continue;
      let score = 0;
      for (const kw of kws) {
        if (kw && d.includes(kw.toLowerCase())) score += 1;
      }
      if (score > bestScore) { best = r; bestScore = score; }
    }
    return best;
  };

  /** When the operator types a description in manual mode, try to
   *  auto-suggest the tax rule and an inventory match. */
  const onDescriptionChange = (idx: number, desc: string) => {
    const ruleSuggestion = suggestRuleFromDescription(desc);
    const dl = desc.toLowerCase();
    const invMatch = inventory.find((it) =>
      dl && (it.item_name.toLowerCase().includes(dl.split(" ")[0] || "_____") || dl.includes(it.item_name.toLowerCase())),
    );
    setLine(idx, {
      description: desc,
      tax_rule_id: ruleSuggestion?.id ?? null,
      is_deductible: ruleSuggestion ? ruleSuggestion.deductibility !== "non_deductible" : true,
      inventory_item_id: invMatch?.id ?? null,
      inventory_query: invMatch?.item_name || desc,
      add_to_stock: !!invMatch,
    });
  };

  const addBlankLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);

  const handleSave = async () => {
    if (!companyId || !userId) {
      toast({ title: "Missing session", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // 1) Best-effort signed URL of the slip image so /admin/tax-purchases
      //    can show it. Imports bucket is private, so we sign for ~10 yrs.
      const imagePath: string | null = sourceData?.storage_path || null;
      let imageUrl: string | null = null;
      if (imagePath) {
        try {
          const { data: signed } = await supabase.storage
            .from("imports")
            .createSignedUrl(imagePath, 60 * 60 * 24 * 365 * 10);
          if (signed?.signedUrl) imageUrl = signed.signedUrl;
        } catch { /* non-fatal */ }
      }

      // Resolve supplier_id from vendor name (case-insensitive exact
      // match within this tenant's suppliers). Anything fuzzier the
      // operator can fix later from /admin/suppliers.
      let supplierId: string | null = null;
      if (vendor.trim()) {
        const { data: supplierMatch } = await supabase
          .from("suppliers")
          .select("id")
          .eq("company_id", companyId)
          .ilike("supplier_name", vendor.trim())
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (supplierMatch) supplierId = (supplierMatch as any).id;
      }

      // 2) Create or update the receipt row depending on mode.
      const totalNum = total ? Number(total) : null;
      let receiptId: string;
      if (existingReceiptId) {
        // Rescan flow: update the existing row's header fields and
        // reuse its id. Don't touch image_path/url -- the original
        // image is what we just rescanned.
        const { error: updErr } = await supabase
          .from("purchase_receipts")
          .update({
            vendor: vendor.trim() || null,
            supplier_id: supplierId,
            receipt_date: receiptDate || null,
            total: totalNum,
            notes: notes.trim() || null,
          })
          .eq("id", existingReceiptId);
        if (updErr) throw new Error(updErr.message);
        receiptId = existingReceiptId;
      } else {
        const { data: receipt, error: rcptErr } = await supabase
          .from("purchase_receipts")
          .insert({
            company_id: companyId,
            uploaded_by: userId,
            vendor: vendor.trim() || null,
            supplier_id: supplierId,
            receipt_date: receiptDate || null,
            total: totalNum,
            notes: notes.trim() || null,
            image_path: imagePath,
            image_url: imageUrl,
          })
          .select()
          .single();
        if (rcptErr || !receipt) throw new Error(rcptErr?.message || "Couldn't create receipt");
        receiptId = (receipt as any).id as string;
      }

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

      // Wipe any draft items the rescan API persisted on this receipt
      // first -- otherwise saving on top of a draft would leave the
      // unchecked AI rows and the operator's confirmed rows side by
      // side. Only purges drafts (is_draft=true), so anything the
      // operator already saved on a prior session survives.
      if (existingReceiptId) {
        await supabase
          .from("purchase_receipt_items")
          .delete()
          .eq("receipt_id", existingReceiptId)
          .eq("is_draft", true);
      }

      // All operator-confirmed rows are inserted with is_draft=false
      // so the next rescan sees them as committed and skips re-running
      // the AI.
      const itemsToInsertFinal = itemsToInsert.map((it) => ({ ...it, is_draft: false }));
      if (itemsToInsertFinal.length > 0) {
        const { error: itemsErr } = await supabase
          .from("purchase_receipt_items")
          .insert(itemsToInsertFinal);
        if (itemsErr) throw new Error(itemsErr.message);
      }

      // Memory layer: remember {vendor, line description} -> {inventory
      // item, tax rule} so the next rescan of the same vendor pre-fills
      // the operator's choices. Upsert keyed on (company_id, vendor_norm,
      // description_norm) so we update the latest mapping in place
      // instead of stacking history rows. Best-effort; failure here
      // doesn't block the save.
      try {
        const vendorNorm = (vendor || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (vendorNorm && itemsToInsertFinal.length > 0) {
          const memoryRows = itemsToInsertFinal
            .filter((it) => it.inventory_item_id || it.suggested_rule_id)
            .map((it) => ({
              company_id: companyId,
              vendor_norm: vendorNorm,
              description_norm: String(it.description || "")
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .replace(/\s+/g, " ")
                .trim(),
              inventory_item_id: it.inventory_item_id || null,
              suggested_rule_id: it.suggested_rule_id || null,
              unit_of_measure: it.unit_of_measure || null,
              last_used_at: new Date().toISOString(),
            }))
            .filter((r) => r.description_norm.length > 0);

          if (memoryRows.length > 0) {
            const { error: memErr } = await supabase
              .from("purchase_line_memory")
              .upsert(memoryRows, {
                onConflict: "company_id,vendor_norm,description_norm",
                ignoreDuplicates: false,
              });
            if (memErr) console.error("[reconcile] memory upsert failed", memErr);
          }
        }
      } catch (memErr) {
        console.error("[reconcile] memory write threw", memErr);
      }

      // 4) Receive into stock for the flagged lines. Single batched
      //    call so we get one transaction per line.
      if (stockReceives.length > 0) {
        const result = await inventoryService.receiveStock({
          companyId,
          supplierId,
          invoiceNumber: receiptNumber || `slip-${receiptId.slice(0, 8)}`,
          receivedDate: receiptDate || toLocalISO(new Date()),
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
          <h2 className="text-lg font-bold text-slate-900">
            {manualMode ? "Manual shopping entry" : existingReceiptId ? "Rescan results" : "Reconcile slip"}
          </h2>
        </div>
        <p className="text-sm text-slate-600 -mt-2">
          {manualMode
            ? "Capture a shop run by hand. Tag each line for tax and, if you stock it, feed your inventory."
            : existingReceiptId
              ? "AI re-extracted the lines from this slip's image. Confirm or fix the tax tags, then save -- new lines get added to the existing slip."
              : "Confirm each line's tax tag and, if it's something you stock, link it to inventory. Lines you tick ‘Add to stock’ will be received against your inventory at the unit price shown."}
        </p>

        {/* Receipt header */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Vendor</label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                list="past-vendors"
                className="mt-1"
                placeholder={pastVendors[0] ? `e.g. ${pastVendors[0]}` : "e.g. Pick n Pay"}
              />
              <datalist id="past-vendors">
                {pastVendors.map((v) => <option key={v} value={v} />)}
              </datalist>
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

        {/* Past-descriptions datalist for the line description Input */}
        <datalist id="past-descriptions">
          {pastDescriptions.map((d) => <option key={d} value={d} />)}
        </datalist>

        {/* Line items */}
        <div className="space-y-3">
          {lines.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No line items yet. Click &lsquo;Add line&rsquo; to start.</p>
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
                      <Input
                        value={ln.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (manualMode || !ln.description) {
                            onDescriptionChange(idx, val);
                          } else {
                            setLine(idx, { description: val });
                          }
                        }}
                        list="past-descriptions"
                        className="font-semibold text-slate-900 -ml-2 border-transparent hover:border-slate-200 focus:border-slate-300"
                        placeholder="Item description"
                      />
                      <p className="text-xs text-slate-500 ml-1">
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

        {/* Add line */}
        <Button
          variant="outline"
          size="sm"
          onClick={addBlankLine}
          className="border-dashed text-slate-700"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add line
        </Button>

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
