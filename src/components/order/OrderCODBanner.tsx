/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: cash-on-delivery banner.
 *
 * When the order is paid (or partially paid) by cash and there's
 * still a balance owing as the driver heads out, this banner shows
 * the amount the driver should collect at delivery.
 *
 * Role gate:
 *   - admin tier: sees rand amount (operational + finance overlap)
 *   - assigned driver: sees rand amount (it's their job to collect)
 *   - other staff: banner not rendered
 *
 * Powered by payment_method + balance_amount + balance_paid on
 * orders. No new schema - 'cash' on payment_method + balance
 * outstanding = COD by inference.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { Banknote } from "lucide-react";

interface Props {
  orderId: string;
  status: string;
  assignedDriverId: string | null;
  deliveredAt: string | null;
}

const fmtZAR = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export function OrderCODBanner({ orderId, status, assignedDriverId, deliveredAt }: Props) {
  const { user } = useAuth();
  const isAdmin = canSeeOtherStaffPay(user?.role as UserRole | undefined);
  const isAssignedDriver = !!user?.id && assignedDriverId === user.id;
  const canSee = isAdmin || isAssignedDriver;

  const [payment, setPayment] = useState<{ payment_method: string | null; balance_amount: number | null; balance_paid: boolean | null } | null>(null);

  useEffect(() => {
    if (!canSee) return;
    // Don't bother fetching for already-paid / cancelled / done orders.
    if (status === "cancelled" || status === "completed") return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("orders")
          .select("payment_method, balance_amount, balance_paid")
          .eq("id", orderId)
          .maybeSingle();
        if (!cancelled && data) setPayment(data);
      } catch {
        // swallow - banner just doesn't render
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, canSee, status]);

  if (!canSee || !payment) return null;
  if (payment.balance_paid) return null;
  if (deliveredAt) return null; // already delivered - balance owed becomes invoice chasing, not COD

  const isCash = payment.payment_method === "cash";
  const balance = Number(payment.balance_amount || 0);
  if (!isCash || balance <= 0) return null;

  return (
    <div className="flex items-start gap-3 p-3 mb-3 rounded-lg border-2 border-brand-primary/30 bg-brand-primary/10 print:hidden">
      <Banknote className="w-6 h-6 text-brand-primary flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-brand-primary font-semibold">Cash on delivery</p>
        <p className="text-lg font-bold text-brand-primary tabular-nums leading-tight">
          Collect {fmtZAR.format(balance)} at delivery
        </p>
        <p className="text-xs text-brand-primary mt-0.5">
          Driver hands the cash back to the office on return. Note the receipt + amount in the POD.
        </p>
      </div>
    </div>
  );
}
