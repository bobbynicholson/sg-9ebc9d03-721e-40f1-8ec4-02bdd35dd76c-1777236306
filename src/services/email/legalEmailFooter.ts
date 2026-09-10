/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  buildCompanyTermsUrl,
  resolveConfidentialityNotice,
} from "@/lib/companyLegal";

interface CompanyLegalRow {
  slug: string | null;
  confidentiality_notice: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const legalCache = new Map<
  string,
  { row: CompanyLegalRow; fetchedAt: number }
>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readCompanyLegal(
  companyId: string,
  client: any,
): Promise<CompanyLegalRow> {
  const cached = legalCache.get(companyId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.row;
  }

  let row: CompanyLegalRow = {
    slug: null,
    confidentiality_notice: null,
  };
  try {
    const { data, error } = await client
      .from("companies")
      .select("slug, confidentiality_notice")
      .eq("id", companyId)
      .maybeSingle();
    if (!error && data) {
      row = {
        slug: (data as any).slug || null,
        confidentiality_notice:
          (data as any).confidentiality_notice || null,
      };
    } else if (error) {
      // During a rolling deployment the code can briefly precede the new
      // column.  Retry for the slug so the link remains tenant-specific and
      // use the standard notice until the migration lands.
      const missingColumn =
        (error as any)?.code === "42703" ||
        /confidentiality_notice.*does not exist/i.test(
          String((error as any)?.message || ""),
        );
      if (missingColumn) {
        const fallback = await client
          .from("companies")
          .select("slug")
          .eq("id", companyId)
          .maybeSingle();
        if (!fallback.error && fallback.data) {
          row.slug = (fallback.data as any).slug || null;
        }
      }
    }
  } catch {
    // A footer must never prevent a transactional email.  The company id is
    // itself a valid public terms-page identifier and the notice has a safe
    // default, so the fallback still satisfies both requirements.
  }

  legalCache.set(companyId, { row, fetchedAt: Date.now() });
  return row;
}

export interface LegalFooterRenderInput {
  companyId: string;
  companySlug?: string | null;
  confidentialityNotice?: string | null;
  origin?: string | null;
}

function renderLegalFooterShell(noticeHtml: string, termsLineHtml: string): string {
  return `
  <div data-cms-legal-footer="true" style="margin-top:24px;padding:18px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#64748b;font-size:10px;line-height:1.55;text-align:left;">
    <div style="margin:0 0 8px 0;">${noticeHtml}</div>
    <div style="margin:0;">${termsLineHtml}</div>
  </div>`;
}

/** Pure renderer kept separate so escaping and URL output are testable. */
export function renderCompanyLegalFooterHtml(
  input: LegalFooterRenderInput,
): string {
  const identifier = input.companySlug || input.companyId;
  const termsUrl = buildCompanyTermsUrl(identifier, input.origin);
  const notice = escapeHtml(
    resolveConfidentialityNotice(input.confidentialityNotice),
  ).replace(/\r?\n/g, "<br>");

  return renderLegalFooterShell(
    notice,
    `Client communications are subject to the caterer&rsquo;s <a href="${escapeHtml(termsUrl)}" style="color:#475569;text-decoration:underline;font-weight:600;">Terms &amp; Conditions</a>.`,
  );
}

/**
 * Platform-audience variant for mail sent BY CateringMS itself (billing,
 * owner welcome, support relays).  Those recipients are caterers, not a
 * caterer's clients, so linking them to their own tenant terms page would
 * be nonsense - the governing document is the platform's /terms.
 */
export function renderPlatformLegalFooterHtml(origin?: string | null): string {
  const brand = escapeHtml(process.env.PLATFORM_BRAND_NAME || "CateringMS");
  const termsUrl = buildCompanyTermsUrl(null, origin);
  const notice = escapeHtml(resolveConfidentialityNotice(null));
  return renderLegalFooterShell(
    notice,
    `This message is subject to the ${brand} <a href="${escapeHtml(termsUrl)}" style="color:#475569;text-decoration:underline;font-weight:600;">Terms &amp; Conditions</a>.`,
  );
}

/** Idempotent platform-footer append; same marker as the tenant variant. */
export function appendPlatformLegalFooter(
  body: string,
  origin?: string | null,
): string {
  if (body.includes('data-cms-legal-footer="true"')) return body;
  const footer = renderPlatformLegalFooterHtml(origin);
  if (/<\/body>/i.test(body)) {
    return body.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${body}${footer}`;
}

/**
 * Append the mandatory tenant legal footer immediately before `</body>` when
 * possible.  The marker makes the operation idempotent for fully-shelled
 * templates that may already include it.
 */
export async function appendCompanyLegalFooter(
  body: string,
  input: { companyId: string; client: any; origin?: string | null },
): Promise<string> {
  if (body.includes('data-cms-legal-footer="true"')) return body;

  const row = await readCompanyLegal(input.companyId, input.client);
  const footer = renderCompanyLegalFooterHtml({
    companyId: input.companyId,
    companySlug: row.slug,
    confidentialityNotice: row.confidentiality_notice,
    origin: input.origin,
  });

  if (/<\/body>/i.test(body)) {
    return body.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${body}${footer}`;
}

/** Test-only cache reset. */
export function _resetLegalFooterCache(): void {
  legalCache.clear();
}
