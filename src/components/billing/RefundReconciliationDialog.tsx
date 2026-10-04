import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function RefundReconciliationDialog({ refundId, onClose, onSaved }: {
  refundId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState("paid");
  const [reference, setReference] = useState("");
  const [evidence, setEvidence] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/refunds/${refundId}/reconcile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, provider_reference: reference, evidence, provider_verified: verified }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save reconciliation");
      await onSaved(); onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save reconciliation");
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reconcile refund outcome</DialogTitle>
        <DialogDescription>Check the original refund in the merchant dashboard or with provider support, then record its confirmed outcome.</DialogDescription>
      </DialogHeader>
      <label className="space-y-1 text-sm">Provider outcome
        <select className="block w-full rounded-md border p-2" value={outcome} disabled={busy}
          onChange={(event) => { setOutcome(event.target.value); setVerified(false); }}>
          <option value="paid">Refund confirmed paid</option>
          <option value="failed">Provider confirmed terminal failure</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">Refund or support reference
        <Input value={reference} maxLength={255} disabled={busy} onChange={(event) => setReference(event.target.value)} />
      </label>
      <label className="space-y-1 text-sm">Evidence and verification details
        <Textarea value={evidence} maxLength={2000} disabled={busy} onChange={(event) => setEvidence(event.target.value)}
          placeholder="Record the provider status, when you checked it, and any support confirmation." />
      </label>
      <p className="text-sm text-muted-foreground">{outcome === "paid"
        ? "This records the completed refund and queues its receipt."
        : "This permits another refund attempt. A missing record or a pending status does not confirm failure."}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={verified} disabled={busy} onChange={(event) => setVerified(event.target.checked)} />
        I verified this outcome for the original refund with the provider.
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy || !verified || reference.trim().length < 3 || evidence.trim().length < 10} onClick={save}>
        {busy ? "Saving…" : "Save verified outcome"}
      </Button>
    </DialogContent>
  </Dialog>;
}
