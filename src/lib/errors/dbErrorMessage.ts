/**
 * Central translator: turn a Supabase / PostgREST / Postgres error into a
 * short, user-facing sentence.
 *
 * Why this exists: insert/update calls were surfacing raw database text like
 * 'duplicate key value violates unique constraint "clients_company_id_email_key"'
 * straight into toasts. That is noise to a user. This maps the common
 * Postgres SQLSTATE codes (and PostgREST codes) to plain language, and pulls
 * the offending column out of the error detail so the message can name the
 * field ("A contact with this email address already exists.").
 *
 * Use it anywhere a Supabase error reaches a human, on the client or in an
 * API route:
 *
 *   const { error } = await supabase.from("clients").insert(payload);
 *   if (error) {
 *     toast({ title: "Couldn't save", description: dbErrorMessage(error, { entity: "contact" }), variant: "destructive" });
 *     return;
 *   }
 *
 * For API routes, dbErrorStatus(error) gives a matching HTTP status.
 */

/** Anything Supabase / PostgREST / pg can hand back. */
export interface DbLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

interface DbErrorOptions {
  /** Noun for the row being saved, e.g. "contact", "supplier", "menu item". */
  entity?: string;
  /** Override the friendly label for a column, e.g. { vat_number: "VAT number" }. */
  fieldLabels?: Record<string, string>;
  /** Message to use when nothing more specific is known. */
  fallback?: string;
}

const GENERIC_FALLBACK = "Something went wrong. Please try again.";

// Columns we never want to name to a user (they are plumbing, not fields the
// user typed). When a unique/not-null error lists several columns we skip
// these and name the meaningful one (email, slug, ...).
const PLUMBING_COLUMNS = new Set([
  "id",
  "company_id",
  "region_id",
  "user_id",
  "created_at",
  "updated_at",
  "tenant_id",
]);

// Column -> human label. Falls back to the column name with underscores
// turned into spaces when a column is not listed here.
const DEFAULT_FIELD_LABELS: Record<string, string> = {
  email: "email address",
  client_email: "email address",
  contact_email: "email address",
  slug: "URL",
  company_name: "company name",
  client_name: "name",
  contact_name: "name",
  name: "name",
  phone: "phone number",
  mobile_number: "mobile number",
  vat_number: "VAT number",
  tax_number: "tax number",
  barcode: "barcode",
  sku: "SKU",
};

function humaniseColumn(col: string, labels: Record<string, string>): string {
  return labels[col] ?? col.replace(/_/g, " ");
}

/** Pull column names out of a Postgres detail string like "Key (a, b)=(..) already exists." */
function extractColumns(err: DbLikeError): string[] {
  const src = `${err.details ?? ""} ${err.message ?? ""}`;
  const m = src.match(/Key \(([^)]+)\)=/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((c) => c.trim().replace(/"/g, ""))
    .filter(Boolean);
}

/** Choose the column most worth naming to the user. */
function meaningfulColumn(cols: string[]): string | null {
  const meaningful = cols.filter((c) => !PLUMBING_COLUMNS.has(c));
  return (meaningful[0] ?? cols[0]) ?? null;
}

function getCode(err: DbLikeError): string {
  return String(err.code ?? "").trim();
}

function looksLikeError(value: unknown): value is DbLikeError {
  return typeof value === "object" && value !== null;
}

/**
 * Translate a database-style error into a user-facing message.
 * Safe to call with anything (null, a plain Error, a PostgrestError).
 */
export function dbErrorMessage(error: unknown, opts: DbErrorOptions = {}): string {
  const fallback = opts.fallback ?? GENERIC_FALLBACK;
  if (!looksLikeError(error)) return fallback;

  const err = error as DbLikeError;
  const labels = { ...DEFAULT_FIELD_LABELS, ...(opts.fieldLabels ?? {}) };
  const entity = opts.entity?.trim();
  const code = getCode(err);
  const rawMessage = (err.message ?? "").trim();

  const subject = entity ? `This ${entity}` : "This record";
  const article = entity ? `A ${entity}` : "A record";

  // Unique violation (duplicate). Code 23505, or a raw message when the code
  // was stripped somewhere upstream.
  if (code === "23505" || /duplicate key value|violates unique constraint/i.test(rawMessage)) {
    const col = meaningfulColumn(extractColumns(err));
    if (col) {
      return `${article} with this ${humaniseColumn(col, labels)} already exists.`;
    }
    return `${article} with these details already exists.`;
  }

  // Not-null violation. Code 23502. Detail: 'null value in column "x"'.
  if (code === "23502") {
    const m = `${err.message ?? ""} ${err.details ?? ""}`.match(/column "([^"]+)"/i);
    const col = m?.[1];
    if (col) {
      const label = humaniseColumn(col, labels);
      return `${label.charAt(0).toUpperCase()}${label.slice(1)} is required.`;
    }
    return "A required field is missing.";
  }

  // Foreign-key violation. Code 23503.
  if (code === "23503") {
    return `${subject} is linked to other records, so this change can't be completed. Remove or update the linked items first.`;
  }

  // Check / exclusion / bad-format errors: the values are not acceptable.
  if (code === "23514") return "One or more values are not allowed.";
  if (code === "23P01") return `${subject} overlaps with an existing record.`;
  if (code === "22P02" || code === "22007" || code === "22008") {
    return "One or more values are in the wrong format.";
  }

  // Transient contention. Worth a retry.
  if (code === "40001" || code === "40P01") {
    return "The system was busy for a moment. Please try again.";
  }

  // Permission / row-level-security.
  if (code === "42501") return "You don't have permission to do this.";

  // PostgREST: no rows / expired auth.
  if (code === "PGRST116") return "We couldn't find that record.";
  if (code === "PGRST301" || code === "401") {
    return "Your session has expired. Please sign in again.";
  }

  // A plain Error thrown by our own code usually already carries a friendly
  // message (e.g. "A client with this email already exists as a lead."), and
  // it has no Postgres code. Pass it through rather than masking it.
  if (!code && rawMessage && !/violates|constraint|sqlstate|pg_/i.test(rawMessage)) {
    return rawMessage;
  }

  return fallback;
}

/** HTTP status that best fits a database error, for API routes. */
export function dbErrorStatus(error: unknown): number {
  if (!looksLikeError(error)) return 500;
  const code = getCode(error as DbLikeError);
  if (code === "23505" || code === "23P01") return 409; // conflict
  if (code === "23502" || code === "23514" || code === "22P02" || code === "22007" || code === "22008") return 400;
  if (code === "23503") return 409;
  if (code === "42501") return 403;
  if (code === "PGRST116") return 404;
  if (code === "PGRST301" || code === "401") return 401;
  return 500;
}
