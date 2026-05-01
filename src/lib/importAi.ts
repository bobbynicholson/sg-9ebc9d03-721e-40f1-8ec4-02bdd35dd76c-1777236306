/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI helpers for the onboarding importer.
 *
 * Cost philosophy:
 *   - Use Haiku as the default model. 95% of the work is "match
 *     these column headers to one of these target fields" -- a Haiku
 *     job, not a Sonnet job.
 *   - One round-trip per sheet for column mapping. Don't loop.
 *   - Tool-use forces structured JSON output -- no parsing errors,
 *     no rambling.
 *   - Hard token caps on prompts. We send headers + 3 sample rows
 *     per sheet, never the whole file.
 *
 * Tenant scoping:
 *   - The AI never sees the company id. Mappings are pure structural
 *     (header -> target field) and aren't sensitive.
 *   - Sample rows DO include real cell values. Anthropic's API has
 *     a no-train policy by default for production traffic. We don't
 *     opt back in.
 */
import Anthropic from "@anthropic-ai/sdk";

// Cheap by default. The mapper rarely benefits from Sonnet -- we'll
// flip the env var to escalate one stuck job at a time if needed.
const DEFAULT_MODEL = process.env.ANTHROPIC_IMPORT_MODEL || "claude-haiku-4-5";

// Cast to any so SDK type drift between minor versions can't break
// our compile. The runtime API is stable.
let _client: any = null;
function client(): any {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  _client = new (Anthropic as any)({ apiKey });
  return _client;
}

// ── Target schemas ────────────────────────────────────────────────────

/** Fields the importer can fill on the clients table. */
export const CLIENT_TARGET_FIELDS = [
  { key: "client_name",   description: "Full name of the contact / company" },
  { key: "email",         description: "Primary email address" },
  { key: "phone",         description: "Primary phone number" },
  { key: "company_name",  description: "Business name when distinct from contact_name" },
  { key: "address",       description: "Postal or street address" },
  { key: "notes",         description: "Free-form notes about the client" },
  { key: "status",        description: "active / inactive / VIP / lost" },
  { key: "created_at",    description: "When the client first signed up (date)" },
  { key: "skip",          description: "Use when the column has nothing useful (running totals, blank columns, etc.)" },
] as const;

/** Fields the importer can fill on the orders table. */
export const ORDER_TARGET_FIELDS = [
  { key: "client_name",   description: "Name of the client placing the order" },
  { key: "client_email",  description: "Client email address" },
  { key: "client_phone",  description: "Client phone number" },
  { key: "event_name",    description: "Event / function name" },
  { key: "event_date",    description: "Date of the event" },
  { key: "event_time",    description: "Start time on the event date" },
  { key: "guest_count",   description: "Number of guests" },
  { key: "venue_address", description: "Venue / delivery address" },
  { key: "total_amount",  description: "Total quote / order amount in Rand" },
  { key: "deposit_paid",  description: "Whether the deposit has been received" },
  { key: "status",        description: "draft / confirmed / completed / cancelled" },
  { key: "notes",         description: "Free-form notes" },
  { key: "external_ref",  description: "Source-system reference (invoice no, Xero ID, etc.)" },
  { key: "skip",          description: "Use when the column has nothing useful" },
] as const;

export type ColumnMappingResult = {
  /** header text from the source sheet */
  source_header: string;
  /** chosen target field key, or 'skip' */
  target: string;
  /** model self-reported confidence 0-1 */
  confidence: number;
  /** one-line rationale for the choice */
  rationale: string;
};

export interface MapColumnsArgs {
  sheetName: string;
  headers: string[];
  sampleRows: Array<Record<string, any>>;
  /** Which target field set to map against. */
  targetSchema: "clients" | "orders";
}

const SYSTEM_PROMPT = `You are an importer assistant for a multi-tenant catering SaaS. Your only job is to match the column headers from a customer-supplied spreadsheet to the target fields the system uses.

Rules:
- Pick exactly one target key per source header.
- Use 'skip' when no field is a clear match. Better to skip than to guess wrong, the operator will spot a missed column and fix it manually.
- Confidence is a 0..1 self-assessment. Start at 0.95 for an exact synonym match (e.g. "Email" -> email), drop to 0.6-0.8 for inference (e.g. "Phone Cell" -> phone), 0.3-0.5 for plausible-but-uncertain. Below 0.3 = use skip.
- Rationale is one sentence, max 80 chars.
- Output via the return_mapping tool. Never write free-form prose.`;

/**
 * One round-trip column mapping. Returns a per-source-header decision
 * with a confidence + rationale so the operator UI can highlight
 * low-confidence rows for manual review.
 */
export async function mapColumnsViaAI(args: MapColumnsArgs): Promise<{
  mapping: ColumnMappingResult[];
  tokens_in: number;
  tokens_out: number;
}> {
  const fields =
    args.targetSchema === "clients" ? CLIENT_TARGET_FIELDS : ORDER_TARGET_FIELDS;

  // Trim sample rows so we don't send 50 of them. Three is enough
  // signal for header inference and stays under 1k tokens.
  const samples = args.sampleRows.slice(0, 3);

  const userMessage = JSON.stringify({
    sheet_name: args.sheetName,
    target_fields: fields.map((f) => ({ key: f.key, description: f.description })),
    source_headers: args.headers,
    sample_rows: samples,
  });

  // Cast the SDK call to any: the @anthropic-ai/sdk types tighten
  // tool_choice + content block shapes between minor versions and
  // we don't want a future SDK upgrade to break compile. Runtime
  // shape is stable.
  const response: any = await (client().messages.create as any)({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "return_mapping",
        description:
          "Return the header -> target mapping. One entry per source header.",
        input_schema: {
          type: "object",
          properties: {
            mappings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  source_header: { type: "string" },
                  target: { type: "string" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  rationale: { type: "string" },
                },
                required: ["source_header", "target", "confidence", "rationale"],
                additionalProperties: false,
              },
            },
          },
          required: ["mappings"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: "tool", name: "return_mapping" },
    messages: [{ role: "user", content: userMessage }],
  });

  const tokensIn: number = response?.usage?.input_tokens ?? 0;
  const tokensOut: number = response?.usage?.output_tokens ?? 0;

  // Pull the tool_use block. With tool_choice forced, this is the
  // only content we expect.
  let mapping: ColumnMappingResult[] = [];
  const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
  for (const block of blocks) {
    if (block?.type === "tool_use" && block?.name === "return_mapping") {
      const input = block.input as any;
      if (Array.isArray(input?.mappings)) {
        mapping = input.mappings.map((m: any) => ({
          source_header: String(m.source_header ?? ""),
          target: String(m.target ?? "skip"),
          confidence: Number(m.confidence ?? 0),
          rationale: String(m.rationale ?? ""),
        }));
      }
      break;
    }
  }

  // Belt-and-braces: ensure every source header has a row. The model
  // sometimes drops blanks; we default missing ones to 'skip'.
  const seen = new Set(mapping.map((m) => m.source_header));
  for (const h of args.headers) {
    if (!seen.has(h)) {
      mapping.push({ source_header: h, target: "skip", confidence: 0, rationale: "Not returned by model" });
    }
  }

  return { mapping, tokens_in: tokensIn, tokens_out: tokensOut };
}

// ── Orphan-row fixer ────────────────────────────────────────────────────

export interface RepairRowResult {
  /** Repaired field values keyed by target field name. Operator
   *  reviews these and accepts / rejects. */
  fixes: Record<string, string | number | null>;
  /** Plain-English explanation of what was changed and why. */
  rationale: string;
  /** Issues the model couldn't auto-resolve. The operator still has to
   *  fix these by hand. */
  unresolved: string[];
}

const ROW_REPAIR_MODEL = process.env.ANTHROPIC_REPAIR_MODEL || DEFAULT_MODEL;

const REPAIR_SYSTEM = `You repair single rows from a customer-supplied spreadsheet that the deterministic importer flagged as broken. Your job is to suggest cleaned values for the named target fields, given the raw cells and the warning messages.

Rules:
- Only return fields you are confident about. Skip the rest.
- Dates: ISO yyyy-mm-dd. Strip times unless the field is event_time.
- Numbers: plain numbers, no R/$ symbols, no thousands separators.
- Phone numbers: keep international prefix when present, otherwise return what the operator typed.
- Names and emails: trim whitespace, normalise case for emails (lowercase).
- If a warning says "doesn't look like an email" and you genuinely can't reconstruct one, leave email out of the fix and add the issue to unresolved.
- Output via the return_repair tool. No prose.`;

/**
 * Ask Claude to repair a single import row. Used when the deterministic
 * normaliser produced warnings the operator wants help resolving --
 * e.g. weird date formats, garbled emails, free-text totals.
 *
 * Cost-conscious: one round-trip per row, Haiku by default, token
 * caps tight. The wizard only triggers this when the operator clicks
 * 'AI repair' on a row, so volume stays bounded.
 */
export async function repairRowViaAI(args: {
  rawRow: Record<string, any>;
  mappedRow: Record<string, any>;
  warnings: string[];
  errorMessage: string | null;
  targetTable: "clients" | "orders";
}): Promise<{ result: RepairRowResult; tokens_in: number; tokens_out: number }> {
  const targetFields = args.targetTable === "orders"
    ? ORDER_TARGET_FIELDS
    : CLIENT_TARGET_FIELDS;

  const fieldList = targetFields
    .filter((f) => f.key !== "skip")
    .map((f) => `- ${f.key}: ${f.description}`)
    .join("\n");

  const userMessage = `Target table: ${args.targetTable}

Available fields you may return values for:
${fieldList}

Raw cells from the spreadsheet (header -> value):
${JSON.stringify(args.rawRow, null, 2)}

Current best-effort mapping after the deterministic pass:
${JSON.stringify(args.mappedRow, null, 2)}

Issues to resolve:
${args.errorMessage ? `- ERROR: ${args.errorMessage}\n` : ""}${args.warnings.map((w) => `- ${w}`).join("\n") || "(no warnings, just clean up the row)"}

Return only the fields where you can improve on the current mapping. Use the return_repair tool.`;

  const response: any = await (client().messages.create as any)({
    model: ROW_REPAIR_MODEL,
    max_tokens: 1024,
    system: REPAIR_SYSTEM,
    tools: [
      {
        name: "return_repair",
        description: "Return repaired field values plus a short explanation.",
        input_schema: {
          type: "object",
          properties: {
            fixes: {
              type: "object",
              description: "Map of target_field -> repaired value. Omit fields you can't improve.",
              additionalProperties: { type: ["string", "number", "null"] },
            },
            rationale: {
              type: "string",
              description: "One sentence explaining what was changed and why.",
            },
            unresolved: {
              type: "array",
              items: { type: "string" },
              description: "Issues you couldn't fix automatically. Operator follow-up needed.",
            },
          },
          required: ["fixes", "rationale", "unresolved"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: "tool", name: "return_repair" },
    messages: [{ role: "user", content: userMessage }],
  });

  const tokensIn = response?.usage?.input_tokens || 0;
  const tokensOut = response?.usage?.output_tokens || 0;

  let result: RepairRowResult = { fixes: {}, rationale: "", unresolved: [] };
  const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
  for (const block of blocks) {
    if (block?.type === "tool_use" && block?.name === "return_repair") {
      const input = block.input as any;
      result = {
        fixes: (input?.fixes && typeof input.fixes === "object") ? input.fixes : {},
        rationale: String(input?.rationale ?? ""),
        unresolved: Array.isArray(input?.unresolved)
          ? input.unresolved.map((s: any) => String(s))
          : [],
      };
      break;
    }
  }

  return { result, tokens_in: tokensIn, tokens_out: tokensOut };
}

// ── Receipt vision extractor ─────────────────────────────────────────────

export interface ReceiptLineItem {
  description: string;
  quantity: number | null;
  unit: string | null;
  /** Per-unit price if discernible, else null. */
  unit_price: number | null;
  /** Line total -- usually printed on the slip. */
  line_total: number | null;
  /** AI's deductibility classification, looked up from
   *  sa_tax_deductibility_rules. Null when no rules were supplied or
   *  the line couldn't be matched. */
  tax_category_code?: string | null;
  /** AI's deductibility flag derived from the matched rule. Null when
   *  unmatched -- caller treats as 'unknown' rather than false. */
  is_deductible?: boolean | null;
  /** Confidence 0-1 the model assigned to its rule match. */
  match_confidence?: number | null;
}

export interface TaxRuleForPrompt {
  category_code: string;
  display_name: string;
  group_label: string;
  deductibility: "deductible" | "partial" | "non_deductible";
  match_keywords: string[];
}

export interface ReceiptExtraction {
  supplier_name: string | null;
  supplier_vat_number: string | null;
  receipt_date: string | null;
  receipt_number: string | null;
  currency: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  payment_method: string | null;
  line_items: ReceiptLineItem[];
  /** Plain-English notes the operator should look at -- e.g.
   *  "Bottom right corner is blurred -- total may be wrong". */
  warnings: string[];
}

const RECEIPT_MODEL = process.env.ANTHROPIC_RECEIPT_MODEL || "claude-sonnet-4-5";

const RECEIPT_SYSTEM_BASE = `You read photos of South African supplier receipts / slips for a catering company. Your job is to extract the structured fields the catering team needs to load into their inventory: supplier, date, line items with quantities + unit prices, totals.

Rules:
- Currency is almost always ZAR. Strip "R" symbols + spaces. Numbers come back as plain numbers, never strings.
- South African dates are usually dd/mm/yyyy. Output ISO yyyy-mm-dd.
- Line items: only food / consumables / equipment that go INTO the catering business. Skip "thank you", footer text, store address.
- If a line price is hidden (folded slip, cropped), set it to null and add a warning, never guess.
- If you can't read the supplier name or date, return null and warn.
- Output via the return_receipt tool. No free-form prose.`;

function buildTaxRulesPrompt(rules: TaxRuleForPrompt[]): string {
  if (!rules.length) return "";
  const lines = rules.map((r) =>
    `- ${r.category_code} (${r.deductibility}, group: ${r.group_label}): ${r.display_name}. Keywords: ${r.match_keywords.slice(0, 12).join(", ")}`,
  );
  return `\n\nFor each line item, additionally classify it against this list of SARS deductibility rules. Use tax_category_code = the exact category_code from the list (or null if no rule fits). Set is_deductible based on the matched rule's deductibility (deductible -> true, non_deductible -> false, partial -> true with a warning). Provide match_confidence between 0 and 1.\n\nRules:\n${lines.join("\n")}`;
}

/**
 * Run a single receipt photo through Claude's vision model and pull
 * out the structured fields. Caller hands us the image as base64
 * (PNG / JPEG / WebP) along with its MIME type.
 */
export async function extractReceiptViaAI(args: {
  imageBase64: string;
  imageMime: string;
  /** Optional SARS rules. When provided, the model classifies each
   *  line item against them and returns tax_category_code +
   *  is_deductible per line. */
  taxRules?: TaxRuleForPrompt[];
}): Promise<{ extraction: ReceiptExtraction; tokens_in: number; tokens_out: number }> {
  const system = RECEIPT_SYSTEM_BASE + buildTaxRulesPrompt(args.taxRules || []);
  const response: any = await (client().messages.create as any)({
    model: RECEIPT_MODEL,
    max_tokens: 2048,
    system,
    tools: [
      {
        name: "return_receipt",
        description: "Return the structured contents of the receipt.",
        input_schema: {
          type: "object",
          properties: {
            supplier_name:        { type: ["string", "null"] },
            supplier_vat_number:  { type: ["string", "null"] },
            receipt_date:         { type: ["string", "null"], description: "ISO yyyy-mm-dd" },
            receipt_number:       { type: ["string", "null"] },
            currency:             { type: ["string", "null"], description: "ISO currency code, usually ZAR" },
            subtotal:             { type: ["number", "null"] },
            vat:                  { type: ["number", "null"] },
            total:                { type: ["number", "null"] },
            payment_method:       { type: ["string", "null"], description: "card / cash / eft / unknown" },
            line_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description:        { type: "string" },
                  quantity:           { type: ["number", "null"] },
                  unit:               { type: ["string", "null"], description: "e.g. kg, ea, L" },
                  unit_price:         { type: ["number", "null"] },
                  line_total:         { type: ["number", "null"] },
                  tax_category_code:  { type: ["string", "null"], description: "category_code from the supplied rules list, or null if no fit" },
                  is_deductible:      { type: ["boolean", "null"], description: "Derived from the matched rule" },
                  match_confidence:   { type: ["number", "null"], description: "0-1 confidence in the rule match" },
                },
                required: ["description", "quantity", "unit", "unit_price", "line_total", "tax_category_code", "is_deductible", "match_confidence"],
                additionalProperties: false,
              },
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "Plain-English notes about anything that was hard to read.",
            },
          },
          required: [
            "supplier_name", "supplier_vat_number", "receipt_date", "receipt_number",
            "currency", "subtotal", "vat", "total", "payment_method",
            "line_items", "warnings",
          ],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: "tool", name: "return_receipt" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: args.imageMime,
              data: args.imageBase64,
            },
          },
          {
            type: "text",
            text: "Extract every line item, totals, supplier and date from this receipt. Use the return_receipt tool.",
          },
        ],
      },
    ],
  });

  const tokensIn = response?.usage?.input_tokens ?? 0;
  const tokensOut = response?.usage?.output_tokens ?? 0;
  let extraction: ReceiptExtraction = {
    supplier_name: null, supplier_vat_number: null, receipt_date: null,
    receipt_number: null, currency: null, subtotal: null, vat: null, total: null,
    payment_method: null, line_items: [], warnings: ["No structured response from model"],
  };

  const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
  for (const block of blocks) {
    if (block?.type === "tool_use" && block?.name === "return_receipt") {
      const input = block.input as any;
      extraction = {
        supplier_name: input.supplier_name ?? null,
        supplier_vat_number: input.supplier_vat_number ?? null,
        receipt_date: input.receipt_date ?? null,
        receipt_number: input.receipt_number ?? null,
        currency: input.currency ?? null,
        subtotal: typeof input.subtotal === "number" ? input.subtotal : null,
        vat: typeof input.vat === "number" ? input.vat : null,
        total: typeof input.total === "number" ? input.total : null,
        payment_method: input.payment_method ?? null,
        line_items: Array.isArray(input.line_items) ? input.line_items.map((li: any) => ({
          description: String(li.description ?? "").trim(),
          quantity: typeof li.quantity === "number" ? li.quantity : null,
          unit: li.unit ?? null,
          unit_price: typeof li.unit_price === "number" ? li.unit_price : null,
          line_total: typeof li.line_total === "number" ? li.line_total : null,
          tax_category_code: typeof li.tax_category_code === "string" ? li.tax_category_code : null,
          is_deductible: typeof li.is_deductible === "boolean" ? li.is_deductible : null,
          match_confidence: typeof li.match_confidence === "number" ? li.match_confidence : null,
        })) : [],
        warnings: Array.isArray(input.warnings) ? input.warnings.map((w: any) => String(w)) : [],
      };
      break;
    }
  }

  return { extraction, tokens_in: tokensIn, tokens_out: tokensOut };
}
