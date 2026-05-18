/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Server-side DNS diagnostic for a tenant's Resend sending domain.
 *
 * Resend's verify endpoint will happily report 'not_started' without
 * telling the operator why. This route does an independent DNS lookup
 * against a public resolver (Cloudflare + Google) for each record
 * Resend told us to publish, then returns a per-record diagnosis plus
 * a summary so the UI can guide the operator to the actual fix.
 *
 * Cache nothing. DNS state is the question; a stale answer is worse
 * than no answer.
 */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { Resolver } from "node:dns/promises";
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
]);

type ExpectedRecord = {
  record?: string;
  type?: string;
  name?: string;
  value?: string;
  priority?: number | string;
  ttl?: number | string;
  status?: string;
};

type RecordResult = {
  name: string;
  type: string;
  expected_value: string;
  expected_priority?: number;
  found_values: string[];
  match: boolean;
  diagnosis: string;
  error?: string;
};

function buildResolver(): Resolver {
  const r = new Resolver();
  // Public resolvers: Cloudflare first, Google as fallback. Avoids
  // the lambda's local resolver returning a stale cached view.
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}

function normaliseTxt(chunks: string[]): string {
  // dns.resolveTxt returns each TXT record as an array of chunks
  // because the DNS wire format splits long strings into 255-byte
  // segments. Join with no separator - that's what every real
  // validator does. We also strip surrounding quotes if some hosts
  // wrap the value.
  const joined = chunks.join("");
  return joined.replace(/^"+|"+$/g, "").trim();
}

function looksQuoteWrapped(chunks: string[]): boolean {
  if (chunks.length === 0) return false;
  return chunks.some((c) => /^".*"$/.test(c.trim()));
}

function valuesMatch(found: string, expected: string): boolean {
  if (!found || !expected) return false;
  // SPF and similar records can have benign whitespace differences.
  const a = found.replace(/\s+/g, " ").trim().toLowerCase();
  const b = expected.replace(/\s+/g, " ").trim().toLowerCase();
  return a === b;
}

async function lookupTxt(
  resolver: Resolver,
  name: string,
): Promise<{ values: string[]; raw: string[][]; error?: string }> {
  try {
    const raw = await resolver.resolveTxt(name);
    return { values: raw.map(normaliseTxt), raw };
  } catch (e: any) {
    const code = e?.code || "";
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { values: [], raw: [] };
    }
    if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
      return { values: [], raw: [], error: "ETIMEOUT" };
    }
    console.error(`[dns-check] TXT lookup failed for ${name}:`, e);
    return { values: [], raw: [], error: code || "UNKNOWN" };
  }
}

async function lookupMx(
  resolver: Resolver,
  name: string,
): Promise<{
  values: { priority: number; exchange: string }[];
  error?: string;
}> {
  try {
    const raw = await resolver.resolveMx(name);
    return { values: raw };
  } catch (e: any) {
    const code = e?.code || "";
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { values: [] };
    }
    if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
      return { values: [], error: "ETIMEOUT" };
    }
    console.error(`[dns-check] MX lookup failed for ${name}:`, e);
    return { values: [], error: code || "UNKNOWN" };
  }
}

async function lookupCname(
  resolver: Resolver,
  name: string,
): Promise<{ values: string[]; error?: string }> {
  try {
    const raw = await resolver.resolveCname(name);
    return { values: raw };
  } catch (e: any) {
    const code = e?.code || "";
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { values: [] };
    }
    if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
      return { values: [], error: "ETIMEOUT" };
    }
    console.error(`[dns-check] CNAME lookup failed for ${name}:`, e);
    return { values: [], error: code || "UNKNOWN" };
  }
}

function toFqdn(name: string, sendingDomain: string): string {
  // Resend's API returns names as short labels (e.g. "resend._domainkey",
  // "send") rather than full FQDNs. Append the sending domain so the
  // resolver actually has a valid hostname to look up. If the name is
  // already absolute, use it as-is.
  const trimmed = name.trim().replace(/\.$/, "");
  const apex = sendingDomain.trim().replace(/\.$/, "").toLowerCase();
  if (!trimmed) return apex;
  if (trimmed.toLowerCase() === apex) return trimmed;
  if (trimmed.toLowerCase().endsWith(`.${apex}`)) return trimmed;
  return `${trimmed}.${apex}`;
}

async function checkRecord(
  resolver: Resolver,
  expected: ExpectedRecord,
  sendingDomain: string,
): Promise<RecordResult> {
  const rawType = (expected.type || expected.record || "").toString().toUpperCase();
  const type = rawType.includes("MX")
    ? "MX"
    : rawType.includes("CNAME")
      ? "CNAME"
      : "TXT";
  const shortName = (expected.name || "").trim();
  const name = toFqdn(shortName, sendingDomain);
  const expectedValue = (expected.value || "").trim();
  const expectedPriority =
    expected.priority !== undefined && expected.priority !== null
      ? Number(expected.priority)
      : undefined;

  const base: RecordResult = {
    name,
    type,
    expected_value: expectedValue,
    found_values: [],
    match: false,
    diagnosis: "",
  };
  if (Number.isFinite(expectedPriority)) {
    base.expected_priority = expectedPriority as number;
  }

  if (!name) {
    base.diagnosis =
      "Resend did not give us a hostname to check for this record, skip it.";
    return base;
  }

  if (type === "TXT") {
    const { values, raw, error } = await lookupTxt(resolver, name);
    base.found_values = values;
    if (error === "ETIMEOUT") {
      base.error = "ETIMEOUT";
      base.diagnosis = "DNS lookup timed out. Try again in a moment.";
      return base;
    }
    if (error) {
      base.error = error;
      base.diagnosis = `DNS lookup failed (${error}). Try again in a moment.`;
      return base;
    }

    const matchedIdx = values.findIndex((v) => valuesMatch(v, expectedValue));
    if (matchedIdx >= 0) {
      base.match = true;
      base.diagnosis = "Record is live and matches what Resend expects.";
      return base;
    }

    if (values.length === 0) {
      base.diagnosis =
        "DNS hasn't published this record yet. Either the record wasn't saved or it's still propagating.";
      return base;
    }

    if (looksQuoteWrapped(raw.flat())) {
      base.diagnosis =
        "Your DNS host wrapped the long DKIM value in quotes, the underlying record is correct but some validators choke on it. Usually fine to ignore.";
      return base;
    }

    const sample = values[0] || "";
    const truncated = sample.length > 80 ? `${sample.slice(0, 80)}...` : sample;
    const expectedSample =
      expectedValue.length > 80
        ? `${expectedValue.slice(0, 80)}...`
        : expectedValue;
    base.diagnosis = `Found \`${truncated}\` but expected \`${expectedSample}\`. Check for stray whitespace or a partial copy of the value.`;
    return base;
  }

  if (type === "MX") {
    const { values, error } = await lookupMx(resolver, name);
    base.found_values = values.map(
      (v) => `${v.priority} ${v.exchange.replace(/\.$/, "")}`,
    );
    if (error === "ETIMEOUT") {
      base.error = "ETIMEOUT";
      base.diagnosis = "DNS lookup timed out. Try again in a moment.";
      return base;
    }
    if (error) {
      base.error = error;
      base.diagnosis = `DNS lookup failed (${error}). Try again in a moment.`;
      return base;
    }
    if (values.length === 0) {
      base.diagnosis =
        "DNS hasn't published this record yet. Either the record wasn't saved or it's still propagating.";
      return base;
    }

    const expectedHost = expectedValue.replace(/\.$/, "").toLowerCase();
    const matched = values.find((v) => {
      const host = v.exchange.replace(/\.$/, "").toLowerCase();
      const priorityOk =
        expectedPriority === undefined || v.priority === expectedPriority;
      return host === expectedHost && priorityOk;
    });
    if (matched) {
      base.match = true;
      base.diagnosis = "Record is live and matches what Resend expects.";
      return base;
    }

    const first = values[0];
    base.diagnosis = `Found MX \`${first.exchange.replace(/\.$/, "")}\` priority ${first.priority}, expected \`${expectedValue}\`${
      expectedPriority !== undefined ? ` priority ${expectedPriority}` : ""
    }. Check for a typo in the host or priority.`;
    return base;
  }

  // CNAME
  const { values, error } = await lookupCname(resolver, name);
  base.found_values = values.map((v) => v.replace(/\.$/, ""));
  if (error === "ETIMEOUT") {
    base.error = "ETIMEOUT";
    base.diagnosis = "DNS lookup timed out. Try again in a moment.";
    return base;
  }
  if (error) {
    base.error = error;
    base.diagnosis = `DNS lookup failed (${error}). Try again in a moment.`;
    return base;
  }
  if (values.length === 0) {
    base.diagnosis =
      "DNS hasn't published this record yet. Either the record wasn't saved or it's still propagating.";
    return base;
  }
  const expectedHost = expectedValue.replace(/\.$/, "").toLowerCase();
  const found = values.find(
    (v) => v.replace(/\.$/, "").toLowerCase() === expectedHost,
  );
  if (found) {
    base.match = true;
    base.diagnosis = "Record is live and matches what Resend expects.";
    return base;
  }
  base.diagnosis = `Found \`${values[0]}\` but expected \`${expectedValue}\`. Check for stray whitespace or a partial copy of the value.`;
  return base;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssr.auth.getUser();
    if (!callerAuth) {
      return res
        .status(401)
        .json({ error: "No active session, sign in and retry." });
    }

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    const role =
      (callerProfile as any)?.active_role || (callerProfile as any)?.role;
    if (!callerProfile || !ALLOWED_ROLES.has(role)) {
      return res.status(403).json({
        error: `Role '${role || "unknown"}' is not permitted to manage email domains.`,
      });
    }

    const companyId = (callerProfile as any).company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Caller has no company_id." });
    }

    const admin = getServiceSupabase();
    const { data: row } = await admin
      .from("email_provider_settings")
      .select("resend_sending_domain, resend_dns_records")
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();

    if (!row || !(row as any).resend_sending_domain) {
      return res.status(404).json({
        error:
          "No Resend domain registered for this company yet. Add one first.",
      });
    }

    const expected: ExpectedRecord[] = Array.isArray(
      (row as any).resend_dns_records,
    )
      ? (row as any).resend_dns_records
      : [];

    if (expected.length === 0) {
      return res.status(409).json({
        error:
          "No expected DNS records on file for this domain. Re-create the domain in Resend to fetch them.",
      });
    }

    const sendingDomain = (row as any).resend_sending_domain as string;
    const resolver = buildResolver();
    const results: RecordResult[] = [];
    for (const rec of expected) {
      try {
        results.push(await checkRecord(resolver, rec, sendingDomain));
      } catch (e: any) {
        console.error("[dns-check] record check crashed:", e);
        results.push({
          name: toFqdn((rec.name || "").trim(), sendingDomain),
          type: ((rec.type || rec.record || "TXT") as string).toUpperCase(),
          expected_value: (rec.value || "").trim(),
          found_values: [],
          match: false,
          diagnosis:
            "Diagnostic check crashed for this record. The other records still apply.",
          error: e?.code || "UNKNOWN",
        });
      }
    }

    const totalCount = results.length;
    const matchCount = results.filter((r) => r.match).length;
    const foundCount = results.filter((r) => r.found_values.length > 0).length;
    const timedOut = results.some((r) => r.error === "ETIMEOUT");

    const allMatch = matchCount === totalCount;
    // If absolutely nothing has shown up yet, the most likely cause is
    // propagation. If some records exist but values mismatch, something
    // was probably typed wrong.
    const propagationLikely = !allMatch && foundCount === 0;

    let nextAction: string;
    if (allMatch) {
      nextAction =
        "All records are live and match, click Verify now in Resend.";
    } else if (timedOut) {
      nextAction =
        "DNS resolver timed out, give it a moment and re-run the check.";
    } else if (propagationLikely) {
      nextAction =
        "Wait 5-10 minutes and re-check, your DNS host is still propagating.";
    } else {
      nextAction =
        "One or more values look wrong, double-check the records you pasted.";
    }

    return res.status(200).json({
      domain: (row as any).resend_sending_domain,
      summary: {
        all_match: allMatch,
        propagation_likely: propagationLikely,
        next_action: nextAction,
      },
      records: results,
    });
  } catch (e: any) {
    console.error("[dns-check] crashed:", e);
    return res
      .status(500)
      .json({ error: e?.message || "Unexpected server error" });
  }
}
