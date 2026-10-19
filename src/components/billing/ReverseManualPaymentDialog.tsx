import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export interface ReversiblePayment { id: string; amount: number; currency?: string | null; payment_reference?: string | null; }

export function ReverseManualPaymentDialog({ open, payment, onOpenChange, onReversed }: {
  open: boolean; payment: ReversiblePayment | null; onOpenChange: (open: boolean) => void; onReversed: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setReason(""); setSaving(false); } }, [open, payment?.id]);
  const reverse = async () => {
    if (!payment || !reason.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/payments/${payment.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { toast({ title: "Could not reverse payment", description: json.error || "Refresh and try again.", variant: "destructive" }); return; }
      toast({ title: json.idempotent ? "Payment was already reversed" : "Manual payment reversed", description: `Invoice balance is now ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: payment.currency || "ZAR" }).format(Number(json.balance_due || 0))}.` });
      onReversed(); onOpenChange(false);
    } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Reverse manual payment</DialogTitle><DialogDescription>This voids the recorded payment and restores the outstanding invoice balance. It does not send money back to the client.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="reverse-payment-reason">Reason for reversal</Label><Textarea id="reverse-payment-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: entered against the wrong invoice" rows={3} disabled={saving} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button variant="destructive" onClick={reverse} disabled={saving || !reason.trim()}>{saving ? "Reversing..." : "Reverse payment"}</Button></DialogFooter></DialogContent></Dialog>;
}
