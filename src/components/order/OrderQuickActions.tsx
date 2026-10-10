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
import { staffOrderHref } from "@/lib/orderUrls";
import { UserRole } from "@/types/app";
import {
  FileText, Eye, Copy, Receipt, Phone, MessageCircle, Mail, UserPlus, Truck, ChefHat,
} from "lucide-react";

interface Props {
  order: {
    id: string;
    order_number: string | null;
    client_name: string | null;
    client_phone: string | null;
    client_email: string | null;
    quote_id: string | null;
    assigned_driver_id?: string | null;
    assigned_chef_id?: string | null;
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

  // TIGHTEN I.111 (2026-06-02): the preview-as-client API returns a
  // relative path (`/c/order/{id}?t=...`). The previous code passed
  // that straight to window.open / clipboard, which:
  //   - For window.open: in some browser contexts navigated to the
  //     wrong tab origin and triggered the cross-tenant "Wrong company"
  //     middleware redirect.
  //   - For clipboard: pasted into WhatsApp/SMS as a "half link" with
  //     no domain.
  // ClientLinkButton already handled this correctly; mirror the same
  // pattern here. Build the absolute URL via window.location.origin
  // and bail with a toast if the API didn't return a url.
  const toAbsoluteUrl = (path: string): string => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (typeof window === "undefined") return path;
    return `${window.location.origin.replace(/\/$/, "")}${path}`;
  };

  const openClientPreview = async () => {
    try {
      const r = await fetch(`/api/orders/${order.id}/preview-as-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (!r.ok || !j?.url) {
        throw new Error(j?.error || "Could not generate preview link");
      }
      const absolute = toAbsoluteUrl(String(j.url));
      window.open(absolute, "_blank", "noopener,noreferrer");
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
      if (!r.ok || !j?.url) {
        throw new Error(j?.error || "Could not mint link");
      }
      const absolute = toAbsoluteUrl(String(j.url));
      await navigator.clipboard.writeText(absolute);
      toast({ title: "Client link copied", description: "Paste it into your WhatsApp or email." });
    } catch (e: any) {
      toast({ title: "Couldn't copy link", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  // One action bar, three labelled groups. Every chip shares one neutral
  // style; colour lives only in the icon so the row reads calmly.
  const chip = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary";
  const groupLabel = "mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={groupLabel}>Team</span>
        <Link href={withSlug(`/admin/order-assignments?orderId=${order.id}`)} className={chip} title="Choose the driver for this order">
          <Truck className="h-3.5 w-3.5 text-blue-600" />
          {order.assigned_driver_id ? "Change driver" : "Assign driver"}
        </Link>
        <Link href={withSlug(`/admin/orders/${order.id}/ticket`)} className={chip} title="Open the kitchen working screen to start, complete and hand over this order">
          <ChefHat className="h-3.5 w-3.5 text-orange-600" />
          Open kitchen
        </Link>
        <Link href={withSlug(`${staffOrderHref(order.id, "admin")}#section-waiter`)} className={chip} title="Open the Service team section to assign or remove waiters">
          <UserPlus className="h-3.5 w-3.5 text-amber-600" />
          Assign waiter
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={groupLabel}>Client</span>
        {phone && (
          <>
            <a href={`tel:${phone.replace(/[^+d]/g, "")}`} className={chip} title={`Call ${phone}`}>
              <Phone className="h-3.5 w-3.5 text-slate-500" />
              Call
            </a>
            <a
              href={`https://wa.me/${phone.replace(/[^d]/g, "")}?text=${encodeURIComponent(waMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={chip}
              title="Open WhatsApp pre-filled"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              WhatsApp
            </a>
          </>
        )}
        {email && (
          <a href={`mailto:${email}?subject=${encodeURIComponent(emailSubject)}`} className={chip} title={`Email ${email}`}>
            <Mail className="h-3.5 w-3.5 text-slate-500" />
            Email
          </a>
        )}
        <button type="button" onClick={openClientPreview} className={chip} title="Open the page the client sees in a new tab">
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Client view
        </button>
        <button type="button" onClick={copyClientLink} className={chip} title="Copy a tokenised client-view link">
          <Copy className="h-3.5 w-3.5 text-slate-500" />
          Copy link
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={groupLabel}>Documents</span>
        {order.quote_id && (
          <Link href={withSlug(`/admin/quotes/${order.quote_id}`)} className={chip} title="Open the source quote">
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            Quote
          </Link>
        )}
        <Link href={withSlug(`/admin/invoices?orderId=${order.id}`)} className={chip} title="Open the invoice list filtered to this order">
          <Receipt className="h-3.5 w-3.5 text-slate-500" />
          Invoice
        </Link>
      </div>
    </div>
  );
}
