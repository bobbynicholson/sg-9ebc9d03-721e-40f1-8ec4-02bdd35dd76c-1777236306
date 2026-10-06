/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { callTextJson, isTextAiConfigured } from "@/lib/ai/textLlm";
import {
  arrangePaletteSuggestion,
  normalizeHex,
  paletteContrast,
  palettePassesWhiteTextContrast,
  type BrandPalette,
  type PaletteSuggestion,
} from "@/lib/branding/paletteAdvisor";

const ADMIN_ROLES = new Set([
  "super_admin",
  "owner",
  "company_admin",
  "admin",
]);

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
- Output only the JSON shape requested.
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
- Keep the rationale to one short sentence.

Return only JSON: {"primary":"#RRGGBB","secondary":"#RRGGBB","accent":"#RRGGBB","rationale":"..."}`;

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

    const configured = isTextAiConfigured();
    let suggestion: PaletteSuggestion | null = null;
    let lastErr: unknown = null;
    if (configured) {
      try {
        // A palette that fails the contrast check moves on to the next provider.
        const r = await callTextJson({
          label: "brand-palette-suggest",
          system: SYSTEM_PROMPT,
          user: JSON.stringify(payload),
          maxTokens: 512,
          temperature: 0.2,
          accept: (d) => cleanPalette(d) !== null,
        });
        suggestion = cleanPalette(r.data);
      } catch (e) {
        lastErr = e;
      }
    }

    if (!suggestion) {
      const fallback = arrangePaletteSuggestion(current);
      return res.status(200).json({
        ok: true,
        suggestion: fallback,
        warning: !configured
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
