/**
 * CateringMS technology-cost model - single source of truth.
 *
 * Used by /admin/platform/tech-costs and by the assistant's
 * platform_technology_costs summary, so both quote the same numbers.
 * Only vendors the platform actually runs on are modelled. The inputs
 * come from real records (companies, plans, emails sent, assistant
 * messages, receipt scans, EFT proofs, FX); AI spend comes from the live
 * ai_usage_events ledger once that table exists.
 *
 * Vendor prices are hard-coded constants, checked against each vendor's
 * pricing page (PRICING_LINKS). When a vendor changes its card, edit the
 * constant here and every number follows.
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
  openrouterScout: { label: "OpenRouter · Llama 4 Scout", url: "https://openrouter.ai/meta-llama/llama-4-scout" },
  openrouterMaverick: { label: "OpenRouter · Llama 4 Maverick", url: "https://openrouter.ai/meta-llama/llama-4-maverick" },
  groq: { label: "Groq model prices", url: "https://console.groq.com/docs/models" },
  openai: { label: "OpenAI API pricing", url: "https://developers.openai.com/api/docs/pricing" },
  anthropic: { label: "Claude API pricing", url: "https://claude.com/pricing#api" },
  resend: { label: "Resend pricing", url: "https://resend.com/pricing" },
  googleMaps: { label: "Google Maps Platform pricing", url: "https://mapsplatform.google.com/pricing/" },
  payfast: { label: "PayFast fees", url: "https://payfast.io/fees" },
} satisfies Record<string, PricingLink>;

// ─── Vendor pricing ────────────────────────────────────────────────────

export const VERCEL = {
  pro_seat_usd_per_mo: 20,
  usage_credit_usd_per_seat: 20,       // each Pro seat includes US$20 of usage credit
  invocations_included_m: 1,
  invocations_overage_usd_per_m: 0.60,
  active_cpu_usd_per_hour: 0.128,      // no included tier on Pro
  bandwidth_included_gb: 1_000,
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

/** PayFast card fee on platform subscriptions, ex VAT. */
export const PAYFAST = { pct: 3.2, fixed_zar: 2 };

export const DOMAIN_USD_PER_MO = 1.5;    // cateringms.com renewal, amortised

export const DEFAULT_USD_TO_ZAR = 18.5;  // only used when exchange_rates has no row

// ─── AI model prices (US$ per 1M tokens) ───────────────────────────────

export interface AiModelPrice {
  id: string;
  label: string;
  provider: string;
  input_usd_per_m: number;
  output_usd_per_m: number;
  link: PricingLink;
}

/** Every model the code can call, keyed by the exact model id it sends. */
export const AI_MODEL_PRICES: AiModelPrice[] = [
  { id: "openai/gpt-oss-20b", label: "gpt-oss-20b", provider: "OpenRouter", input_usd_per_m: 0.018, output_usd_per_m: 0.09, link: PRICING_LINKS.openrouterOss20b },
  { id: "openai/gpt-oss-120b", label: "gpt-oss-120b", provider: "OpenRouter", input_usd_per_m: 0.037, output_usd_per_m: 0.17, link: PRICING_LINKS.openrouterOss120b },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "OpenRouter", input_usd_per_m: 0.10, output_usd_per_m: 0.30, link: PRICING_LINKS.openrouterScout },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "OpenRouter", input_usd_per_m: 0.1875, output_usd_per_m: 0.6525, link: PRICING_LINKS.openrouterMaverick },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", provider: "Groq", input_usd_per_m: 0.80, output_usd_per_m: 4.00, link: PRICING_LINKS.groq },
  { id: "gpt-4o-mini", label: "gpt-4o-mini", provider: "OpenAI", input_usd_per_m: 0.15, output_usd_per_m: 0.60, link: PRICING_LINKS.openai },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini", provider: "OpenAI", input_usd_per_m: 0.40, output_usd_per_m: 1.60, link: PRICING_LINKS.openai },
  { id: "text-embedding-3-small", label: "text-embedding-3-small", provider: "OpenAI", input_usd_per_m: 0.02, output_usd_per_m: 0, link: PRICING_LINKS.openai },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "Anthropic", input_usd_per_m: 1.00, output_usd_per_m: 5.00, link: PRICING_LINKS.anthropic },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic", input_usd_per_m: 3.00, output_usd_per_m: 15.00, link: PRICING_LINKS.anthropic },
];

/** Groq bills gpt-oss at its own rates. */
const GROQ_PRICES: Record<string, { input_usd_per_m: number; output_usd_per_m: number }> = {
  "openai/gpt-oss-20b": { input_usd_per_m: 0.075, output_usd_per_m: 0.30 },
  "openai/gpt-oss-120b": { input_usd_per_m: 0.15, output_usd_per_m: 0.60 },
};

const bareId = (id: string) => id.replace(/^(openai|anthropic|meta-llama)\//, "");

/** Price for a model id as sent to a provider. Null for a model this file doesn't know. */
export function priceForModel(model: string, provider?: string): { input_usd_per_m: number; output_usd_per_m: number } | null {
  const id = String(model || "").toLowerCase();
  if (provider === "groq" && GROQ_PRICES[id]) return GROQ_PRICES[id];
  const exact = AI_MODEL_PRICES.find((m) => m.id === id);
  if (exact) return exact;
  const bare = bareId(id);
  return AI_MODEL_PRICES.find((m) => bareId(m.id) === bare)
    ?? AI_MODEL_PRICES.find((m) => bare.startsWith(bareId(m.id)))
    ?? null;
}

/** OpenRouter's live per-model prices (US$ per 1M tokens), keyed by model id. */
export type LivePrices = Record<string, { input_usd_per_m: number; output_usd_per_m: number }>;

export interface ResolvedPrice {
  input_usd_per_m: number;
  output_usd_per_m: number;
  source: "openrouter-live" | "published" | "unknown";
}

/** Price for a provider + model: OpenRouter's live list first, then the published rates above. */
export function resolvePrice(provider: string, model: string, live: LivePrices = {}): ResolvedPrice {
  if (provider === "openrouter" && live[model]) return { ...live[model], source: "openrouter-live" };
  const p = priceForModel(model, provider);
  return p ? { input_usd_per_m: p.input_usd_per_m, output_usd_per_m: p.output_usd_per_m, source: "published" } : { input_usd_per_m: 0, output_usd_per_m: 0, source: "unknown" };
}

/** Cost of one AI call in US$. Unknown models cost 0. */
export function aiCallCostUsd(model: string, tokensIn: number, tokensOut: number, provider?: string): number {
  const p = priceForModel(model, provider);
  if (!p) return 0;
  return (Math.max(0, tokensIn) / 1_000_000) * p.input_usd_per_m + (Math.max(0, tokensOut) / 1_000_000) * p.output_usd_per_m;
}

/**
 * Typical tokens for one call of each AI feature (output includes the
 * model's reasoning where it has any). Used to show the cost of a single
 * call next to each model on the tech-costs page; the live ledger records
 * the real numbers.
 */
export const FEATURE_TOKEN_PROFILE: Record<string, { input: number; output: number }> = {
  chat_reply: { input: 5_000, output: 650 },
  chat_intent: { input: 2_500, output: 40 },
  embeddings: { input: 40, output: 0 },
  knowledge_review: { input: 6_000, output: 400 },
  column_matching: { input: 1_500, output: 1_600 },
  import_row_repair: { input: 900, output: 550 },
  receipt_scan: { input: 4_000, output: 1_500 },
  eft_proof: { input: 2_000, output: 300 },
  blog_draft: { input: 600, output: 3_250 },
  brand_palette: { input: 600, output: 400 },
};

/** Average tokens per call, used only to estimate AI spend before live tracking has data. */
export const AI_CALL_PROFILE = {
  receipt: { input: 4_000, output: 1_500, model: "meta-llama/llama-4-scout" },
  eft_proof: { input: 2_000, output: 300, model: "meta-llama/llama-4-scout" },
  chat_reply: { input: 5_000, output: 650, model: "openai/gpt-oss-20b" },   // incl. low-effort reasoning
  chat_llm_share: 0.6,                                                    // the rest are answered from records
  chat_intent: { input: 2_500, output: 40, model: "gpt-4o-mini" },
  chat_query_embedding_tokens: 40,
};

// ─── Inputs ────────────────────────────────────────────────────────────

/** Real platform numbers, all per month, read from the database. */
export interface TechCostInputs {
  companies: number;               // onboarded, not deleted
  paying_companies: number;        // active with a priced plan
  revenue_zar: number;             // sum of active plan prices
  users: number;                   // profiles (upper bound for auth MAU)
  emails: number;                  // emails queued in the last 30 days
  chat_messages: number;           // assistant questions in the last 30 days
  receipt_scans: number;           // receipt rows scanned in the last 30 days
  eft_proofs: number;              // EFT proofs uploaded in the last 30 days
  /** Tracked AI spend for the current month; null until ai_usage_events exists. */
  ai_actual_usd: number | null;
  ai_actual_calls?: number;
}

export const EMPTY_INPUTS: TechCostInputs = {
  companies: 0, paying_companies: 0, revenue_zar: 0, users: 0, emails: 0,
  chat_messages: 0, receipt_scans: 0, eft_proofs: 0, ai_actual_usd: null,
};

/**
 * Usage nobody logs per call (Vercel CPU / bandwidth, Supabase storage /
 * egress / database size, Google Maps). Per company per month; at the
 * platform's current size all of them sit inside the included allowances.
 */
export const UNLOGGED_USAGE_PER_COMPANY = {
  function_invocations_m: 0.05,
  cpu_hours: 0.7,
  bandwidth_gb: 2,
  db_gb: 0.1,
  storage_gb: 0.5,
  egress_gb: 5,
  map_loads: 150,
  places_autocompletes: 100,
  place_details: 30,
  distance_matrix_elements: 200,
  directions: 60,
};

// ─── Math ──────────────────────────────────────────────────────────────

export type CostCategoryKey = "hosting" | "database" | "ai" | "email" | "maps" | "payments" | "fixed";

export interface CostLine {
  label: string;
  formula: string;
  usd_per_mo: number;
}

export interface CostCategory {
  key: CostCategoryKey;
  category: string;
  lines: CostLine[];
  subtotal_usd: number;
  links: PricingLink[];
}

export interface TechCostResult {
  categories: CostCategory[];
  total_usd: number;
  ai_usd: number;
  /** True when the AI figure is tracked spend, false when it is an estimate. */
  ai_is_actual: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-ZA", { maximumFractionDigits: 1 });
const sum = (lines: CostLine[]) => lines.reduce((s, l) => s + l.usd_per_mo, 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function supabaseComputeTier(companies: number) {
  return SUPABASE_COMPUTE_TIERS.find((t) => companies <= t.up_to_tenants) ?? SUPABASE_COMPUTE_TIERS[SUPABASE_COMPUTE_TIERS.length - 1];
}

function estimateAiUsd(i: TechCostInputs): { usd: number; formula: string } {
  const p = AI_CALL_PROFILE;
  const cost = (x: { input: number; output: number; model: string }) => aiCallCostUsd(x.model, x.input, x.output);
  const chat = i.chat_messages * (p.chat_llm_share * cost(p.chat_reply) + cost(p.chat_intent))
    + aiCallCostUsd("text-embedding-3-small", i.chat_messages * p.chat_query_embedding_tokens, 0);
  const receipts = i.receipt_scans * cost(p.receipt);
  const eft = i.eft_proofs * cost(p.eft_proof);
  return {
    usd: chat + receipts + eft,
    formula: `Estimate from the last 30 days: ${fmt(i.chat_messages)} assistant questions, ${fmt(i.receipt_scans)} receipt scans, ${fmt(i.eft_proofs)} EFT proofs. Becomes tracked spend once the ai_usage_events table exists.`,
  };
}

export function computeTechCosts(i: TechCostInputs, usdToZar: number = DEFAULT_USD_TO_ZAR): TechCostResult {
  const n = Math.max(0, i.companies);
  const u = UNLOGGED_USAGE_PER_COMPANY;
  const fx = usdToZar > 0 ? usdToZar : DEFAULT_USD_TO_ZAR;
  const categories: CostCategory[] = [];

  // Vercel: one Pro seat; metered usage is billed only above its US$20 credit.
  const metered =
    Math.max(0, n * u.function_invocations_m - VERCEL.invocations_included_m) * VERCEL.invocations_overage_usd_per_m +
    n * u.cpu_hours * VERCEL.active_cpu_usd_per_hour +
    Math.max(0, n * u.bandwidth_gb - VERCEL.bandwidth_included_gb) * VERCEL.bandwidth_usd_per_gb;
  const usageAfterCredit = Math.max(0, metered - VERCEL.usage_credit_usd_per_seat);
  const hosting: CostLine[] = [
    { label: "Pro plan (1 seat)", formula: `Flat US$${VERCEL.pro_seat_usd_per_mo}/mo, includes US$${VERCEL.usage_credit_usd_per_seat} of usage`, usd_per_mo: VERCEL.pro_seat_usd_per_mo },
    {
      label: "Usage above the included credit",
      formula: usageAfterCredit > 0
        ? `Functions, CPU and bandwidth ≈ US$${metered.toFixed(2)} − US$${VERCEL.usage_credit_usd_per_seat} credit`
        : `Functions, CPU and bandwidth for ${plural(n, "company", "companies")} ≈ US$${metered.toFixed(2)}, inside the US$${VERCEL.usage_credit_usd_per_seat} credit`,
      usd_per_mo: usageAfterCredit,
    },
  ];
  categories.push({ key: "hosting", category: "Vercel (hosting)", lines: hosting, subtotal_usd: sum(hosting), links: [PRICING_LINKS.vercel, PRICING_LINKS.vercelFunctions] });

  // Supabase
  const tier = supabaseComputeTier(n);
  const overage =
    Math.max(0, n * u.db_gb - SUPABASE.db_included_gb) * SUPABASE.db_usd_per_gb +
    Math.max(0, n * u.storage_gb - SUPABASE.storage_included_gb) * SUPABASE.storage_usd_per_gb +
    Math.max(0, n * u.egress_gb - SUPABASE.egress_included_gb) * SUPABASE.egress_usd_per_gb +
    Math.max(0, i.users - SUPABASE.mau_included) * SUPABASE.mau_usd_each;
  const database: CostLine[] = [
    { label: "Pro plan", formula: `Flat US$${SUPABASE.pro_base_usd_per_mo}/mo`, usd_per_mo: SUPABASE.pro_base_usd_per_mo },
    {
      label: `Database compute (${tier.name})`,
      formula: `${tier.name} US$${tier.usd_per_mo}/mo − US$${SUPABASE.compute_credit_usd} Pro compute credit`,
      usd_per_mo: Math.max(0, tier.usd_per_mo - SUPABASE.compute_credit_usd),
    },
    {
      label: "Usage above the included allowance",
      formula: `${i.users.toLocaleString()} users (100,000 included); database 8 GB, files 100 GB and egress 250 GB included`,
      usd_per_mo: overage,
    },
  ];
  categories.push({ key: "database", category: "Supabase (database, auth, storage)", lines: database, subtotal_usd: sum(database), links: [PRICING_LINKS.supabase, PRICING_LINKS.supabaseCompute] });

  // AI: tracked spend when available, otherwise an estimate from real counts.
  const ai_is_actual = i.ai_actual_usd != null;
  const est = estimateAiUsd(i);
  const ai_usd = ai_is_actual ? (i.ai_actual_usd as number) : est.usd;
  const ai: CostLine[] = [ai_is_actual
    ? { label: "Tracked AI spend this month", formula: `${(i.ai_actual_calls ?? 0).toLocaleString()} AI calls logged, each priced by its model`, usd_per_mo: ai_usd }
    : { label: "Estimated AI spend", formula: est.formula, usd_per_mo: ai_usd }];
  categories.push({ key: "ai", category: "AI models", lines: ai, subtotal_usd: ai_usd, links: [PRICING_LINKS.openrouterOss20b, PRICING_LINKS.openrouterScout, PRICING_LINKS.openai, PRICING_LINKS.groq] });

  // Resend
  let emailCost = 0;
  let emailFormula = `${i.emails.toLocaleString()} emails in the last 30 days; ${RESEND.free_tier_emails.toLocaleString()} a month are free`;
  if (i.emails > RESEND.paid_tier_emails) {
    emailCost = RESEND.paid_tier_usd_per_mo + ((i.emails - RESEND.paid_tier_emails) / 1000) * RESEND.overage_usd_per_1k;
    emailFormula = `${i.emails.toLocaleString()} emails: Pro US$${RESEND.paid_tier_usd_per_mo} + US$${RESEND.overage_usd_per_1k}/1k above ${RESEND.paid_tier_emails.toLocaleString()}`;
  } else if (i.emails > RESEND.free_tier_emails) {
    emailCost = RESEND.paid_tier_usd_per_mo;
    emailFormula = `${i.emails.toLocaleString()} emails in the last 30 days: Pro US$${RESEND.paid_tier_usd_per_mo}/mo (up to ${RESEND.paid_tier_emails.toLocaleString()})`;
  }
  const email: CostLine[] = [{ label: "Transactional email", formula: emailFormula, usd_per_mo: emailCost }];
  categories.push({ key: "email", category: "Resend (email)", lines: email, subtotal_usd: emailCost, links: [PRICING_LINKS.resend] });

  // Google Maps - per-SKU free caps
  const sku = (calls: number, per1k: number) => (Math.max(0, calls - GOOGLE_MAPS.free_calls_per_sku) / 1000) * per1k;
  const mapsUsd =
    sku(n * u.map_loads, GOOGLE_MAPS.dynamic_map_loads_usd_per_1k) +
    sku(n * u.places_autocompletes, GOOGLE_MAPS.autocomplete_usd_per_1k) +
    sku(n * u.place_details, GOOGLE_MAPS.place_details_usd_per_1k) +
    sku(n * u.distance_matrix_elements, GOOGLE_MAPS.distance_matrix_usd_per_1k_elements) +
    sku(n * u.directions, GOOGLE_MAPS.directions_usd_per_1k);
  const maps: CostLine[] = [{
    label: "Maps, address search, distances, routes",
    formula: `Each service has ${GOOGLE_MAPS.free_calls_per_sku.toLocaleString()} free calls a month; ${plural(n, "company is", "companies are")} ${mapsUsd > 0 ? "above" : "well inside"} that`,
    usd_per_mo: mapsUsd,
  }];
  categories.push({ key: "maps", category: "Google Maps", lines: maps, subtotal_usd: mapsUsd, links: [PRICING_LINKS.googleMaps] });

  // PayFast fees on real subscription revenue
  const feeZar = i.revenue_zar * (PAYFAST.pct / 100) + i.paying_companies * PAYFAST.fixed_zar;
  const payments: CostLine[] = [{
    label: "PayFast card fees on subscriptions",
    formula: `${PAYFAST.pct}% of ZAR ${i.revenue_zar.toLocaleString("en-ZA")} + ZAR ${PAYFAST.fixed_zar} × ${plural(i.paying_companies, "paying company", "paying companies")}`,
    usd_per_mo: feeZar / fx,
  }];
  categories.push({ key: "payments", category: "Payment processing (PayFast)", lines: payments, subtotal_usd: feeZar / fx, links: [PRICING_LINKS.payfast] });

  // Domain
  const fixed: CostLine[] = [{ label: "cateringms.com", formula: `US$${DOMAIN_USD_PER_MO.toFixed(2)}/mo renewal, amortised`, usd_per_mo: DOMAIN_USD_PER_MO }];
  categories.push({ key: "fixed", category: "Domain", lines: fixed, subtotal_usd: DOMAIN_USD_PER_MO, links: [] });

  return {
    categories,
    total_usd: categories.reduce((s, c) => s + c.subtotal_usd, 0),
    ai_usd,
    ai_is_actual,
  };
}

/** Every vendor pricing page, for the page's sources list. */
export const ALL_PRICING_LINKS: PricingLink[] = [...new Map(Object.values(PRICING_LINKS).map((l) => [l.url, l])).values()];
