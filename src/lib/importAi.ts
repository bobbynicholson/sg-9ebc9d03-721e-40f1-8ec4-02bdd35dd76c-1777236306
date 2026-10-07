/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI helpers for the onboarding importer.
 *
 * Cost philosophy:
 *   - Text tasks (column mapping, row repair) run on OpenAI's
 *     open-weight gpt-oss-20b via OpenRouter / Groq, with OpenAI direct
 *     as the last text fallback (src/lib/ai/textLlm.ts). Anthropic is not
 *     used for text - it cost ~40x more for the same mapping job.
 *   - One round-trip per sheet for column mapping. Don't loop.
 *   - JSON mode + a fixed shape in the prompt; parsed defensively.
 *   - Hard token caps on prompts. We send headers + 3 sample rows
 *     per sheet, never the whole file.
 *   - Receipt vision runs on Llama 4 Scout (OpenRouter), gpt-4.1-mini, Qwen 3.8 (Groq); Claude
 *     is only a last-resort vision fallback when those all fail.
 *
 * Tenant scoping:
 *   - The AI never sees the company id. Mappings are pure structural
 *     (header -> target field) and aren't sensitive.
 *   - Sample rows DO include real cell values (max 3 rows, clipped).
 */
import {
  callTextJson,
  chatCompletion,
  parseJsonLoose,
  visionModels,
  visionProviderOrder,
  VISION_AI_KEYS_HINT,
  type VisionProvider,
} from "@/lib/ai/textLlm";
import { recordAiUsage } from "@/lib/ai/usageLog";

// Anthropic is a last-resort vision fallback only (receipt scans), so
// the SDK is loaded lazily the first time that path actually fires.
let _client: any = null;
async function client(): Promise<any> {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
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
  /** Optional custom field list (key + description). Overrides the
   *  schema preset; a "skip" entry is added automatically. */
  targetFields?: Array<{ key: string; description: string }>;
}

const SYSTEM_PROMPT = `You are an importer assistant for a multi-tenant catering SaaS. Your only job is to match every column of a customer-supplied spreadsheet to the target field the system uses.

How to decide:
- Read BOTH the header and the sample values. Values beat headers: a column of "x@y.com" values is the email even if the header says "Contact"; a column of 10-digit numbers starting 0 or +27 is a phone; "Col 7" full of street names is an address.
- Fields marked (required) matter most. If any column plausibly holds a required field, map it - the import fails for every row without it.
- Each target field may be used by at most ONE column. If two columns fit, give the field to the better one and map the other to its next-best field or 'skip'.
- Separate first-name and last-name columns: use the dedicated first/last name fields when offered, not the full-name field twice.
- A company / organisation column and a person-name column together: the company goes to the client / company name field, the person to the person-name (first-name) field.
- Use the exact key strings from target_fields; never invent a key.
- Use 'skip' only for columns with nothing importable (internal ids, running balances, blank columns, timestamps of the export itself).

Confidence is a 0..1 self-assessment: 0.95 for an exact synonym ("Email" -> email), 0.7-0.85 for inference from values or a loose header, 0.4-0.6 when plausible but unsure. Below 0.4 use 'skip'.
Rationale: one short sentence, max 80 chars, saying what in the header or values decided it.

Return ONLY a JSON object: { "mappings": [ { "source_header": string, "target": string, "confidence": number, "rationale": string } ] } with exactly one entry per source header, using the header text verbatim.`;

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
  const fields = args.targetFields && args.targetFields.length > 0
    ? [...args.targetFields.filter((f) => f.key !== "skip"), { key: "skip", description: "No matching field; ignore this column." }]
    : args.targetSchema === "clients" ? CLIENT_TARGET_FIELDS : ORDER_TARGET_FIELDS;

  // Five rows give the model enough values to recognise a column by its
  // contents (emails, phone numbers) when the header is vague. Cells are
  // clipped so a notes column can't blow the prompt up.
  const samples = args.sampleRows.slice(0, 5).map((row) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row || {})) {
      out[k] = typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}...` : v;
    }
    return out;
  });

  const ask = async (headers: string[]) => {
    const userMessage = JSON.stringify({
      sheet_name: args.sheetName,
      target_fields: fields.map((f) => ({ key: f.key, description: f.description })),
      source_headers: headers,
      sample_rows: samples,
    });
    // gpt-oss-120b first (OpenRouter -> Groq -> OpenAI). Output scales with
    // the column count (~60 tokens per mapping) so wide sheets are not cut
    // off; bounded so one call stays cheap. A provider that returns no
    // mappings array falls through to the next one.
    const { data, tokens_in, tokens_out } = await callTextJson({
      label: "column_matching",
      // Mapping decides whether a whole file imports correctly, so it
      // gets the stronger model (gpt-oss-120b).
      tier: "smart",
      timeoutMs: 45_000,
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: Math.min(4096, 256 + headers.length * 64),
      accept: (d) => Array.isArray(d?.mappings) && d.mappings.length > 0,
    });
    return { rows: data.mappings as any[], tokens_in, tokens_out };
  };

  // The model sometimes echoes a header with different case / spacing;
  // match on a tidied form so those still count.
  const tidy = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();
  const byTidy = new Map(args.headers.map((h) => [tidy(h), h]));
  const decided = new Map<string, ColumnMappingResult>();
  const take = (raw: any[]) => {
    for (const m of raw) {
      const header = byTidy.get(tidy(String(m?.source_header ?? "")));
      if (header === undefined || decided.has(header)) continue;
      decided.set(header, {
        source_header: header,
        target: String(m?.target ?? "skip"),
        confidence: Number(m?.confidence ?? 0),
        rationale: String(m?.rationale ?? ""),
      });
    }
  };

  const first = await ask(args.headers);
  take(first.rows);
  let tokens_in = first.tokens_in;
  let tokens_out = first.tokens_out;

  // The model occasionally leaves columns out (short headers like "X"
  // go missing most). Ask once more about just those, so a column with
  // real data isn't skipped by accident.
  const missing = args.headers.filter((h) => h.trim() !== "" && !decided.has(h));
  if (missing.length > 0) {
    try {
      const retry = await ask(missing);
      take(retry.rows);
      tokens_in += retry.tokens_in;
      tokens_out += retry.tokens_out;
    } catch {
      // Keep the first answer; the rest default to skip below.
    }
  }

  const mapping: ColumnMappingResult[] = args.headers.map((h) => decided.get(h)
    || { source_header: h, target: "skip", confidence: 0, rationale: h.trim() ? "Not returned by model" : "Column has no heading" });

  return { mapping, tokens_in, tokens_out };
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

const REPAIR_SYSTEM = `You repair single rows from a customer-supplied spreadsheet that the deterministic importer flagged as broken. Your job is to suggest cleaned values for the named target fields, given the raw cells and the warning messages.

Rules:
- Only return fields you are confident about. Skip the rest.
- Dates: ISO yyyy-mm-dd. Strip times unless the field is event_time.
- Numbers: plain numbers, no R/$ symbols, no thousands separators.
- Phone numbers: keep international prefix when present, otherwise return what the operator typed.
- Names and emails: trim whitespace, normalise case for emails (lowercase).
- If a warning says "doesn't look like an email" and you genuinely can't reconstruct one, leave email out of the fix and add the issue to unresolved.
- No prose.

Return ONLY a JSON object: { "fixes": { <field>: <value> }, "rationale": string, "unresolved": [string] }`;

/**
 * Ask the model to repair a single import row. Used when the deterministic
 * normaliser produced warnings the operator wants help resolving --
 * e.g. weird date formats, garbled emails, free-text totals.
 *
 * Cost-conscious: one round-trip per row, gpt-oss-20b, token
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

Return only the fields where you can improve on the current mapping, as the JSON object described.`;

  const { data, tokens_in, tokens_out } = await callTextJson({
    label: "import_row_repair",
    system: REPAIR_SYSTEM,
    user: userMessage,
    maxTokens: 1024,
  });
  const result: RepairRowResult = {
    fixes: (data?.fixes && typeof data.fixes === "object" && !Array.isArray(data.fixes)) ? data.fixes : {},
    rationale: String(data?.rationale ?? ""),
    unresolved: Array.isArray(data?.unresolved) ? data.unresolved.map((s: any) => String(s)) : [],
  };
  return { result, tokens_in, tokens_out };
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

// Receipt OCR provider order: OpenRouter (Llama 4 Scout) -> OpenAI
// (gpt-4.1-mini) -> Groq (Qwen 3.8) -> Anthropic Haiku as a last resort. gpt-oss is
// text-only so it cannot read slips. Within each provider there's a cheap
// primary model and a higher-capability fallback used when the primary
// returns 0 lines (faded thermal slips, sideways images, dense text).
// All env-overridable so models can be swapped without a deploy.
const ANTHROPIC_RECEIPT_MODEL = process.env.ANTHROPIC_RECEIPT_MODEL || "claude-haiku-4-5";

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

/**
 * Single Anthropic (Claude) vision call. Uses tool-use to force
 * structured JSON. Last-resort only: the dispatcher reaches it when the
 * Llama vision providers are unconfigured or all failed.
 */
async function callAnthropicForReceipt(args: {
  imageBase64: string;
  imageMime: string;
  taxRules?: TaxRuleForPrompt[];
  model: string;
}): Promise<{ extraction: ReceiptExtraction; tokens_in: number; tokens_out: number; model_used: string }> {
  const systemText = RECEIPT_SYSTEM_BASE + buildTaxRulesPrompt(args.taxRules || []);
  const started = Date.now();
  const response: any = await ((await client()).messages.create as any)({
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
  recordAiUsage({
    feature: "receipt_scan", provider: "anthropic", model: args.model,
    tokensIn, tokensOut: response?.usage?.output_tokens ?? 0, success: true, latencyMs: Date.now() - started,
  });
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
 * Single OpenAI-compatible vision call (Groq or OpenRouter) against a
 * chosen model. We send the receipt as an image_url (base64 data URL)
 * plus a JSON-only instruction and parse the returned JSON. Extracted so
 * the outer dispatcher can retry against a higher-tier model when the
 * primary returns 0 lines.
 */
async function callOpenAiCompatibleForReceipt(args: {
  provider: VisionProvider;
  imageBase64: string;
  imageMime: string;
  taxRules?: TaxRuleForPrompt[];
  model: string;
}): Promise<{ extraction: ReceiptExtraction; tokens_in: number; tokens_out: number; model_used: string }> {
  const systemText = RECEIPT_SYSTEM_BASE + buildTaxRulesPrompt(args.taxRules || []) + RECEIPT_JSON_INSTRUCTION;
  const dataUrl = `data:${args.imageMime};base64,${args.imageBase64}`;

  // 8192 output tokens leaves headroom for till-roll receipts (Pick n
  // Pay / Makro / Spar) whose line_items array can run 30+ rows. Errors
  // (bad key, bad model id, rate limit) surface with the provider's
  // message so the upload route + UI banner can show what to fix.
  const r = await chatCompletion({
    provider: args.provider,
    model: args.model,
    feature: "receipt_scan",
    maxTokens: 8192,
    timeoutMs: 55_000,
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
  });

  const tokensIn = r.tokens_in;
  const tokensOut = r.tokens_out;
  const truncated = r.finishReason === "length";
  const content = r.content;
  const parsed = parseJsonLoose(content);

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
 * Run a single receipt photo through a vision model and pull out the
 * structured fields. Caller hands us the image as base64 (PNG / JPEG /
 * WebP) along with its MIME type.
 *
 * Strategy:
 *   1. Compress the image (rotate per EXIF, resize to 1568px max long
 *      edge, re-encode as JPEG q=82). Cuts image-token cost.
 *   2. Llama 4 Scout first (OpenRouter), then gpt-4.1-mini (OpenAI), then
 *      Qwen 3.8 (Groq).
 *   3. If Scout returns 0 line items, retry with Llama 4 Maverick on the
 *      same provider (faded thermal slips, sideways images, dense text).
 *      We tag the result with a "switched to" warning so the UI/log
 *      shows when the fallback fired.
 *   4. Claude Haiku only when every Llama provider failed or read
 *      nothing - a last resort, never the default.
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

  // Provider order: OpenRouter -> OpenAI -> Groq -> Anthropic (last resort).
  // Each Llama provider runs its own cheap-primary -> higher-tier
  // fallback when the primary returns 0 lines. If a provider errors (bad
  // key, outage) or still yields 0 lines, we fall through to the next.
  type ReceiptProvider = VisionProvider | "anthropic";
  const providers: ReceiptProvider[] = [...visionProviderOrder()];
  if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
  if (providers.length === 0) {
    throw new Error(`AI receipt scanning is not configured - ${VISION_AI_KEYS_HINT}.`);
  }

  const runProvider = async (provider: ReceiptProvider) => {
    const base = { imageBase64: compressed.base64, imageMime: compressed.mime, taxRules: args.taxRules };
    if (provider === "anthropic") {
      return callAnthropicForReceipt({ ...base, model: ANTHROPIC_RECEIPT_MODEL });
    }
    const { primary, fallback } = visionModels(provider);
    const call = (model: string) => callOpenAiCompatibleForReceipt({ ...base, provider, model });
    const res = await call(primary);
    if (res.extraction.line_items.length === 0 && primary !== fallback) {
      console.log(`[receipt] ${provider} primary ${primary} returned 0 lines, retrying with ${fallback}`);
      const fb = await call(fallback);
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
