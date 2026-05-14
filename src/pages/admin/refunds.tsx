/**
 * /admin/refunds (renamed to "Refunds & Credits" in Wave 29.3).
 *
 * Pending + completed refunds list, plus -- since Wave 29.3 -- store
 * credit issuances and redemptions on the same timeline so finance
 * has one place to reconcile every "money out" or "credit in/out"
 * movement against the bank statement.
 *
 * Three row kinds:
 *   - refund        (payment_type='refund', original behaviour)
 *   - credit_issue  (payment_type='credit_issue', from cancellation
 *                   wizard with payout_choice='credit')
 *   - credit_redeem (payment_type='credit_redeem', applied to an
 *                   invoice via redeem_client_credit RPC)
 *
 * Actions:
 *   - "Mark refund paid" -- refund kind only, EFT/cash/manual pending.
 *   - "Retry refund" -- refund kind only, PayFast pending auto-failed.
 *   - Credit rows are display-only (no further action; they auto-
 *     completed at issue / redeem time).
 *
 * Filter chips: All / Refunds / Credits / Pending / Rejected.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { supabase } from "@/integrations/supabase/client";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { UserRole } from "@/types/app";
import {
  Receipt, CheckCircle2, Clock, RefreshCw, XCircle, Zap, Download,
  ExternalLink, User as UserIcon, Wallet, ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";

interface RefundRow {
  id: string;
  // Wave 29.3: row kind. 'refund' rows preserve every existing UI
  // behaviour; credit_issue + credit_redeem render display-only on
  // the same timeline so finance reconciles all money/credit moves
  // in one place.
  kind: "refund" | "credit_issue" | "credit_redeem";
  amount: number;
  status: string;
  reason: string | null;
  created_at: string;
  processed_at: string | null;
  order_id: string | null;
  cancellation_request_id: string | null;
  // The refund row's own gateway -- set to 'payfast' once auto-processed.
  refund_gateway: string | null;
  // Joined order
  order_number?: string | null;
  client_name?: string | null;
  client_id?: string | null;
  event_date?: string | null;
  invoice_id?: string | null;
  // Derived from the parent payment(s) for this order.
  parent_gateway: string | null;
  parent_method: string | null;
}

// Wave 29.3: 'credits' chip rolls credit_issue + credit_redeem
// together (finance usually wants both halves of the credit ledger
// in one view).
type FilterKey = "all" | "auto" | "credits" | "pending" | "rejected";

/**
 * Phase 15 #10: tenant-currency-aware formatter. Same locale-
 * lookup pattern used on the dashboard + invoice PDF -- falls
 * back to ZAR / en-ZA when the tenant's currency code is
 * unknown so existing tenants render unchanged.
 */
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE", AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE",
};
const buildFmt = (code: string) => {
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[code] || "en-ZA", {
      style: "currency",
      currency: code,
    });
  } catch {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
  }
};

function ProtectedRefundsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <RefundsPage />
    </ProtectedRoute>
  );
}

/**
 * The refund row was raised against an order. To know what the
 * original payment method was we need to look at the order's other
 * (non-refund) payments. We classify using the same rule the
 * refundService uses on the server.
 */
function classifyParent(
  parents: Array<{
    gateway: string | null;
    gateway_provider: string | null;
    payment_method: string | null;
    // reads payment_status (canonical enum); status text column kept as a write mirror for rollback safety until Phase 3 drop
    payment_status: string | null;
  }>,
): { gateway: string | null; method: string | null } {
  const settled = parents.filter((p) => {
    const s = String(p.payment_status || "").toLowerCase();
    return s === "completed" || s === "succeeded" || s === "paid";
  });
  if (settled.length === 0) return { gateway: null, method: null };
  const pf = settled.find((p) => {
    const g = String(p.gateway || "").toLowerCase();
    const gp = String(p.gateway_provider || "").toLowerCase();
    const pm = String(p.payment_method || "").toLowerCase();
    return g === "payfast" || gp === "payfast" || pm === "payfast";
  });
  if (pf) return { gateway: "payfast", method: pf.payment_method || "payfast" };
  const first = settled[0];
  return {
    gateway: first.gateway || first.gateway_provider || null,
    method: first.payment_method || null,
  };
}

function methodLabel(gateway: string | null, method: string | null): string {
  if ((gateway || "").toLowerCase() === "payfast") return "PayFast";
  const m = (method || "").toLowerCase();
  if (m === "eft" || m === "bank_transfer") return "EFT";
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (gateway) return gateway;
  if (method) return method;
  return "Manual";
}

function RefundsPage() {
  const { toast } = useToast();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user } = useAuth() as any;
  const companyId = user?.company_id || null;
  // Phase 15 #10: tenant currency. Closure-bind a formatter
  // off the resolved code so a UK / US tenant sees their
  // own symbol on the refund amounts.
  const tenantCurrency = useTenantCurrency(companyId);
  const fmt = buildFmt(tenantCurrency.code);

  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  // Phase 27 #3: ?paymentId scrolls to + highlights the matching
  // refund row. Used by PendingRefundsWidget deep-link from the
  // dashboard so the bookkeeper lands inside their chase.
  const router = useRouter();
  const [focusedRefundId, setFocusedRefundId] = useState<string | null>(null);
  useEffect(() => {
    if (!router.isReady || loading) return;
    const target = typeof router.query.paymentId === "string" ? router.query.paymentId : null;
    if (!target) return;
    setFilter("all");
    setFocusedRefundId(target);
    const t = setTimeout(() => {
      const el = typeof document !== "undefined"
        ? document.getElementById(`refund-row-${target}`)
        : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clearT = setTimeout(() => setFocusedRefundId(null), 4000);
    const { paymentId: _drop, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    return () => { clearTimeout(t); clearTimeout(clearT); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.paymentId, loading]);
  // Phase 17 #2: saved-view chips. Bookkeeping segments (auto-
  // processed for the day, pending EFT > 3 days, recently
  // rejected) re-occur every reconciliation pass; named chips
  // skip the manual filter clicks.
  interface SavedRefundView {
    id: string;
    name: string;
    filter: FilterKey;
  }
  const [savedRefundViews, setSavedRefundViews] = useState<SavedRefundView[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminRefunds.savedViews.v1");
      if (raw) setSavedRefundViews(JSON.parse(raw) as SavedRefundView[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminRefunds.savedViews.v1",
        JSON.stringify(savedRefundViews),
      );
    } catch { /* storage blocked */ }
  }, [savedRefundViews]);
  const saveCurrentRefundView = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this view:", "");
    if (!name || !name.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedRefundViews((prev) => [
      ...prev.filter((v) => v.name.toLowerCase() !== name.trim().toLowerCase()),
      { id, name: name.trim(), filter },
    ]);
  };
  const applySavedRefundView = (v: SavedRefundView) => setFilter(v.filter);
  const removeSavedRefundView = (id: string) =>
    setSavedRefundViews((prev) => prev.filter((v) => v.id !== id));

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Wave 29.3: pull credit_issue + credit_redeem alongside refunds
      // so the page is a unified "money out / credit in / credit
      // applied" timeline. payment_type stays in the SELECT so the
      // mapper below can branch on it.
      // reads payment_status (canonical enum); status text column kept as a write mirror for rollback safety until Phase 3 drop
      const { data: refundRows, error } = await supabase
        .from("payments")
        .select(
          "id, amount, payment_status, reason, created_at, processed_at, order_id, cancellation_request_id, gateway, gateway_provider, invoice_id, payment_type, order:orders!payments_order_id_fkey(order_number, client_name, client_id, event_date)" as any,
        )
        .eq("company_id", companyId)
        .in("payment_type", ["refund", "credit_issue", "credit_redeem"])
        .order("created_at", { ascending: false });
      if (error) throw error;

      const refunds = (refundRows || []) as any[];

      // Pull every parent payment for the orders we care about so we
      // can label the original payment method on each refund row.
      const orderIds = Array.from(
        new Set(refunds.map((r) => r.order_id).filter(Boolean)),
      ) as string[];

      const parentsByOrder = new Map<
        string,
        Array<{
          gateway: string | null;
          gateway_provider: string | null;
          payment_method: string | null;
          status: string | null;
          payment_status: string | null;
        }>
      >();

      if (orderIds.length > 0) {
        // reads payment_status (canonical enum); status text column kept as a write mirror for rollback safety until Phase 3 drop
        const { data: parents } = await supabase
          .from("payments")
          .select(
            "order_id, gateway, gateway_provider, payment_method, payment_status, payment_type",
          )
          .in("order_id", orderIds)
          .neq("payment_type", "refund");
        for (const p of (parents || []) as any[]) {
          const list = parentsByOrder.get(p.order_id) || [];
          list.push(p);
          parentsByOrder.set(p.order_id, list);
        }
      }

      const flat: RefundRow[] = refunds.map((r) => {
        const parents = (r.order_id && parentsByOrder.get(r.order_id)) || [];
        const cls = classifyParent(parents as any);
        const kind = (
          r.payment_type === "credit_issue"
            ? "credit_issue"
            : r.payment_type === "credit_redeem"
              ? "credit_redeem"
              : "refund"
        ) as RefundRow["kind"];
        return {
          id: r.id,
          kind,
          amount: Number(r.amount) || 0,
          // reads payment_status (canonical enum); status text column kept as a write mirror for rollback safety until Phase 3 drop
          status: String(r.payment_status || "pending"),
          reason: r.reason || null,
          created_at: r.created_at,
          processed_at: r.processed_at,
          order_id: r.order_id,
          cancellation_request_id: r.cancellation_request_id,
          refund_gateway: r.gateway || r.gateway_provider || null,
          order_number: r.order?.order_number || null,
          client_name: r.order?.client_name || null,
          client_id: r.order?.client_id || null,
          event_date: r.order?.event_date || null,
          invoice_id: r.invoice_id || null,
          // Credit rows have no parent payment to classify (the
          // catering company keeps the original cash). Leave the
          // parent fields null so the row renderer skips that chip.
          parent_gateway: kind === "refund" ? cls.gateway : null,
          parent_method: kind === "refund" ? cls.method : null,
        };
      });

      setRows(flat);
    } catch (e: any) {
      console.error("[refunds] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markPaid = async (r: RefundRow) => {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/refunds/${r.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        toast({
          title: "Could not mark refund paid",
          description:
            json.error ||
            (res.status === 409
              ? "Refund is already settled or rejected. Refresh the list to see the current state."
              : `Server returned ${res.status}. Check the audit log or try again.`),
          variant: "destructive",
        });
      } else {
        const who = r.client_name ? ` for ${r.client_name}` : "";
        toast({
          title: `Refund of ${fmt.format(r.amount)} marked paid`,
          description: `Recorded against order #${r.order_number || r.order_id?.slice(0, 8) || "?"}${who}. Audit log updated.`,
        });
        await load();
      }
    } catch (e: any) {
      toast({
        title: "Could not mark refund paid",
        description: e?.message || "Network error. Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const retryAuto = async (r: RefundRow) => {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/refunds/${r.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        toast({
          title: "Retry failed",
          description:
            json.error ||
            "PayFast did not accept the retry. The original payment may not have synced through yet. Give it a minute, or fall back to manual EFT.",
          variant: "destructive",
        });
      } else if (json.status === "auto_processed") {
        toast({
          title: `Refund of ${fmt.format(r.amount)} auto-processed`,
          description: `PayFast accepted the refund${r.client_name ? ` for ${r.client_name}` : ""}.`,
        });
        await load();
      } else if (json.status === "auto_failed") {
        toast({
          title: "PayFast still rejecting",
          description:
            json.message ||
            "PayFast rejected the retry. Common cause: the original payment hasn't fully settled. Try again later or mark this refund for manual EFT.",
          variant: "destructive",
        });
        await load();
      } else {
        toast({
          title: "Refund stays pending",
          description: json.message || "PayFast did not auto-process. Send a manual EFT and use Mark refund paid.",
        });
        await load();
      }
    } catch (e: any) {
      toast({
        title: "Retry failed",
        description: e?.message || "Network error. Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    // Wave 29.3: 'credits' chip = both halves of the credit ledger.
    if (filter === "credits") {
      return rows.filter(
        (r) => r.kind === "credit_issue" || r.kind === "credit_redeem",
      );
    }
    // Refund-only filters below (auto / pending / rejected) -- credit
    // rows are excluded because they auto-complete and have no
    // gateway / pending state.
    const refundsOnly = rows.filter((r) => r.kind === "refund");
    if (filter === "rejected") return refundsOnly.filter((r) => r.status === "failed" || r.status === "rejected");
    if (filter === "auto") {
      return refundsOnly.filter(
        (r) => r.status === "completed" && (r.refund_gateway || "").toLowerCase() === "payfast",
      );
    }
    // pending = anything not completed and not failed/rejected
    return refundsOnly.filter(
      (r) => r.status !== "completed" && r.status !== "failed" && r.status !== "rejected",
    );
  }, [rows, filter]);

  const counts = useMemo(() => {
    // Wave 29.3: refund-only buckets exclude credit rows so the
    // pending / auto / rejected counts mean what they say.
    const refundsOnly = rows.filter((r) => r.kind === "refund");
    const auto = refundsOnly.filter(
      (r) => r.status === "completed" && (r.refund_gateway || "").toLowerCase() === "payfast",
    ).length;
    const pending = refundsOnly.filter(
      (r) => r.status !== "completed" && r.status !== "failed" && r.status !== "rejected",
    ).length;
    const rejected = refundsOnly.filter((r) => r.status === "failed" || r.status === "rejected").length;
    const credits = rows.filter(
      (r) => r.kind === "credit_issue" || r.kind === "credit_redeem",
    ).length;
    return { all: rows.length, auto, credits, pending, rejected };
  }, [rows]);

  // Phase 19 #1: amount totals per filter so finance sees the
  // monetary exposure for each slice next to the row counts. Same
  // source array as counts so the two always agree.
  const totals = useMemo(() => {
    const sum = (xs: RefundRow[]) => xs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const refundsOnly = rows.filter((r) => r.kind === "refund");
    return {
      all: sum(rows),
      auto: sum(refundsOnly.filter(
        (r) => r.status === "completed" && (r.refund_gateway || "").toLowerCase() === "payfast",
      )),
      // Wave 29.3: credits total = issued minus redeemed, so the
      // chip reads "outstanding credit owed across all clients".
      credits: sum(rows.filter((r) => r.kind === "credit_issue"))
        - sum(rows.filter((r) => r.kind === "credit_redeem")),
      pending: sum(refundsOnly.filter(
        (r) => r.status !== "completed" && r.status !== "failed" && r.status !== "rejected",
      )),
      rejected: sum(refundsOnly.filter(
        (r) => r.status === "failed" || r.status === "rejected",
      )),
    };
  }, [rows]);
  const fmtCompact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return n.toFixed(0);
  };

  const Row = ({ r }: { r: RefundRow }) => {
    const isCompleted = r.status === "completed";
    const isRejected = r.status === "failed" || r.status === "rejected";
    const parentIsPayFast = (r.parent_gateway || "").toLowerCase() === "payfast";
    // Wave 29.3: refund-only actions. Credit rows auto-complete and
    // have nothing the operator needs to mark paid or retry.
    const isRefund = r.kind === "refund";
    const isCreditIssue = r.kind === "credit_issue";
    const isCreditRedeem = r.kind === "credit_redeem";
    const showMarkPaid = isRefund && !isCompleted && !isRejected && !parentIsPayFast;
    const showRetry = isRefund && !isCompleted && !isRejected && parentIsPayFast;

    // Icon + tone vary by kind so the row is identifiable at a glance.
    let iconBg: string;
    let Icon: typeof CheckCircle2;
    if (isCreditIssue) {
      iconBg = "bg-emerald-100 text-emerald-700";
      Icon = Wallet;
    } else if (isCreditRedeem) {
      iconBg = "bg-blue-100 text-blue-700";
      Icon = ArrowRightLeft;
    } else {
      iconBg = isCompleted
        ? "bg-emerald-100 text-emerald-700"
        : isRejected
          ? "bg-rose-100 text-rose-700"
          : "bg-amber-100 text-amber-700";
      Icon = isCompleted ? CheckCircle2 : isRejected ? XCircle : Clock;
    }

    // Headline copy varies per kind.
    const amountColor = isCreditIssue
      ? "text-emerald-700"
      : isCreditRedeem
        ? "text-blue-700"
        : "text-rose-700";
    const kindLabel = isCreditIssue
      ? "store credit issued"
      : isCreditRedeem
        ? "credit applied to invoice"
        : "refund";

    return (
      <div
        id={`refund-row-${r.id}`}
        className={`flex items-start gap-3 rounded-lg border bg-white p-3 ${
          focusedRefundId === r.id
            ? "border-amber-400 ring-2 ring-amber-300 ring-inset bg-amber-50 animate-pulse"
            : "border-slate-200"
        }`}
      >
        <div className={`p-2 rounded-full ${iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <strong className={amountColor}>{fmt.format(r.amount)}</strong>
            <span className="text-sm text-slate-700">{kindLabel}</span>
            {r.order_number ? (
              <Link
                href={withSlug(`/admin/orders?orderId=${r.order_id || ""}`)}
                className="text-xs text-blue-700 hover:underline"
              >
                #{r.order_number}
              </Link>
            ) : null}
            {r.client_name ? <span className="text-xs text-slate-500">- {r.client_name}</span> : null}
            {/* Wave 29.3: refund-only "paid by" classification.
                Credit rows have no parent payment to chip. */}
            {isRefund && (
              <Badge
                variant="outline"
                className={`text-xs ${parentIsPayFast ? "border-indigo-300 text-indigo-800 bg-indigo-50" : "border-slate-300 text-slate-700 bg-slate-50"}`}
              >
                {parentIsPayFast ? <Zap className="w-3 h-3 mr-1" /> : null}
                Paid by {methodLabel(r.parent_gateway, r.parent_method)}
              </Badge>
            )}
            {isRefund && isCompleted && (r.refund_gateway || "").toLowerCase() === "payfast" ? (
              <Badge className="text-xs bg-emerald-600 hover:bg-emerald-600">
                Auto-processed
              </Badge>
            ) : null}
            {isCreditIssue && (
              <Badge className="text-xs bg-emerald-600 hover:bg-emerald-600">
                Cancellation credit
              </Badge>
            )}
            {isCreditRedeem && (
              <Badge className="text-xs bg-blue-600 hover:bg-blue-600">
                Applied to invoice
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Raised {new Date(r.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
            {r.event_date ? `, event was ${new Date(r.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
            {r.processed_at ? `, paid ${new Date(r.processed_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </div>
          {r.reason ? <p className="text-xs text-slate-600 mt-1">{r.reason}</p> : null}
          {/* Quick drilldowns -- so an operator working a refund row can
              jump to the source order, the client's contact record, or
              the original invoice without backing out and searching. */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
            {r.order_id ? (
              <Link
                href={withSlug(`/admin/orders?orderId=${r.order_id}`)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                View order
              </Link>
            ) : null}
            {r.client_id ? (
              <Link
                href={withSlug(`/admin/contacts?clientId=${r.client_id}`)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"
              >
                <UserIcon className="w-3 h-3" />
                View client
              </Link>
            ) : null}
            {r.invoice_id ? (
              <Link
                href={withSlug(`/admin/invoices?invoiceId=${r.invoice_id}`)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline"
              >
                <Receipt className="w-3 h-3" />
                View original payment
              </Link>
            ) : null}
          </div>
        </div>
        {showMarkPaid ? (
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            onClick={() => markPaid(r)}
            disabled={busy === r.id}
          >
            {busy === r.id ? "Marking..." : "Mark refund paid"}
          </Button>
        ) : null}
        {showRetry ? (
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
            onClick={() => retryAuto(r)}
            disabled={busy === r.id}
          >
            {busy === r.id ? "Retrying..." : "Retry refund"}
          </Button>
        ) : null}
      </div>
    );
  };

  const FilterChip = ({ k, label, count, total }: { k: FilterKey; label: string; count: number; total: number }) => (
    <button
      type="button"
      onClick={() => setFilter(k)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colours ${
        filter === k
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
      }`}
      title={total > 0 ? `${count} refund${count === 1 ? "" : "s"} totalling ${fmt.format(total)}` : undefined}
    >
      {label}
      <span className={`ml-2 ${filter === k ? "text-slate-300" : "text-slate-500"}`}>
        {count}
      </span>
      {total > 0 && (
        <span className={`ml-1.5 pl-1.5 border-l ${filter === k ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-500"}`}>
          {tenantCurrency.symbol}{fmtCompact(total)}
        </span>
      )}
    </button>
  );

  return (
    <>
      <Head>
        <title>Refunds & Credits | CateringMS</title>
        <NoIndexMeta />
      </Head>
      <div className="min-h-screen bg-slate-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <AdminNav />
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-7 h-7 text-rose-600" />
                Refunds &amp; Credits
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Cancellation refunds plus store-credit issuances and redemptions. PayFast refunds auto-process; EFT and cash need a manual mark as paid. Credit movements are display-only -- they auto-completed at issue or redeem time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Phase 16 #7: refunds CSV export. Bookkeeping team
                  reconciling refunds against the gateway / bank
                  statement needs an offline copy. Reads from the
                  filtered list so filter chip scope flows through. */}
              <Button
                variant="outline"
                onClick={() => {
                  if (filtered.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust filters until at least one refund is visible." });
                    return;
                  }
                  // Wave 29.3: 'Kind' column lets finance pivot the
                  // exported sheet by refund / credit_issue /
                  // credit_redeem when reconciling against the bank.
                  const headers = [
                    "Created", "Processed", "Kind", "Order number", "Client", "Event date",
                    "Amount", "Status", "Refund gateway", "Parent gateway", "Parent method", "Reason",
                  ];
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const lines = [headers.join(",")];
                  for (const r of filtered) {
                    lines.push([
                      esc(r.created_at), esc(r.processed_at),
                      esc(r.kind),
                      esc(r.order_number), esc(r.client_name), esc(r.event_date),
                      esc(r.amount), esc(r.status),
                      esc(r.refund_gateway), esc(r.parent_gateway), esc(r.parent_method),
                      esc(r.reason),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const stamp = new Date().toISOString().slice(0, 10);
                  a.download = `refunds_${stamp}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip k="all" label="All" count={counts.all} total={totals.all} />
            <FilterChip k="auto" label="Auto-processed (PayFast)" count={counts.auto} total={totals.auto} />
            <FilterChip k="credits" label="Store credits" count={counts.credits} total={totals.credits} />
            <FilterChip k="pending" label="Pending (manual EFT)" count={counts.pending} total={totals.pending} />
            <FilterChip k="rejected" label="Rejected" count={counts.rejected} total={totals.rejected} />
          </div>

          {/* Phase 17 #2: saved-view chips. Same pattern as orders /
              quotes / invoices / contacts. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {savedRefundViews.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs">
                <button
                  type="button"
                  onClick={() => applySavedRefundView(v)}
                  className="px-2.5 py-0.5 hover:underline"
                  title={`Apply: ${v.filter}`}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedRefundView(v.id)}
                  className="pr-1.5 text-purple-500 hover:text-purple-800"
                  title="Remove this view"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={saveCurrentRefundView}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 text-slate-500 text-xs px-2.5 py-0.5 hover:border-purple-300 hover:text-purple-700"
              title="Save the current filter as a named view"
            >
              + Save view
            </button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {filter === "all"
                  ? "All refunds & credits"
                  : filter === "auto"
                    ? "Auto-processed (PayFast)"
                    : filter === "credits"
                      ? "Store credit movements"
                      : filter === "pending"
                        ? "Pending refunds"
                        : "Rejected refunds"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500 text-center py-8">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-8">Nothing here.</div>
              ) : (
                filtered.map((r) => <Row key={r.id} r={r} />)
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default ProtectedRefundsPage;
