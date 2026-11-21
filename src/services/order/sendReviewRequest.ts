/* eslint-disable @typescript-eslint/no-explicit-any */
import { deliverAutomatedEmail } from "@/lib/email/automatedDelivery";
import { mintOrderCustomerLink } from "@/lib/customerLinksServer";
import { renderTemplate, TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

/** Send the review request to the client's secure in-app order rating form. */
export async function sendOrderReviewRequest(db: any, orderId: string) {
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, company_id, order_number, event_name, client_id, client_email, client_name, status, delivered_at, completed_at")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Order not found.");
  if (!(order.delivered_at || order.completed_at || ["delivered", "completed"].includes(String(order.status || "").toLowerCase()))) {
    return { sent: false, reason: "not_delivered" as const };
  }

  const { data: existingFeedback, error: feedbackError } = await db
    .from("delivery_feedback")
    .select("id")
    .eq("order_id", order.id)
    .eq("company_id", order.company_id)
    .limit(1)
    .maybeSingle();
  if (feedbackError) throw feedbackError;
  if (existingFeedback?.id) return { sent: false, reason: "already_reviewed" as const };

  const [outgoing, automation] = await Promise.all([
    db.from("outgoing_email_queue")
      .select("status, sent_at")
      .eq("company_id", order.company_id)
      .eq("trigger_ref_id", order.id)
      .eq("template_type", "review_request"),
    db.from("email_automation_log")
      .select("status, sent_at")
      .eq("order_id", order.id)
      .eq("template_type", "review_request"),
  ]);
  const wasSent = [outgoing, automation].some(({ data, error }) => {
    if (error) {
      console.warn("[sendOrderReviewRequest] sent-email history lookup failed:", error.message);
      return false;
    }
    return (data || []).some((row: any) =>
      !!row.sent_at || ["sent", "delivered", "completed"].includes(String(row.status || "").toLowerCase()),
    );
  });
  if (wasSent) return { sent: false, reason: "already_sent" as const };

  const [{ data: company, error: companyError }, { data: template, error: templateError }] = await Promise.all([
    db.from("companies").select("company_name").eq("id", order.company_id).maybeSingle(),
    db.from("email_templates")
      .select("subject, body, is_active")
      .eq("company_id", order.company_id)
      .eq("template_type", "review_request")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (companyError) throw companyError;
  if (templateError) throw templateError;

  const companyName = company?.company_name || "the catering team";
  const firstName = String(order.client_name || "there").trim().split(/\s+/)[0] || "there";
  if (!order.client_email) {
    await notifyClientReviewRequest(db, order, companyName);
    return { sent: false, reason: "missing_email" as const };
  }
  const secureOrderUrl = await mintOrderCustomerLink({
    sb: db,
    companyId: order.company_id,
    orderId: order.id,
    label: "post-delivery-review",
  });
  if (!/[?&]t=/.test(secureOrderUrl)) {
    throw new Error("Could not create the secure client order link.");
  }
  const reviewLink = `${secureOrderUrl}&feedback=1#feedback`;
  const vars: Record<string, string> = {
    first_name: firstName,
    name: firstName,
    client_name: order.client_name || firstName,
    company_name: companyName,
    tenant_name: companyName,
    order_id: order.id,
    order_number: order.order_number || order.id,
    event_name: order.event_name || "your event",
    order_url: secureOrderUrl,
    review_link: reviewLink,
  };
  const defaultTemplate = TEMPLATE_REGISTRY.find((entry) => entry.key === "review_request");
  const subjectTemplate = template?.subject || defaultTemplate?.defaultSubject || `How was ${companyName}?`;
  const bodyTemplate = template?.body || defaultTemplate?.defaultBody ||
    `Hi {{first_name}},\n\nThank you for choosing {{tenant_name}} for {{event_name}}.\n\n` +
    `Leave a review: {{review_link}}\n\nView your order: {{order_url}}\n\nWarm regards,\n{{tenant_name}}`;
  const subject = renderTemplate(subjectTemplate, vars);
  const renderedBody = renderTemplate(bodyTemplate, vars);
  const withoutReviewLink = renderedBody.split(reviewLink).join("");
  const withRatingLink = renderedBody.includes(reviewLink)
    ? renderedBody
    : `${renderedBody.trim()}\n\nLeave a review in your client portal:\n${reviewLink}`;
  const withOrderLink = withoutReviewLink.includes(secureOrderUrl)
    || withoutReviewLink.includes(secureOrderUrl.replace(/&/g, "&amp;"))
    ? withRatingLink
    : `${withRatingLink.trim()}\n\nView your order and messages:\n${secureOrderUrl}`;
  const body = /\bthank/i.test(withOrderLink)
    ? withOrderLink
    : `${withOrderLink.trim()}\n\nThank you for choosing ${companyName}.`;

  const delivery = await deliverAutomatedEmail(db, {
    companyId: order.company_id,
    to: order.client_email,
    recipientName: order.client_name || null,
    subject,
    body,
    orderId: order.id,
    templateType: "review_request",
    triggerEvent: "review.request",
    triggerRefId: order.id,
  } as any);

  // A successful return can still mean "skipped" (the admin turned this
  // automatic email off, or the duplicate guard found a recent send).
  // Keep the durable queue row unsent in those cases so a later cron run can
  // retry. Callers must not stamp pending_reviews.sent_at on a skipped send.
  if (!delivery.success) {
    throw new Error(delivery.error || "The review email could not be sent.");
  }
  if (delivery.skippedBySettings || delivery.skipped_by_settings) {
    return { sent: false as const, reason: "settings_off" as const };
  }
  if (delivery.skipped_duplicate) {
    return { sent: false as const, reason: "duplicate_recently_sent" as const };
  }

  await notifyClientReviewRequest(db, order, companyName);
  return { sent: true as const, reviewLink };
}

async function notifyClientReviewRequest(db: any, order: any, companyName: string) {
  if (!order.client_id) return;
  try {
    const { data: client } = await db
      .from("clients")
      .select("user_id")
      .eq("id", order.client_id)
      .maybeSingle();
    if (client?.user_id) {
      await db.from("notifications").insert({
        company_id: order.company_id,
        user_id: client.user_id,
        recipient_id: client.user_id,
        notification_type: "review_request",
        title: "How was your experience?",
        message: `Thanks for booking with ${companyName}. We'd love to hear how it went.`,
        priority: "normal",
        link: `/client-portal/dashboard?orderId=${order.id}#past-events`,
        related_entity_type: "order",
        related_entity_id: order.id,
      });
    }
  } catch (error) {
    console.warn("[sendOrderReviewRequest] in-app prompt failed:", error);
  }
}
