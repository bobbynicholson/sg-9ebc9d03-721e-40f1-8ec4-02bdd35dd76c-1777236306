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

export type TemplateType = "clients" | "leads" | "orders" | "quotes" | "invoices" | "payments";

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
  targetTable: "clients" | "leads" | "orders" | "quotes" | "invoices" | "payments";
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

/**
 * Orders template -- past or upcoming events. Goes to `orders`.
 * Required: client_name OR client_email (so the linker can resolve a
 * client) AND event_date (orders.event_date is NOT NULL on the schema).
 *
 * The cross-sheet linker resolves client_id in this priority order:
 *   1. client row in the same workbook's clients sheet (by email/name)
 *   2. existing client in the DB (by email/name match)
 *   3. auto-create a stub client from this order row -- so an order
 *      without a matching clients-sheet entry still lands. Required
 *      because orders.client_id is NOT NULL.
 */
const ORDERS_TEMPLATE: TemplateDefinition = {
  type: "orders",
  targetTable: "orders",
  sheetName: "Orders",
  columns: [
    { key: "order_number", header: "Order number", required: false,
      example: "ORD-2026-001",
      hint: "Your existing order numbering. Optional but recommended -- it's how invoices in your invoices sheet will link back to this order.",
      aliases: ["order ref", "order no", "ref", "function ref"] },
    { key: "client_name", header: "Client name *", required: true,
      example: "Jane Smith",
      hint: "Used to link this order to a client. Either name OR email is enough.",
      aliases: ["customer", "customer name", "client"] },
    { key: "client_email", header: "Client email", required: false,
      example: "jane@example.co.za",
      hint: "Helps the linker dedupe across sheets. Strongly recommended.",
      aliases: ["email", "customer email"] },
    { key: "client_phone", header: "Client phone", required: false,
      example: "082 555 1234",
      aliases: ["phone", "mobile", "cell"] },
    { key: "event_name", header: "Event name", required: false,
      example: "30th birthday braai",
      aliases: ["function", "function name", "occasion"] },
    { key: "event_date", header: "Event date *", required: true,
      example: "2026-04-15",
      hint: "YYYY-MM-DD or any standard date format. Past dates are fine -- those become historical orders.",
      aliases: ["date", "function date", "service date"] },
    { key: "event_time", header: "Event time", required: false,
      example: "18:00",
      aliases: ["start time", "time"] },
    { key: "guest_count", header: "Guest count", required: false,
      example: "80", aliases: ["pax", "guests", "headcount"] },
    { key: "venue_address", header: "Venue address", required: false,
      example: "12 Long Street, Cape Town",
      aliases: ["venue", "location", "delivery address"] },
    { key: "total_amount", header: "Total (R) *", required: true,
      example: "12500",
      hint: "Inclusive of VAT. Strip the 'R' if Excel won't parse it.",
      aliases: ["total", "amount", "value"] },
    { key: "deposit_amount", header: "Deposit (R)", required: false,
      example: "5000",
      aliases: ["deposit", "deposit paid"] },
    { key: "status", header: "Status", required: false,
      example: "completed",
      hint: "pending, confirmed, completed, cancelled. Defaults to 'completed' for past dates, 'confirmed' for future.",
      aliases: ["order status"] },
    { key: "dietary_requirements", header: "Dietary", required: false,
      example: "Halal, no nuts, 2 vegan",
      aliases: ["dietary requirements", "allergens"] },
    { key: "notes", header: "Notes", required: false,
      example: "Setup at 16:00, pack-down by 22:00",
      aliases: ["comments", "memo"] },
  ],
};

/**
 * Quotes template -- proposals sent to clients, may or may not have
 * been accepted. Goes to `quotes`.
 *
 * Required: quote_number AND total_amount AND client_name (or client_email)
 * so the linker can resolve a client. quote_number is the canonical
 * key; the DB enforces per-tenant uniqueness on it.
 */
const QUOTES_TEMPLATE: TemplateDefinition = {
  type: "quotes",
  targetTable: "quotes",
  sheetName: "Quotes",
  columns: [
    { key: "quote_number", header: "Quote number *", required: true,
      example: "Q-2026-001",
      hint: "Use whatever numbering scheme you already had. We preserve it verbatim.",
      aliases: ["quote ref", "ref", "quote no", "number"] },
    { key: "client_name", header: "Client name *", required: true,
      example: "Jane Smith",
      hint: "Used to link this quote to a client. Either name OR email is enough.",
      aliases: ["customer", "customer name"] },
    { key: "client_email", header: "Client email", required: false,
      example: "jane@example.co.za",
      aliases: ["email"] },
    { key: "client_phone", header: "Client phone", required: false,
      example: "082 555 1234",
      aliases: ["phone"] },
    { key: "quote_name", header: "Quote name", required: false,
      example: "Wedding catering for 80",
      hint: "Defaults to 'Imported quote' if blank.",
      aliases: ["title", "description"] },
    { key: "event_date", header: "Event date", required: false,
      example: "2026-04-15",
      aliases: ["date", "function date"] },
    { key: "guest_count", header: "Guest count", required: false,
      example: "80", aliases: ["pax", "guests"] },
    { key: "venue_address", header: "Venue address", required: false,
      example: "12 Long Street, Cape Town",
      aliases: ["venue"] },
    { key: "total_amount", header: "Total (R) *", required: true,
      example: "12500",
      hint: "Inclusive of VAT.",
      aliases: ["total", "amount"] },
    { key: "subtotal", header: "Subtotal (R)", required: false,
      example: "10870",
      hint: "Pre-VAT. Defaults to total if blank.",
      aliases: ["sub total"] },
    { key: "tax_amount", header: "VAT (R)", required: false,
      example: "1630",
      aliases: ["vat", "tax"] },
    { key: "delivery_fee", header: "Delivery fee (R)", required: false,
      example: "500",
      aliases: ["delivery"] },
    { key: "valid_until", header: "Valid until", required: false,
      example: "2026-03-31",
      aliases: ["expires", "expiry"] },
    { key: "status", header: "Status", required: false,
      example: "sent",
      hint: "draft, sent, accepted, declined, expired. Defaults to 'sent'.",
      aliases: ["quote status"] },
    { key: "notes", header: "Notes", required: false,
      example: "Client requested follow-up after Easter",
      aliases: ["comments"] },
  ],
};

/**
 * Invoices template -- bills sent to clients. Goes to `invoices`.
 *
 * Required: invoice_number, client linkage (name OR email), subtotal,
 * total_amount, due_date.
 *
 * Cross-sheet linker resolves:
 *   - client_id via clients sheet / DB by name+email
 *   - order_id via orders sheet by order_number column (optional)
 */
const INVOICES_TEMPLATE: TemplateDefinition = {
  type: "invoices",
  targetTable: "invoices",
  sheetName: "Invoices",
  columns: [
    { key: "invoice_number", header: "Invoice number *", required: true,
      example: "INV-2026-001",
      hint: "Use whatever numbering scheme you already had. We preserve it verbatim.",
      aliases: ["invoice no", "invoice ref", "ref", "number"] },
    { key: "client_name", header: "Client name *", required: true,
      example: "Jane Smith",
      hint: "Used to link this invoice to a client.",
      aliases: ["customer", "customer name", "billed to"] },
    { key: "client_email", header: "Client email", required: false,
      example: "jane@example.co.za",
      aliases: ["email"] },
    { key: "order_number", header: "Order number", required: false,
      example: "ORD-2026-001",
      hint: "If this invoice ties to a specific order, the importer links them. Optional -- standalone invoices land fine without one.",
      aliases: ["order ref", "linked order", "event ref"] },
    { key: "invoice_date", header: "Invoice date *", required: true,
      example: "2026-03-15",
      hint: "Date the invoice was issued. Defaults to today if blank.",
      aliases: ["date", "issue date", "issued"] },
    { key: "due_date", header: "Due date *", required: true,
      example: "2026-04-14",
      hint: "When payment is due. If blank, defaults to invoice_date + 30 days.",
      aliases: ["payment due"] },
    { key: "subtotal", header: "Subtotal (R) *", required: true,
      example: "10870",
      hint: "Pre-VAT total.",
      aliases: ["sub total", "net"] },
    { key: "tax_amount", header: "VAT (R)", required: false,
      example: "1630",
      aliases: ["vat", "tax"] },
    { key: "total_amount", header: "Total (R) *", required: true,
      example: "12500",
      hint: "Including VAT.",
      aliases: ["total", "gross"] },
    { key: "amount_paid", header: "Amount paid (R)", required: false,
      example: "5000",
      hint: "How much has been paid against this invoice. Importer auto-flips status to 'paid' when amount_paid >= total.",
      aliases: ["paid", "received"] },
    { key: "status", header: "Status", required: false,
      example: "sent",
      hint: "draft, sent, paid, overdue. Importer auto-derives from amount_paid + due_date if blank.",
      aliases: ["invoice status"] },
    { key: "notes", header: "Notes", required: false,
      example: "Payment terms: 30 days from issue",
      aliases: ["comments", "memo"] },
  ],
};

/**
 * Payments template -- money received against invoices. Goes to
 * `payments`.
 *
 * Required: amount AND (invoice_number OR order_number) so the
 * linker can resolve invoice_id / order_id / client_id.
 *
 * Cross-sheet linker resolves the client_id transitively through
 * the invoice / order it links to, so the operator doesn't have to
 * include client info on each payment row.
 */
const PAYMENTS_TEMPLATE: TemplateDefinition = {
  type: "payments",
  targetTable: "payments",
  sheetName: "Payments",
  columns: [
    { key: "invoice_number", header: "Invoice number", required: false,
      example: "INV-2026-001",
      hint: "Strongest link. If you have it, the importer ties this payment to the invoice and rolls up amount_paid automatically.",
      aliases: ["invoice ref", "invoice"] },
    { key: "order_number", header: "Order number", required: false,
      example: "ORD-2026-001",
      hint: "Fallback link when no invoice number is on the row.",
      aliases: ["order ref", "linked order"] },
    { key: "amount", header: "Amount (R) *", required: true,
      example: "5000",
      hint: "How much was received.",
      aliases: ["paid", "value", "total"] },
    { key: "payment_date", header: "Payment date *", required: true,
      example: "2026-03-20",
      hint: "When the money was received -- the date on the bank statement.",
      aliases: ["date", "received", "paid on"] },
    { key: "payment_method", header: "Payment method", required: false,
      example: "eft",
      hint: "eft, card, cash, paypal, payfast, stripe, manual. Defaults to manual.",
      aliases: ["method", "via"] },
    { key: "payment_reference", header: "Reference", required: false,
      example: "INV0001-Smith",
      hint: "Bank reference / transaction id. Helps when reconciling against the bank statement later.",
      aliases: ["bank reference", "txn ref", "transaction id"] },
    { key: "payment_status", header: "Status", required: false,
      example: "completed",
      hint: "pending, completed, failed, refunded. Defaults to completed for imports (assumes the money is already in the bank).",
      aliases: ["status"] },
    { key: "notes", header: "Notes", required: false,
      example: "Deposit -- balance due before event",
      aliases: ["comments", "memo"] },
  ],
};

const TEMPLATES: Record<TemplateType, TemplateDefinition> = {
  clients: CLIENTS_TEMPLATE,
  leads: LEADS_TEMPLATE,
  orders: ORDERS_TEMPLATE,
  quotes: QUOTES_TEMPLATE,
  invoices: INVOICES_TEMPLATE,
  payments: PAYMENTS_TEMPLATE,
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
