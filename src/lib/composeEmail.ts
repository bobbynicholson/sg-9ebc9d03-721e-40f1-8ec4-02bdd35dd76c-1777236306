/**
 * Quick-mail helpers used by the Clients CRM. Returns 4 ways to send a
 * personalised email so the catering company can pick whichever client
 * they have open:
 *
 * - Gmail compose (cloud): opens https://mail.google.com... pre-filled
 * - Outlook compose (cloud): opens outlook.office.com... pre-filled
 * - Default mail app (mailto:): falls back to whatever the OS picks up
 * - Clipboard: copies "subject + body" so you can paste anywhere
 *
 * Future: a fifth option once the SMTP relay edge function is live --
 * sendDirect() will POST to /api/email/send and use the company's
 * configured SMTP / Gmail / Outlook OAuth. Stub is here so the UI
 * doesn't change when we wire it up.
 */

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

  /** Stub: sends through the company's configured SMTP/Gmail/Outlook
   *  via a future edge function. For now returns "not yet" so the UI
   *  can show a coming-soon badge without crashing. */
  async sendDirect(_p: ComposePayload): Promise<{ ok: false; reason: "smtp_not_configured" }> {
    return { ok: false, reason: "smtp_not_configured" };
  },
};

/** Suggested email templates keyed off the recommended action. */
export type ClientStatus =
  | "hot_lead" | "quoted" | "won" | "active" | "returning"
  | "vip" | "quiet" | "cold" | "lost";

export interface TemplateContext {
  contactName: string;
  companyName?: string;
  eventDate?: string;
  daysSinceLastContact?: number;
  fromName?: string;
}

export function templateFor(status: ClientStatus, ctx: TemplateContext): { subject: string; body: string } {
  const first = (ctx.contactName || "there").split(" ")[0];
  const company = ctx.companyName || "the team";
  const sig = `\n\nBest,\n${ctx.fromName || company}`;
  switch (status) {
    case "hot_lead":
      return {
        subject: `Quick check-in on your catering enquiry`,
        body: `Hi ${first},\n\nThanks for reaching out about your event. Wanted to make sure your enquiry didn't slip through the cracks -- happy to put a quick quote together if you can share final guest numbers and your venue.\n\nLet me know if you'd like to book a 10-minute call.${sig}`,
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
        body: `Hi ${first},\n\nQuick check-in -- everything's on track for your upcoming event. Would you like to confirm guest numbers and any last menu tweaks this week?\n\nReply here and I'll lock it in.${sig}`,
      };
    case "vip":
      return {
        subject: `It's been a while -- how are things?`,
        body: `Hi ${first},\n\nNo agenda here -- just wanted to drop a note and say hi. It's been ${ctx.daysSinceLastContact ?? "some"} days since we last caught up.\n\nIf there's anything coming up where we can help, you know where to find me.${sig}`,
      };
    case "quiet":
      return {
        subject: `Anything coming up we can help with?`,
        body: `Hi ${first},\n\nIt's been a while since your last event with us. Hope all is well.\n\nIf you have something on the horizon -- birthday, work do, family thing -- happy to put together ideas before you brief anyone else.${sig}`,
      };
    case "cold":
      return {
        subject: `Hello again`,
        body: `Hi ${first},\n\nReaching out after a long pause. We've added a few things to the menu since you last booked -- worth a look if you have anything coming up.\n\nNo pressure, just keeping the door open.${sig}`,
      };
    case "lost":
      return {
        subject: `Following up`,
        body: `Hi ${first},\n\nUnderstand you went a different way last time -- happy to be kept in the loop for the next event. Send me a quick note when something comes up and I'll put a fresh quote together.${sig}`,
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
export type QuoteStatus = "draft" | "sent" | "revised" | "accepted" | "rejected" | "expired";

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
}

const fmtRand = (v?: number) =>
  v == null ? "" : `R${Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

export function templateForQuote(status: QuoteStatus, ctx: QuoteTemplateContext): { subject: string; body: string } {
  const first = (ctx.contactName || "there").split(" ")[0];
  const sig = `\n\nBest,\n${ctx.fromName || ctx.companyName || "the team"}`;
  const eventLine = ctx.eventName
    ? ctx.eventDate ? `your ${ctx.eventName} on ${ctx.eventDate}` : `your ${ctx.eventName}`
    : ctx.eventDate ? `your event on ${ctx.eventDate}` : `your upcoming event`;
  const ref = ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "";
  const totalLine = ctx.total ? ` The quote sits at ${fmtRand(ctx.total)} including VAT.` : "";

  switch (status) {
    case "draft":
      return {
        subject: `Quick note about your quote${ref}`,
        body: `Hi ${first},\n\nJust a heads-up that I am polishing your quote for ${eventLine} -- I will have it across to you shortly. If anything has changed on your side (guest count, venue, dietary), let me know now so I can fold it in.${sig}`,
      };
    case "sent":
      return {
        subject: `Following up on your quote${ref}`,
        body: `Hi ${first},\n\nJust circling back on the quote we sent across for ${eventLine}.${totalLine}\n\nAnything you would like changed, or shall we lock in the date for you? Happy to walk through the menu options if it would help.${sig}`,
      };
    case "revised":
      return {
        subject: `Revised quote ready for ${eventLine.replace(/^your /, "")}`,
        body: `Hi ${first},\n\nI have revised the quote based on what we last spoke about${totalLine ? "." + totalLine : "."}\n\nHave a quick look when you can and shout if anything still needs tweaking.${sig}`,
      };
    case "accepted":
      return {
        subject: `Thanks for confirming -- next steps for ${eventLine.replace(/^your /, "")}`,
        body: `Hi ${first},\n\nThanks for confirming the quote${ref}. Now that we are locked in for ${eventLine}, here is what happens next:\n\n1. Deposit invoice on its way\n2. Final guest numbers + dietary requirements 7 days before\n3. Final walk-through call a week out\n\nReply here if anything has shifted on your side.${sig}`,
      };
    case "rejected":
      return {
        subject: `Following up`,
        body: `Hi ${first},\n\nUnderstand the quote did not land this time. No hard feelings -- happy to be kept in mind for the next event. If anything comes up where we can help, drop me a line and I will put a fresh quote together quickly.${sig}`,
      };
    case "expired":
      return {
        subject: `Your quote has expired -- want me to refresh it?`,
        body: `Hi ${first},\n\nThe quote we sent for ${eventLine}${ref ? ` ${ref}` : ""} has lapsed. Pricing on a few items may have shifted since.\n\nIf the event is still on, I can put a fresh quote across in a few minutes -- just confirm guest numbers and venue and I will get it out today.${sig}`,
      };
    default:
      return {
        subject: `Quick check-in${ref}`,
        body: `Hi ${first},\n\nJust touching base on ${eventLine}.${totalLine}\n\nLet me know if there is anything you would like changed.${sig}`,
      };
  }
}

/**
 * Sweetener template -- used when the diary signal flags a wide-open or
 * quiet day. The catering team would rather take this booking at a small
 * discount than leave the kitchen idle, so the email leans warm + soft
 * scarcity ("we have a window for you, here's a thank-you on top").
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
      ? `we'd like to take ${ctx.discountPercent}% off the original quote -- ${fmtRand(ctx.total)} drops to ${fmtRand(Math.round(newTotal))}.`
      : `we'd like to take ${ctx.discountPercent}% off the original quote.`;
  } else if (ctx.discountAmount && ctx.discountAmount > 0) {
    const newTotal = ctx.total ? ctx.total - ctx.discountAmount : null;
    offerLine = newTotal
      ? `we'd like to take ${fmtRand(ctx.discountAmount)} off the original quote -- bringing it from ${fmtRand(ctx.total)} to ${fmtRand(newTotal)}.`
      : `we'd like to take ${fmtRand(ctx.discountAmount)} off the original quote.`;
  } else if (ctx.perk) {
    offerLine = `we'd like to throw in ${ctx.perk} on the house if you confirm with us.`;
  } else {
    offerLine = `we can be flexible on a few line items if it helps you get this over the line.`;
  }

  const expiryLine = ctx.validUntil
    ? `\n\nThis offer holds until ${ctx.validUntil} -- after that we'll likely be locked in elsewhere.`
    : "";

  return {
    subject: `A small thank-you to lock in ${eventLine.replace(/^your /, "")}${ref}`,
    body:
      `Hi ${first},\n\n` +
      `Quick one -- I had a look at our diary for ${eventLine} and we have a clear window to give your event our full attention.\n\n` +
      `Because of that, ${offerLine}` +
      `${expiryLine}\n\n` +
      `Reply here and I'll send through the updated paperwork the same day.${sig}`,
  };
}
