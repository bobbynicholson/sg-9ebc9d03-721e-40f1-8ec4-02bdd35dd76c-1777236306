/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";

/**
 * GET /api/public/embed/[token]/config?slug=...
 *
 * Public, unauthenticated. The only auth gate is the embed_token UUID --
 * unknown or suspended tenants get a 404 (never 401, to avoid token
 * enumeration).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res, { cacheSeconds: 60 });

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  const slugParam = req.query.slug;
  const slug =
    typeof slugParam === "string" && slugParam.length > 0 && slugParam.length <= 200
      ? slugParam
      : null;

  const supabase = getServiceSupabase();

  // Rate-limit this read endpoint -- 600 req/IP/min is generous but stops
  // scrapers cold.
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 600,
    bucket: "minute",
  });
  if (!rl.allowed) {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(429)
      .json({ ok: false, message: "Too many requests, slow down" });
  }

  // Resolve company by token. is_active gate keeps suspended tenants dark.
  const { data: company, error: companyErr } = await (supabase as any)
    .from("companies")
    .select(
      "id, company_name, primary_color, secondary_color, logo_url, is_active, deleted_at, embed_token"
    )
    .eq("embed_token", token)
    .maybeSingle();

  if (companyErr || !company || company.is_active === false || company.deleted_at) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  // Resolve form: slug if provided, else first active form for the tenant.
  let formQuery = (supabase as any)
    .from("embed_form_configs")
    .select(
      "id, slug, name, template_id, fields, theme, success_message, redirect_url"
    )
    .eq("company_id", company.id)
    .eq("is_active", true);

  if (slug) {
    formQuery = formQuery.eq("slug", slug);
  }
  formQuery = formQuery.order("created_at", { ascending: true }).limit(1);

  const { data: forms, error: formErr } = await formQuery;
  if (formErr || !forms || forms.length === 0) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  const form = forms[0];

  // Best-effort view counter -- fire-and-forget so a slow update never blocks
  // the response. Use rpc-style increment to avoid lost updates under race.
  void (async () => {
    try {
      await (supabase as any).rpc("increment_embed_form_views", {
        p_form_id: form.id,
      });
    } catch {
      try {
        const { data: current } = await (supabase as any)
          .from("embed_form_configs")
          .select("views_count")
          .eq("id", form.id)
          .maybeSingle();
        const next = ((current as any)?.views_count || 0) + 1;
        await (supabase as any)
          .from("embed_form_configs")
          .update({ views_count: next })
          .eq("id", form.id);
      } catch {
        // Swallow -- view counting is non-critical telemetry.
      }
    }
  })();

  return res.status(200).json({
    ok: true,
    formId: form.id,
    slug: form.slug,
    templateId: form.template_id,
    name: form.name,
    fields: form.fields || [],
    theme: form.theme || {},
    successMessage:
      form.success_message || "Thanks, we'll be in touch shortly.",
    redirectUrl: form.redirect_url || null,
    brand: {
      companyName: company.company_name,
      primaryColor: company.primary_color || null,
      secondaryColor: company.secondary_color || null,
      logoUrl: company.logo_url || null,
    },
  });
}
