/**
 * WhatsApp deep-link helpers.
 *
 * One source of truth for "open WhatsApp at the right number with the
 * right message pre-populated". Used by every WhatsApp button across
 * the admin tool so we never end up with empty-text chats again.
 *
 * Why two URL shapes:
 *   - Mobile  -> wa.me/PHONE?text=MSG       (universal link, opens app)
 *   - Desktop -> whatsapp://send?... (asks the OS to open its installed app)
 * WhatsApp Web is an explicit alternative, never an automatic redirect.
 *
 * Phone validation:
 *   normaliseToE164() takes any free-form input and returns a digits-
 *   only string. South African landlines (anything after the 27 country
 *   code that does not start with 6/7/8) are flagged via isLikelyMobile
 *   so the UI can hide the WhatsApp option for those numbers rather
 *   than firing the user off to a chat that will never deliver.
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
    return after.length === 9 && /^[678]/.test(after);
  }
  // Non-SA -> trust it. We don't ship in countries we haven't validated.
  return digits.length >= 10;
}

/**
 * Detect whether the current browser is mobile. Used to pick the URL
 * shape: wa.me on mobile, the registered WhatsApp app protocol on desktop.
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
 * Desktop -> whatsapp://send?phone=27825550001&text=Hi%20Bobby...
 *
 * The OS chooses the installed app; a website cannot detect its running
 * state or account. Passing "web" explicitly opens the separate web client.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message?: string, target: "app" | "web" = "app"): string | null {
  const digits = normaliseToE164(phone);
  if (!digits) return null;
  const text = message ? encodeURIComponent(message) : "";
  if (target === "app" && isMobileBrowser()) {
    return text ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/${digits}`;
  }
  const params = [`phone=${digits}`, text ? `text=${text}` : ""].filter(Boolean).join("&");
  return target === "web" ? `https://web.whatsapp.com/send?${params}` : `whatsapp://send?${params}`;
}

/**
 * Request an app launch without leaving a blank browser tab. Returns true
 * when navigation was requested, not proof that the installed app opened.
 */
export function openWhatsApp(phone: string | null | undefined, message?: string, target: "app" | "web" = "app"): boolean {
  const url = buildWhatsAppUrl(phone, message, target);
  if (!url) return false;
  if (typeof window === "undefined") return false;
  // Use the normal browser launch path first. Some browsers and embedded
  // Chromium sessions return null when `noopener` is supplied, even though
  // the user-initiated launch is otherwise valid.
  const opened = window.open(url, target === "web" ? "_blank" : "_self");
  if (opened !== null) return true;

  // A blocked new tab must not make the button appear dead. Navigating the
  // current tab is a reliable fallback and still takes the operator to the
  // same pre-filled WhatsApp conversation.
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}
