/**
 * GET /api/cron/process-pending-reviews
 *
 * Cron worker that drains pending_reviews. Replaces the broken
 * notificationService.sendReviewRequest setTimeout(24h) flow --
 * Vercel serverless functions don't survive 24h, so the timer never
 * fired and zero reviews were captured platform-wide.
 *
 * Logic:
 *   - Reads pending_reviews where sent_at IS NULL AND cancelled_at
 *     IS NULL AND due_at <= now(), ordered by due_at ASC, capped at
 *     200 rows per fire.
 *   - For each row: send the review email (using the company's
 *     review_request template, falling back to a hardcoded body) and
 *     fire an in-app notification when client_user_id is set.
 *   - On success: stamp sent_at = now(). On failure: log + continue
 *     (a single bad recipient must not stop the batch).
 *   - Bail-cap: 5min wall clock or 200 rows, whichever hits first.
 *
 * Auth: shared CRON_SECRET via Authorization: Bearer ${CRON_SECRET}.
 *
 * Vercel cron schedule: every 15 minutes (configured in vercel.json)
 * - matches process-email-queue / late-event-check granularity.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "process-pending-reviews";
const BATCH_LIMIT = 200;
const RUNTIME_CAP_MS = 5 * 60 * 1000;

type PendingReview = {
  id: string;
  company_id: string;
  order_id: string;
  client_id: string | null;
  client_user_id: string | null;
  client_email: string | null;
  client_name: string | null;
  delivered_at: string;
  due_at: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("pending_reviews")
    .select("id, company_id, order_id, client_id, client_user_id, client_email, client_name, delivered_at, due_at")
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron/process-pending-reviews] read failed:", error);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }

  // Cache company name + Google place_id so a batch of reviews for
  // the same tenant doesn't fan out to a query per row. Phase 5 #3:
  // place_id drives the review URL - tenants with a Google Business
  // Profile get a write-review deeplink, the rest fall back to a
  // Maps search by name.
  const companyCache = new Map<string, { name: string; placeId: string | null }>();
  const fetchCompany = async (
    companyId: string,
  ): Promise<{ name: string; placeId: string | null }> => {
    if (companyCache.has(companyId)) return companyCache.get(companyId)!;
    const { data } = await supabase
      .from("companies")
      .select("company_name, google_place_id")
      .eq("id", companyId)
      .maybeSingle();
    const row = {
      name: ((data as any)?.company_name as string) || "us",
      placeId: ((data as any)?.google_place_id as string) || null,
    };
    companyCache.set(companyId, row);
    return row;
  };

  // Build the right review URL. Place-id-backed deeplink lands the
  // customer straight on the write-review modal in their Google
  // account - highest conversion. Without a place_id we fall back
  // to a Maps search; the customer still has to click into the
  // listing but the operator at least gets actual Google reviews.
  const reviewUrl = (placeId: string | null, companyName: string): string => {
    if (placeId) {
      return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(companyName)}`;
  };

  // Cache the review_request template per company. NULL means the
  // tenant hasn't customised one - we fall back to a hardcoded body.
  const templateCache = new Map<string, { subject: string; body: string } | null>();
  const fetchTemplate = async (companyId: string): Promise<{ subject: string; body: string } | null> => {
    if (templateCache.has(companyId)) return templateCache.get(companyId)!;
    const { data } = await supabase
      .from("email_templates")
      .select("subject, body, is_active")
      .eq("company_id", companyId)
      .eq("template_type", "review_request")
      .eq("is_active", true)
      .maybeSingle();
    const tpl = data
      ? { subject: (data as any).subject as string, body: (data as any).body as string }
      : null;
    templateCache.set(companyId, tpl);
    return tpl;
  };

  let sent = 0;
  let failed = 0;
  let bailed = false;

  for (const row of (due || []) as PendingReview[]) {
    if (Date.now() - startedAt > RUNTIME_CAP_MS) {
      bailed = true;
      break;
    }

    try {
      const company = await fetchCompany(row.company_id);
      const companyName = company.name;
      const firstName = (row.client_name || "there").split(" ")[0];
      const review = reviewUrl(company.placeId, companyName);

      // Email send - only if we have an address. Template lives at
      // email_templates.review_request and supports {review_link}
      // for tenants who want the link inside their custom copy;
      // falls back to a hardcoded body otherwise.
      if (row.client_email) {
        const tpl = await fetchTemplate(row.company_id);
        const vars = {
          name: firstName,
          company_name: companyName,
          order_id: row.order_id,
          review_link: review,
        };
        const subject = tpl?.subject
          ? interpolate(tpl.subject, vars)
          : `How was ${companyName}?`;
        const body = tpl?.body
          ? interpolate(tpl.body, vars)
          : `Hi ${firstName},\n\nHow was ${companyName}? We'd love to hear how it went. ` +
            `If you can spare 30 seconds, a quick Google review goes a long way:\n\n` +
            `${review}\n\n` +
            `Thanks for booking with us.`;

        try {
          await emailService.sendEmail({
            companyId: row.company_id,
            to: row.client_email,
            subject,
            body,
            orderId: row.order_id,
            // Wave 24: cron worker - pass service-role client so
            // getEmailConfig can read email_provider_settings under
            // RLS. Without this the helper falls back to browser anon
            // and the SELECT silently returns nothing, so the email
            // never sends and we mark sent_at anyway.
            _client: supabase,
          } as any);
        } catch (e) {
          // A blocked / quarantined recipient is not a failure of the
          // worker - emailService logs it. We still mark sent_at so
          // we don't loop forever on a permanently undeliverable row.
          console.warn("[cron/process-pending-reviews] email send failed:", e);
        }
      }

      // In-app prompt - only if we resolved the auth uid at insert.
      if (row.client_user_id) {
        try {
          await supabase.from("notifications").insert({
            company_id: row.company_id,
            recipient_id: row.client_user_id,
            user_id: row.client_user_id,
            notification_type: "review_request",
            title: "How was your experience?",
            message: `Thanks for booking with ${companyName}. We'd love to hear how it went.`,
            priority: "normal",
            link: `/client-portal/feedback?orderId=${row.order_id}`,
            // notifications has no metadata column - use related_entity_*
            // (writing metadata PGRST204s and the review prompt is lost).
            related_entity_type: "order",
            related_entity_id: row.order_id,
          } as any);
        } catch (e) {
          console.warn("[cron/process-pending-reviews] in-app notify failed:", e);
        }
      }

      const { error: updateError } = await supabase
        .from("pending_reviews")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) {
        console.error("[cron/process-pending-reviews] sent_at stamp failed:", updateError);
        failed += 1;
      } else {
        sent += 1;
      }
    } catch (e) {
      console.error("[cron/process-pending-reviews] row failed:", row.id, e);
      failed += 1;
    }
  }

  await recordCronHeartbeat(supabase, CRON_NAME, failed > 0 ? "error" : "ok", {
    source: auth.source,
    checked: (due || []).length,
    sent, failed, bailed,
    runtime_ms: Date.now() - startedAt,
  });
  return res.status(200).json({
    ok: true,
    checked: (due || []).length,
    sent,
    failed,
    bailed,
    runtime_ms: Date.now() - startedAt,
  });
}

/**
 * Tiny {placeholder} interpolator. Matches the shape used elsewhere in
 * the codebase so operators authoring review_request templates can
 * use the same {name} / {company_name} / {order_id} tokens.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

export default withApiLogging(handler);
