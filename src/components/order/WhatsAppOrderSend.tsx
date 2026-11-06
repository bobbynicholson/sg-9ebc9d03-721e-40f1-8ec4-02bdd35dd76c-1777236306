/**
 * Sends one approved WhatsApp message about this order through the company's
 * business account, so it is logged. Only shows when WhatsApp is connected.
 */
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WHATSAPP_AUTOMATIONS } from "@/lib/whatsapp/automations";

const ORDER_MESSAGES = WHATSAPP_AUTOMATIONS.filter((item) => item.group === "Booked events");

export function WhatsAppOrderSend({ orderId, companyId, onSent }: { orderId: string; companyId: string; onSent: () => void }) {
  const { toast } = useToast();
  const [ready, setReady] = useState<string[]>([]);
  const [key, setKey] = useState("");
  const [sending, setSending] = useState(false);
  const query = `?companyId=${encodeURIComponent(companyId)}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/admin/whatsapp/settings${query}`);
      if (!response.ok) return;
      const json = await response.json();
      if (cancelled || !json.connected) return;
      setReady(ORDER_MESSAGES.filter((item) => json.automations?.[item.key]?.templateName).map((item) => item.key));
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [query]);

  if (ready.length === 0) return null;

  const send = async () => {
    setSending(true);
    try {
      const response = await fetch(`/api/admin/whatsapp/send${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "order", orderId, key }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Try again.");
      toast({ title: "WhatsApp queued", description: "It goes out within about 5 minutes." });
      setKey("");
      onSent();
    } catch (e) {
      toast({ title: "WhatsApp not sent", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 pb-3">
      <div className="min-w-48 flex-1">
        <label htmlFor={`wa-order-${orderId}`} className="text-xs text-slate-600">Send a WhatsApp to the client</label>
        <select
          id={`wa-order-${orderId}`}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          <option value="">Choose a message</option>
          {ORDER_MESSAGES.filter((item) => ready.includes(item.key)).map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </select>
      </div>
      <Button type="button" size="sm" className="gap-1.5" disabled={!key || sending} title={key ? undefined : "Choose a message first"} onClick={() => void send()}>
        <Send className="h-3.5 w-3.5" /> {sending ? "Sending..." : "Send WhatsApp to client"}
      </Button>
    </div>
  );
}
