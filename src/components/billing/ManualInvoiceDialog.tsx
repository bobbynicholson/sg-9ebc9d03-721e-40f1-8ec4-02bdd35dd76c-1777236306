/**
 * ManualInvoiceDialog - Wave 69.
 *
 * Create an invoice that is NOT tied to a specific order. Use cases:
 *  - Deposits charged in advance of a quote being built
 *  - Retainers (monthly fee for an annual catering contract)
 *  - Late fees, equipment damage charges, restocking fees
 *  - Ad-hoc billable consultations / venue scouting
 *
 * Pre-Wave-69 every invoice needed an order. Operators created
 * placeholder orders or charged off-platform to bill these scenarios.
 * Now: pick an existing client (or type in a fresh name + email),
 * add line items, hit save. order_id is NULL on the resulting row.
 *
 * Schema note: invoices.order_id is nullable, invoices.client_id is
 * NOT NULL. We resolve / create a clients row before the insert.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatZAR } from "@/lib/formatters";

interface LineItem {
  item_name: string;
  quantity: number;
  unit_price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (invoiceId: string) => void;
}

export function ManualInvoiceDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth() as any;
  const { toast } = useToast();

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { item_name: "", quantity: 1, unit_price: 0 },
  ]);
  const [vatRate, setVatRate] = useState(0.15);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Defaults on open: due in 14 days, fetch tenant VAT rate
  useEffect(() => {
    if (!open) return;
    setClientName(""); setClientEmail(""); setClientPhone("");
    setReason(""); setNotes("");
    setItems([{ item_name: "", quantity: 1, unit_price: 0 }]);
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setDueDate(due.toISOString().slice(0, 10));
    // Pull tenant VAT rate
    (async () => {
      if (!user?.company_id) return;
      try {
        const { data } = await (supabase as any)
          .from("companies")
          .select("vat_rate")
          .eq("id", user.company_id)
          .maybeSingle();
        const rate = Number((data as any)?.vat_rate);
        if (Number.isFinite(rate) && rate >= 0 && rate <= 1) setVatRate(rate);
      } catch {/* fall through to 0.15 default */}
    })();
  }, [open, user?.company_id]);

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const taxAmount = Number((subtotal * vatRate).toFixed(2));
  const total = Number((subtotal + taxAmount).toFixed(2));

  const setItem = (i: number, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };
  const addRow = () => setItems((prev) => [...prev, { item_name: "", quantity: 1, unit_price: 0 }]);
  const removeRow = (i: number) => setItems((prev) => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  const create = async () => {
    if (!user?.company_id) { toast({ title: "Not signed in", variant: "destructive" }); return; }
    if (!clientName.trim()) { toast({ title: "Client name required", variant: "destructive" }); return; }
    const validItems = items.filter((it) => it.item_name.trim() && Number(it.quantity) > 0);
    if (validItems.length === 0) { toast({ title: "Add at least one line item", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // 1. Resolve or create the client row
      let clientId: string;
      const { data: existing } = await (supabase as any)
        .from("clients")
        .select("id")
        .eq("company_id", user.company_id)
        .ilike("client_name", clientName.trim())
        .maybeSingle();
      if (existing?.id) {
        clientId = existing.id;
      } else {
        const { data: newClient, error: ce } = await (supabase as any)
          .from("clients")
          .insert([{
            company_id: user.company_id,
            client_name: clientName.trim(),
            email: clientEmail.trim() || null,
            phone: clientPhone.trim() || null,
          }])
          .select("id")
          .single();
        if (ce) throw ce;
        clientId = (newClient as any).id;
      }

      // 2. Get a proper invoice number
      let invoiceNumber: string;
      try {
        const { data: num } = await (supabase as any).rpc("consume_next_document_number", {
          p_company_id: user.company_id,
          p_doc_type: "invoice",
        });
        invoiceNumber = String(num) || `INV-MAN-${Date.now().toString(36).toUpperCase()}`;
      } catch {
        invoiceNumber = `INV-MAN-${Date.now().toString(36).toUpperCase()}`;
      }

      // 3. Insert the invoice with order_id = NULL
      const todayIso = new Date().toISOString().slice(0, 10);
      const lineItemsForData = validItems.map((it) => ({
        item_name: it.item_name,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        line_total: Number(it.quantity) * Number(it.unit_price),
      }));
      const { data: inv, error: invErr } = await (supabase as any)
        .from("invoices")
        .insert([{
          company_id: user.company_id,
          client_id: clientId,
          order_id: null,
          invoice_number: invoiceNumber,
          invoice_date: todayIso,
          due_date: dueDate,
          subtotal: Number(subtotal.toFixed(2)),
          tax_amount: taxAmount,
          total_amount: total,
          balance_due: total,
          amount_paid: 0,
          status: "draft",
          notes: notes.trim() || null,
          invoice_data: {
            clientName: clientName.trim(),
            clientEmail: clientEmail.trim() || null,
            clientPhone: clientPhone.trim() || null,
            items: lineItemsForData,
            subtotal: Number(subtotal.toFixed(2)),
            taxAmount,
            total,
            reason: reason.trim() || null,
            manual: true,
          },
        }])
        .select("id")
        .single();
      if (invErr) throw invErr;

      toast({
        title: "Manual invoice created",
        description: `${invoiceNumber} for ${clientName.trim()} (${formatZAR(total)})`,
      });
      onOpenChange(false);
      onCreated?.((inv as any).id);
    } catch (e: any) {
      toast({
        title: "Could not create invoice",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New invoice (no order)</DialogTitle>
          <DialogDescription>
            Create an invoice that isn't tied to a specific event order - deposits, retainers, late fees, equipment damage charges, ad-hoc consultations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Client name</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Corporate" />
            </div>
            <div>
              <Label>Client email</Label>
              <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} type="email" placeholder="finance@acme.com" />
            </div>
            <div>
              <Label>Client phone</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+27 ..." />
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Retainer / late fee / damage / etc" />
            </div>
          </div>

          <div>
            <Label>Line items</Label>
            <div className="space-y-2 mt-1">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_100px_30px] gap-2 items-center">
                  <Input
                    value={it.item_name}
                    onChange={(e) => setItem(i, { item_name: e.target.value })}
                    placeholder="Item description"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: Number(e.target.value) || 0 })}
                    placeholder="Qty"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={it.unit_price}
                    onChange={(e) => setItem(i, { unit_price: Number(e.target.value) || 0 })}
                    placeholder="Unit price"
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeRow(i)} disabled={items.length === 1} className="text-rose-600">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="w-4 h-4 mr-1" />
                Add line
              </Button>
            </div>
          </div>

          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span className="tabular-nums">{formatZAR(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">VAT ({(vatRate * 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{formatZAR(taxAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span className="tabular-nums">{formatZAR(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Notes (internal)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context the bookkeeper needs"
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving || !clientName.trim() || total <= 0} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
