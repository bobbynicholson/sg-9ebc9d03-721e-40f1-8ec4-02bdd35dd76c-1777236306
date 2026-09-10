/**
 * GET /api/admin/quote-pdf?id=<quoteId>
 *
 * Phase 16 #3. Renders a quote PDF and streams it back to the
 * browser as application/pdf so the admin can download a copy
 * without firing a send. The existing send-email route renders
 * the PDF inline as an attachment; this route exposes the same
 * pipeline as a direct download.
 *
 * Auth (Wave 24): admin / owner / super_admin role only. The previous
 * "any signed-in user" gate leaned on RLS to scope per-tenant, which
 * is correct for cross-tenant isolation, but a signed-in kitchen /
 * driver / cleaning staffer still belongs to the tenant and the RLS
 * policy on quotes lets any company member read. They shouldn't be
 * downloading quote PDFs (which include client contact + pricing
 * detail not relevant to their role). Belt-and-braces role check
 * here mirrors the gate pattern the other admin/* routes use.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export const config = {
  api: {
    // PDF buffer can be 50-300 KB. Default body cap is fine.
    responseLimit: false,
  },
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }
  const quoteId = typeof req.query.id === "string" ? req.query.id : null;
  if (!quoteId) return res.status(400).json({ error: "Missing id" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    // Wave 24: role gate (see header). RLS continues to scope the
    // quote read per-tenant; this rejects in-tenant non-admin staff
    // before they reach the read.
    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[admin/quote-pdf] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }

    const { data: q, error: readErr } = await ssr
      .from("quotes")
      .select(`
        id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
        venue_address, menu_items, equipment_items, notes, terms_and_conditions,
        subtotal, tax_amount, discount_amount, total, total_amount, status,
        delivery_fee, delivery_distance_km, delivery_rate_per_km,
        collection_fee, collection_distance_km, collection_rate_per_km,
        valid_until, accepted_at, updated_at,
        company:company_id (
          id, slug, company_name, legal_name, logo_url, email, phone, website,
          address_line1, address_line2, city,
          primary_color, vat_registered, vat_number, vat_rate, pricing_includes_vat,
          registration_number, tax_number, currency,
          updated_at
        )
      `)
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (readErr) {
      console.error("[quote-pdf] quote read failed:", readErr);
      return res.status(500).json({ error: `Quote read failed: ${dbErrorMessage(readErr)}`, code: readErr.code });
    }
    if (!q) return res.status(404).json({ error: "Quote not found" });

    // Pre-resolve the company logo to a data URI so @react-pdf's
    // <Image> doesn't do its own outbound fetch from inside the PDF
    // renderer. The renderer fetch goes through Node's https without
    // a timeout, and a slow / 404 logo can take the entire route
    // down with a generic 500. Best-effort - if the fetch fails,
    // we strip the logo and render the PDF without it rather than
    // crashing the whole download.
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
            console.warn("[quote-pdf] unsupported logo type, rendering without logo:", ct);
            logoUrl = null;
          }
        } else {
          logoUrl = null;
        }
      } catch (logoErr) {
        console.warn("[quote-pdf] logo pre-fetch failed, rendering without:", logoErr);
        logoUrl = null;
      }
    } else if (logoUrl && !/^data:/i.test(logoUrl)) {
      // Not http(s) and not a data URI - drop it.
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
          quoteId,
          quoteUpdatedAt: q.updated_at ?? null,
          companyUpdatedAt: q.company?.updated_at ?? null,
        },
      },
    );

    const filename = `Quote-${sanitiseFilename(q.quote_number || quoteId)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error("[quote-pdf] crashed:", err);
    // Surface the actual error message + name so the operator (or
    // future support) can spot the real cause instead of staring at
    // a generic "HTTP 500" toast. Stack only in non-prod to avoid
    // leaking internals.
    const payload: any = {
      error: dbErrorMessage(err) || "PDF render failed",
      name: err?.name || undefined,
    };
    if (process.env.NODE_ENV !== "production") {
      payload.stack = err?.stack;
    }
    return res.status(500).json(payload);
  }
}

export default withApiLogging(handler);
