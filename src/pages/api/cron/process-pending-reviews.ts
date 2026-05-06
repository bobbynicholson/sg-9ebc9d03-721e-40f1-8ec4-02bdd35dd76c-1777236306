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
 * -- matches process-email-queue / late-event-check granularity.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

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
    return res.status(500).json({ error: error.message });
  }

  // Cache company names so a batch of reviews for the same tenant
  // doesn't fan out to a query per row.
  const companyNameCache = new Map<string, string>();
  const fetchCompanyName = async (companyId: string): Promise<string> => {
    if (companyNameCache.has(companyId)) return companyNameCache.get(companyId)!;
    const { data } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();
    const name = ((data as any)?.company_name as string) || "us";
    companyNameCache.set(companyId, name);
    return name;
  };

  // Cache the review_request template per company. NULL means the
  // tenant hasn't customised one -- we fall back to a hardcoded body.
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
      const companyName = await fetchCompanyName(row.company_id);
      const firstName = (row.client_name || "there").split(" ")[0];

      // Email send -- only if we have an address. The brief notes the
      // template lives at email_templates.review_request; fall back
      // when the tenant hasn't seeded one.
      if (row.client_email) {
        const tpl = await fetchTemplate(row.company_id);
        const subject = tpl?.subject
          ? interpolate(tpl.subject, { name: firstName, company_name: companyName, order_id: row.order_id })
          : `How was ${companyName}?`;
        const body = tpl?.body
          ? interpolate(tpl.body, { name: firstName, company_name: companyName, order_id: row.order_id })
          : `Hi ${firstName},\n\nHow was ${companyName}? We'd love to hear how it went -- ` +
            `tag us on social or leave a quick review here:\n` +
            `https://www.google.com/search?q=${encodeURIComponent(companyName)}\n\n` +
            `Thanks for booking with us.`;

        try {
          await emailService.sendEmail({
            companyId: row.company_id,
            to: row.client_email,
            subject,
            body,
            orderId: row.order_id,
          });
        } catch (e) {
          // A blocked / quarantined recipient is not a failure of the
          // worker -- emailService logs it. We still mark sent_at so
          // we don't loop forever on a permanently undeliverable row.
          console.warn("[cron/process-pending-reviews] email send failed:", e);
        }
      }

      // In-app prompt -- only if we resolved the auth uid at insert.
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
            metadata: { orderId: row.order_id },
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
