/**
 * Deterministic field normalisers for the AI Onboarding Importer.
 *
 * Everything here runs in plain TypeScript -- no AI. Only data the
 * deterministic path can't handle gets escalated to a future
 * AI-row-fixer pass.
 */

export interface NormaliseResult<T> {
  value: T | null;
  warnings: string[];
}

/** Strip trim + lowercase for emails. Returns null if obviously bogus. */
export function normaliseEmail(raw: any): NormaliseResult<string> {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null, warnings: [] };
  const lower = s.toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(lower)) {
    return { value: null, warnings: [`"${s}" doesn't look like an email`] };
  }
  return { value: lower, warnings: [] };
}

/** Normalise SA-style phone numbers. Strips spaces, dashes, parens.
 *  Converts +27 / 27 / 0 prefixes to a canonical +27...x form. */
export function normalisePhoneZA(raw: any): NormaliseResult<string> {
  const s = String(raw ?? "").trim();
  if (!s) return { value: null, warnings: [] };
  const digits = s.replace(/[^\d+]/g, "");
  if (!digits) return { value: null, warnings: [`"${s}" has no digits`] };
  let canonical: string;
  if (digits.startsWith("+27")) {
    canonical = digits;
  } else if (digits.startsWith("27") && digits.length >= 11) {
    canonical = "+" + digits;
  } else if (digits.startsWith("0") && digits.length === 10) {
    canonical = "+27" + digits.slice(1);
  } else {
    // Probably an international number we don't need to mangle.
    canonical = digits;
  }
  // Sanity: must end up with at least 10 digits.
  const digitCount = canonical.replace(/\D/g, "").length;
  if (digitCount < 9) {
    return { value: canonical, warnings: [`"${s}" looks too short for a valid phone`] };
  }
  return { value: canonical, warnings: [] };
}

/** Normalise a date-ish input to ISO yyyy-mm-dd. */
export function normaliseDate(raw: any): NormaliseResult<string> {
  if (raw == null || raw === "") return { value: null, warnings: [] };
  // SheetJS sometimes passes us Date objects directly when cellDates: true
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { value: null, warnings: ["invalid date"] };
    return { value: raw.toISOString().slice(0, 10), warnings: [] };
  }
  const s = String(raw).trim();
  // Try a few common patterns: yyyy-mm-dd, yyyy/mm/dd, dd-mm-yyyy,
  // dd/mm/yyyy, dd Month yyyy. Date.parse is unreliable across
  // formats so we shape input first.
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime()) && s.match(/^\d{4}-\d{2}-\d{2}/)) {
    return { value: direct.toISOString().slice(0, 10), warnings: [] };
  }
  // dd-mm-yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += yy < 50 ? 2000 : 1900;
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) {
      return { value: null, warnings: [`"${s}" date doesn't parse`] };
    }
    const iso = `${yy.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
    const d = new Date(iso + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return { value: null, warnings: [`"${s}" date doesn't parse`] };
    return { value: iso, warnings: [] };
  }
  if (!Number.isNaN(direct.getTime())) {
    return { value: direct.toISOString().slice(0, 10), warnings: [`"${s}" parsed but format was ambiguous`] };
  }
  return { value: null, warnings: [`"${s}" date doesn't parse`] };
}

/** Strip currency symbols and commas, return as a positive number. */
export function normaliseAmount(raw: any): NormaliseResult<number> {
  if (raw == null || raw === "") return { value: null, warnings: [] };
  const s = String(raw).trim();
  // Strip "R", "ZAR", "$", thousand separators, space groupings.
  const cleaned = s.replace(/[Rr]\s?|\bZAR\b|\$/g, "").replace(/[\s,]/g, "");
  if (!cleaned) return { value: null, warnings: [`"${s}" has no number`] };
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return { value: null, warnings: [`"${s}" is not a number`] };
  if (n < 0) return { value: 0, warnings: [`"${s}" was negative, clamped to 0`] };
  return { value: n, warnings: [] };
}

/** Coerce a guest count to a positive int. */
export function normaliseInt(raw: any): NormaliseResult<number> {
  if (raw == null || raw === "") return { value: null, warnings: [] };
  const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(n)) return { value: null, warnings: [`"${raw}" is not a number`] };
  if (n < 0) return { value: 0, warnings: [`"${raw}" was negative, clamped to 0`] };
  return { value: n, warnings: [] };
}

/** Minimal text trim + length cap so we don't blow Postgres column sizes. */
export function normaliseText(raw: any, maxLen = 1000): NormaliseResult<string> {
  if (raw == null || raw === "") return { value: null, warnings: [] };
  const s = String(raw).trim();
  if (!s) return { value: null, warnings: [] };
  if (s.length > maxLen) {
    return { value: s.slice(0, maxLen), warnings: [`field truncated to ${maxLen} chars`] };
  }
  return { value: s, warnings: [] };
}

/** Boolean-ish: yes/no, true/false, 1/0, paid/unpaid. */
export function normaliseBool(raw: any): NormaliseResult<boolean> {
  if (raw == null || raw === "") return { value: null, warnings: [] };
  const s = String(raw).trim().toLowerCase();
  if (["y", "yes", "true", "1", "paid", "received"].includes(s)) return { value: true, warnings: [] };
  if (["n", "no", "false", "0", "unpaid", "outstanding", "pending"].includes(s)) return { value: false, warnings: [] };
  return { value: null, warnings: [`"${raw}" isn't a clear yes/no`] };
}

// ── Field-key dispatch ─────────────────────────────────────────────────

/** What kind of normaliser to apply for a given target field key. */
const FIELD_TYPE: Record<string, "email" | "phone" | "date" | "amount" | "int" | "bool" | "text"> = {
  email: "email",
  client_email: "email",
  phone: "phone",
  client_phone: "phone",
  event_date: "date",
  created_at: "date",
  total_amount: "amount",
  guest_count: "int",
  deposit_paid: "bool",
};

/**
 * Apply the right normaliser for a target field. Returns {value,
 * warnings}. Unknown fields fall back to text.
 */
export function normaliseFieldValue(
  targetKey: string,
  raw: any,
): NormaliseResult<any> {
  const t = FIELD_TYPE[targetKey] || "text";
  switch (t) {
    case "email":  return normaliseEmail(raw);
    case "phone":  return normalisePhoneZA(raw);
    case "date":   return normaliseDate(raw);
    case "amount": return normaliseAmount(raw);
    case "int":    return normaliseInt(raw);
    case "bool":   return normaliseBool(raw);
    case "text":
    default:       return normaliseText(raw);
  }
}
