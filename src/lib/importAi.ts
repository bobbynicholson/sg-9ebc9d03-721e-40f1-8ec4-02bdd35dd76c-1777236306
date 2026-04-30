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
- Use 'skip' when no field is a clear match. Better to skip than to guess wrong -- the operator will spot a missed column and fix it manually.
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
