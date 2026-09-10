/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";
import { withApiLogging } from "@/lib/withApiLogging";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";

const CRON_NAME = "expire-stale-quotes";

// Keep the query explicit. This endpoint runs with service-role access and
// should never accidentally pull unrelated quote/customer payloads.
const QUOTE_SELECT = [
  "id", "status", "valid_until", "company_id", "client_id", "client_email",
  "client_name", "quote_number", "quote_name", "event_date", "public_token",
  "expired_at", "expiry_admin_notified_at", "expiry_admin_emailed_at",
  "expiry_client_eligible",
  "expiry_client_notified_at", "expiry_client_emailed_at",
  "expiry_admin_notification_error", "expiry_admin_email_error",
  "expiry_client_notification_error", "expiry_client_email_error",
  "company:companies(email, company_name, slug, timezone)",
].join(", ");

type QuoteExpiryRow = Record<string, any> & {
  id: string;
  company_id: string;
  valid_until: string | null;
  company?: Record<string, any> | null;
};

function companyFor(row: QuoteExpiryRow): Record<string, any> {
  const company = row.company;
  return Array.isArray(company) ? company[0] || {} : company || {};
}

function quoteLabel(row: QuoteExpiryRow): string {
  return row.quote_number || row.quote_name || row.id;
}

function buildQuoteUrl(row: QuoteExpiryRow): string {
  const token = String(row.public_token || "").trim();
  if (!token) return "";
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://cateringms.com"
  ).replace(/\/$/, "");
  const slug = String(companyFor(row).slug || "").trim();
  return `${origin}${slug ? `/${slug}` : ""}/q/${encodeURIComponent(token)}`;
}

function hasPendingDelivery(row: QuoteExpiryRow): boolean {
  return Boolean(
    !row.expiry_admin_notified_at ||
    !row.expiry_admin_emailed_at ||
    (row.expiry_client_eligible && !row.expiry_client_notified_at && (row.client_id || row.client_email)) ||
    (row.expiry_client_eligible && !row.expiry_client_emailed_at && row.client_email),
  );
}

async function markRows(sb: any, ids: string[], patch: Record<string, any>) {
  if (ids.length === 0) return;
  const { error } = await sb.from("quotes").update(patch).in("id", ids);
  if (error) console.warn("[expire-stale-quotes] delivery marker update failed:", error.message);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const utcTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // First find only non-terminal quotes that are past their validity date.
    // The exact comparison is made in each tenant's local timezone.
    const { data: stale, error: selErr } = await sb
      .from("quotes")
      .select(QUOTE_SELECT)
      .lte("valid_until", utcTomorrow)
      .in("status", ["draft", "sent"])
      .is("deleted_at", null)
      .limit(2000);
    if (selErr) {
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: selErr.message });
      return res.status(500).json({ error: selErr.message });
    }

    const staleRows = ((stale || []) as QuoteExpiryRow[]).filter((row) => {
      if (!row.valid_until) return false;
      const tz = companyFor(row).timezone || DEFAULT_TENANT_TIMEZONE;
      return row.valid_until < toZonedISO(now, tz);
    });

    let newlyExpired: QuoteExpiryRow[] = [];
    if (staleRows.length > 0) {
      // The status predicate makes overlapping cron invocations race-safe.
      // Only the invocation that wins the transition receives these rows.
      // Drafts are internal records and must not cause a client email or
      // portal notification. Sent quotes are eligible for client comms.
      const updatedRows: QuoteExpiryRow[] = [];
      for (const group of [
        { ids: staleRows.filter((row) => row.status === "sent").map((row) => row.id), clientEligible: true },
        { ids: staleRows.filter((row) => row.status === "draft").map((row) => row.id), clientEligible: false },
      ]) {
        if (group.ids.length === 0) continue;
        const { data: updated, error: updateError } = await sb
          .from("quotes")
          .update({
            status: "expired",
            expired_at: nowIso,
            expiry_client_eligible: group.clientEligible,
            updated_at: nowIso,
          })
          .in("id", group.ids)
          .in("status", ["draft", "sent"])
          .select(QUOTE_SELECT);
        if (updateError) {
          await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: updateError.message });
          return res.status(500).json({ error: updateError.message });
        }
        updatedRows.push(...((updated || []) as QuoteExpiryRow[]));
      }
      newlyExpired = updatedRows;
    }

    // Retry rows whose status flip succeeded previously but whose delivery
    // channel failed. This is the key difference from the old one-shot flow.
    const { data: retryRows, error: retryError } = await sb
      .from("quotes")
      .select(QUOTE_SELECT)
      .eq("status", "expired")
      .not("expired_at", "is", null)
      .is("deleted_at", null)
      .limit(2000);
    if (retryError) {
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: retryError.message });
      return res.status(500).json({ error: retryError.message });
    }

    const rowsById = new Map<string, QuoteExpiryRow>();
    for (const row of [...newlyExpired, ...((retryRows || []) as QuoteExpiryRow[])]) {
      if (row?.id) rowsById.set(row.id, row);
    }
    const pendingRows = Array.from(rowsById.values()).filter(hasPendingDelivery);
    if (pendingRows.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", {
        source: auth.source, expired: newlyExpired.length, pending: 0,
      });
      return res.status(200).json({ ok: true, expired: newlyExpired.length, pending: 0 });
    }

    const { notificationService } = await import("@/services/notificationService");
    const { emailService } = await import("@/services/emailService");
    let adminNotified = 0;
    let adminEmailed = 0;
    let clientNotified = 0;
    let clientEmailed = 0;
    let deliveryFailures = 0;

    const grouped = (predicate: (row: QuoteExpiryRow) => boolean) => {
      const result = new Map<string, QuoteExpiryRow[]>();
      for (const row of pendingRows) {
        if (!row.company_id || !predicate(row)) continue;
        const list = result.get(row.company_id) || [];
        list.push(row);
        result.set(row.company_id, list);
      }
      return result;
    };

    // One in-app digest per tenant for company_admin/admin/owner roles.
    for (const [companyId, rows] of grouped((row) => !row.expiry_admin_notified_at)) {
      try {
        const sent = await notificationService.broadcastNotification({
          companyId,
          targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
          title: `📄 ${rows.length} quote${rows.length === 1 ? "" : "s"} expired`,
          message: `${rows.length} quote${rows.length === 1 ? "" : "s"} passed ${rows.length === 1 ? "its" : "their"} valid-until date and was automatically marked expired. Review and resend any quote that is still needed.`,
          type: "quotes_expired_digest",
          priority: "normal",
          link: "/admin/quotes",
          relatedEntityType: "company",
          relatedEntityId: companyId,
          dedup: true,
          dedupWindowMinutes: 20 * 60,
        }, sb);
        if ((sent || 0) > 0) {
          await markRows(sb, rows.map((row) => row.id), {
            expiry_admin_notified_at: nowIso,
            expiry_admin_notification_error: null,
          });
          adminNotified += 1;
        } else {
          deliveryFailures += 1;
          await markRows(sb, rows.map((row) => row.id), {
            expiry_admin_notification_error: "No active company admin recipient was found.",
          });
        }
      } catch (error: any) {
        deliveryFailures += 1;
        await markRows(sb, rows.map((row) => row.id), {
          expiry_admin_notification_error: error?.message || "Admin notification failed",
        });
      }
    }

    // One digest email goes to the company's canonical operating email. This
    // avoids sending the same digest once per admin profile and makes retry
    // state unambiguous.
    for (const [companyId, rows] of grouped((row) => !row.expiry_admin_emailed_at)) {
      const company = companyFor(rows[0]);
      const recipient = String(company.email || "").trim();
      if (!recipient) {
        deliveryFailures += 1;
        await markRows(sb, rows.map((row) => row.id), {
          expiry_admin_email_error: "The company has no admin email address configured.",
        });
        continue;
      }
      const companyName = company.company_name || "your CateringMS workspace";
      const subject = `${rows.length} quote${rows.length === 1 ? "" : "s"} expired in ${companyName}`;
      const body = [
        "Hello,", "",
        `${rows.length} quote${rows.length === 1 ? " has" : "s have"} passed its valid-until date and was automatically marked expired:`,
        "",
        ...rows.map((row) => `- ${quoteLabel(row)}${row.client_name ? ` · ${row.client_name}` : ""}${row.valid_until ? ` · valid until ${row.valid_until}` : ""}`),
        "",
        "Review the expired quotes in CateringMS and resend any quote that is still relevant.",
        "", "CateringMS",
      ].join("\n");
      try {
        const result = await emailService.sendEmailDetailed({
          companyId, to: recipient, subject, body,
          template: "quote_expired_admin",
          variables: { companyName, quoteCount: rows.length },
          _client: sb,
        } as any);
        if (result.success) {
          await markRows(sb, rows.map((row) => row.id), {
            expiry_admin_emailed_at: nowIso, expiry_admin_email_error: null,
          });
          adminEmailed += 1;
        } else {
          deliveryFailures += 1;
          await markRows(sb, rows.map((row) => row.id), {
            expiry_admin_email_error: result.error || "Admin email was not sent",
          });
        }
      } catch (error: any) {
        deliveryFailures += 1;
        await markRows(sb, rows.map((row) => row.id), {
          expiry_admin_email_error: error?.message || "Admin email failed",
        });
      }
    }

    // Client in-app notification + client email are per quote. A client
    // notification is only created for a real auth UID, never clients.id.
    for (const row of pendingRows) {
      if (row.expiry_client_eligible && !row.expiry_client_notified_at && (row.client_id || row.client_email)) {
        try {
          let clientUserId = row.client_id ? await resolveClientUserId(sb, row.client_id) : null;
          if (!clientUserId && row.client_email) {
            const { data: profile } = await sb
              .from("profiles")
              .select("id")
              .eq("company_id", row.company_id)
              .ilike("email", String(row.client_email).trim())
              .maybeSingle();
            clientUserId = profile?.id || null;
          }
          if (!clientUserId) {
            await markRows(sb, [row.id], {
              expiry_client_notification_error: "Client has no linked portal account; email delivery remains available.",
            });
          } else {
            const { data: existing } = await sb.from("notifications")
              .select("id")
              .eq("recipient_id", clientUserId)
              .eq("notification_type", "quote_expired_client")
              .eq("related_entity_id", row.id)
              .limit(1)
              .maybeSingle();
            const created = existing || await notificationService.createNotification({
              company_id: row.company_id,
              recipient_id: clientUserId,
              user_id: clientUserId,
              notification_type: "quote_expired_client",
              title: "Your quote has expired",
              message: `Quote ${quoteLabel(row)} passed its valid-until date (${row.valid_until || "the validity date"}) and was automatically marked expired. Contact the catering team if you would like an updated quote.`,
              priority: "normal",
              link: "/client-portal/quotes",
              related_entity_type: "quote",
              related_entity_id: row.id,
              dedup: true,
              dedupWindowMinutes: 365 * 24 * 60,
            }, sb);
            if (created) {
              await markRows(sb, [row.id], {
                expiry_client_notified_at: nowIso,
                expiry_client_notification_error: null,
              });
              clientNotified += 1;
            } else {
              deliveryFailures += 1;
              await markRows(sb, [row.id], {
                expiry_client_notification_error: "Client notification could not be created.",
              });
            }
          }
        } catch (error: any) {
          deliveryFailures += 1;
          await markRows(sb, [row.id], {
            expiry_client_notification_error: error?.message || "Client notification failed",
          });
        }
      }

      if (row.expiry_client_eligible && !row.expiry_client_emailed_at && row.client_email) {
        const company = companyFor(row);
        const companyName = company.company_name || "the catering team";
        const quoteUrl = buildQuoteUrl(row);
        const subject = `Your quote ${quoteLabel(row)} has expired`;
        const body = [
          `Hello ${row.client_name || "there"},`, "",
          `Your quote ${quoteLabel(row)} for ${row.quote_name || "your event"} expired because it was not accepted before ${row.valid_until || "the validity date"}.`,
          "",
          `If you still need this event, please contact ${companyName} and ask for an updated quote.`,
          ...(quoteUrl ? ["", `You can still review the quote details here: ${quoteUrl}`] : []),
          "", `Kind regards,\n${companyName}`,
        ].join("\n");
        try {
          const result = await emailService.sendEmailDetailed({
            companyId: row.company_id,
            to: String(row.client_email).trim(),
            subject,
            body,
            template: "quote_expired_client",
            quoteId: row.id,
            variables: {
              clientName: row.client_name || "there",
              companyName,
              quoteNumber: quoteLabel(row),
              quoteUrl,
              validUntil: row.valid_until || "",
            },
            _client: sb,
          } as any);
          if (result.success) {
            await markRows(sb, [row.id], {
              expiry_client_emailed_at: nowIso,
              expiry_client_email_error: null,
            });
            clientEmailed += 1;
          } else {
            deliveryFailures += 1;
            await markRows(sb, [row.id], {
              expiry_client_email_error: result.error || "Client email was not sent",
            });
          }
        } catch (error: any) {
          deliveryFailures += 1;
          await markRows(sb, [row.id], {
            expiry_client_email_error: error?.message || "Client email failed",
          });
        }
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, deliveryFailures > 0 ? "error" : "ok", {
      source: auth.source,
      expired: newlyExpired.length,
      pending: pendingRows.length,
      admin_in_app: adminNotified,
      admin_email: adminEmailed,
      client_in_app: clientNotified,
      client_email: clientEmailed,
      delivery_failures: deliveryFailures,
    });
    return res.status(200).json({
      ok: true,
      expired: newlyExpired.length,
      pending: pendingRows.length,
      adminNotified,
      adminEmailed,
      clientNotified,
      clientEmailed,
      deliveryFailures,
    });
  } catch (error: any) {
    console.error("[expire-stale-quotes] crashed:", error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error?.message || "crash" });
    return res.status(500).json({ error: error?.message || "crash" });
  }
}

export default withApiLogging(handler);
