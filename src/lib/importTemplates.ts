/**
 * Import template schemas.
 *
 * Single source of truth for which columns the import engine
 * understands per target table. Consumed by:
 *
 *   - /api/imports/templates/[type] -- generates the downloadable
 *     .xlsx the operator fills in.
 *   - /api/imports/upload -- when every header on a sheet matches a
 *     known column, skip the AI mapping step and synthesise the
 *     mapping directly from this schema.
 *   - importNormalise -- per-field validators / coercers.
 *
 * Adding a new column is a single-edit drop-in here. Don't fork
 * column lists into the API routes; everyone reads from this file.
 */

export type TemplateType = "clients" | "leads";

export interface TemplateColumn {
  /** DB column name on the target table -- used by importNormalise + commit. */
  key: string;
  /** Human-readable header that appears in the template's first row. */
  header: string;
  /** Whether the import preview rejects the row when this column is blank. */
  required: boolean;
  /** Hint shown in row 2 of the template so operators know what to type. */
  example: string;
  /** Short note appended to the header in column comments. */
  hint?: string;
  /** Synonyms an AI-mapping fallback would accept for this column. */
  aliases?: string[];
}

export interface TemplateDefinition {
  type: TemplateType;
  /** target_table the import engine writes to. */
  targetTable: "clients" | "leads";
  /** Sheet name in the generated workbook + label shown in the UI. */
  sheetName: string;
  columns: TemplateColumn[];
}

/**
 * Clients template -- existing customers the catering company has
 * already worked with. Going to populate `clients`.
 */
const CLIENTS_TEMPLATE: TemplateDefinition = {
  type: "clients",
  targetTable: "clients",
  sheetName: "Clients",
  columns: [
    { key: "client_name", header: "Client name *", required: true,
      example: "Jane Smith", aliases: ["name", "full name", "customer", "customer name"] },
    { key: "email", header: "Email *", required: true,
      example: "jane@example.co.za", aliases: ["e-mail", "email address"] },
    { key: "mobile_number", header: "Mobile", required: false,
      example: "082 555 1234",
      hint: "SA mobile (06x / 07x / 08x). Stored separately from landline so the WhatsApp shortcut on each contact knows which number to dial.",
      aliases: ["mobile", "cell", "cellphone", "cell number", "mobile number", "whatsapp"] },
    { key: "landline_number", header: "Landline", required: false,
      example: "021 555 1234",
      hint: "Office or home landline (021 / 011 / 012 etc.). Used for non-WhatsApp call-outs.",
      aliases: ["landline", "office", "office phone", "home phone", "telephone"] },
    { key: "phone", header: "Phone", required: false,
      example: "082 555 1234",
      hint: "Generic phone column for spreadsheets that don't separate mobile and landline. The importer auto-routes the value to Mobile or Landline based on the prefix.",
      aliases: ["contact number", "phone number", "primary phone", "tel"] },
    { key: "client_type", header: "Client type", required: false,
      example: "individual", hint: "individual or business",
      aliases: ["type"] },
    { key: "tax_number", header: "Tax / VAT number", required: false,
      example: "4123456789", aliases: ["vat", "vat number", "tax id"] },
    { key: "billing_address_line1", header: "Billing address (line 1)", required: false,
      example: "12 Main Road", aliases: ["address", "address 1", "street"] },
    { key: "billing_address_line2", header: "Billing address (line 2)", required: false,
      example: "Newlands", aliases: ["address 2", "suburb"] },
    { key: "billing_city", header: "City", required: false,
      example: "Cape Town", aliases: ["town"] },
    { key: "billing_postal_code", header: "Postal code", required: false,
      example: "7700", aliases: ["postcode", "zip"] },
    { key: "payment_terms", header: "Payment terms (days)", required: false,
      example: "30", hint: "Days from invoice to expected payment",
      aliases: ["terms", "net days", "due days"] },
    { key: "credit_limit", header: "Credit limit (R)", required: false,
      example: "10000", aliases: ["credit"] },
    { key: "notes", header: "Notes", required: false,
      example: "Prefers Friday deliveries",
      aliases: ["comments", "memo"] },
    { key: "tags", header: "Tags (comma-separated)", required: false,
      example: "VIP, corporate", aliases: ["labels", "categories"] },
    // Imported-history rollup. Optional. Lets a tenant migrating from
    // another system carry forward each client's lifetime metrics
    // even when they don't have per-event data to recreate. The
    // dashboard surfaces these alongside real orders.
    { key: "historical_total_events", header: "Total events (history)", required: false,
      example: "42",
      hint: "Lifetime number of events from your old system. Surfaces on the contact card so the client doesn't look brand new.",
      aliases: ["total events", "event count", "events booked", "lifetime events", "past events"] },
    { key: "historical_lifetime_spend", header: "Lifetime spend (R)", required: false,
      example: "125000",
      hint: "Total spend across all past events. Sums into the dashboard's LTV display.",
      aliases: ["lifetime spend", "total spent", "lifetime value", "ltv", "total revenue"] },
    { key: "historical_last_event_date", header: "Last event date (history)", required: false,
      example: "2024-12-15",
      hint: "Most recent event from your old system. Drives the 'last touch' display on the contact card.",
      aliases: ["last event", "most recent event", "last booking", "last function"] },
    { key: "historical_last_event_type", header: "Last event type (history)", required: false,
      example: "Wedding",
      hint: "What the last event was -- wedding, corporate, birthday, etc.",
      aliases: ["last event type", "last booking type"] },
    { key: "historical_notes", header: "History notes", required: false,
      example: "Repeat client, prefers Italian buffet, dietary: 2 vegan",
      hint: "Free-form notes about past relationship. Shown on the contact detail.",
      aliases: ["history notes", "client history", "previous notes"] },
  ],
};

/**
 * Leads template -- prospects who've enquired but haven't booked
 * yet. Going to populate `leads`.
 */
const LEADS_TEMPLATE: TemplateDefinition = {
  type: "leads",
  targetTable: "leads",
  sheetName: "Leads",
  columns: [
    { key: "contact_name", header: "Contact name *", required: true,
      example: "John Doe", aliases: ["name", "full name", "lead name"] },
    { key: "client_email", header: "Email *", required: true,
      example: "john@example.co.za",
      hint: "Lead's primary email -- mirrored to the lead's email column",
      aliases: ["email", "e-mail", "email address"] },
    { key: "client_phone", header: "Phone", required: false,
      example: "082 555 1234",
      aliases: ["phone", "mobile", "cell", "contact number"] },
    { key: "company_name", header: "Company name", required: false,
      example: "Acme (Pty) Ltd", aliases: ["company", "business"] },
    { key: "event_type", header: "Event type", required: false,
      example: "wedding", hint: "wedding, corporate, birthday, etc.",
      aliases: ["type", "occasion"] },
    { key: "event_date", header: "Event date", required: false,
      example: "2026-06-15", hint: "YYYY-MM-DD or any standard date format",
      aliases: ["date", "function date"] },
    { key: "guest_count", header: "Guest count", required: false,
      example: "120", aliases: ["pax", "guests", "headcount"] },
    { key: "venue_address", header: "Venue address", required: false,
      example: "12 Long Street, Cape Town", aliases: ["venue", "location"] },
    { key: "budget", header: "Budget (R)", required: false,
      example: "25000", aliases: ["budget amount"] },
    { key: "source", header: "Source", required: false,
      example: "referral", hint: "referral, instagram, google, etc.",
      aliases: ["lead source", "referral", "channel"] },
    { key: "special_requests", header: "Special requests", required: false,
      example: "Halal menu, no nuts", aliases: ["requests", "dietary", "notes"] },
    { key: "tags", header: "Tags (comma-separated)", required: false,
      example: "hot, follow-up", aliases: ["labels"] },
  ],
};

const TEMPLATES: Record<TemplateType, TemplateDefinition> = {
  clients: CLIENTS_TEMPLATE,
  leads: LEADS_TEMPLATE,
};

export function getTemplateDefinition(type: TemplateType): TemplateDefinition {
  return TEMPLATES[type];
}

export const TEMPLATE_TYPES: ReadonlyArray<TemplateType> = Object.freeze(
  Object.keys(TEMPLATES) as TemplateType[],
);

/**
 * Try to recognise a sheet's headers as a known template. Returns the
 * matched TemplateDefinition if every non-empty header lines up with
 * a known column (key, header, or alias, all case + space tolerant);
 * null otherwise. Used by the upload endpoint to skip AI mapping.
 */
export function recogniseHeaders(headers: string[]): TemplateDefinition | null {
  const tidy = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "").replace(/\*$/, "").trim();
  const nonEmpty = headers.filter((h) => h && h.trim().length > 0);
  if (nonEmpty.length === 0) return null;

  for (const def of Object.values(TEMPLATES)) {
    const knownTokens = new Set<string>();
    for (const col of def.columns) {
      knownTokens.add(tidy(col.key));
      knownTokens.add(tidy(col.header));
      for (const a of col.aliases || []) knownTokens.add(tidy(a));
    }
    const allMatch = nonEmpty.every((h) => knownTokens.has(tidy(h)));
    if (allMatch) return def;
  }
  return null;
}

/**
 * Build a header -> { target, source } mapping object compatible with
 * what the existing /api/imports/[id]/preview pipeline expects, so the
 * upload route can synthesise it when headers match the template.
 *
 * The existing preview reads `mapping[sheetName][headerName] = { target, ... }`
 * and `mapping[sheetName].__schema__.target = "clients" | "orders" | "leads"`.
 */
export function buildMappingFromTemplate(
  def: TemplateDefinition,
  sheetName: string,
  headers: string[],
): Record<string, any> {
  const tidy = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "").replace(/\*$/, "").trim();
  const lookup = new Map<string, string>();
  for (const col of def.columns) {
    lookup.set(tidy(col.key), col.key);
    lookup.set(tidy(col.header), col.key);
    for (const a of col.aliases || []) lookup.set(tidy(a), col.key);
  }
  const sheetMapping: Record<string, any> = {
    __schema__: { target: def.targetTable, source: "template-auto-map" },
  };
  for (const h of headers) {
    if (!h || !h.trim()) continue;
    const target = lookup.get(tidy(h));
    if (target) {
      sheetMapping[h] = { target, confidence: 1, source: "template" };
    } else {
      // Header not in template -- mark as skip so preview won't try to
      // write an unknown column. (Auto-map only triggers when every
      // header is recognised, but defensive belt + braces.)
      sheetMapping[h] = { target: "skip", confidence: 0, source: "template" };
    }
  }
  return { [sheetName]: sheetMapping };
}
