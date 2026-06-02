/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PendingClaimsBanner
 *
 * Top-of-page strip on the admin invoices view that surfaces every
 * pending EFT claim a client has made via the portal. Each row shows
 * the amount, reference (= invoice number), client + claimed date,
 * any free-form note, and Confirm / Reject buttons that POST to
 * /api/payments/verify-claim.
 *
 * Reconciliation flow Bobby asked for:
 *   1. Admin sees the claim with all the info needed to find it on the
 *      bank statement (amount, reference, date).
 *   2. Confirm → invoice marks paid, client gets notified.
 *   3. Reject → admin enters a reason, client gets notified to fix +
 *      retry.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, CheckCircle2, XCircle, Banknote } from "lucide-react";
import { format } from "date-fns";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface PendingClaim {
  id: string;
  amount: number;
  payment_reference: string;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  invoices: {
    id: string;
    invoice_number: string;
    total_amount: number;
    balance_due: number;
  } | null;
  clients: {
    client_name: string | null;
    email: string | null;
  } | null;
}

interface PendingClaimsBannerProps {
  onAfterAction?: () => void;
}

export function PendingClaimsBanner({ onAfterAction }: PendingClaimsBannerProps) {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const router = useRouter();
  // TIGHTEN I.82 (2026-06-02): tenant-aware currency. Was previously a
  // module-scope ZAR formatter which mislabelled EFT claim amounts for
  // USD / GBP / EUR tenants on the invoices page banner.
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  const fmt = { format: (n: number) => tenantCurrency.format(n, 2) };
  // Notification deep-link: ?claimId={paymentId} from the
  // payment_claimed bell row. Once claims load, scroll to the
  // matching row and pulse it so the operator's eye lands there
  // instead of having to scan the whole list.
  const targetClaimId = String(router.query.claimId || "");
  const targetRowRef = useRef<HTMLDivElement | null>(null);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<PendingClaim | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const companyId = user?.company_id;

  // Scroll-into-view + pulse when arriving from a notification deep
  // link. Run after claims load so the row exists in the DOM. Bail if
  // the targeted claim isn't in the pending list (already actioned).
  useEffect(() => {
    if (!targetClaimId) return;
    if (claims.length === 0) return;
    const exists = claims.some((c) => c.id === targetClaimId);
    if (!exists) return;
    const t = setTimeout(() => {
      targetRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    return () => clearTimeout(t);
  }, [targetClaimId, claims]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, amount, payment_reference, payment_date, notes, created_at, " +
        "invoices:invoice_id ( id, invoice_number, total_amount, balance_due ), " +
        "clients:client_id ( client_name, email )"
      )
      .eq("company_id", companyId)
      .eq("payment_method", "eft")
      .eq("payment_status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[PendingClaimsBanner] payments fetch failed:", error);
    }
    setClaims(((data as any[]) || []) as PendingClaim[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const act = async (claim: PendingClaim, action: "confirm" | "reject", reason?: string) => {
    setActingId(claim.id);
    try {
      const res = await fetch("/api/payments/verify-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: claim.id,
          action,
          reason: reason || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Verify failed");

      toast({
        title: action === "confirm" ? "Marked paid" : "Claim rejected",
        description: action === "confirm"
          ? `${claim.invoices?.invoice_number || "Invoice"} updated. Client notified.`
          : "Client has been notified to fix the reference and try again.",
      });
      setRejectingClaim(null);
      setRejectReason("");
      await load();
      onAfterAction?.();
    } catch (e: any) {
      toast({
        title: "Couldn't update claim",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setActingId(null);
    }
  };

  if (loading) return null;
  if (claims.length === 0) return null;

  return (
    <>
      <Card className="mb-6 border-blue-300 bg-blue-50">
        <CardContent className="py-4 px-5 space-y-3">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-semibold text-blue-900">
              {claims.length} pending EFT claim{claims.length === 1 ? "" : "s"} - check your bank statement
            </h2>
          </div>
          <p className="text-xs text-blue-800">
            Each claim shows the reference your client used. Match it on your bank statement, then
            confirm here. Rejecting prompts the client to fix the reference and try again.
          </p>

          <div className="space-y-2">
            {claims.map((c) => {
              const isTarget = !!targetClaimId && c.id === targetClaimId;
              return (
                <ClaimRow
                  key={c.id}
                  claim={c}
                  acting={actingId === c.id}
                  onConfirm={() => act(c, "confirm")}
                  onReject={() => setRejectingClaim(c)}
                  highlight={isTarget}
                  rowRef={isTarget ? targetRowRef : undefined}
                  fmt={fmt}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!rejectingClaim} onOpenChange={(o) => !o && setRejectingClaim(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              Reject this claim
            </DialogTitle>
            <DialogDescription>
              The client gets a notification with your reason. Common ones:
              wrong reference, amount short, can&apos;t find on bank.
            </DialogDescription>
          </DialogHeader>
          {rejectingClaim && (
            <div className="text-sm text-slate-700 space-y-3">
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Client</span>
                  <span className="font-medium">
                    {rejectingClaim.clients?.client_name || rejectingClaim.clients?.email || "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference claimed</span>
                  <span className="font-mono">{rejectingClaim.payment_reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-mono">{fmt.format(rejectingClaim.amount)}</span>
                </div>
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. Reference doesn't match - can you resend with INV-… exactly?"
                className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm resize-none"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setRejectingClaim(null); setRejectReason(""); }}
                  disabled={actingId !== null}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => act(rejectingClaim, "reject", rejectReason)}
                  disabled={actingId !== null}
                >
                  {actingId ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Reject claim
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClaimRow({
  claim, acting, onConfirm, onReject, highlight, rowRef, fmt,
}: {
  claim: PendingClaim;
  acting: boolean;
  onConfirm: () => void;
  onReject: () => void;
  highlight?: boolean;
  rowRef?: React.RefObject<HTMLDivElement | null>;
  /** TIGHTEN I.82: parent passes its tenant-currency formatter so the
   *  row doesn't have to call useTenantCurrency itself (would dup the
   *  companies fetch per row). */
  fmt: { format: (n: number) => string };
}) {
  const clientLabel =
    claim.clients?.client_name ||
    claim.clients?.email ||
    "Unknown client";
  const paidLabel = claim.payment_date
    ? format(new Date(claim.payment_date), "dd MMM yyyy")
    : "date not given";
  const claimedLabel = format(new Date(claim.created_at), "dd MMM, HH:mm");
  const balance = claim.invoices?.balance_due ?? null;

  return (
    <div
      ref={rowRef}
      className={`rounded-lg border bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-shadow ${
        highlight
          ? "border-amber-400 ring-2 ring-amber-300 shadow-md animate-pulse"
          : "border-blue-200"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 truncate">{clientLabel}</span>
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            {fmt.format(claim.amount)}
          </Badge>
        </div>
        <div className="text-xs text-slate-600 mt-1 space-y-0.5">
          <div>
            Ref: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded">
              {claim.payment_reference}
            </code>
            {claim.invoices?.invoice_number && claim.payment_reference !== claim.invoices.invoice_number && (
              <span className="ml-2 text-rose-600 font-semibold">⚠ doesn&apos;t match invoice</span>
            )}
          </div>
          <div>
            Client paid {paidLabel} • claimed {claimedLabel}
            {balance != null && (
              <> • balance after this claim: <span className="font-semibold">{fmt.format(Math.max(balance - claim.amount, 0))}</span></>
            )}
          </div>
          {claim.notes && (
            <div className="italic text-slate-600 mt-1 line-clamp-2">
              &ldquo;{claim.notes}&rdquo;
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 sm:flex-col lg:flex-row">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={onConfirm}
          disabled={acting}
        >
          {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
          Confirm received
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-rose-200 text-rose-700 hover:bg-rose-50"
          onClick={onReject}
          disabled={acting}
        >
          <XCircle className="w-3.5 h-3.5 mr-1" />
          Reject
        </Button>
      </div>
    </div>
  );
}
