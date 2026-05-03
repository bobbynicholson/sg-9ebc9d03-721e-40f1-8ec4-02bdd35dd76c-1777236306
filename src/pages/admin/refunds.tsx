/**
 * /admin/refunds
 *
 * Pending + completed refunds list. Each pending row has a
 * "Mark refund paid" action that calls /api/refunds/[id]/mark-paid.
 * The completed view is a read-only audit of refunds already issued.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { UserRole } from "@/types/app";
import { Receipt, CheckCircle2, Clock, Search, RefreshCw } from "lucide-react";
import Link from "next/link";

interface RefundRow {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  created_at: string;
  processed_at: string | null;
  order_id: string | null;
  cancellation_request_id: string | null;
  // Joined
  order_number?: string | null;
  client_name?: string | null;
  event_date?: string | null;
}

const fmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

function ProtectedRefundsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <RefundsPage />
    </ProtectedRoute>
  );
}

function RefundsPage() {
  const { toast } = useToast();
  const { user } = useAuth() as any;
  const companyId = user?.company_id || null;

  const [pending, setPending] = useState<RefundRow[]>([]);
  const [completed, setCompleted] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("payments")
        .select("id, amount, status, reason, created_at, processed_at, order_id, cancellation_request_id, order:orders!payments_order_id_fkey(order_number, client_name, event_date)" as any)
        .eq("company_id", companyId)
        .eq("payment_type", "refund")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const flat: RefundRow[] = (rows || []).map((r: any) => ({
        id: r.id,
        amount: Number(r.amount) || 0,
        status: String(r.status || "pending"),
        reason: r.reason || null,
        created_at: r.created_at,
        processed_at: r.processed_at,
        order_id: r.order_id,
        cancellation_request_id: r.cancellation_request_id,
        order_number: r.order?.order_number || null,
        client_name: r.order?.client_name || null,
        event_date: r.order?.event_date || null,
      }));

      setPending(flat.filter((r) => r.status !== "completed"));
      setCompleted(flat.filter((r) => r.status === "completed"));
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

  const markPaid = async (refundId: string) => {
    setMarking(refundId);
    try {
      const res = await fetch(`/api/refunds/${refundId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Could not mark refund paid", description: json.error, variant: "destructive" });
      } else {
        toast({ title: "Refund marked paid", description: "Audit log entry created." });
        await load();
      }
    } catch (e: any) {
      toast({ title: "Could not mark refund paid", description: e?.message || "Network error", variant: "destructive" });
    } finally {
      setMarking(null);
    }
  };

  const Row = ({ r, mode }: { r: RefundRow; mode: "pending" | "completed" }) => (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className={`p-2 rounded-full ${mode === "pending" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
        {mode === "pending" ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-rose-700">{fmt.format(r.amount)}</strong>
          <span className="text-sm text-slate-700">refund</span>
          {r.order_number ? (
            <Link
              href={`/admin/orders?orderId=${r.order_id || ""}`}
              className="text-xs text-blue-700 hover:underline"
            >
              #{r.order_number}
            </Link>
          ) : null}
          {r.client_name ? <span className="text-xs text-slate-500">- {r.client_name}</span> : null}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          Raised {new Date(r.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
          {r.event_date ? `, event was ${new Date(r.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
          {r.processed_at ? `, paid ${new Date(r.processed_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </div>
        {r.reason ? <p className="text-xs text-slate-600 mt-1">{r.reason}</p> : null}
      </div>
      {mode === "pending" ? (
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
          onClick={() => markPaid(r.id)}
          disabled={marking === r.id}
        >
          {marking === r.id ? "Marking..." : "Mark refund paid"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <Head>
        <title>Refunds | CateringMS</title>
        <NoIndexMeta />
      </Head>
      <div className="min-h-screen bg-slate-50">
        <AdminNav />
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-7 h-7 text-rose-600" />
                Refunds
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Refunds raised by cancellations. Mark each one paid once you've sent the EFT or processed the gateway refund.
              </p>
            </div>
            <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="w-4 h-4" />
                Pending {pending.length > 0 ? <Badge variant="secondary">{pending.length}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Completed {completed.length > 0 ? <Badge variant="secondary">{completed.length}</Badge> : null}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pending refunds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <div className="text-sm text-slate-500 text-center py-8">Loading...</div>
                  ) : pending.length === 0 ? (
                    <div className="text-sm text-slate-500 text-center py-8">No refunds outstanding.</div>
                  ) : (
                    pending.map((r) => <Row key={r.id} r={r} mode="pending" />)
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="completed">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Completed refunds</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <div className="text-sm text-slate-500 text-center py-8">Loading...</div>
                  ) : completed.length === 0 ? (
                    <div className="text-sm text-slate-500 text-center py-8">No refunds processed yet.</div>
                  ) : (
                    completed.map((r) => <Row key={r.id} r={r} mode="completed" />)
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

export default ProtectedRefundsPage;
