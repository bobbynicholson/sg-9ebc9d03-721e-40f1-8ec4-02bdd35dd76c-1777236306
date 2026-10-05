/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC H.1: admin-tier "edits live in the quote" notice.
 *
 * The unified order doc is the operational source of truth - it's
 * read-only for everyone. Field changes (menu, guest count, event
 * date, venue, pricing, etc.) happen on the source quote, which
 * mirrors to the order via the existing
 * 20260515510000_wave51_b1_quote_to_order_mirror_trigger.
 *
 * This banner is the admin's way out of the doc to the editor. It
 * only renders for admin-tier roles (staff don't need to be told
 * to edit a quote they can't access) and only when the order has
 * a linked quote_id (manual orders without a source quote get a
 * different message - "no source quote, contact admin").
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { Pencil, FileSignature, AlertCircle, ArrowRight } from "lucide-react";

interface Props {
  orderId: string;
  quoteId: string | null;
  status: string;
}

export function OrderEditNotice({ orderId, quoteId, status }: Props) {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const canEdit = canSeeOtherStaffPay(user?.role as UserRole | undefined);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit || !quoteId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("quotes")
          .select("quote_number")
          .eq("id", quoteId)
          .maybeSingle();
        if (!cancelled && data?.quote_number) setQuoteNumber(data.quote_number);
      } catch {
        // swallow - just no quote number label
      }
    })();
    return () => { cancelled = true; };
  }, [quoteId, canEdit]);

  // Hidden for staff (they can't access quotes anyway) and on closed/
  // cancelled orders (no point pointing at a quote for a finished job).
  if (!canEdit) return null;
  if (status === "cancelled" || status === "completed") return null;

  if (!quoteId) {
    // Manual order - no source quote. Different copy.
    return (
      <div className="flex items-start gap-3 p-3 mb-3 rounded-lg border-2 border-amber-300 bg-amber-50 print:hidden">
        <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">Manual order</p>
          <p className="text-sm font-medium text-amber-900 mt-0.5">
            This order has no source quote. Field edits aren't propagated automatically - contact an admin to amend the menu, event details, or pricing through a new quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2 print:hidden">
      <Pencil className="h-4 w-4 flex-shrink-0 text-blue-600" />
      <p className="min-w-[13rem] flex-1 text-xs text-blue-900">
        <span className="font-semibold">To change menu, guests, date, venue or price, edit the quote.</span>{" "}
        <span className="text-blue-800/80">Changes copy to this order automatically.</span>
      </p>
      <a
        href={withSlug(`/admin/quotes/${quoteId}`)}
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        <FileSignature className="w-3.5 h-3.5" />
        Edit quote {quoteNumber || ""}
        <ArrowRight className="w-3 h-3" />
      </a>
    </div>
  );
}
