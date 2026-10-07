/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Existing clients / leads for one company, keyed the way the database
 * decides "same client": email, lowercased and trimmed, ignoring
 * soft-deleted rows (idx_clients_company_email_unique is
 * (company_id, lower(trim(email))) WHERE deleted_at IS NULL).
 *
 * Every import path (preview, commit, onboarding bulk) uses this so a
 * duplicate is judged by one rule. The earlier `.in("email", fileEmails)`
 * lookups were case-sensitive (a saved "Thabo@Gmail.com" was missed and
 * the insert then failed on the unique index) and put every file email
 * in one request URL, which large files overflowed.
 *
 * Reads the company's rows in pages of 1000 and builds the maps in memory.
 */

export const emailKey = (v: unknown): string => String(v ?? "").trim().toLowerCase();

const PAGE = 1000;

async function pageAll(
  supabase: any,
  table: "clients" | "leads",
  columns: string,
  companyId: string,
): Promise<any[]> {
  const page = async (from: number, withCount: boolean) => {
    const { data, error, count } = await supabase
      .from(table)
      .select(columns, withCount ? { count: "exact" } : undefined)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read existing ${table}: ${error.message}`);
    return { rows: (data || []) as any[], count: typeof count === "number" ? count : null };
  };
  // First page also returns the total, so the rest load in parallel
  // (8 at a time) instead of one after another (~1s each).
  const first = await page(0, true);
  const out: any[] = [...first.rows];
  if (first.rows.length < PAGE) return out;
  if (first.count === null) {
    for (let from = PAGE; ; from += PAGE) {
      const next = await page(from, false);
      out.push(...next.rows);
      if (next.rows.length < PAGE) break;
    }
    return out;
  }
  const starts: number[] = [];
  for (let from = PAGE; from < first.count; from += PAGE) starts.push(from);
  for (let i = 0; i < starts.length; i += 8) {
    const pages = await Promise.all(starts.slice(i, i + 8).map((from) => page(from, false)));
    for (const p of pages) out.push(...p.rows);
  }
  return out;
}

/** clientByEmail: email key -> client id; clientByName: lowercased name -> client id. */
export async function loadClientIndex(supabase: any, companyId: string): Promise<{
  clientByEmail: Map<string, string>;
  clientByName: Map<string, string>;
}> {
  const clientByEmail = new Map<string, string>();
  const clientByName = new Map<string, string>();
  for (const c of await pageAll(supabase, "clients", "id, email, client_name", companyId)) {
    const e = emailKey(c.email);
    if (e && !clientByEmail.has(e)) clientByEmail.set(e, c.id);
    const n = String(c.client_name ?? "").trim().toLowerCase();
    if (n && !clientByName.has(n)) clientByName.set(n, c.id);
  }
  return { clientByEmail, clientByName };
}

/** leadByEmail: email key (from email or client_email) -> lead id. */
export async function loadLeadIndex(supabase: any, companyId: string): Promise<Map<string, string>> {
  const leadByEmail = new Map<string, string>();
  for (const l of await pageAll(supabase, "leads", "id, email, client_email", companyId)) {
    for (const v of [l.email, l.client_email]) {
      const e = emailKey(v);
      if (e && !leadByEmail.has(e)) leadByEmail.set(e, l.id);
    }
  }
  return leadByEmail;
}
