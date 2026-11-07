export interface WhatsAppFailureDescription {
  title: string;
  explanation: string;
  nextStep: string;
  code: string | null;
  detail: string | null;
  actionHref: string | null;
  actionLabel: string | null;
}

const META_BILLING_URL = "https://business.facebook.com/billing_hub/";
const META_APPS_URL = "https://developers.facebook.com/apps/";

export function readableWhatsAppError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/failed to fetch|fetch failed|network error|load failed/i.test(message)) {
    return "We couldn't reach the WhatsApp service. Check your internet connection and try again.";
  }
  return message.trim() || fallback;
}

/** Turn Meta's provider text into a readable explanation while keeping the
 * original detail and code available for support. */
export function describeWhatsAppFailure(reason: string | null | undefined): WhatsAppFailureDescription {
  const raw = String(reason || "").trim();
  const code = raw.match(/\b(?:Meta\s*)?(\d{3,})\b/i)?.[1] || null;
  const detail = raw
    .replace(/^Meta refused (?:the )?(?:test|reply)\s*:\s*/i, "")
    .replace(/^Meta\s+\d{3,}\s*:\s*/i, "")
    .trim() || null;

  if (/failed to fetch|fetch failed|network error|load failed/i.test(raw)) {
    return {
      title: "We couldn't confirm the test request",
      explanation: "The browser could not reach the WhatsApp service, so we don't know whether Meta received the request.",
      nextStep: "Check your connection, then check WhatsApp Activity before sending again in case the message already reached Meta.",
      code: null,
      detail: null,
      actionHref: null,
      actionLabel: null,
    };
  }

  if (/only allows a reply within 24 hours|24 hours of the client's last message/i.test(raw)) {
    return {
      title: "The 24-hour reply window has closed",
      explanation: "WhatsApp only allows free-text replies for 24 hours after the client's latest message.",
      nextStep: "Call the client or open the conversation in WhatsApp, then ask them to message your business again before replying here.",
      code: null,
      detail: null,
      actionHref: null,
      actionLabel: null,
    };
  }

  if (/connect WhatsApp first/i.test(raw)) {
    return {
      title: "Connect WhatsApp before replying",
      explanation: "This company does not currently have an active WhatsApp connection.",
      nextStep: "Open WhatsApp Setup and connect the business number before sending replies.",
      code: null,
      detail: null,
      actionHref: null,
      actionLabel: null,
    };
  }

  if (code === "131042") {
    return {
      title: "Meta billing setup is incomplete",
      explanation: "Meta blocked this message because the WhatsApp Business account needs billing set up.",
      nextStep: "In Meta billing, add or confirm a payment method and make sure the account currency is configured for the business that owns this WhatsApp number. Then send the test again.",
      code,
      detail,
      actionHref: META_BILLING_URL,
      actionLabel: "Open Meta billing",
    };
  }

  return {
    title: "WhatsApp could not send this message",
    explanation: "Meta could not send or deliver this message. The provider response is available below for troubleshooting.",
    nextStep: "Check the WhatsApp account, recipient number, and approved template in Meta, then try again. If it still fails, share the Meta code and response details with support.",
    code,
    detail,
    actionHref: META_APPS_URL,
    actionLabel: "Open Meta apps",
  };
}
