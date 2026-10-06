/**
 * CateringMS technology-cost model - single source of truth.
 *
 * Used by /admin/platform/tech-costs (interactive calculator) and by the
 * assistant's platform_technology_costs summary, so both always quote the
 * same numbers. Vendor prices are hard-coded constants: when a vendor
 * changes its card, edit the constant here and every projection follows.
 * Every vendor carries a link to its official pricing page (PRICING_LINKS).
 *
 * AI routing mirrors src/lib/ai/textLlm.ts:
 *   - Text (row repair, chatbot replies, knowledge review, blog drafts,
 *     brand palettes): gpt-oss-20b. Client / CSV import column matching:
 *     gpt-oss-120b (one call per file, accuracy matters most).
 *   - Vision (receipt scans, EFT proofs): Llama 4 Scout on OpenRouter,
 *     Maverick retry; then gpt-4.1-mini, then Groq Qwen 3.8.
 *   - Chat intent routing: OpenAI gpt-4o-mini. Knowledge search:
 *     text-embedding-3-small.
 *   - Claude is a last-resort fallback only, so it is not billed in the
 *     default scenario; pick it in the model selectors to compare.
 *
 * Prices in USD (per 1M tokens for AI) unless stated, excluding VAT.
 * Checked against the vendors' pricing pages in October 2026.
 */

export const PRICES_CHECKED = "October 2026";

// ─── Official pricing pages ────────────────────────────────────────────

export interface PricingLink {
  label: string;
  url: string;
}

export const PRICING_LINKS = {
  vercel: { label: "Vercel pricing", url: "https://vercel.com/pricing" },
  vercelFunctions: { label: "Vercel Functions pricing", url: "https://vercel.com/docs/functions/usage-and-pricing" },
  supabase: { label: "Supabase pricing", url: "https://supabase.com/pricing" },
  supabaseCompute: { label: "Supabase compute sizes", url: "https://supabase.com/docs/guides/platform/compute-and-disk" },
  openrouterOss20b: { label: "OpenRouter · gpt-oss-20b", url: "https://openrouter.ai/openai/gpt-oss-20b" },
  openrouterOss120b: { label: "OpenRouter · gpt-oss-120b", url: "https://openrouter.ai/openai/gpt-oss-120b" },
  openrouterMaverick: { label: "OpenRouter · Llama 4 Maverick", url: "https://openrouter.ai/meta-llama/llama-4-maverick" },
  openrouterScout: { label: "OpenRouter · Llama 4 Scout", url: "https://openrouter.ai/meta-llama/llama-4-scout" },
  groq: { label: "Groq model prices", url: "https://console.groq.com/docs/models" },
  groqDeprecations: { label: "Groq model shutdowns", url: "https://console.groq.com/docs/deprecations" },
  openai: { label: "OpenAI API pricing", url: "https://developers.openai.com/api/docs/pricing" },
  anthropic: { label: "Claude API pricing", url: "https://claude.com/pricing#api" },
  resend: { label: "Resend pricing", url: "https://resend.com/pricing" },
  cloudflare: { label: "Cloudflare plans", url: "https://www.cloudflare.com/plans/" },
  turnstile: { label: "Cloudflare Turnstile", url: "https://www.cloudflare.com/products/turnstile/" },
  googleMaps: { label: "Google Maps Platform pricing", url: "https://mapsplatform.google.com/pricing/" },
  googleMapsSkus: { label: "Google Maps SKU price list", url: "https://developers.google.com/maps/billing-and-pricing/pricing" },
  payfast: { label: "PayFast fees", url: "https://payfast.io/fees" },
  yoco: { label: "Yoco pricing", url: "https://www.yoco.com/za/pricing/" },
  stripe: { label: "Stripe pricing", url: "https://stripe.com/pricing" },
  xero: { label: "Xero developer pricing", url: "https://developer.xero.com/pricing" },
  quickbooks: { label: "Intuit App Partner Program", url: "https://developer.intuit.com/app/developer/qbo/docs/develop/app-partner-program" },
  sage: { label: "Sage developer", url: "https://developer.sage.com/accounting/" },
  sentry: { label: "Sentry pricing", url: "https://sentry.io/pricing/" },
  whatsapp: { label: "WhatsApp Business pricing", url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing" },
  exchangeRate: { label: "ExchangeRate-API free endpoint", url: "https://www.exchangerate-api.com/docs/free" },
  nominatim: { label: "Nominatim usage policy", url: "https://operations.osmfoundation.org/policies/nominatim/" },
} satisfies Record<string, PricingLink>;

// ─── Vendor pricing ────────────────────────────────────────────────────

export const VERCEL = {
  pro_seat_usd_per_mo: 20,             // per developer seat
  usage_credit_usd_per_seat: 20,       // each Pro seat includes US$20 of usage credit
  invocations_included_m: 1,
  invocations_overage_usd_per_m: 0.60,
  active_cpu_usd_per_hour: 0.128,      // no included tier on Pro
  bandwidth_included_gb: 1_000,        // 1 TB Fast Data Transfer
  bandwidth_usd_per_gb: 0.15,
};

export const SUPABASE = {
  pro_base_usd_per_mo: 25,
  compute_credit_usd: 10,              // covers one Micro instance
  db_included_gb: 8,
  db_usd_per_gb: 0.125,
  storage_included_gb: 100,
  storage_usd_per_gb: 0.021,
  egress_included_gb: 250,
  egress_usd_per_gb: 0.09,
  mau_included: 100_000,
  mau_usd_each: 0.00325,
};

/** Supabase compute sizes (US$/month) and the company count each is sized for. */
export const SUPABASE_COMPUTE_TIERS = [
  { name: "Small", usd_per_mo: 15, up_to_tenants: 100 },
  { name: "Medium", usd_per_mo: 60, up_to_tenants: 300 },
  { name: "Large", usd_per_mo: 110, up_to_tenants: 700 },
  { name: "XL", usd_per_mo: 210, up_to_tenants: Infinity },
];

export interface AiModelPrice {
  id: string;
  label: string;
  provider: string;
  input_usd_per_m: number;
  output_usd_per_m: number;
  /** Extra output tokens per call spent on reasoning (gpt-oss). */
  reasoning_tokens_per_call?: number;
  link: PricingLink;
}

/** Text models the app can route to, cheapest first. */
export const TEXT_MODELS: Record<string, AiModelPrice> = {
  "gpt-oss-20b-openrouter": { id: "openai/gpt-oss-20b", label: "gpt-oss-20b · OpenRouter", provider: "OpenRouter", input_usd_per_m: 0.018, output_usd_per_m: 0.09, reasoning_tokens_per_call: 250, link: PRICING_LINKS.openrouterOss20b },
  "gpt-oss-20b-groq": { id: "openai/gpt-oss-20b", label: "gpt-oss-20b · Groq", provider: "Groq", input_usd_per_m: 0.075, output_usd_per_m: 0.30, reasoning_tokens_per_call: 250, link: PRICING_LINKS.groq },
  "gpt-4o-mini": { id: "gpt-4o-mini", label: "gpt-4o-mini · OpenAI", provider: "OpenAI", input_usd_per_m: 0.15, output_usd_per_m: 0.60, link: PRICING_LINKS.openai },
  "claude-haiku-4-5": { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 · Anthropic", provider: "Anthropic", input_usd_per_m: 1.00, output_usd_per_m: 5.00, link: PRICING_LINKS.anthropic },
  "claude-sonnet-4-5": { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 · Anthropic", provider: "Anthropic", input_usd_per_m: 3.00, output_usd_per_m: 15.00, link: PRICING_LINKS.anthropic },
};

/**
 * Column matching runs on the stronger gpt-oss-120b (medium reasoning,
 * tier "smart" in src/lib/ai/textLlm.ts) on the same provider as the text
 * route; on OpenAI direct it uses gpt-4.1-mini.
 */
export const SMART_TEXT_MODELS: Record<string, AiModelPrice> = {
  "gpt-oss-20b-openrouter": { id: "openai/gpt-oss-120b", label: "gpt-oss-120b · OpenRouter", provider: "OpenRouter", input_usd_per_m: 0.037, output_usd_per_m: 0.17, reasoning_tokens_per_call: 600, link: PRICING_LINKS.openrouterOss120b },
  "gpt-oss-20b-groq": { id: "openai/gpt-oss-120b", label: "gpt-oss-120b · Groq", provider: "Groq", input_usd_per_m: 0.15, output_usd_per_m: 0.60, reasoning_tokens_per_call: 600, link: PRICING_LINKS.groq },
  "gpt-4o-mini": { id: "gpt-4.1-mini", label: "gpt-4.1-mini · OpenAI", provider: "OpenAI", input_usd_per_m: 0.40, output_usd_per_m: 1.60, link: PRICING_LINKS.openai },
};

/** Vision models: primary + the retry used when the primary reads 0 lines. */
/**
 * Vision models: primary + the retry used when the primary reads 0 lines.
 * Groq shut down its Llama 4 models in 2026; Qwen 3.8 is its only vision
 * model now and is priced above gpt-4.1-mini.
 */
export const VISION_MODELS: Record<string, { primary: AiModelPrice; fallback: AiModelPrice }> = {
  "llama-4-openrouter": {
    primary: { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout · OpenRouter", provider: "OpenRouter", input_usd_per_m: 0.10, output_usd_per_m: 0.30, link: PRICING_LINKS.openrouterScout },
    fallback: { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick · OpenRouter", provider: "OpenRouter", input_usd_per_m: 0.1875, output_usd_per_m: 0.6525, link: PRICING_LINKS.openrouterMaverick },
  },
  "gpt-4-1-mini": {
    primary: { id: "gpt-4.1-mini", label: "gpt-4.1-mini · OpenAI", provider: "OpenAI", input_usd_per_m: 0.40, output_usd_per_m: 1.60, link: PRICING_LINKS.openai },
    fallback: { id: "gpt-4.1-mini", label: "gpt-4.1-mini · OpenAI", provider: "OpenAI", input_usd_per_m: 0.40, output_usd_per_m: 1.60, link: PRICING_LINKS.openai },
  },
  "qwen-groq": {
    primary: { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B · Groq", provider: "Groq", input_usd_per_m: 0.80, output_usd_per_m: 4.00, link: PRICING_LINKS.groq },
    fallback: { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B · Groq", provider: "Groq", input_usd_per_m: 0.80, output_usd_per_m: 4.00, link: PRICING_LINKS.groq },
  },
  "claude-haiku-sonnet": {
    primary: { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "Anthropic", input_usd_per_m: 1.00, output_usd_per_m: 5.00, link: PRICING_LINKS.anthropic },
    fallback: { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic", input_usd_per_m: 3.00, output_usd_per_m: 15.00, link: PRICING_LINKS.anthropic },
  },
};

export const INTENT_MODEL = TEXT_MODELS["gpt-4o-mini"];
export const EMBEDDING_MODEL = { id: "text-embedding-3-small", label: "text-embedding-3-small · OpenAI", input_usd_per_m: 0.02, link: PRICING_LINKS.openai };

export const DEFAULT_TEXT_MODEL = "gpt-oss-20b-openrouter";
export const DEFAULT_VISION_MODEL = "llama-4-openrouter";
/** What the platform ran before the switch - used for the savings line. */
export const PREVIOUS_TEXT_MODEL = "claude-haiku-4-5";
export const PREVIOUS_VISION_MODEL = "claude-haiku-sonnet";

/** Average tokens per call, per AI feature. */
export const AI_CALL_PROFILE = {
  receipt: { input: 4_000, output: 1_500 },          // compressed image + system + SARS rules
  receipt_retry_rate: 0.12,                          // share of slips re-read on the fallback model
  eft_proof: { input: 2_000, output: 300 },
  column_mapping: { input: 1_500, output: 600 },     // client / CSV import: headers + 3 sample rows
  row_repair: { input: 900, output: 300 },
  chat_reply: { input: 5_000, output: 400 },         // system prompt + live context + history
  chat_llm_share: 0.6,                               // the rest are answered directly from records
  chat_intent: { input: 2_500, output: 40 },         // allowlisted capability catalogue
  chat_query_embedding_tokens: 40,
  knowledge_review: { input: 6_000, output: 150 },
  knowledge_embedding_tokens: 20_000,                // per uploaded document
  brand_palette: { input: 600, output: 150 },
  blog_draft: { input: 600, output: 3_000 },
};

export const RESEND = {
  free_tier_emails: 3_000,
  paid_tier_usd_per_mo: 20,
  paid_tier_emails: 50_000,
  overage_usd_per_1k: 0.90,
};

/** Google Maps Platform: each Essentials SKU has 10k free calls / month. */
export const GOOGLE_MAPS = {
  free_calls_per_sku: 10_000,
  dynamic_map_loads_usd_per_1k: 7,
  autocomplete_usd_per_1k: 2.83,
  place_details_usd_per_1k: 5,
  distance_matrix_usd_per_1k_elements: 5,
  directions_usd_per_1k: 5,
};

/** Card fees on platform subscriptions, ex VAT. */
export const PAYMENT_GATEWAYS = {
  payfast: { label: "PayFast", pct: 3.2, fixed_zar: 2, fixed_usd: 0, link: PRICING_LINKS.payfast, note: "3.2% + R2 per card charge" },
  yoco: { label: "Yoco", pct: 3.2, fixed_zar: 0, fixed_usd: 0, link: PRICING_LINKS.yoco, note: "3.2% online local cards up to R100k monthly turnover (2.75% above)" },
  stripe: { label: "Stripe", pct: 2.9, fixed_zar: 0, fixed_usd: 0.30, link: PRICING_LINKS.stripe, note: "2.9% + US$0.30 per card charge" },
} as const;
export type PaymentGatewayKey = keyof typeof PAYMENT_GATEWAYS;

/** Xero API tiers by connected companies (billed in AUD; USD approximations). */
export const XERO_TIERS = [
  { name: "Starter", usd_per_mo: 0, up_to_connections: 5 },
  { name: "Core", usd_per_mo: 22, up_to_connections: 50 },
  { name: "Plus", usd_per_mo: 152, up_to_connections: 1_000 },
  { name: "Advanced", usd_per_mo: 895, up_to_connections: 10_000 },
];

export const SENTRY_PLANS = {
  developer: { label: "Developer (free, 5k errors)", usd_per_mo: 0 },
  team: { label: "Team (US$26, 50k errors)", usd_per_mo: 26 },
  business: { label: "Business (US$80, 100k errors)", usd_per_mo: 80 },
} as const;
export type SentryPlanKey = keyof typeof SENTRY_PLANS;

export const DOMAIN_USD_PER_MO = 1.5;    // cateringms.com renewal, amortised

/** WhatsApp Cloud API rates for South Africa - billed to each company's own Meta account. */
export const WHATSAPP_ZA = { utility_usd: 0.0076, marketing_usd: 0.0379 };

export const DEFAULT_USD_TO_ZAR = 18.5;

/** Hard cap from src/lib/receiptScanQuota.ts (keep in sync). */
export const RECEIPT_SCAN_QUOTA_CAP = 60;

// ─── Assumptions ───────────────────────────────────────────────────────

export interface TechCostAssumptions {
  tenants: number;
  subscription_zar_per_tenant: number;
  // AI usage per tenant per month
  receipt_scans_per_tenant: number;
  eft_proofs_per_tenant: number;
  csv_imports_per_tenant: number;
  row_repairs_per_tenant: number;
  chat_messages_per_tenant: number;
  knowledge_uploads_per_tenant: number;
  brand_palettes_per_tenant: number;
  // Platform-level AI per month
  blog_drafts_per_month: number;
  text_model: string;
  vision_model: string;
  // Hosting + database per tenant per month
  function_invocations_per_tenant_m: number;
  cpu_hours_per_tenant: number;
  bandwidth_gb_per_tenant: number;
  db_gb_per_tenant: number;
  storage_gb_per_tenant: number;
  egress_gb_per_tenant: number;
  mau_per_tenant: number;
  // Other usage per tenant per month
  emails_per_tenant: number;
  map_loads_per_tenant: number;
  places_autocompletes_per_tenant: number;
  place_details_per_tenant: number;
  distance_matrix_calls_per_tenant: number;
  directions_calls_per_tenant: number;
  // Platform setup
  vercel_seats: number;
  xero_connected_share: number;
  payment_gateway: PaymentGatewayKey;
  card_paying_share: number;
  sentry_plan: SentryPlanKey;
}

export const DEFAULT_ASSUMPTIONS: TechCostAssumptions = {
  tenants: 50,
  subscription_zar_per_tenant: 2_000,
  // Worst case: every tenant hits the server-side scan cap.
  receipt_scans_per_tenant: RECEIPT_SCAN_QUOTA_CAP,
  eft_proofs_per_tenant: 10,
  csv_imports_per_tenant: 1,
  row_repairs_per_tenant: 5,
  chat_messages_per_tenant: 300,
  knowledge_uploads_per_tenant: 2,
  brand_palettes_per_tenant: 0.5,
  blog_drafts_per_month: 8,
  text_model: DEFAULT_TEXT_MODEL,
  vision_model: DEFAULT_VISION_MODEL,
  function_invocations_per_tenant_m: 0.05,
  cpu_hours_per_tenant: 0.7,
  bandwidth_gb_per_tenant: 2,
  db_gb_per_tenant: 0.1,
  storage_gb_per_tenant: 0.5,
  egress_gb_per_tenant: 5,
  mau_per_tenant: 25,
  emails_per_tenant: 200,
  map_loads_per_tenant: 150,
  places_autocompletes_per_tenant: 100,
  place_details_per_tenant: 30,
  distance_matrix_calls_per_tenant: 200,
  directions_calls_per_tenant: 60,
  vercel_seats: 1,
  xero_connected_share: 0.3,
  payment_gateway: "payfast",
  card_paying_share: 1,
  sentry_plan: "team",
};

// ─── Math ──────────────────────────────────────────────────────────────

export type CostCategoryKey =
  | "hosting" | "database" | "ai" | "email" | "maps" | "payments"
  | "accounting" | "monitoring" | "free" | "fixed" | "passthrough";

export interface CostLine {
  label: string;
  formula: string;
  usd_per_mo: number;
  link?: PricingLink;
}

export interface CostCategory {
  key: CostCategoryKey;
  category: string;
  lines: CostLine[];
  subtotal_usd: number;
  links: PricingLink[];
  /** Shown for reference only; never part of the platform total. */
  informational?: boolean;
}

export interface TechCostResult {
  categories: CostCategory[];
  total_usd: number;
  /** AI spend if the same usage ran on the previous Claude routing. */
  ai_previous_claude_usd: number;
  ai_usd: number;
}

const perCall = (m: AiModelPrice, input: number, output: number) =>
  (input / 1_000_000) * m.input_usd_per_m +
  ((output + (m.reasoning_tokens_per_call ?? 0)) / 1_000_000) * m.output_usd_per_m;

const usd = (n: number) => (n < 0.01 && n > 0 ? `US$${n.toFixed(5)}` : `US$${n.toFixed(4)}`);
const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 1 });
const sum = (lines: CostLine[]) => lines.reduce((s, l) => s + l.usd_per_mo, 0);
const uniqueLinks = (links: PricingLink[]) => [...new Map(links.map((l) => [l.url, l])).values()];

function aiLines(a: TechCostAssumptions, textKey: string, visionKey: string): CostLine[] {
  const text = TEXT_MODELS[textKey] ?? TEXT_MODELS[DEFAULT_TEXT_MODEL];
  const smart = SMART_TEXT_MODELS[textKey] ?? (TEXT_MODELS[textKey] ? text : SMART_TEXT_MODELS[DEFAULT_TEXT_MODEL]);
  const vision = VISION_MODELS[visionKey] ?? VISION_MODELS[DEFAULT_VISION_MODEL];
  const p = AI_CALL_PROFILE;
  const n = a.tenants;

  const scans = n * a.receipt_scans_per_tenant;
  const retries = scans * p.receipt_retry_rate;
  const scanPrimary = perCall(vision.primary, p.receipt.input, p.receipt.output);
  const scanRetry = perCall(vision.fallback, p.receipt.input, p.receipt.output);
  const eft = n * a.eft_proofs_per_tenant;
  const eftCall = perCall(vision.primary, p.eft_proof.input, p.eft_proof.output);

  const imports = n * a.csv_imports_per_tenant;
  const importCall = perCall(smart, p.column_mapping.input, p.column_mapping.output);
  const repairs = n * a.row_repairs_per_tenant;
  const repairCall = perCall(text, p.row_repair.input, p.row_repair.output);

  const chats = n * a.chat_messages_per_tenant;
  const llmChats = chats * p.chat_llm_share;
  const chatCall = perCall(text, p.chat_reply.input, p.chat_reply.output);
  const intentCall = perCall(INTENT_MODEL, p.chat_intent.input, p.chat_intent.output);

  const uploads = n * a.knowledge_uploads_per_tenant;
  const reviewCall = perCall(text, p.knowledge_review.input, p.knowledge_review.output);
  const embeddingTokens = uploads * p.knowledge_embedding_tokens + chats * p.chat_query_embedding_tokens;

  const palettes = n * a.brand_palettes_per_tenant;
  const paletteCall = perCall(text, p.brand_palette.input, p.brand_palette.output);
  const blogCall = perCall(text, p.blog_draft.input, p.blog_draft.output);

  return [
    {
      label: `Receipt scans · ${vision.primary.label}`,
      formula: `${fmt(scans)} scans × ${usd(scanPrimary)} (~${fmt(p.receipt.input)} in + ${fmt(p.receipt.output)} out tokens)`,
      usd_per_mo: scans * scanPrimary,
      link: vision.primary.link,
    },
    {
      label: `Receipt re-reads · ${vision.fallback.label}`,
      formula: `~${(p.receipt_retry_rate * 100).toFixed(0)}% of slips re-read when the first pass finds no lines: ${fmt(retries)} × ${usd(scanRetry)}`,
      usd_per_mo: retries * scanRetry,
      link: vision.fallback.link,
    },
    {
      label: `EFT proof screening · ${vision.primary.label}`,
      formula: `${fmt(eft)} proofs × ${usd(eftCall)}`,
      usd_per_mo: eft * eftCall,
      link: vision.primary.link,
    },
    {
      label: `Client / CSV import column matching · ${smart.label}`,
      formula: `${fmt(imports)} imports × ${usd(importCall)} (headers + 3 sample rows)`,
      usd_per_mo: imports * importCall,
      link: smart.link,
    },
    {
      label: `Import row repair · ${text.label}`,
      formula: `${fmt(repairs)} repairs × ${usd(repairCall)}`,
      usd_per_mo: repairs * repairCall,
      link: text.link,
    },
    {
      label: `Assistant replies · ${text.label}`,
      formula: `${fmt(chats)} messages, ${(p.chat_llm_share * 100).toFixed(0)}% need the model: ${fmt(llmChats)} × ${usd(chatCall)}`,
      usd_per_mo: llmChats * chatCall,
      link: text.link,
    },
    {
      label: `Assistant intent routing · ${INTENT_MODEL.label}`,
      formula: `${fmt(chats)} messages × ${usd(intentCall)}`,
      usd_per_mo: chats * intentCall,
      link: INTENT_MODEL.link,
    },
    {
      label: `Knowledge safety review · ${text.label}`,
      formula: `${fmt(uploads)} uploads × ${usd(reviewCall)}`,
      usd_per_mo: uploads * reviewCall,
      link: text.link,
    },
    {
      label: `Knowledge search embeddings · ${EMBEDDING_MODEL.label}`,
      formula: `${fmt(embeddingTokens)} tokens × US$${EMBEDDING_MODEL.input_usd_per_m}/M (uploads + one query per message)`,
      usd_per_mo: (embeddingTokens / 1_000_000) * EMBEDDING_MODEL.input_usd_per_m,
      link: EMBEDDING_MODEL.link,
    },
    {
      label: `Brand palette suggestions · ${text.label}`,
      formula: `${fmt(palettes)} suggestions × ${usd(paletteCall)}`,
      usd_per_mo: palettes * paletteCall,
      link: text.link,
    },
    {
      label: `Marketing blog drafts · ${text.label}`,
      formula: `${fmt(a.blog_drafts_per_month)} drafts / month (platform-wide) × ${usd(blogCall)}`,
      usd_per_mo: a.blog_drafts_per_month * blogCall,
      link: text.link,
    },
  ];
}

export function supabaseComputeTier(tenants: number) {
  return SUPABASE_COMPUTE_TIERS.find((t) => tenants <= t.up_to_tenants) ?? SUPABASE_COMPUTE_TIERS[SUPABASE_COMPUTE_TIERS.length - 1];
}

export function xeroTier(connections: number) {
  return XERO_TIERS.find((t) => connections <= t.up_to_connections) ?? null;
}

export function computeTechCosts(a: TechCostAssumptions, usdToZar: number = DEFAULT_USD_TO_ZAR): TechCostResult {
  const n = Math.max(0, a.tenants);
  const fx = usdToZar > 0 ? usdToZar : DEFAULT_USD_TO_ZAR;
  const categories: CostCategory[] = [];

  // Vercel: seats, then metered usage net of the per-seat usage credit.
  const seats = Math.max(1, Math.round(a.vercel_seats));
  const invocationsM = n * a.function_invocations_per_tenant_m;
  const invocationOverageM = Math.max(0, invocationsM - VERCEL.invocations_included_m);
  const cpuHours = n * a.cpu_hours_per_tenant;
  const bandwidthGb = n * a.bandwidth_gb_per_tenant;
  const bandwidthOver = Math.max(0, bandwidthGb - VERCEL.bandwidth_included_gb);
  const meteredUsd =
    invocationOverageM * VERCEL.invocations_overage_usd_per_m +
    cpuHours * VERCEL.active_cpu_usd_per_hour +
    bandwidthOver * VERCEL.bandwidth_usd_per_gb;
  const credit = Math.min(meteredUsd, seats * VERCEL.usage_credit_usd_per_seat);
  const hosting: CostLine[] = [
    { label: "Pro seats", formula: `${seats} seat${seats === 1 ? "" : "s"} × US$${VERCEL.pro_seat_usd_per_mo}/mo`, usd_per_mo: seats * VERCEL.pro_seat_usd_per_mo, link: PRICING_LINKS.vercel },
    {
      label: "Function invocations",
      formula: `${invocationsM.toFixed(2)}M, ${VERCEL.invocations_included_m}M included; ${invocationOverageM.toFixed(2)}M × US$${VERCEL.invocations_overage_usd_per_m}/M`,
      usd_per_mo: invocationOverageM * VERCEL.invocations_overage_usd_per_m,
      link: PRICING_LINKS.vercelFunctions,
    },
    {
      label: "Active CPU",
      formula: `${fmt(cpuHours)} CPU-hours × US$${VERCEL.active_cpu_usd_per_hour}/hour (no included tier)`,
      usd_per_mo: cpuHours * VERCEL.active_cpu_usd_per_hour,
      link: PRICING_LINKS.vercelFunctions,
    },
    {
      label: "Fast Data Transfer",
      formula: `${fmt(bandwidthGb)}GB, ${VERCEL.bandwidth_included_gb.toLocaleString()}GB included; ${fmt(bandwidthOver)}GB × US$${VERCEL.bandwidth_usd_per_gb}/GB`,
      usd_per_mo: bandwidthOver * VERCEL.bandwidth_usd_per_gb,
      link: PRICING_LINKS.vercel,
    },
    {
      label: "Included usage credit",
      formula: `US$${VERCEL.usage_credit_usd_per_seat} per seat, applied to the metered lines above`,
      usd_per_mo: -credit,
      link: PRICING_LINKS.vercel,
    },
  ];
  categories.push({ key: "hosting", category: "Vercel (hosting)", lines: hosting, subtotal_usd: sum(hosting), links: [PRICING_LINKS.vercel, PRICING_LINKS.vercelFunctions] });

  // Supabase
  const tier = supabaseComputeTier(n);
  const dbGb = n * a.db_gb_per_tenant;
  const dbOver = Math.max(0, dbGb - SUPABASE.db_included_gb);
  const storageGb = n * a.storage_gb_per_tenant;
  const storageOver = Math.max(0, storageGb - SUPABASE.storage_included_gb);
  const egressGb = n * a.egress_gb_per_tenant;
  const egressOver = Math.max(0, egressGb - SUPABASE.egress_included_gb);
  const mau = n * a.mau_per_tenant;
  const mauOver = Math.max(0, mau - SUPABASE.mau_included);
  const database: CostLine[] = [
    { label: "Pro plan base", formula: `Flat US$${SUPABASE.pro_base_usd_per_mo}/mo`, usd_per_mo: SUPABASE.pro_base_usd_per_mo, link: PRICING_LINKS.supabase },
    {
      label: `Database compute (${tier.name})`,
      formula: `${tier.name} US$${tier.usd_per_mo}/mo − US$${SUPABASE.compute_credit_usd} Pro compute credit (sized for up to ${Number.isFinite(tier.up_to_tenants) ? tier.up_to_tenants : "1,000+"} companies)`,
      usd_per_mo: Math.max(0, tier.usd_per_mo - SUPABASE.compute_credit_usd),
      link: PRICING_LINKS.supabaseCompute,
    },
    {
      label: "Database size",
      formula: `${dbGb.toFixed(1)}GB, ${SUPABASE.db_included_gb}GB included; ${dbOver.toFixed(1)}GB × US$${SUPABASE.db_usd_per_gb}/GB`,
      usd_per_mo: dbOver * SUPABASE.db_usd_per_gb,
      link: PRICING_LINKS.supabase,
    },
    {
      label: "File storage",
      formula: `${storageGb.toFixed(1)}GB, ${SUPABASE.storage_included_gb}GB included; ${storageOver.toFixed(1)}GB × US$${SUPABASE.storage_usd_per_gb}/GB`,
      usd_per_mo: storageOver * SUPABASE.storage_usd_per_gb,
      link: PRICING_LINKS.supabase,
    },
    {
      label: "Egress (bandwidth)",
      formula: `${egressGb.toFixed(0)}GB, ${SUPABASE.egress_included_gb}GB included; ${egressOver.toFixed(0)}GB × US$${SUPABASE.egress_usd_per_gb}/GB`,
      usd_per_mo: egressOver * SUPABASE.egress_usd_per_gb,
      link: PRICING_LINKS.supabase,
    },
    {
      label: "Monthly active users",
      formula: `${mau.toLocaleString()} MAU, ${SUPABASE.mau_included.toLocaleString()} included; ${mauOver.toLocaleString()} × US$${SUPABASE.mau_usd_each}`,
      usd_per_mo: mauOver * SUPABASE.mau_usd_each,
      link: PRICING_LINKS.supabase,
    },
  ];
  categories.push({ key: "database", category: "Supabase (database, auth, storage)", lines: database, subtotal_usd: sum(database), links: [PRICING_LINKS.supabase, PRICING_LINKS.supabaseCompute] });

  // AI
  const ai = aiLines(a, a.text_model, a.vision_model);
  const ai_usd = sum(ai);
  const ai_previous_claude_usd = sum(aiLines(a, PREVIOUS_TEXT_MODEL, PREVIOUS_VISION_MODEL));
  categories.push({ key: "ai", category: "AI models", lines: ai, subtotal_usd: ai_usd, links: uniqueLinks(ai.map((l) => l.link!).filter(Boolean)) });

  // Resend
  const emails = n * a.emails_per_tenant;
  let emailCost = 0;
  let emailFormula: string;
  if (emails <= RESEND.free_tier_emails) {
    emailFormula = `${emails.toLocaleString()} ≤ ${RESEND.free_tier_emails.toLocaleString()} (free tier)`;
  } else if (emails <= RESEND.paid_tier_emails) {
    emailFormula = `${emails.toLocaleString()} on Pro (US$${RESEND.paid_tier_usd_per_mo}/mo up to ${RESEND.paid_tier_emails.toLocaleString()})`;
    emailCost = RESEND.paid_tier_usd_per_mo;
  } else {
    const over = emails - RESEND.paid_tier_emails;
    emailFormula = `${emails.toLocaleString()} (Pro US$${RESEND.paid_tier_usd_per_mo} + ${over.toLocaleString()} extra × US$${RESEND.overage_usd_per_1k}/1k)`;
    emailCost = RESEND.paid_tier_usd_per_mo + (over / 1000) * RESEND.overage_usd_per_1k;
  }
  const email: CostLine[] = [{ label: "Transactional email", formula: emailFormula, usd_per_mo: emailCost, link: PRICING_LINKS.resend }];
  categories.push({ key: "email", category: "Resend (email)", lines: email, subtotal_usd: emailCost, links: [PRICING_LINKS.resend] });

  // Google Maps - per-SKU free caps
  const sku = (label: string, calls: number, per1k: number, unit: string): CostLine => {
    const billable = Math.max(0, calls - GOOGLE_MAPS.free_calls_per_sku);
    return {
      label,
      formula: `${calls.toLocaleString()} ${unit}, ${GOOGLE_MAPS.free_calls_per_sku.toLocaleString()} free; ${billable.toLocaleString()} × US$${per1k}/1k`,
      usd_per_mo: (billable / 1000) * per1k,
      link: PRICING_LINKS.googleMapsSkus,
    };
  };
  const maps: CostLine[] = [
    sku("Map loads (tracking, regions)", n * a.map_loads_per_tenant, GOOGLE_MAPS.dynamic_map_loads_usd_per_1k, "loads"),
    sku("Places autocomplete", n * a.places_autocompletes_per_tenant, GOOGLE_MAPS.autocomplete_usd_per_1k, "requests"),
    sku("Place details", n * a.place_details_per_tenant, GOOGLE_MAPS.place_details_usd_per_1k, "requests"),
    sku("Distance Matrix (delivery distance)", n * a.distance_matrix_calls_per_tenant, GOOGLE_MAPS.distance_matrix_usd_per_1k_elements, "elements"),
    sku("Directions (driver routes)", n * a.directions_calls_per_tenant, GOOGLE_MAPS.directions_usd_per_1k, "requests"),
  ];
  categories.push({ key: "maps", category: "Google Maps", lines: maps, subtotal_usd: sum(maps), links: [PRICING_LINKS.googleMaps, PRICING_LINKS.googleMapsSkus] });

  // Card fees on subscription revenue
  const gw = PAYMENT_GATEWAYS[a.payment_gateway] ?? PAYMENT_GATEWAYS.payfast;
  const payingTenants = n * Math.max(0, Math.min(1, a.card_paying_share));
  const feeUsd = payingTenants * (
    (a.subscription_zar_per_tenant * (gw.pct / 100) + gw.fixed_zar) / fx + gw.fixed_usd
  );
  const payments: CostLine[] = [{
    label: `Subscription card fees (${gw.label})`,
    formula: `${fmt(payingTenants)} card-paying companies × ZAR ${a.subscription_zar_per_tenant.toLocaleString()}; ${gw.note}`,
    usd_per_mo: feeUsd,
    link: gw.link,
  }];
  categories.push({ key: "payments", category: "Payment processing", lines: payments, subtotal_usd: feeUsd, links: [PRICING_LINKS.payfast, PRICING_LINKS.yoco, PRICING_LINKS.stripe] });

  // Accounting integrations (platform's own app credentials)
  const xeroConnections = Math.round(n * Math.max(0, Math.min(1, a.xero_connected_share)));
  const xt = xeroTier(xeroConnections);
  const accounting: CostLine[] = [
    {
      label: `Xero app connections (${xt ? xt.name : "Enterprise"} tier)`,
      formula: xt
        ? `${xeroConnections} connected companies, ${xt.name} covers up to ${xt.up_to_connections.toLocaleString()}; ~US$${xt.usd_per_mo}/mo (billed in AUD)`
        : `${xeroConnections} connected companies is above Advanced; Enterprise is custom-priced`,
      usd_per_mo: xt ? xt.usd_per_mo : XERO_TIERS[XERO_TIERS.length - 1].usd_per_mo,
      link: PRICING_LINKS.xero,
    },
    { label: "QuickBooks (Intuit Builder tier)", formula: "Free: unlimited Core calls + 500,000 CorePlus credits / month", usd_per_mo: 0, link: PRICING_LINKS.quickbooks },
    { label: "Sage Business Cloud Accounting API", formula: "Free developer access", usd_per_mo: 0, link: PRICING_LINKS.sage },
  ];
  categories.push({ key: "accounting", category: "Accounting integrations", lines: accounting, subtotal_usd: sum(accounting), links: [PRICING_LINKS.xero, PRICING_LINKS.quickbooks, PRICING_LINKS.sage] });

  // Monitoring
  const sentry = SENTRY_PLANS[a.sentry_plan] ?? SENTRY_PLANS.team;
  const monitoring: CostLine[] = [{ label: `Sentry error monitoring · ${sentry.label}`, formula: `Flat US$${sentry.usd_per_mo}/mo`, usd_per_mo: sentry.usd_per_mo, link: PRICING_LINKS.sentry }];
  categories.push({ key: "monitoring", category: "Monitoring (Sentry)", lines: monitoring, subtotal_usd: sum(monitoring), links: [PRICING_LINKS.sentry] });

  // Free services the platform depends on
  const free: CostLine[] = [
    { label: "Cloudflare DNS for company sending domains", formula: "Free plan; keeps Resend domain verification reliable", usd_per_mo: 0, link: PRICING_LINKS.cloudflare },
    { label: "Cloudflare Turnstile (public form bot protection)", formula: "Free plan", usd_per_mo: 0, link: PRICING_LINKS.turnstile },
    { label: "ExchangeRate-API (daily USD/ZAR check)", formula: "Free open endpoint, one call a day from the currency cron", usd_per_mo: 0, link: PRICING_LINKS.exchangeRate },
    { label: "Nominatim geocoding fallback", formula: "Free under the OSM usage policy (max 1 request / second)", usd_per_mo: 0, link: PRICING_LINKS.nominatim },
  ];
  categories.push({ key: "free", category: "Free services (Cloudflare, FX, geocoding)", lines: free, subtotal_usd: 0, links: [PRICING_LINKS.cloudflare, PRICING_LINKS.turnstile, PRICING_LINKS.exchangeRate, PRICING_LINKS.nominatim] });

  // Fixed
  const fixed: CostLine[] = [{ label: "Domain (cateringms.com)", formula: `US$${DOMAIN_USD_PER_MO.toFixed(2)}/mo renewal, amortised`, usd_per_mo: DOMAIN_USD_PER_MO }];
  categories.push({ key: "fixed", category: "Fixed costs", lines: fixed, subtotal_usd: sum(fixed), links: [] });

  const total_usd = categories.reduce((s, c) => s + c.subtotal_usd, 0);

  // Billed to each company directly - shown for reference, not in the total.
  const passthrough: CostLine[] = [
    {
      label: "WhatsApp Cloud API messages",
      formula: `Each company's own Meta account: ~US$${WHATSAPP_ZA.utility_usd} utility / US$${WHATSAPP_ZA.marketing_usd} marketing per message (South Africa); replies within 24h are free`,
      usd_per_mo: 0,
      link: PRICING_LINKS.whatsapp,
    },
    {
      label: "Client payment gateway fees",
      formula: "Invoices paid by a company's clients settle through that company's own PayFast / Yoco / Stripe account",
      usd_per_mo: 0,
      link: PRICING_LINKS.payfast,
    },
  ];
  categories.push({ key: "passthrough", category: "Billed to companies directly (not in total)", lines: passthrough, subtotal_usd: 0, links: [PRICING_LINKS.whatsapp], informational: true });

  return { categories, total_usd, ai_usd, ai_previous_claude_usd };
}

/** Every distinct pricing page, for the page's "Pricing sources" list. */
export const ALL_PRICING_LINKS: PricingLink[] = uniqueLinks(Object.values(PRICING_LINKS));
