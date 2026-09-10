/**
 * Quick-mail helpers used by the Clients CRM. Returns 4 ways to send a
 * personalised email so the catering company can pick whichever client
 * they have open:
 *
 * - Gmail compose (cloud): opens https://mail.google.com... pre-filled
 * - Outlook compose (cloud): opens outlook.office.com... pre-filled
 * - Default mail app (mailto:): falls back to whatever the OS picks up
 * - Clipboard: copies subject + body so you can paste anywhere
 *
 * Direct delivery is handled by MessageComposer through the authenticated
 * /api/send-email route. These helpers intentionally remain the personal
 * draft/copy alternatives and never claim that a draft was sent.
 */

import { resolveTemplateSync } from "@/services/messageTemplateService";

export interface ComposePayload {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  fromName?: string;
}

const enc = (s: string) => encodeURIComponent(s ?? "");

export const composeEmail = {
  gmailUrl(p: ComposePayload): string {
    // Gmail's compose deep link
    const params = [
      `view=cm`,
      `fs=1`,
      `to=${enc(p.to)}`,
      p.cc ? `cc=${enc(p.cc)}` : "",
      p.bcc ? `bcc=${enc(p.bcc)}` : "",
      `su=${enc(p.subject)}`,
      `body=${enc(p.body)}`,
    ].filter(Boolean).join("&");
    return `https://mail.google.com/mail/?${params}`;
  },

  outlookUrl(p: ComposePayload): string {
    const params = [
      `to=${enc(p.to)}`,
      p.cc ? `cc=${enc(p.cc)}` : "",
      p.bcc ? `bcc=${enc(p.bcc)}` : "",
      `subject=${enc(p.subject)}`,
      `body=${enc(p.body)}`,
    ].filter(Boolean).join("&");
    return `https://outlook.office.com/mail/deeplink/compose?${params}`;
  },

  mailto(p: ComposePayload): string {
    const params = [
      p.cc ? `cc=${enc(p.cc)}` : "",
      p.bcc ? `bcc=${enc(p.bcc)}` : "",
      `subject=${enc(p.subject)}`,
      `body=${enc(p.body)}`,
    ].filter(Boolean).join("&");
    return `mailto:${enc(p.to)}?${params}`;
  },

  async copyToClipboard(p: ComposePayload): Promise<boolean> {
    const text = `To: ${p.to}\nSubject: ${p.subject}\n\n${p.body}`;
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },

  /** @deprecated Use MessageComposer's directEmail prop so the request
   *  includes the authenticated company scope and can be logged. */
  async sendDirect(_p: ComposePayload): Promise<{ ok: false; reason: "smtp_not_configured" }> {
    return { ok: false, reason: "smtp_not_configured" };
  },
};

/** Suggested email templates keyed off the recommended action.
 *  Wave 70.72: added "imported" - bulk-imported contacts who've
 *  never interacted with the system. Previously they fell through
 *  to "cold" which lumped them with real cold contacts (people
 *  the tenant USED to talk to, then went quiet). They're not the
 *  same audience - imported contacts have never said yes.
 *  Template registry uses the cold template as fallback for now. */
export type ClientStatus =
  | "hot_lead" | "quoted" | "won" | "active" | "returning"
  | "vip" | "quiet" | "cold" | "lost" | "imported";

export interface TemplateContext {
  contactName: string;
  companyName?: string;
  eventDate?: string;
  daysSinceLastContact?: number;
  fromName?: string;
  /** When provided, the renderer first checks the company's
   *  customised template (saved on /admin/messaging-templates) and
   *  falls back to the hardcoded default below if nothing custom
   *  is saved yet. Cache must be prewarmed via useTemplateOverrides. */
  companyId?: string | null;
}

/**
 * Map a ClientStatus to the registry key it overrides. Statuses not
 * in this map fall through to the hardcoded default in templateFor().
 * Add registry entries + map rows together to extend coverage.
 */
const CLIENT_STATUS_TO_REGISTRY: Partial<Record<ClientStatus, string>> = {
  hot_lead:  "email_lead_hot",
  quoted:    "email_lead_quoted",
  quiet:     "email_lead_quiet",
  lost:      "email_lead_lost",
  active:    "email_client_active",
  returning: "email_client_returning",
  vip:       "email_client_vip",
  cold:      "email_client_cold",
  won:       "email_client_won",
};

/** Build the registry context object from a TemplateContext. */
function buildClientCtx(ctx: TemplateContext): Record<string, string | number> {
  const first = (ctx.contactName || "there").split(" ")[0];
  return {
    first_name:   first,
    client_name:  ctx.contactName || "",
    company_name: ctx.companyName || "the team",
    from_name:    ctx.fromName || ctx.companyName || "the team",
    event_date:   ctx.eventDate || "",
    event_name:   "",
    guest_count:  "",
  };
}

export function templateFor(status: ClientStatus, ctx: TemplateContext): { subject: string; body: string } {
  // 1. Try the company override - only takes effect if cached AND
  //    the operator has saved a customisation. Otherwise we drop
  //    through to the hardcoded default so existing UX never changes
  //    for tenants who haven't customised yet.
  const overrideKey = CLIENT_STATUS_TO_REGISTRY[status];
  if (overrideKey) {
    const resolved = resolveTemplateSync({
      companyId: ctx.companyId ?? null,
      key: overrideKey,
      ctx: buildClientCtx(ctx),
    });
    if (resolved && resolved.fromOverride) {
      return { subject: resolved.subject, body: resolved.body };
    }
  }

  // 2. Hardcoded defaults (existing UX, unchanged).
  const first = (ctx.contactName || "there").split(" ")[0];
  const company = ctx.companyName || "the team";
  const sig = `\n\nBest,\n${ctx.fromName || company}`;
  switch (status) {
    case "hot_lead":
      return {
        subject: `Quick check-in on your catering enquiry`,
        body: `Hi ${first},\n\nThanks for reaching out about your event. Wanted to make sure your enquiry didn't slip through the cracks. Happy to put a quick quote together if you can share final guest numbers and your venue.\n\nLet me know if you'd like to book a 10-minute call.${sig}`,
      };
    case "quoted":
      return {
        subject: `Following up on your quote`,
        body: `Hi ${first},\n\nJust circling back on the quote we sent across. Anything you'd like changed, or shall we lock the date in for you?\n\nHappy to walk through the menu options if helpful.${sig}`,
      };
    case "active":
    case "returning":
      return {
        subject: ctx.eventDate ? `Final details for ${ctx.eventDate}` : `Final details for your upcoming event`,
        body: `Hi ${first},\n\nQuick check-in. Everything's on track for your upcoming event. Would you like to confirm guest numbers and any last menu tweaks this week?\n\nReply here and I'll lock it in.${sig}`,
      };
    case "vip":
      return {
        subject: `It's been a while, how are things?`,
        body: `Hi ${first},\n\nNo agenda here. Just wanted to drop a note and say hi. It's been ${ctx.daysSinceLastContact ?? "some"} days since we last caught up.\n\nIf there's anything coming up where we can help, you know where to find me.${sig}`,
      };
    case "quiet":
      return {
        subject: `Anything coming up we can help with?`,
        body: `Hi ${first},\n\nIt's been a while since your last event with us. Hope all is well.\n\nIf you have something on the horizon (birthday, work do, family thing), happy to put together ideas before you brief anyone else.${sig}`,
      };
    case "cold":
      return {
        subject: `Hello again`,
        body: `Hi ${first},\n\nReaching out after a long pause. We've added a few things to the menu since you last booked. Worth a look if you have anything coming up.\n\nNo pressure, just keeping the door open.${sig}`,
      };
    case "lost":
      return {
        subject: `Following up`,
        body: `Hi ${first},\n\nUnderstand you went a different way last time. Happy to be kept in the loop for the next event. Send me a quick note when something comes up and I'll put a fresh quote together.${sig}`,
      };
    case "won":
    default:
      return {
        subject: `Quick check-in`,
        body: `Hi ${first},\n\nHope all is well. Let me know if there's anything we can help with on the catering side.${sig}`,
      };
  }
}

/**
 * Quote-status email templates. Used by the Quote Management page so staff can
 * fire a personal follow-up email without copy-pasting from a Google doc.
 *
 * Each template gets event details + total + a quote reference woven in so the
 * client knows what they are looking at when they read your message.
 */
// TIGHTEN I.75 (2026-06-02): dropped 'revised' - no longer in the
// quote_status enum and zero rows in production carry it.
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface QuoteTemplateContext {
  contactName: string;
  eventName?: string;
  eventDate?: string;
  guestCount?: number;
  total?: number;
  quoteRef?: string;
  daysSinceSent?: number;
  fromName?: string;
  companyName?: string;
  /** When provided, the renderer first checks the company's
   *  customised template. See note on TemplateContext. */
  companyId?: string | null;
  /** Wave 24: tenant currency code so the {total} interpolation
   *  renders in the right symbol for non-ZAR tenants. Defaults to
   *  ZAR for back-compat. */
  currencyCode?: string | null;
}

// Wave 24: tenant-aware money formatter, mirrors subjectFormatters +
// whatsappTemplates. Defaults to ZAR for back-compat. Email body /
// subject density is fine with no decimal places ("R 12 345" reads
// cleaner than "R 12 345,00" in body copy).
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
  AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE", CAD: "en-CA",
};
const fmtMoney = (v: number | null | undefined, code?: string | null): string => {
  if (v == null || !Number.isFinite(v)) return "";
  const c = (code || "ZAR").toUpperCase();
  const locale = CURRENCY_LOCALE[c] || "en-ZA";
  try {
    // Consistency (Callum 2026-07-08): show exact cents and normalise
    // separators (space grouping, dot decimal) exactly like formatZAR so
    // the amount in an email matches the quote, invoice + PDF. Rounding
    // to whole rands here made "R 5 833.86" read as "R 5 834".
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(v).map((p) => {
      if (p.type === "group") return " ";
      if (p.type === "decimal") return ".";
      return p.value.replace(/\s/g, " ");
    }).join("");
  } catch {
    return `${c} ${v.toFixed(2)}`;
  }
};

// TIGHTEN I.75: dropped revised key - QuoteStatus no longer carries it.
const QUOTE_STATUS_TO_REGISTRY: Partial<Record<QuoteStatus, string>> = {
  sent:     "email_lead_quoted",     // operator chasing a sent quote
  accepted: "email_quote_accepted",
  expired:  "email_quote_expired",
  draft:    "email_quote_draft",
  rejected: "email_quote_rejected",
};

function buildQuoteCtx(ctx: QuoteTemplateContext): Record<string, string | number> {
  const first = (ctx.contactName || "there").split(" ")[0];
  return {
    first_name:   first,
    client_name:  ctx.contactName || "",
    company_name: ctx.companyName || "the team",
    from_name:    ctx.fromName || ctx.companyName || "the team",
    event_name:   ctx.eventName || "your event",
    event_date:   ctx.eventDate || "",
    guest_count:  ctx.guestCount ?? "",
    quote_ref:    ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "",
    total:        fmtMoney(ctx.total, ctx.currencyCode),
  };
}

export function templateForQuote(status: QuoteStatus, ctx: QuoteTemplateContext): { subject: string; body: string } {
  // 1. Override path - silent fallback to default when no customisation.
  const overrideKey = QUOTE_STATUS_TO_REGISTRY[status];
  if (overrideKey) {
    const resolved = resolveTemplateSync({
      companyId: ctx.companyId ?? null,
      key: overrideKey,
      ctx: buildQuoteCtx(ctx),
    });
    if (resolved && resolved.fromOverride) {
      return { subject: resolved.subject, body: resolved.body };
    }
  }

  // 2. Hardcoded defaults (existing UX, unchanged).
  const first = (ctx.contactName || "there").split(" ")[0];
  const sig = `\n\nBest,\n${ctx.fromName || ctx.companyName || "the team"}`;
  const eventLine = ctx.eventName
    ? ctx.eventDate ? `your ${ctx.eventName} on ${ctx.eventDate}` : `your ${ctx.eventName}`
    : ctx.eventDate ? `your event on ${ctx.eventDate}` : `your upcoming event`;
  const ref = ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "";
  const totalLine = ctx.total ? ` The quote sits at ${fmtMoney(ctx.total, ctx.currencyCode)} including VAT.` : "";

  switch (status) {
    case "draft":
      return {
        subject: `Quick note about your quote${ref}`,
        body: `Hi ${first},\n\nJust a heads-up that I am polishing your quote for ${eventLine}. I will have it across to you shortly. If anything has changed on your side (guest count, venue, dietary), let me know now so I can fold it in.${sig}`,
      };
    case "sent":
      return {
        subject: `Following up on your quote${ref}`,
        body: `Hi ${first},\n\nJust circling back on the quote we sent across for ${eventLine}.${totalLine}\n\nAnything you would like changed, or shall we lock in the date for you? Happy to walk through the menu options if it would help.${sig}`,
      };
    // TIGHTEN I.75: 'revised' case dropped - the enum no longer
    // carries it and no caller can produce that status.
    case "accepted":
      return {
        subject: `Thanks for confirming, next steps for ${eventLine.replace(/^your /, "")}`,
        body: `Hi ${first},\n\nThanks for confirming the quote${ref}. Now that we are locked in for ${eventLine}, here is what happens next:\n\n1. Deposit invoice on its way\n2. Final guest numbers and dietary requirements 7 days before\n3. Final walk-through call a week out\n\nReply here if anything has shifted on your side.${sig}`,
      };
    case "rejected":
      return {
        subject: `Following up`,
        body: `Hi ${first},\n\nUnderstand the quote did not land this time. No hard feelings. Happy to be kept in mind for the next event. If anything comes up where we can help, drop me a line and I will put a fresh quote together quickly.${sig}`,
      };
    case "expired":
      return {
        subject: `Your quote has expired, want me to refresh it?`,
        body: `Hi ${first},\n\nThe quote we sent for ${eventLine}${ref ? ` ${ref}` : ""} has lapsed. Pricing on a few items may have shifted since.\n\nIf the event is still on, I can put a fresh quote across in a few minutes. Just confirm guest numbers and venue and I will get it out today.${sig}`,
      };
    default:
      return {
        subject: `Quick check-in${ref}`,
        body: `Hi ${first},\n\nJust touching base on ${eventLine}.${totalLine}\n\nLet me know if there is anything you would like changed.${sig}`,
      };
  }
}

/**
 * Sweetener template. Used when the diary signal flags a wide-open or
 * quiet day. The catering team would rather take this booking at a
 * small discount than leave the kitchen idle, so the email leans warm
 * with a touch of soft scarcity ("we have a window for you, here's a
 * thank-you on top").
 */
export interface SweetenerContext extends QuoteTemplateContext {
  /** Optional. e.g. 10 for 10% off. */
  discountPercent?: number;
  /** Optional fixed-rand discount, used when percent isn't set. */
  discountAmount?: number;
  /** Optional. ISO date when the offer should lapse. */
  validUntil?: string;
  /** Optional alternative perk if no money-off, e.g. "complimentary dessert station". */
  perk?: string;
  /** Wave 27.2: absolute URL to the polished /q/{token} client view.
   *  When present, the body includes a "View & accept the quote" line
   *  pointing at this link so the client can act on the discount in
   *  one click instead of having to reply to the email. Built from
   *  buildPublicQuoteUrl(quote.public_token) at the call site. */
  quoteUrl?: string;
}

export function templateSweetener(ctx: SweetenerContext): { subject: string; body: string } {
  const first = (ctx.contactName || "there").split(" ")[0];
  const sig = `\n\nBest,\n${ctx.fromName || ctx.companyName || "the team"}`;
  const eventLine = ctx.eventName
    ? ctx.eventDate ? `your ${ctx.eventName} on ${ctx.eventDate}` : `your ${ctx.eventName}`
    : ctx.eventDate ? `your event on ${ctx.eventDate}` : `your upcoming event`;
  const ref = ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "";

  // Pick the strongest offer line we have. Discount % wins, then fixed
  // rand, then a non-monetary perk, then a generic flexibility line.
  let offerLine = "";
  if (ctx.discountPercent && ctx.discountPercent > 0) {
    const newTotal = ctx.total ? ctx.total * (1 - ctx.discountPercent / 100) : null;
    offerLine = newTotal
      ? `we'd like to take ${ctx.discountPercent}% off the original quote, so ${fmtMoney(ctx.total, ctx.currencyCode)} drops to ${fmtMoney(Math.round(newTotal), ctx.currencyCode)}.`
      : `we'd like to take ${ctx.discountPercent}% off the original quote.`;
  } else if (ctx.discountAmount && ctx.discountAmount > 0) {
    const newTotal = ctx.total ? ctx.total - ctx.discountAmount : null;
    offerLine = newTotal
      ? `we'd like to take ${fmtMoney(ctx.discountAmount, ctx.currencyCode)} off the original quote, bringing it from ${fmtMoney(ctx.total, ctx.currencyCode)} to ${fmtMoney(newTotal, ctx.currencyCode)}.`
      : `we'd like to take ${fmtMoney(ctx.discountAmount, ctx.currencyCode)} off the original quote.`;
  } else if (ctx.perk) {
    offerLine = `we'd like to throw in ${ctx.perk} on the house if you confirm with us.`;
  } else {
    offerLine = `we can be flexible on a few line items if it helps you get this over the line.`;
  }

  const expiryLine = ctx.validUntil
    ? `\n\nThis offer holds until ${ctx.validUntil}, after that we'll likely be locked in elsewhere.`
    : "";

  // Wave 27.2: include the polished /q/{token} link when the caller
  // passed it. Lets the client act on the sweetener in one click
  // (open quote -> Accept) instead of having to reply, wait, get
  // updated paperwork, then respond again. Falls back to the old
  // "Reply here" close when no link is available.
  const actionLine = ctx.quoteUrl
    ? `\n\nView & accept the updated quote here:\n${ctx.quoteUrl}\n\nOr reply to this email if you'd like to chat through it first.`
    : `\n\nReply here and I'll send through the updated paperwork the same day.`;

  return {
    subject: `A small thank-you to lock in ${eventLine.replace(/^your /, "")}${ref}`,
    body:
      `Hi ${first},\n\n` +
      `Quick one. I had a look at our diary for ${eventLine} and we have a clear window to give your event our full attention.\n\n` +
      `Because of that, ${offerLine}` +
      `${expiryLine}` +
      `${actionLine}${sig}`,
  };
}
