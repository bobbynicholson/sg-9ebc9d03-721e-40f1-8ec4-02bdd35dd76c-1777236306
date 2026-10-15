/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email the catering company when a client asks to change a confirmed
 * order (client portal or the order link in their email).
 *
 * Before 2026-10-15 these requests only created an in-app bell
 * notification, so companies never got an email. Quote change requests
 * already email the company; this mirrors that: companies.email first,
 * otherwise the owner / company admin logins.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

const FIELD_LABELS: Record<string, string> = {
  guest_count: "Guest count",
  menu_items: "Menu",
  equipment_items: "Equipment",
  special_instructions: "Special instructions",
  delivery_time: "Delivery time",
  venue_address: "Venue address",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One readable line per requested change, e.g. "Guest count: 120". */
export function describeOrderChanges(changes: Record<string, unknown>): string[] {
  return Object.entries(changes || {}).map(([key, value]) => {
    const label = FIELD_LABELS[key] || key.replace(/_/g, " ");
    if (Array.isArray(value)) {
      const names = value
        .map((item: any) => {
          if (item && typeof item === "object") {
            const name = item.name || item.item_name || item.title;
            const qty = item.quantity ?? item.qty;
            return name ? (qty != null ? `${name} x ${qty}` : String(name)) : null;
          }
          return item == null ? null : String(item);
        })
        .filter(Boolean) as string[];
      return names.length ? `${label}: ${names.join(", ")}` : `${label}: ${value.length} item${value.length === 1 ? "" : "s"}`;
    }
    if (value && typeof value === "object") return `${label}: updated`;
    return `${label}: ${value == null || value === "" ? "(cleared)" : String(value)}`;
  });
}

export interface OrderChangeRequestEmail {
  companyId: string;
  orderId: string;
  amendmentId: string;
  changes: Record<string, unknown>;
  notes?: string | null;
  /** Where the client made the request, shown in the email. */
  via: "client portal" | "order link";
}

/** Never throws: a failed alert must not undo the client's request. */
export async function emailCompanyAboutOrderChangeRequest(args: OrderChangeRequestEmail): Promise<{ sent: number; targets: string[] }> {
  try {
    const sb: any = getServiceSupabase();
    const [{ data: company }, { data: order }] = await Promise.all([
      sb.from("companies").select("email, company_name, slug").eq("id", args.companyId).maybeSingle(),
      sb.from("orders").select("order_number, client_name, client_email, event_date").eq("id", args.orderId).maybeSingle(),
    ]);

    let targets: string[] = company?.email ? [String(company.email).trim()] : [];
    if (targets.length === 0) {
      const { data: operators } = await sb
        .from("profiles")
        .select("email")
        .eq("company_id", args.companyId)
        .in("role", ["company_admin", "owner"]);
      targets = Array.from(new Set(((operators as any[]) || []).map((p) => String(p.email || "").trim()).filter(Boolean)));
    }
    if (targets.length === 0) {
      console.warn(`[orderChangeRequestEmail] no company email or admin login for company ${args.companyId}`);
      return { sent: 0, targets };
    }

    const orderRef = order?.order_number || args.orderId;
    const clientLabel = order?.client_name || order?.client_email || "A client";
    const eventLabel = order?.event_date
      ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
      : "date to be confirmed";
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com").replace(/\/$/, "");
    const link = `${appUrl}${company?.slug ? `/${company.slug}` : ""}/admin/orders?orderId=${encodeURIComponent(args.orderId)}&amendment=${encodeURIComponent(args.amendmentId)}`;
    const changeLines = describeOrderChanges(args.changes);
    const notes = (args.notes || "").trim();

    const body = `
      <p>Hi,</p>
      <p><strong>${escapeHtml(clientLabel)}</strong> has requested changes to order <strong>${escapeHtml(String(orderRef))}</strong> (event ${escapeHtml(eventLabel)}) from the ${args.via}.</p>
      ${changeLines.length ? `<p><strong>Requested changes</strong></p><ul>${changeLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
      ${notes ? `<p><strong>Client note</strong></p><blockquote style="border-left:3px solid #e2e8f0;margin:12px 0;padding:8px 16px;color:#475569;font-style:italic">${escapeHtml(notes).replace(/\n/g, "<br/>")}</blockquote>` : ""}
      <p>Nothing changes on the order until you approve it.</p>
      <p><a href="${link}" style="color:#4f46e5">Review change request &rarr;</a></p>
      <p style="font-size:12px;color:#94a3b8">${escapeHtml(company?.company_name || "CateringMS")} &mdash; automated notification</p>
    `;

    const { emailService } = await import("@/services/emailService");
    let sent = 0;
    for (const to of targets) {
      const ok = await emailService.sendEmail({
        companyId: args.companyId,
        to,
        subject: `Client change request - ${orderRef} (${clientLabel})`,
        body,
        orderId: args.orderId,
        skipUnsubscribeFooter: true,
        _client: sb,
      } as any);
      if (ok) sent += 1;
      else console.warn(`[orderChangeRequestEmail] email to ${to} was not sent for order ${orderRef}`);
    }
    return { sent, targets };
  } catch (error) {
    console.warn("[orderChangeRequestEmail] failed:", error);
    return { sent: 0, targets: [] };
  }
}
