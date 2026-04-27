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
