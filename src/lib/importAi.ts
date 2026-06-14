/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI helpers for the onboarding importer.
 *
 * Cost philosophy:
 *   - Use Haiku as the default model. 95% of the work is "match
 *     these column headers to one of these target fields" - a Haiku
 *     job, not a Sonnet job.
 *   - One round-trip per sheet for column mapping. Don't loop.
 *   - Tool-use forces structured JSON output - no parsing errors,
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

// Cheap by default. The mapper rarely benefits from Sonnet - we'll
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
  /** Line total - usually printed on the slip. */
  line_total: number | null;
  /** AI's deductibility classification, looked up from
   *  sa_tax_deductibility_rules. Null when no rules were supplied or
   *  the line couldn't be matched. */
  tax_category_code?: string | null;
  /** AI's deductibility flag derived from the matched rule. Null when
   *  unmatched - caller treats as 'unknown' rather than false. */
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
  /** Plain-English notes the operator should look at - e.g.
   *  "Bottom right corner is blurred - total may be wrong". */
  warnings: string[];
}

// Receipt OCR supports two providers and prefers Anthropic when its
// key is present, falling back to Groq otherwise (or when Anthropic
// errors / returns nothing). Within each provider there's a cheap
// primary model and a higher-capability fallback used when the primary
// returns 0 lines (faded thermal slips, sideways images, dense text).
// All env-overridable so models can be swapped without a deploy.
const ANTHROPIC_PRIMARY_MODEL = process.env.ANTHROPIC_RECEIPT_MODEL || "claude-haiku-4-5";
const ANTHROPIC_FALLBACK_MODEL = process.env.ANTHROPIC_RECEIPT_FALLBACK_MODEL || "claude-sonnet-4-5";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_PRIMARY_MODEL = process.env.GROQ_RECEIPT_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_FALLBACK_MODEL = process.env.GROQ_RECEIPT_FALLBACK_MODEL || "meta-llama/llama-4-maverick-17b-128e-instruct";

const RECEIPT_SYSTEM_BASE = `You read photos of South African supplier receipts / slips for a catering company. Your job is to extract the structured fields the catering team needs to load into their inventory: supplier, date, line items with quantities + unit prices, totals.

Rules:
- Currency is almost always ZAR. Strip "R" symbols + spaces. Numbers come back as plain numbers, never strings.
- South African dates are usually dd/mm/yyyy. Output ISO yyyy-mm-dd.
- Line items: only food / consumables / equipment that go INTO the catering business. Skip "thank you", footer text, store address.
- If a line price is hidden (folded slip, cropped), set it to null and add a warning, never guess.
- If you can't read the supplier name or date, return null and warn.
- Output ONLY a single JSON object matching the schema you are given. No markdown, no code fences, no commentary.`;

function buildTaxRulesPrompt(rules: TaxRuleForPrompt[]): string {
  if (!rules.length) return "";
  const lines = rules.map((r) =>
    `- ${r.category_code} (${r.deductibility}, group: ${r.group_label}): ${r.display_name}. Keywords: ${r.match_keywords.slice(0, 12).join(", ")}`,
  );
  return `\n\nFor each line item, additionally classify it against this list of SARS deductibility rules. Use tax_category_code = the exact category_code from the list (or null if no rule fits). Set is_deductible based on the matched rule's deductibility (deductible -> true, non_deductible -> false, partial -> true with a warning). Provide match_confidence between 0 and 1.\n\nRules:\n${lines.join("\n")}`;
}

/**
 * Compress a receipt image before we send it to the model. Anthropic
 * tokenises images by dimensions (~tokens = w*h/750) and caps internally
 * at 1568px on the long edge anyway, so over-large phone photos waste
 * money on bytes the model won't see. We:
 *   - rotate per EXIF so portrait phone photos arrive right-way-up
 *   - resize to 1568px max long edge (fit:inside, no upscale)
 *   - re-encode as JPEG q=82 with mozjpeg for ~25-40% smaller file
 *
 * Failure here is non-fatal - log + send the original. Better to spend
 * a few extra cents than fail a scan over a sharp glitch.
 */
async function compressReceiptImage(base64: string, mime: string): Promise<{ base64: string; mime: string }> {
  if (!base64) return { base64, mime };
  try {
    const sharpMod: any = await import("sharp");
    const sharp = sharpMod.default || sharpMod;
    const buf = Buffer.from(base64, "base64");
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mime: "image/jpeg" };
  } catch (e) {
    console.error("[receipt] compression failed, sending raw image", e);
    return { base64, mime };
  }
}

/** Compact JSON schema appended to the prompt. Groq vision calls use
 *  plain JSON output (not Anthropic tool-use), so we describe the shape
 *  in the prompt and parse the returned JSON ourselves. */
const RECEIPT_JSON_INSTRUCTION = `

Respond with ONLY a single JSON object (no markdown fences, no prose) with EXACTLY these keys:
{
  "supplier_name": string|null,
  "supplier_vat_number": string|null,
  "receipt_date": string|null,
  "receipt_number": string|null,
  "currency": string|null,
  "subtotal": number|null,
  "vat": number|null,
  "total": number|null,
  "payment_method": string|null,
  "line_items": [
    { "description": string, "quantity": number|null, "unit": string|null, "unit_price": number|null, "line_total": number|null, "tax_category_code": string|null, "is_deductible": boolean|null, "match_confidence": number|null }
  ],
  "warnings": [string]
}`;

/** Strip markdown fences / surrounding prose and JSON.parse the model
 *  output. Returns null when nothing parseable is found. */
function parseReceiptJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* fall through to slice */ }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(t.slice(first, last + 1)); } catch { /* give up */ }
  }
  return null;
}

/**
 * Single Anthropic (Claude) vision call against a chosen model. Uses
 * tool-use to force structured JSON. Kept as the preferred provider:
 * when ANTHROPIC_API_KEY is set the dispatcher tries this first.
 */
async function callAnthropicForReceipt(args: {
  imageBase64: string;
  imageMime: string;
  taxRules?: TaxRuleForPrompt[];
  model: string;
}): Promise<{ extraction: ReceiptExtraction; tokens_in: number; tokens_out: number; model_used: string }> {
  const systemText = RECEIPT_SYSTEM_BASE + buildTaxRulesPrompt(args.taxRules || []);
  const response: any = await (client().messages.create as any)({
    model: args.model,
    max_tokens: 8192,
    system: [
      { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
    ],
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
          { type: "image", source: { type: "base64", media_type: args.imageMime, data: args.imageBase64 } },
          { type: "text", text: "Extract every line item, totals, supplier and date from this receipt. Use the return_receipt tool." },
        ],
      },
    ],
  });

  const tokensIn = response?.usage?.input_tokens ?? 0;
  const tokensOut = response?.usage?.output_tokens ?? 0;
  const truncated = response?.stop_reason === "max_tokens";

  let extraction: ReceiptExtraction = {
    supplier_name: null, supplier_vat_number: null, receipt_date: null,
    receipt_number: null, currency: null, subtotal: null, vat: null, total: null,
    payment_method: null, line_items: [],
    warnings: truncated
      ? ["Output was cut off before the model finished - raise max_tokens or split the receipt."]
      : ["No structured response from model"],
  };

  const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
  const textCommentary: string[] = [];
  for (const block of blocks) {
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
      textCommentary.push(block.text.trim());
    }
  }
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
      if (textCommentary.length > 0) extraction.warnings = [...extraction.warnings, ...textCommentary];
      if (truncated) {
        extraction.warnings = [
          "Output was cut off mid-receipt (max_tokens hit). Lines below may be incomplete.",
          ...extraction.warnings,
        ];
      }
      break;
    }
  }

  return { extraction, tokens_in: tokensIn, tokens_out: tokensOut, model_used: args.model };
}

/**
 * Single Groq vision call against a chosen model. Groq exposes an
 * OpenAI-compatible /chat/completions endpoint, so we send the receipt
 * as an image_url (base64 data URL) plus a JSON-only instruction and
 * parse the returned JSON. Extracted so the outer dispatcher can retry
 * against a higher-tier model when the primary returns 0 lines.
 */
async function callGroqForReceipt(args: {
  imageBase64: string;
  imageMime: string;
  taxRules?: TaxRuleForPrompt[];
  model: string;
}): Promise<{ extraction: ReceiptExtraction; tokens_in: number; tokens_out: number; model_used: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const systemText = RECEIPT_SYSTEM_BASE + buildTaxRulesPrompt(args.taxRules || []) + RECEIPT_JSON_INSTRUCTION;
  const dataUrl = `data:${args.imageMime};base64,${args.imageBase64}`;

  // 8192 output tokens leaves headroom for till-roll receipts (Pick n
  // Pay / Makro / Spar) whose line_items array can run 30+ rows.
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemText },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract every line item, totals, supplier and date from this receipt. Respond with ONLY the JSON object." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    // Surface the real Groq error (bad key, bad model id, rate limit) so
    // the upload route + UI banner can show the operator what to fix.
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }

  const json: any = await res.json();
  const tokensIn: number = json?.usage?.prompt_tokens ?? 0;
  const tokensOut: number = json?.usage?.completion_tokens ?? 0;
  const choice: any = json?.choices?.[0];
  const truncated = choice?.finish_reason === "length";
  const content: string = choice?.message?.content ?? "";
  const parsed = parseReceiptJson(content);

  if (!parsed) {
    return {
      extraction: {
        supplier_name: null, supplier_vat_number: null, receipt_date: null,
        receipt_number: null, currency: null, subtotal: null, vat: null, total: null,
        payment_method: null, line_items: [],
        warnings: truncated
          ? ["Output was cut off before the model finished - raise max_tokens or split the receipt."]
          : [content.trim() ? `Model did not return valid JSON: ${content.trim().slice(0, 200)}` : "No structured response from model"],
      },
      tokens_in: tokensIn, tokens_out: tokensOut, model_used: args.model,
    };
  }

  const extraction: ReceiptExtraction = {
    supplier_name: parsed.supplier_name ?? null,
    supplier_vat_number: parsed.supplier_vat_number ?? null,
    receipt_date: parsed.receipt_date ?? null,
    receipt_number: parsed.receipt_number ?? null,
    currency: parsed.currency ?? null,
    subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : null,
    vat: typeof parsed.vat === "number" ? parsed.vat : null,
    total: typeof parsed.total === "number" ? parsed.total : null,
    payment_method: parsed.payment_method ?? null,
    line_items: Array.isArray(parsed.line_items) ? parsed.line_items.map((li: any) => ({
      description: String(li?.description ?? "").trim(),
      quantity: typeof li?.quantity === "number" ? li.quantity : null,
      unit: li?.unit ?? null,
      unit_price: typeof li?.unit_price === "number" ? li.unit_price : null,
      line_total: typeof li?.line_total === "number" ? li.line_total : null,
      tax_category_code: typeof li?.tax_category_code === "string" ? li.tax_category_code : null,
      is_deductible: typeof li?.is_deductible === "boolean" ? li.is_deductible : null,
      match_confidence: typeof li?.match_confidence === "number" ? li.match_confidence : null,
    })) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((w: any) => String(w)) : [],
  };

  if (truncated) {
    extraction.warnings = [
      "Output was cut off mid-receipt (max_tokens hit). Lines below may be incomplete.",
      ...extraction.warnings,
    ];
  }

  return { extraction, tokens_in: tokensIn, tokens_out: tokensOut, model_used: args.model };
}

/**
 * Run a single receipt photo through Claude's vision model and pull
 * out the structured fields. Caller hands us the image as base64
 * (PNG / JPEG / WebP) along with its MIME type.
 *
 * Two-tier strategy:
 *   1. Compress the image (rotate per EXIF, resize to 1568px max long
 *      edge, re-encode as JPEG q=82). Cuts image-token cost.
 *   2. Try Haiku 4-5 first (~4x cheaper than Sonnet for the same task).
 *   3. If Haiku returns 0 line items, retry with Sonnet 4-5 - the
 *      higher-tier model handles edge cases (faded thermal slips,
 *      sideways images, very dense text) that Haiku occasionally
 *      drops. We tag the result with a "switched to higher-tier model"
 *      warning so the UI/log shows when the fallback fired.
 *
 * Net effect: ~80% of slips run on Haiku at low cost; the harder ~20%
 * still get the right answer at Sonnet rates. Expected per-scan blended
 * cost is roughly Haiku-rate + a small Sonnet tail.
 */
export async function extractReceiptViaAI(args: {
  imageBase64: string;
  imageMime: string;
  /** Optional SARS rules. When provided, the model classifies each
   *  line item against them and returns tax_category_code +
   *  is_deductible per line. */
  taxRules?: TaxRuleForPrompt[];
}): Promise<{ extraction: ReceiptExtraction; tokens_in: number; tokens_out: number; model_used?: string }> {
  const compressed = await compressReceiptImage(args.imageBase64, args.imageMime);

  // Provider order: Anthropic first when its key is set, then Groq.
  // Each provider runs its own cheap-primary -> higher-tier-fallback
  // when the primary returns 0 lines. If a provider errors (bad key,
  // outage) or still yields 0 lines, we fall through to the next.
  const providers: Array<"anthropic" | "groq"> = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
  if (process.env.GROQ_API_KEY) providers.push("groq");
  if (providers.length === 0) {
    throw new Error("AI receipt scanning is not configured - set ANTHROPIC_API_KEY or GROQ_API_KEY on the server.");
  }

  const runProvider = async (provider: "anthropic" | "groq") => {
    const isAnthropic = provider === "anthropic";
    const call = isAnthropic ? callAnthropicForReceipt : callGroqForReceipt;
    const primary = isAnthropic ? ANTHROPIC_PRIMARY_MODEL : GROQ_PRIMARY_MODEL;
    const fallback = isAnthropic ? ANTHROPIC_FALLBACK_MODEL : GROQ_FALLBACK_MODEL;
    const res = await call({ imageBase64: compressed.base64, imageMime: compressed.mime, taxRules: args.taxRules, model: primary });
    if (res.extraction.line_items.length === 0 && primary !== fallback) {
      console.log(`[receipt] ${provider} primary ${primary} returned 0 lines, retrying with ${fallback}`);
      const fb = await call({ imageBase64: compressed.base64, imageMime: compressed.mime, taxRules: args.taxRules, model: fallback });
      fb.extraction.warnings = [
        `Switched to ${fallback} after ${primary} returned no lines.`,
        ...(fb.extraction.warnings || []).filter((w) => !w.startsWith("No structured response")),
      ];
      return fb;
    }
    return res;
  };

  let lastResult: { extraction: ReceiptExtraction; tokens_in: number; tokens_out: number; model_used?: string } | null = null;
  let lastErr: unknown = null;
  for (const provider of providers) {
    try {
      const result = await runProvider(provider);
      if (result.extraction.line_items.length > 0) return result;
      // Zero lines from this provider - keep it as a fallback result
      // but try the next provider for a better read.
      lastResult = result;
    } catch (e) {
      console.warn(`[receipt] provider ${provider} failed:`, e);
      lastErr = e;
    }
  }
  if (lastResult) return lastResult;
  throw lastErr instanceof Error ? lastErr : new Error("Receipt extraction failed");
}
