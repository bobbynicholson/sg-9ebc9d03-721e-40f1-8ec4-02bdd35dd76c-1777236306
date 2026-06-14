/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/cms/ai-draft
 *
 * Generates a blog-post draft for the cateringms.com marketing site
 * using Anthropic. Super-admin only - the marketing CMS is platform
 * scope, not tenant.
 *
 * Body:
 *   topic       string  required - what the post is about
 *   audience    string  optional - "catering business owners",
 *                                  "kitchen managers", etc.
 *   tone        string  optional - "informative" (default),
 *                                  "casual", "promotional"
 *   wordTarget  number  optional - ~600 by default
 *   keywords    string  optional - SEO keywords to weave in
 *
 * Returns:
 *   { ok: true, title, slug, content, meta_description, meta_keywords,
 *     tokens_in, tokens_out }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { withApiLogging } from "@/lib/withApiLogging";


const DEFAULT_MODEL = process.env.ANTHROPIC_BLOG_MODEL || "claude-sonnet-4-5";

let _client: any = null;
function client(): any {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  _client = new (Anthropic as any)({ apiKey });
  return _client;
}

// Groq fallback (OpenAI-compatible). Used when ANTHROPIC_API_KEY is
// absent or Anthropic errors. JSON mode instead of tool-use.
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_BLOG_MODEL = process.env.GROQ_BLOG_MODEL || "llama-3.3-70b-versatile";

async function callGroqBlog(system: string, user: string): Promise<{ data: any; tokens_in: number; tokens_out: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_BLOG_MODEL,
      temperature: 0.4,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${t.slice(0, 300) || res.statusText}`);
  }
  const json: any = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  let data: any = null;
  try { data = JSON.parse(content); } catch {
    const f = content.indexOf("{");
    const l = content.lastIndexOf("}");
    if (f !== -1 && l > f) { try { data = JSON.parse(content.slice(f, l + 1)); } catch { /* give up */ } }
  }
  return { data, tokens_in: json?.usage?.prompt_tokens ?? 0, tokens_out: json?.usage?.completion_tokens ?? 0 };
}

const SYSTEM_PROMPT = `You write blog posts for CateringMS, a multi-tenant SaaS for South African catering businesses (companies that run spit braais, weddings, corporate events). The CateringMS marketing site lives at cateringms.com. Posts you write get published there.

Audience: catering company owners, operations managers, head chefs running 5-50 staff. Pragmatic, time-poor, allergic to corporate fluff.

Style:
- South African English ("colour", "centre", "organise", "fulfil")
- Short, plain sentences. No em dashes, use double hyphens (--).
- Concrete and specific. Real-world catering examples (lamb spit, chafing dishes, deposit chasing, driver dispatch). No abstract platitudes.
- One clear point per paragraph. 5-7 sentences max.
- Markdown formatting, ## H2 for sections, ** for bold, - for bullets.

Banned phrases:
- "leverage", "synergy", "moving forward", "circle back"
- "I'd be happy to", "certainly", "great question"
- "in today's fast-paced world"
- AI-tone openers ("In the world of..." / "When it comes to...")

Output via the return_blog_post tool. Never write free prose outside the tool.`;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ── Auth: super-admin only - this writes to cateringms.com ─────
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile?.active_role || profile?.role || "") as string;
    if (role !== "super_admin") {
      return res.status(403).json({ error: "Marketing CMS is super-admin only" });
    }

    const {
      topic,
      audience,
      tone,
      wordTarget,
      keywords,
    } = (req.body || {}) as Record<string, any>;

    if (!topic || typeof topic !== "string" || topic.trim().length < 5) {
      return res.status(400).json({ error: "Topic is required (at least 5 characters)" });
    }

    const toneClean = ["informative", "casual", "promotional"].includes(tone)
      ? tone
      : "informative";
    const wordsClean = Math.min(2000, Math.max(200, Number(wordTarget) || 600));

    const userPayload = JSON.stringify({
      topic: topic.trim(),
      target_audience: (audience || "catering company owners and operations managers").toString().trim(),
      tone: toneClean,
      word_target: wordsClean,
      seo_keywords: typeof keywords === "string" ? keywords.trim() : undefined,
    });

    // Provider chain: Anthropic first (tool-use) when its key is set,
    // then Groq (JSON mode). Falls through on error.
    const providers: Array<"anthropic" | "groq"> = [];
    if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
    if (process.env.GROQ_API_KEY) providers.push("groq");
    if (providers.length === 0) {
      return res.status(500).json({ error: "AI blog drafting is not configured - set ANTHROPIC_API_KEY or GROQ_API_KEY on the server." });
    }

    let draft: any = null;
    let tokensIn = 0;
    let tokensOut = 0;
    let modelUsed = "";
    let lastErr: unknown = null;

    for (const provider of providers) {
      try {
        if (provider === "anthropic") {
          modelUsed = DEFAULT_MODEL;
          const response: any = await (client().messages.create as any)({
            model: DEFAULT_MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: [
              {
                name: "return_blog_post",
                description: "Return the completed blog post as structured fields ready to drop into the CMS form.",
                input_schema: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Punchy headline, 6-12 words, no clickbait." },
                    slug: { type: "string", description: "URL slug derived from the title. Lowercase a-z 0-9 hyphens only, no leading/trailing hyphens, max 80 chars." },
                    content: { type: "string", description: "Full body of the post in Markdown. Open with one strong intro paragraph, no heading. Use ## for section headings. Aim for the requested word count ±10%." },
                    meta_description: { type: "string", description: "SEO meta description, 150-155 characters, plain text, must read naturally as a search snippet." },
                    meta_keywords: { type: "string", description: "Comma-separated SEO keywords (5-8 of them), no quotes, no hashtags." },
                  },
                  required: ["title", "slug", "content", "meta_description", "meta_keywords"],
                  additionalProperties: false,
                },
              },
            ],
            tool_choice: { type: "tool", name: "return_blog_post" },
            messages: [{ role: "user", content: userPayload }],
          });
          tokensIn = response?.usage?.input_tokens ?? 0;
          tokensOut = response?.usage?.output_tokens ?? 0;
          const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
          for (const block of blocks) {
            if (block?.type === "tool_use" && block?.name === "return_blog_post") { draft = block.input; break; }
          }
        } else {
          modelUsed = GROQ_BLOG_MODEL;
          const groqSystem = SYSTEM_PROMPT.replace(
            "Output via the return_blog_post tool. Never write free prose outside the tool.",
            'Return ONLY a JSON object (no markdown fences) with keys: "title", "slug", "content", "meta_description", "meta_keywords". The "content" value is the full Markdown body.',
          );
          const { data, tokens_in, tokens_out } = await callGroqBlog(groqSystem, userPayload);
          tokensIn = tokens_in;
          tokensOut = tokens_out;
          if (data && typeof data === "object") draft = data;
        }
        if (draft) break;
      } catch (e) {
        console.warn(`[ai-draft] provider ${provider} failed:`, e);
        lastErr = e;
      }
    }

    if (!draft) {
      return res.status(502).json({
        error: lastErr instanceof Error ? lastErr.message : "Model returned no draft. Try a more specific topic.",
      });
    }

    return res.status(200).json({
      ok: true,
      title: String(draft.title || "").trim(),
      slug: String(draft.slug || "").trim(),
      content: String(draft.content || "").trim(),
      meta_description: String(draft.meta_description || "").trim(),
      meta_keywords: String(draft.meta_keywords || "").trim(),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      model: modelUsed,
    });
  } catch (e: any) {
    console.error("/api/cms/ai-draft crashed:", e);
    return res.status(500).json({ error: e?.message || "AI draft failed" });
  }
}

export default withApiLogging(handler);
