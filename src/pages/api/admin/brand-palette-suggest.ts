/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import {
  arrangePaletteSuggestion,
  normalizeHex,
  paletteContrast,
  palettePassesWhiteTextContrast,
  type BrandPalette,
  type PaletteSuggestion,
} from "@/lib/branding/paletteAdvisor";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_BRAND_MODEL || "claude-haiku-4-5";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_BRAND_MODEL || process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";

const ADMIN_ROLES = new Set([
  "super_admin",
  "owner",
  "company_admin",
  "admin",
]);

let anthropicClient: any = null;
function getAnthropicClient(): any {
  if (anthropicClient) return anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  anthropicClient = new (Anthropic as any)({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

function parseJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(t.slice(first, last + 1)); } catch { /* give up */ }
  }
  return null;
}

function cleanPalette(input: any): PaletteSuggestion | null {
  const primary = normalizeHex(input?.primary);
  const secondary = normalizeHex(input?.secondary);
  const accent = normalizeHex(input?.accent);
  if (!primary || !secondary || !accent) return null;

  const palette: BrandPalette = { primary, secondary, accent };
  if (!palettePassesWhiteTextContrast(palette)) return null;

  return {
    ...palette,
    contrast: paletteContrast(palette),
    source: "ai",
    rationale: String(input?.rationale || "AI suggested a more readable brand palette.").slice(0, 240),
  };
}

const SYSTEM_PROMPT = `You are a senior brand designer for a catering SaaS.

Return one polished, practical white-label colour palette for an admin operator.

Rules:
- Output only through the tool / JSON shape requested.
- Colours must be hex strings in #RRGGBB format.
- primary, secondary, and accent must each have WCAG contrast >= 4.5:1 against white text.
- Treat the three input colours as admin-selected ingredients, not fixed roles.
- Decide which colour should become primary, secondary, and accent.
- primary is the strongest readable action/sidebar colour.
- secondary is the best partner for gradients and secondary chrome.
- accent is the distinct highlight colour for badges, active stages, and small attention points.
- Avoid neon colours, muddy colours, and palettes that look accidental.
- Reuse and reorder the admin's colours where possible. Darken unsafe colours rather than replacing the hue.
- The palette must work for buttons, sidebars, client portals, quote pages, invoices, and email headers.
- Keep the rationale to one short sentence.`;

async function callAnthropic(payload: Record<string, any>): Promise<PaletteSuggestion | null> {
  const response: any = await (getAnthropicClient().messages.create as any)({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "return_palette",
        description: "Return the recommended brand palette.",
        input_schema: {
          type: "object",
          properties: {
            primary: { type: "string" },
            secondary: { type: "string" },
            accent: { type: "string" },
            rationale: { type: "string" },
          },
          required: ["primary", "secondary", "accent", "rationale"],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: "tool", name: "return_palette" },
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  const blocks: any[] = Array.isArray(response?.content) ? response.content : [];
  for (const block of blocks) {
    if (block?.type === "tool_use" && block?.name === "return_palette") {
      return cleanPalette(block.input);
    }
  }
  return null;
}

async function callGroq(payload: Record<string, any>): Promise<PaletteSuggestion | null> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nReturn only JSON: {"primary":"#RRGGBB","secondary":"#RRGGBB","accent":"#RRGGBB","rationale":"..."}`,
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${text.slice(0, 240) || res.statusText}`);
  }
  const json: any = await res.json();
  const content = String(json?.choices?.[0]?.message?.content || "");
  return cleanPalette(parseJson(content));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String((profile as any)?.active_role || (profile as any)?.role || "");
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Only admins can request brand palette suggestions" });
    }

    const primary = normalizeHex(req.body?.primaryColor);
    const secondary = normalizeHex(req.body?.secondaryColor);
    const accent = normalizeHex(req.body?.accentColor);
    if (!primary || !secondary || !accent) {
      return res.status(400).json({ error: "Valid primary, secondary, and accent hex colours are required" });
    }

    const current: BrandPalette = { primary, secondary, accent };
    const payload = {
      company_name: String(req.body?.organizationName || "").slice(0, 120),
      admin_selected_colours: [current.primary, current.secondary, current.accent],
      current_field_order: current,
      current_contrast_against_white: paletteContrast(current),
      goal: "Choose which selected colour belongs in primary, secondary, and accent, then darken only where needed for white text.",
    };

    const providers: Array<"anthropic" | "groq"> = [];
    if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
    if (process.env.GROQ_API_KEY) providers.push("groq");

    let suggestion: PaletteSuggestion | null = null;
    let lastErr: unknown = null;
    for (const provider of providers) {
      try {
        suggestion = provider === "anthropic"
          ? await callAnthropic(payload)
          : await callGroq(payload);
        if (suggestion) break;
      } catch (e) {
        console.warn(`[brand-palette-suggest] provider ${provider} failed:`, e);
        lastErr = e;
      }
    }

    if (!suggestion) {
      const fallback = arrangePaletteSuggestion(current);
      return res.status(200).json({
        ok: true,
        suggestion: fallback,
        warning: providers.length === 0
          ? "AI is not configured on this server, so the colours were arranged automatically."
          : lastErr instanceof Error
            ? `AI failed validation, so the colours were arranged automatically. ${lastErr.message}`
            : "AI did not return a valid accessible palette, so the colours were arranged automatically.",
      });
    }

    return res.status(200).json({ ok: true, suggestion });
  } catch (e: any) {
    console.error("/api/admin/brand-palette-suggest crashed:", e);
    return res.status(500).json({ error: e?.message || "Could not suggest a brand palette" });
  }
}

export default withApiLogging(handler);
