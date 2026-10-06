/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { escapeHtml } from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";

/**
 * GET /quote/<company-slug>/<form-slug>   (rewritten here by next.config)
 * GET /quote/<company-slug>               (the company's first active form)
 *
 * The clean, shareable quote-request page. Standalone HTML (not a Next
 * page) so none of the app chrome - chat bot, command palette, internal
 * footer - loads on a public customer page. The brand panel and the
 * social-share tags are rendered here; /embed/hosted.js mounts the real
 * form through the same loader every website snippet uses, so behaviour
 * and submissions are identical to the snippet.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/i;
const HEX_RE = /^#[0-9a-f]{3,8}$/i;

function page(body: string, head: string, status = 200) {
  return {
    status,
    html: `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${head}
<link rel="stylesheet" href="/embed/hosted.css">
</head>
<body class="cms-hosted">
${body}
</body>
</html>`,
  };
}

function notFound(message: string) {
  return page(
    `<main class="hp" style="display:block"><div class="hp-err">${escapeHtml(message)}</div></main>`,
    `<title>Form not available</title><meta name="robots" content="noindex">`,
    404,
  );
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const companySlug = String(req.query.company || "").trim().toLowerCase();
  const formSlug = String(req.query.form || "").trim().toLowerCase();
  const send = (p: { status: number; html: string }, cache = false) => {
    res.setHeader("Cache-Control", cache ? "public, max-age=60, s-maxage=300" : "no-store");
    return res.status(p.status).send(p.html);
  };

  if (!SLUG_RE.test(companySlug) || (formSlug && !SLUG_RE.test(formSlug))) {
    return send(notFound("This quote form link is incomplete. Please check the link or contact the caterer directly."));
  }

  const supabase = getServiceSupabase() as any;
  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name, slug, logo_url, primary_color, secondary_color, embed_token, is_active, deleted_at")
    .eq("slug", companySlug)
    .maybeSingle();
  if (!company || company.is_active === false || company.deleted_at || !company.embed_token) {
    return send(notFound("This quote form isn't available right now. Please contact the caterer directly."));
  }

  let formQuery = supabase
    .from("embed_form_configs")
    .select("slug, name")
    .eq("company_id", company.id)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (formSlug) formQuery = formQuery.eq("slug", formSlug);
  const { data: forms } = await formQuery.order("created_at", { ascending: true }).limit(1);
  const form = forms && forms[0];
  if (!form) {
    return send(notFound("This quote form is paused or no longer exists. Please contact the caterer directly."));
  }

  const name = String(company.company_name || "Catering");
  const primary = HEX_RE.test(company.primary_color || "") ? company.primary_color : "#0F172A";
  const secondary = HEX_RE.test(company.secondary_color || "") ? company.secondary_color : "#F59E0B";
  const logo = typeof company.logo_url === "string" && /^https:\/\//.test(company.logo_url) ? company.logo_url : null;
  const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || "?");
  const title = `Request a quote | ${name}`;
  const description = `Tell ${name} about your event and get a tailored catering quote.`;
  const origin = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;
  const canonical = `${origin.replace(/\/$/, "")}/quote/${company.slug}/${form.slug}`;

  // Everything interpolated below is escaped; the JSON for hosted.js is
  // escaped for a <script> context (no "</script>" breakout).
  const preview = req.query.preview === "1";
  const bootstrap = JSON.stringify({ token: company.embed_token, slug: form.slug, preview })
    .replace(/</g, "\\u003c");

  const head = `<title>${escapeHtml(title)}</title>
${preview ? `<meta name="robots" content="noindex">` : ""}
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${logo ? `<meta property="og:image" content="${escapeHtml(logo)}">` : ""}
<meta name="theme-color" content="${escapeHtml(primary)}">
<style>:root{--hp-primary:${primary};--hp-secondary:${secondary}}</style>`;

  const body = `<div id="hp-preview-bar" class="hp-preview-bar"${preview ? "" : " hidden"}>Preview: this shows your saved form exactly as visitors see it. Submitting here will not create a lead.</div>
<main class="hp">
  <aside id="hp-brand" class="hp-brand" data-prerendered="true">
    <div class="hp-brand-inner">
      ${logo
        ? `<div class="hp-logo"><img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}" onerror="this.parentNode.outerHTML='<div class=&quot;hp-logo-badge&quot;>${initial}</div>'"></div>`
        : `<div class="hp-logo-badge">${initial}</div>`}
      <div class="hp-company">${escapeHtml(name)}</div>
      <h1 class="hp-title">Request a quote</h1>
      <p class="hp-lede">Tell us about your event, pick what you would like from our menu, and we will send you a tailored quote.</p>
      <ul class="hp-points">
        <li>Free, no-obligation quote</li>
        <li>Reply within 1 working day</li>
        <li>Menu and equipment tailored to your event</li>
        <li>Your details stay private</li>
      </ul>
    </div>
  </aside>
  <section class="hp-form">
    <div class="hp-form-inner" id="hp-mount"></div>
    <p class="hp-powered">Powered by <a href="https://cateringms.com" rel="noopener" target="_blank">CateringMS</a></p>
  </section>
</main>
<script>window.__CMS_HOSTED=${bootstrap};</script>
<script src="/embed/hosted.js"></script>`;

  return send(page(body, head), !preview);
}

export default withApiLogging(handler);
