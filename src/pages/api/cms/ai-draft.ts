/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/cms/ai-draft
 *
 * Generates a blog-post draft for the cateringms.com marketing site
 * using gpt-oss-20b (src/lib/ai/textLlm.ts). Super-admin only - the marketing CMS is platform
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
import { withApiLogging } from "@/lib/withApiLogging";
import { callTextJson, isTextAiConfigured, TEXT_AI_KEYS_HINT } from "@/lib/ai/textLlm";

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

Return ONLY a JSON object (no markdown fences) with keys:
- "title": punchy headline, 6-12 words, no clickbait
- "slug": URL slug from the title, lowercase a-z 0-9 hyphens only, max 80 chars
- "content": full Markdown body. One strong intro paragraph with no heading, ## for section headings, aim for the requested word count +/-10%
- "meta_description": SEO meta description, 150-155 characters, plain text
- "meta_keywords": 5-8 comma-separated SEO keywords`;

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

    if (!isTextAiConfigured()) {
      return res.status(500).json({ error: `AI blog drafting is not configured - ${TEXT_AI_KEYS_HINT}.` });
    }

    let draft: any = null;
    let tokensIn = 0;
    let tokensOut = 0;
    let modelUsed = "";
    let lastErr: unknown = null;
    try {
      const r = await callTextJson({
        label: "ai-draft",
        system: SYSTEM_PROMPT,
        user: userPayload,
        maxTokens: 4096,
        temperature: 0.4,
        timeoutMs: 55_000,
        accept: (d) => typeof d?.content === "string" && d.content.trim().length > 0,
      });
      draft = r.data;
      tokensIn = r.tokens_in;
      tokensOut = r.tokens_out;
      modelUsed = r.model;
    } catch (e) {
      lastErr = e;
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
