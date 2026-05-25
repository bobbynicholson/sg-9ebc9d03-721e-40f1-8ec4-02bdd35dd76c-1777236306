/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC H.4: quick-action chip strip at the top of the order doc.
 *
 * Mirrors the chips the old OrderDetailsModal carried so when admin
 * row-click migrates from modal to doc, they don't lose:
 *
 *   - Quote link (public token client view OR /admin/quotes/[id])
 *   - Client view (mints a magic-link preview in a new tab)
 *   - Copy link (mints a tokenised client-view URL to clipboard)
 *   - Invoice (jumps to /admin/invoices filtered to this order)
 *   - Call (tel:)
 *   - WhatsApp (wa.me pre-populated with first-name + order_number)
 *   - Email (mailto: pre-populated subject)
 *
 * Admin-tier only - previewing-as-client, minting tokens, and
 * jumping to invoices are admin functions. Staff don't need them.
 */
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import {
  FileText, Eye, Copy, Receipt, Phone, MessageCircle, Mail,
} from "lucide-react";

interface Props {
  order: {
    id: string;
    order_number: string | null;
    client_name: string | null;
    client_phone: string | null;
    client_email: string | null;
    quote_id: string | null;
  };
}

export function OrderQuickActions({ order }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const canSee = canSeeOtherStaffPay(user?.role as UserRole | undefined);

  if (!canSee) return null;

  const phone = order.client_phone || "";
  const email = order.client_email || "";
  const firstName = (order.client_name || "there").trim().split(" ")[0] || "there";
  const waMessage = `Hi ${firstName}, regarding your booking ${order.order_number || ""}`;
  const emailSubject = `Booking ${order.order_number || "your order"}`;

  const openClientPreview = async () => {
    try {
      const r = await fetch(`/api/orders/${order.id}/preview-as-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not generate preview link");
      window.open(j.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Couldn't open preview", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const copyClientLink = async () => {
    try {
      const r = await fetch(`/api/orders/${order.id}/preview-as-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not mint link");
      await navigator.clipboard.writeText(String(j.url));
      toast({ title: "Client link copied", description: "Paste it into your WhatsApp or email." });
    } catch (e: any) {
      toast({ title: "Couldn't copy link", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const chipBase = "inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 transition";
  const slateChip = `${chipBase} text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900`;
  const greenChip = `${chipBase} text-green-800 bg-green-50 border border-green-200 hover:bg-green-100`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 print:hidden">
      {order.quote_id && (
        <Link
          href={withSlug(`/admin/quotes/${order.quote_id}`)}
          className={slateChip}
          title="Open the source quote"
        >
          <FileText className="w-3.5 h-3.5" />
          Quote
        </Link>
      )}
      <button type="button" onClick={openClientPreview} className={slateChip} title="Open the page the client sees in a new tab">
        <Eye className="w-3.5 h-3.5" />
        Client view
      </button>
      <button type="button" onClick={copyClientLink} className={slateChip} title="Copy a tokenised client-view link">
        <Copy className="w-3.5 h-3.5" />
        Copy link
      </button>
      <Link
        href={withSlug(`/admin/invoices?orderId=${order.id}`)}
        className={slateChip}
        title="Open the invoice list filtered to this order"
      >
        <Receipt className="w-3.5 h-3.5" />
        Invoice
      </Link>
      {phone && (
        <>
          <a
            href={`tel:${phone.replace(/[^+\d]/g, "")}`}
            className={slateChip}
            title={`Call ${phone}`}
          >
            <Phone className="w-3.5 h-3.5" />
            Call {phone}
          </a>
          <a
            href={`https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(waMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={greenChip}
            title="Open WhatsApp pre-filled"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </a>
        </>
      )}
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(emailSubject)}`}
          className={slateChip}
          title={`Email ${email}`}
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </a>
      )}
    </div>
  );
}
