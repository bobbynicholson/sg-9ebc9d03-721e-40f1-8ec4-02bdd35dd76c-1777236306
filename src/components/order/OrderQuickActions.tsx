import { OrderWhatsAppButton } from "@/components/messaging/WorkflowWhatsAppButtons";
import type { WhatsAppOrder } from "@/lib/whatsappContexts";
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
 *   - WhatsApp (editable booking message in the shared composer)
 *   - Email (mailto: pre-populated subject)
 *
 * Admin-tier only - previewing-as-client, minting tokens, and
 * jumping to invoices are admin functions. Staff don't need them.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { staffOrderHref } from "@/lib/orderUrls";
import { UserRole } from "@/types/app";
import {
  FileText, Eye, Copy, Receipt, Phone, Mail, UserPlus, Truck, ChefHat,
  Users, UserRound, FolderOpen, ChevronDown,
} from "lucide-react";

interface Props {
  order: WhatsAppOrder & {
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

  const triggerClass = "h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-auto sm:gap-2 sm:px-3";
  const menuIconClass = "mr-2 h-4 w-4 shrink-0 text-slate-500";

  return (
    <div className="mb-3 flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm print:hidden sm:gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClass} aria-label="Team actions" title="Team actions">
            <Users className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Team</span>
            <ChevronDown className="hidden h-4 w-4 sm:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem asChild>
            <Link href={withSlug(`/admin/order-assignments?orderId=${order.id}`)}>
              <Truck className={menuIconClass} />{order.assigned_driver_id ? "Change driver" : "Assign driver"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={withSlug(`/admin/orders/${order.id}/ticket`)}>
              <ChefHat className={menuIconClass} />Open kitchen
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={withSlug(`${staffOrderHref(order.id, "admin")}#section-waiter`)}>
              <UserPlus className={menuIconClass} />Assign waiter
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClass} aria-label="Client actions" title="Client actions">
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Client</span>
            <ChevronDown className="hidden h-4 w-4 sm:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {phone && (
            <DropdownMenuItem asChild>
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                <Phone className={menuIconClass} />Call client
              </a>
            </DropdownMenuItem>
          )}
          {email && (
            <DropdownMenuItem asChild>
              <a href={`mailto:${email}?subject=${encodeURIComponent(emailSubject)}`}>
                <Mail className={menuIconClass} />Email client
              </a>
            </DropdownMenuItem>
          )}
          {(phone || email) && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => void openClientPreview()}>
            <Eye className={menuIconClass} />Client view
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyClientLink()}>
            <Copy className={menuIconClass} />Copy link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OrderWhatsAppButton order={order} compactOnMobile />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={triggerClass} aria-label="Order documents" title="Order documents">
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Documents</span>
            <ChevronDown className="hidden h-4 w-4 sm:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {order.quote_id && (
            <DropdownMenuItem asChild>
              <Link href={withSlug(`/admin/quotes/${order.quote_id}`)}>
                <FileText className={menuIconClass} />Quote
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={withSlug(`/admin/invoices?orderId=${order.id}`)}>
              <Receipt className={menuIconClass} />Invoice
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
