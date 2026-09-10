/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: pending amendment banner with inline approve / decline.
 *
 * Admin-only banner that appears above the order doc when a client
 * has requested an amendment and it's still in 'pending' state.
 * Shows the proposed_changes diff inline and exposes Approve /
 * Decline buttons that POST to /api/orders/amendment-review.
 *
 * Approval applies the diff to the order row + triggers the cascade
 * (kitchen prep regen, shopping refresh, inventory recalc, invoice
 * update). Decline keeps the order as-is and the client gets an
 * order_change_rejected email.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { captureException } from "@/lib/observability";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileEdit, Check, X, Loader2 } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  onApplied?: () => void;
}

interface Amendment {
  id: string;
  status: string;
  proposed_changes: any;
  client_notes: string | null;
  requested_at: string;
  requested_by_user_id: string | null;
}

function fmtDelta(key: string, val: any): string {
  if (val == null) return "-";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

export function OrderAmendmentBanner({ orderId, companyId, onApplied }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const canReview = canSeeOtherStaffPay(user?.role as UserRole | undefined);
  const [pending, setPending] = useState<Amendment | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const fetchPending = async () => {
    try {
      const { data } = await (supabase as any)
        .from("order_amendment_requests")
        .select("id, status, proposed_changes, client_notes, requested_at, requested_by_user_id")
        .eq("order_id", orderId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPending(data as Amendment | null);
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "loadAmendmentBanner", orderId, companyId } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canReview) { setLoading(false); return; }
    fetchPending();
    // Realtime - new amendment requests should surface immediately.
    const ch = supabase
      .channel(`order-doc-amendment:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_amendment_requests", filter: `order_id=eq.${orderId}` },
        () => { fetchPending(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, canReview]);

  const review = async (action: "approve" | "reject") => {
    if (!pending) return;
    setActing(action);
    try {
      const res = await fetch("/api/orders/amendment-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: pending.id, action }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Review failed (${res.status})`);
      }
      toast({
        title: action === "approve" ? "Amendment approved" : "Amendment declined",
        description: action === "approve" ? "Changes applied to the order. Client has been notified." : "Order kept as-is. Client has been notified.",
      });
      setPending(null);
      onApplied?.();
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "reviewAmendment", orderId, companyId, action } });
      toast({ title: "Could not save", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  if (!canReview || loading || !pending) return null;

  const changes = pending.proposed_changes && typeof pending.proposed_changes === "object"
    ? Object.entries(pending.proposed_changes as Record<string, any>)
    : [];

  return (
    <div className="flex items-start gap-3 p-3 mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 print:hidden">
      <FileEdit className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-900 uppercase tracking-wider">Pending amendment</p>
        <p className="text-xs text-amber-800 mt-0.5">
          Requested {new Date(pending.requested_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
        {pending.client_notes && (
          <p className="text-xs text-amber-900 mt-2 italic">"{pending.client_notes}"</p>
        )}
        {changes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs">
            {changes.map(([k, v]) => (
              <li key={k} className="text-amber-900">
                <span className="font-semibold capitalize">{k.replace(/_/g, " ")}:</span>{" "}
                <span className="font-mono bg-white border border-amber-200 rounded px-1">{fmtDelta(k, v)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            onClick={() => review("approve")}
            disabled={acting !== null}
            className="h-8 bg-brand-primary hover:bg-brand-primary/90"
          >
            {acting === "approve" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Approve + apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => review("reject")}
            disabled={acting !== null}
            className="h-8 border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            {acting === "reject" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
