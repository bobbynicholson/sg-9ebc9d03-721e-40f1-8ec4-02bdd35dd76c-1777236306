/**
 * POST /api/onboarding/clients/map-columns
 *
 * AI column matching for the easy client importer
 * (/admin/onboarding/clients). The browser parses the CSV / Excel file
 * locally and sends ONLY the header row plus up to three sample rows;
 * the full file never leaves the browser through this route. Returns
 * one decision per source column (target field, confidence, reason)
 * so the operator can review and change every match before importing.
 *
 * Nothing is written to the database here. The import itself still
 * goes through /api/onboarding/clients/bulk with its own validation.
 *
 * Same access rule as the bulk endpoint: signed-in owner / admin tier
 * linked to a company.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { mapColumnsViaAI } from "@/lib/importAi";
import { withApiLogging } from "@/lib/withApiLogging";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

// Fields the importer understands. Keys must match the importer's row
// shape and /api/onboarding/clients/bulk's RowInput.
export const CLIENT_IMPORT_FIELDS: Array<{ key: string; description: string }> = [
  { key: "name", description: "Client first name, or the full client / company name when there is no surname column" },
  { key: "surname", description: "Client last name / family name" },
  { key: "email", description: "Client email address" },
  { key: "phone", description: "Main phone number (any type)" },
  { key: "mobile_number", description: "Mobile / cell phone number" },
  { key: "landline_number", description: "Landline / office / home phone number" },
  { key: "notes", description: "Free-text notes or comments about the client" },
  { key: "client_type", description: "Client type, e.g. individual or company" },
  { key: "tax_number", description: "VAT / tax registration number" },
  { key: "billing_address_line1", description: "Street address, first line" },
  { key: "billing_address_line2", description: "Address second line / suburb" },
  { key: "billing_city", description: "City or town" },
  { key: "billing_postal_code", description: "Postal / ZIP code" },
  { key: "payment_terms", description: "Payment terms in days" },
  { key: "credit_limit", description: "Credit limit amount" },
  { key: "tags", description: "Tags / labels / categories, comma separated" },
  { key: "historical_total_events", description: "Number of past events / bookings" },
  { key: "historical_lifetime_spend", description: "Total amount spent historically" },
  { key: "historical_last_event_date", description: "Date of the most recent past event" },
  { key: "historical_last_event_type", description: "Type of the most recent past event" },
  { key: "historical_notes", description: "Notes about the client's history" },
];
const VALID_KEYS = new Set(CLIENT_IMPORT_FIELDS.map((f) => f.key));

const MAX_HEADERS = 80;
const MAX_HEADER_LEN = 120;
const MAX_SAMPLE_ROWS = 3;
const MAX_CELL_LEN = 200;

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .single();
  const role = String(profile?.active_role || profile?.role || "");
  if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });
  if (!profile?.company_id) return res.status(403).json({ error: "Account isn't linked to a company" });

  const rawHeaders = Array.isArray(req.body?.headers) ? (req.body.headers as unknown[]) : [];
  if (rawHeaders.length === 0) return res.status(400).json({ error: "headers[] is required" });
  if (rawHeaders.length > MAX_HEADERS) {
    return res.status(413).json({ error: `Too many columns (max ${MAX_HEADERS}).` });
  }
  // Unique, non-empty labels: blank headers become "Column N" and repeated
  // names get " (2)", " (3)" so every column maps back unambiguously.
  const seenLabels = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = clip(h, MAX_HEADER_LEN).replace(/^﻿/, "").trim() || `Column ${i + 1}`;
    const n = (seenLabels.get(base.toLowerCase()) || 0) + 1;
    seenLabels.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const rawSamples = Array.isArray(req.body?.sampleRows) ? (req.body.sampleRows as unknown[]) : [];
  // Send samples keyed by header so the model sees which value belongs where.
  const sampleRows = rawSamples.slice(0, MAX_SAMPLE_ROWS).map((row) => {
    const cells = Array.isArray(row) ? row : [];
    const out: Record<string, string> = {};
    headers.forEach((h, i) => { out[h] = clip(cells[i], MAX_CELL_LEN); });
    return out;
  });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return res.status(503).json({
      error: "AI column matching isn't configured on this server.",
      code: "ai_unavailable",
    });
  }

  try {
    const { mapping } = await mapColumnsViaAI({
      sheetName: "Client list",
      headers,
      sampleRows,
      targetSchema: "clients",
      targetFields: CLIENT_IMPORT_FIELDS,
    });

    // Attach the column index, drop unknown targets, and keep only the
    // most confident column per target so two columns never fill the
    // same field.
    const norm = (v: string) => v.toLowerCase().replace(/s+/g, " ").trim();
    const decisions = headers.map((label, index) => {
      const m = mapping.find((x) => x.source_header === label)
        || mapping.find((x) => norm(x.source_header) === norm(label));
      const target = m && VALID_KEYS.has(m.target) ? m.target : "skip";
      const confidence = Math.max(0, Math.min(1, Number(m?.confidence) || 0));
      return { index, source_header: label, target, confidence, rationale: m?.rationale || "" };
    });
    const best = new Map<string, number>();
    for (const d of decisions) {
      if (d.target === "skip") continue;
      const prev = best.get(d.target);
      if (prev === undefined || decisions[prev].confidence < d.confidence) best.set(d.target, d.index);
    }
    for (const d of decisions) {
      if (d.target !== "skip" && best.get(d.target) !== d.index) {
        d.rationale = `Another column matched ${d.target} more closely`;
        d.target = "skip";
        d.confidence = 0;
      }
    }
    return res.status(200).json({ mapping: decisions });
  } catch (e: unknown) {
    const err = (e && typeof e === "object" ? e : {}) as { status?: unknown; message?: unknown; name?: unknown };
    const status = Number(err.status) || 0;
    const timedOut = /timed? ?out|timeout|ETIMEDOUT|aborted/i.test(String(err.message || err.name || ""));
    console.error("[clients/map-columns] AI mapping failed", { status, message: String(err.message || e).slice(0, 300) });
    if (status === 429) {
      return res.status(429).json({ error: "AI matching is busy right now. Try again in a minute, or match the columns by hand.", code: "ai_rate_limited" });
    }
    if (timedOut) {
      return res.status(504).json({ error: "AI matching took too long. Try again, or match the columns by hand.", code: "ai_timeout" });
    }
    return res.status(502).json({ error: "AI matching is unavailable right now. Match the columns by hand.", code: "ai_failed" });
  }
}

export default withApiLogging(handler);
