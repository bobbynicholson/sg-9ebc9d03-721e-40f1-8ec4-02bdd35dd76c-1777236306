/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ConvertLeadDialog
 *
 * The "Convert to order" CTA on the leads page used to redirect to
 * /admin/quotes/new?fromQuoteId=... which only cloned the quote --
 * never actually creating an order. This dialog replaces that path.
 *
 * Pre-flight check on open:
 *   - Has an accepted, unconverted quote -> show a "ready to convert"
 *     summary, Confirm button hits POST /api/admin/leads/:id/convert-to-order.
 *   - Has draft / sent quotes only -> tell the operator to mark a
 *     quote accepted first; button deep-links to the most recent quote.
 *   - No quotes at all -> tell the operator to create a quote first;
 *     button deep-links to /admin/quotes/new?leadId={X}.
 *
 * On success the parent closes the dialog, fires a toast, and routes
 * to /admin/orders?orderId={newOrderId}.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";

interface QuoteSummary {
  id: string;
  quote_number: string | null;
  quote_name: string | null;
  status: string | null;
  total_amount: number | null;
  converted_to_order_id: string | null;
  created_at: string | null;
}

interface Lead {
  id: string;
  company_id: string;
  client_name?: string | null;
  contact_name?: string | null;
  client_email?: string | null;
  email?: string | null;
  converted_to_client_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  /** Called with the new order id when the conversion succeeds. */
  onConverted?: (result: { orderId: string; orderNumber: string | null }) => void;
}

type Mode =
  | { kind: "loading" }
  | { kind: "ready"; quote: QuoteSummary }
  | { kind: "needs_acceptance"; latestQuote: QuoteSummary }
  | { kind: "no_quotes" }
  | { kind: "error"; message: string };

function formatRand(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "--";
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
}

export function ConvertLeadDialog({ open, onOpenChange, lead, onConverted }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const displayName =
    lead?.client_name || lead?.contact_name || lead?.client_email || lead?.email || "this lead";

  useEffect(() => {
    if (!open || !lead) return;
    let cancelled = false;
    setMode({ kind: "loading" });

    (async () => {
      try {
        // Pull every quote attached to this lead (by lead_id OR by
        // client_id when promotion has already happened). Mirrors the
        // server-side picker so the dialog tells the operator the same
        // story the API will.
        const orFilter = lead.converted_to_client_id
          ? `lead_id.eq.${lead.id},client_id.eq.${lead.converted_to_client_id}`
          : `lead_id.eq.${lead.id}`;
        const { data, error } = await supabase
          .from("quotes")
          .select(
            "id, quote_number, quote_name, status, total_amount, converted_to_order_id, created_at"
          )
          .eq("company_id", lead.company_id)
          .is("deleted_at", null)
          .or(orFilter)
          .order("created_at", { ascending: false });
        if (cancelled) return;

        if (error) {
          setMode({ kind: "error", message: error.message });
          return;
        }
        const quotes = (data || []) as QuoteSummary[];
        if (quotes.length === 0) {
          setMode({ kind: "no_quotes" });
          return;
        }
        const ready = quotes.find(
          (q) => q.status === "accepted" && !q.converted_to_order_id
        );
        if (ready) {
          setMode({ kind: "ready", quote: ready });
          return;
        }
        // No accepted convertible quote -- show the acceptance prompt
        // anchored to whichever quote is most recent.
        setMode({ kind: "needs_acceptance", latestQuote: quotes[0] });
      } catch (err: any) {
        if (cancelled) return;
        setMode({ kind: "error", message: err?.message || "Could not load quotes" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, lead]);

  const handleConfirm = async () => {
    if (!lead || mode.kind !== "ready") return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/convert-to-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMode({
          kind: "error",
          message: json?.error || `Conversion failed (HTTP ${res.status})`,
        });
        setSubmitting(false);
        return;
      }
      onConverted?.({ orderId: json.order_id, orderNumber: json.order_number || null });
      onOpenChange(false);
    } catch (err: any) {
      setMode({ kind: "error", message: err?.message || "Conversion crashed" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenQuote = (quoteId: string) => {
    onOpenChange(false);
    router.push(`/admin/quotes/${quoteId}`);
  };

  const handleNewQuote = () => {
    if (!lead) return;
    onOpenChange(false);
    router.push(`/admin/quotes/new?leadId=${lead.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-600" />
            Convert lead to order
          </DialogTitle>
        </DialogHeader>

        {mode.kind === "loading" && (
          <div className="py-8 text-center text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Checking quotes for {displayName}...
          </div>
        )}

        {mode.kind === "ready" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Ready to convert. We&apos;ll create an order from quote{" "}
              <span className="font-semibold">
                {mode.quote.quote_number || mode.quote.quote_name || mode.quote.id.slice(0, 8)}
              </span>{" "}
              for <span className="font-semibold">{displayName}</span>, total{" "}
              <span className="font-semibold">{formatRand(mode.quote.total_amount)}</span>.
            </p>
            <p className="text-xs text-slate-500">
              The order is born confirmed. The kitchen, invoicing and confirmation email run
              automatically once the order exists.
            </p>
          </div>
        )}

        {mode.kind === "needs_acceptance" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-900">
                <span className="font-semibold">{displayName}</span> has a quote out, but it
                isn&apos;t accepted yet. Mark the quote accepted first, then come back here.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Latest quote:{" "}
              <span className="font-medium text-slate-700">
                {mode.latestQuote.quote_number ||
                  mode.latestQuote.quote_name ||
                  mode.latestQuote.id.slice(0, 8)}
              </span>{" "}
              · status {mode.latestQuote.status || "unknown"}
            </div>
          </div>
        )}

        {mode.kind === "no_quotes" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <FileText className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-slate-800">
                <span className="font-semibold">{displayName}</span> doesn&apos;t have a quote
                yet. Create one first, send it for acceptance, then convert it to an order.
              </p>
            </div>
          </div>
        )}

        {mode.kind === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {mode.message}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          {mode.kind === "ready" && (
            <Button
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-1.5" />
                  Confirm conversion
                </>
              )}
            </Button>
          )}
          {mode.kind === "needs_acceptance" && (
            <Button
              onClick={() => handleOpenQuote(mode.latestQuote.id)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Open quote
            </Button>
          )}
          {mode.kind === "no_quotes" && (
            <Button
              onClick={handleNewQuote}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Create quote
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
