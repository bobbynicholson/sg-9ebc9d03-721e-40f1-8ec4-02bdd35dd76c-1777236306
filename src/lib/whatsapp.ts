/**
 * WhatsApp deep-link helpers.
 *
 * One source of truth for "open WhatsApp at the right number with the
 * right message pre-populated". Used by every WhatsApp button across
 * the admin tool so we never end up with empty-text chats again.
 *
 * Why two URL shapes:
 *   - Mobile  -> wa.me/PHONE?text=MSG       (universal link, opens app)
 *   - Desktop -> web.whatsapp.com/send?...  (skips the wa.me landing
 *     page with the "Download it now" download nudge that the catering
 *     owner does NOT want clients/staff to see).
 *
 * Phone validation:
 *   normaliseToE164() takes any free-form input and returns a digits-
 *   only string. South African landlines (anything after the 27 country
 *   code that does not start with 6/7/8) are flagged via isLikelyMobile
 *   so the UI can hide the WhatsApp option for those numbers rather
 *   than firing the user off to a chat that will never deliver.
 *
 * Future: when we wire WhatsApp Business API, the templates layer
 * stays unchanged -- only buildWhatsAppUrl flips to a server send.
 */

/**
 * Strip a phone number down to digits-only E.164 form (no leading +).
 *
 *   "+27 82 555 0001" -> "27825550001"
 *   "082 555 0001"    -> "27825550001"   (leading 0 swapped for CC)
 *   "0027825550001"   -> "27825550001"   (00 prefix dropped)
 *   "27825550001"     -> "27825550001"
 *
 * @param phone Free-form phone string.
 * @param defaultCountryCode Two/three-digit country code prepended when
 *   the input starts with a single 0 (local format). SA = "27".
 */
export function normaliseToE164(phone: string | null | undefined, defaultCountryCode = "27"): string {
  if (!phone) return "";
  // Strip everything except digits.
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // 00 international prefix -> drop
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Local SA "0xxx" -> swap the leading 0 for the country code.
  if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  // If it already starts with the country code, leave it.
  // If it doesn't, assume the operator typed the number without the
  // local 0 (e.g. "82 555 0001" -> "27825550001") and prepend.
  if (!digits.startsWith(defaultCountryCode) && digits.length <= 10) {
    digits = defaultCountryCode + digits;
  }
  return digits;
}

/**
 * Best-effort "is this a mobile that WhatsApp will deliver to" check.
 *
 * SA mobile prefixes (after the 27 country code) start with 6, 7 or 8.
 * Anything else is almost certainly a landline (021, 011, 012, etc.)
 * and a WhatsApp message will never arrive.
 *
 * For non-SA numbers we err on the side of "show the button" since
 * we have no reliable mobile-vs-landline rule for every country.
 */
export function isLikelyMobile(phone: string | null | undefined): boolean {
  const digits = normaliseToE164(phone);
  if (!digits) return false;
  // SA: country code 27, mobile starts with 6/7/8 after CC.
  if (digits.startsWith("27")) {
    const after = digits.slice(2);
    return /^[678]/.test(after);
  }
  // Non-SA -> trust it. We don't ship in countries we haven't validated.
  return digits.length >= 10;
}

/**
 * Detect whether the current browser is mobile. Used to pick the URL
 * shape: wa.me on mobile (so the WhatsApp app opens), web.whatsapp.com
 * on desktop (so we skip the wa.me landing page with the download
 * nudge).
 *
 * Falls back to "desktop" on the server.
 */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|Windows Phone/i.test(ua);
}

/**
 * Build the right WhatsApp deep link for the current platform.
 *
 *   buildWhatsAppUrl("+27 82 555 0001", "Hi Bobby, ...")
 *
 * Mobile  -> https://wa.me/27825550001?text=Hi%20Bobby...
 * Desktop -> https://web.whatsapp.com/send?phone=27825550001&text=Hi%20Bobby...
 *
 * Both URLs are valid universal links; the chat opens with the message
 * pre-populated and the user just hits send.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message?: string): string | null {
  const digits = normaliseToE164(phone);
  if (!digits) return null;
  const text = message ? encodeURIComponent(message) : "";
  if (isMobileBrowser()) {
    return text ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/${digits}`;
  }
  // Desktop: web.whatsapp.com/send opens WhatsApp Web directly with no
  // intermediate landing page. If the user does not have the app
  // installed they go straight to the QR-paired Web client.
  const params = [`phone=${digits}`, text ? `text=${text}` : ""].filter(Boolean).join("&");
  return `https://web.whatsapp.com/send?${params}`;
}

/**
 * One-call helper: build the URL and open it in a new tab. Returns
 * true if the chat was opened, false if the phone was unusable.
 */
export function openWhatsApp(phone: string | null | undefined, message?: string): boolean {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  if (typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener");
  return true;
}
