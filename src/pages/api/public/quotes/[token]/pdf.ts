/**
 * GET /api/public/quotes/[token]/pdf
 *
 * Public, token-gated download of the clean react-pdf quote document
 * (same pipeline as /api/admin/quote-pdf). Added 2026-07-04: the public
 * quote page's "Download PDF" button used window.print(), which stamps
 * the browser's own header/footer onto the output (date, page URL,
 * "1/2") and breaks sections mid-page. This streams the real generated
 * PDF instead - no browser chrome, controlled page breaks, any length.
 *
 * Auth: the public_token IS the capability. Anyone with the share link
 * can already view every field on /q/[token]; the PDF exposes nothing
 * more. Rate-limited by IP hash to stop a token being used to hammer the
 * renderer.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

export const config = {
  api: { responseLimit: false },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).end("Method Not Allowed");
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ error: "Not found" });

  const supabase = getServiceSupabase();

  // Rate-limit per IP hash - a share link is public, so cap renderer abuse.
  const ipHash = hashIp(getClientIp(req as any));
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 30,
    bucket: "minute",
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests, slow down" });
  }

  try {
    const { data: q, error: readErr } = await supabase
      .from("quotes")
      .select(`
        id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
        venue_address, menu_items, equipment_items, notes, terms_and_conditions,
        subtotal, tax_amount, discount_amount, total, total_amount, status,
        delivery_fee, delivery_distance_km, delivery_rate_per_km,
        valid_until, accepted_at, updated_at,
        company:company_id (
          id, slug, company_name, legal_name, logo_url, email, phone, website,
          address_line1, address_line2, city,
          primary_color, vat_registered, vat_number, vat_rate, pricing_includes_vat,
          registration_number, tax_number, currency,
          updated_at
        )
      `)
      .eq("public_token", token)
      .is("deleted_at", null)
      .maybeSingle();

    if (readErr) {
      console.error("[public/quote-pdf] quote read failed:", readErr);
      return res.status(500).json({ error: `Quote read failed: ${dbErrorMessage(readErr)}` });
    }
    if (!q) return res.status(404).json({ error: "Quote not found" });

    // Pre-resolve the logo to a data URI so @react-pdf's <Image> doesn't
    // do its own un-timed outbound fetch inside the renderer (a slow/404
    // logo would 500 the whole download). Same guard as the admin route.
    let logoUrl: string | null = (q.company as any)?.logo_url ?? null;
    if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const resp = await fetch(logoUrl, { signal: ctl.signal });
        clearTimeout(t);
        if (resp.ok) {
          const ct = resp.headers.get("content-type") || "image/png";
          if (/^image\/(?:png|jpe?g)(?:;|$)/i.test(ct)) {
            const buf = Buffer.from(await resp.arrayBuffer());
            logoUrl = `data:${ct};base64,${buf.toString("base64")}`;
          } else {
            logoUrl = null;
          }
        } else {
          logoUrl = null;
        }
      } catch {
        logoUrl = null;
      }
    } else if (logoUrl && !/^data:/i.test(logoUrl)) {
      logoUrl = null;
    }

    const { renderQuotePdf, sanitiseFilename } = await import("@/services/pdf");
    const { buildQuotePdfDataFromRow } = await import("@/services/pdf/quotePdfData");
    const pdfBuffer = await renderQuotePdf(
      buildQuotePdfDataFromRow({
        ...q,
        company: { ...(q.company || {}), logo_url: logoUrl },
      }),
      {
        cacheKey: {
          quoteId: q.id,
          quoteUpdatedAt: q.updated_at ?? null,
          companyUpdatedAt: q.company?.updated_at ?? null,
        },
      },
    );

    const filename = `Quote-${sanitiseFilename(q.quote_number || q.id)}.pdf`;
    const disposition = req.query.inline === "1" ? "inline" : "attachment";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error("[public/quote-pdf] crashed:", err);
    return res.status(500).json({ error: err?.message || dbErrorMessage(err) || "PDF render failed" });
  }
}

export default withApiLogging(handler);
