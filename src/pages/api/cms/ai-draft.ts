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

    const response: any = await (client().messages.create as any)({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "return_blog_post",
          description:
            "Return the completed blog post as structured fields ready to drop into the CMS form.",
          input_schema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Punchy headline, 6-12 words, no clickbait.",
              },
              slug: {
                type: "string",
                description:
                  "URL slug derived from the title. Lowercase a-z 0-9 hyphens only, no leading/trailing hyphens, max 80 chars.",
              },
              content: {
                type: "string",
                description:
                  "Full body of the post in Markdown. Open with one strong intro paragraph, no heading. Use ## for section headings. Aim for the requested word count ±10%.",
              },
              meta_description: {
                type: "string",
                description:
                  "SEO meta description, 150-155 characters, plain text, must read naturally as a search snippet.",
              },
              meta_keywords: {
                type: "string",
                description:
                  "Comma-separated SEO keywords (5-8 of them), no quotes, no hashtags.",
              },
            },
            required: ["title", "slug", "content", "meta_description", "meta_keywords"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "tool", name: "return_blog_post" },
      messages: [{ role: "user", content: userPayload }],
    });

    const tokensIn: number = response?.usage?.input_tokens ?? 0;
    const tokensOut: number = response?.usage?.output_tokens ?? 0;

    let draft: any = null;
    const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
    for (const block of blocks) {
      if (block?.type === "tool_use" && block?.name === "return_blog_post") {
        draft = block.input;
        break;
      }
    }
    if (!draft) {
      return res.status(502).json({
        error: "Model returned no draft. Try a more specific topic.",
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
      model: DEFAULT_MODEL,
    });
  } catch (e: any) {
    console.error("/api/cms/ai-draft crashed:", e);
    return res.status(500).json({ error: e?.message || "AI draft failed" });
  }
}

export default withApiLogging(handler);
