/**
 * Public, unauthenticated terms page for a single caterer.
 *
 * /terms/{slug} (or /terms/{company-uuid} as a stable fallback) is the URL
 * every client-facing surface links to: email legal footers, quote/invoice/
 * receipt PDFs and the client portal. Required for POPIA / CPA compliance -
 * a client must always be able to read the caterer's T&Cs from anything the
 * caterer sends them.
 *
 * Data access mirrors serverBrandingForSlug: companies has NO anon SELECT
 * policy (it also holds billing/embed-token columns), so we read with the
 * service role and an explicit safe column whitelist. The platform's own
 * terms stay at /terms (pages/terms.tsx) - Next routes the static file
 * before this dynamic one.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { FileText, Mail, Phone } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isUuid } from "@/lib/embedFormApi";

interface CompanyTermsProps {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  email: string | null;
  phone: string | null;
  terms: string | null;
}

const SAFE_COLS =
  "id, slug, company_name, logo_url, primary_color, email, phone, terms_and_conditions";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Bold markers survive the HTML strip as private-use tokens, then become
// <strong> again after escaping, so no other caterer HTML reaches the page.
const BOLD_START = "\u0001BOLD_START\u0001";
const BOLD_END = "\u0001BOLD_END\u0001";

const inlineHtml = (text: string): string =>
  escapeHtml(text)
    .replace(
      /\u0001BOLD_START\u0001([\s\S]*?)\u0001BOLD_END\u0001/g,
      "<strong>$1</strong>",
    )
    .replace(/\*\*([^*\n][\s\S]*?[^*\n]|\S)\*\*/g, "<strong>$1</strong>");

const plainText = (text: string): string =>
  text
    .split(BOLD_START)
    .join("")
    .split(BOLD_END)
    .join("")
    .replace(/\*\*/g, "")
    .trim();

const toTextBlocks = (value: string): string[] => {
  const source = String(value || "");
  const text = /<[^>]+>/.test(source)
    ? source
        .replace(/<\s*(strong|b)\b[^>]*>/gi, BOLD_START)
        .replace(/<\s*\/\s*(strong|b)\s*>/gi, BOLD_END)
        .replace(/<\s*br\s*\/?\s*>/gi, "\n")
        .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
        .replace(/<\s*(p|div|li|h[1-6])\b[^>]*>/gi, "")
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\u00a0/g, " ")
    : source;
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
};

interface TermsSection {
  id: string;
  heading: string | null;
  // Each block is a list of lines (already escaped HTML). A block with
  // several lines is a list of separate rules; one line is a paragraph.
  blocks: string[][];
}

// Caterers type their terms as plain text: a short line on its own
// ("Bookings", "Cancellations") names a section and every line under it
// is a separate rule. Turn that into headed sections so clients can scan
// and jump. Terms with no such headings render as plain paragraphs.
const isHeading = (block: string): boolean => {
  if (block.includes("\n")) return false;
  const text = plainText(block);
  return text.length > 0 && text.length <= 60 && !/[.,;:!?)]$/.test(text);
};

const parseTermsSections = (value: string): TermsSection[] => {
  const sections: TermsSection[] = [];
  const used = new Set<string>();
  for (const block of toTextBlocks(value)) {
    if (isHeading(block)) {
      const heading = plainText(block);
      let id = `terms-${
        heading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "section"
      }`;
      while (used.has(id)) id += "-more";
      used.add(id);
      sections.push({ id, heading, blocks: [] });
      continue;
    }
    if (!sections.length)
      sections.push({ id: "terms-intro", heading: null, blocks: [] });
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(inlineHtml);
    sections[sections.length - 1].blocks.push(lines);
  }
  return sections;
};

export const getServerSideProps: GetServerSideProps<CompanyTermsProps> = async (
  ctx,
) => {
  const raw = String(ctx.params?.company || "").trim();
  if (!raw) return { notFound: true };

  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch {
    // Without the service key we can't scope-read companies safely.
    return { notFound: true };
  }

  const { data, error } = await supabase
    .from("companies")
    .select(SAFE_COLS)
    .eq(isUuid(raw) ? "id" : "slug", raw)
    .maybeSingle();

  if (error || !data) return { notFound: true };

  const row = data as Record<string, string | null>;
  return {
    props: {
      companyName: row.company_name || "This caterer",
      logoUrl: row.logo_url || null,
      primaryColor: row.primary_color || null,
      email: row.email || null,
      phone: row.phone || null,
      terms: (row.terms_and_conditions || "").trim() || null,
    },
  };
};

export default function CompanyTermsPage({
  companyName,
  logoUrl,
  primaryColor,
  email,
  phone,
  terms,
}: CompanyTermsProps) {
  const accent = primaryColor || "#0f172a";
  const sections = terms ? parseTermsSections(terms) : [];
  const headed = sections.filter((section) => section.heading);
  const hasSidebar = headed.length > 1;

  // Shown in the sidebar on wide screens and under the terms on phones.
  const contactCard = (className: string) =>
    email || phone ? (
      <div
        className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}
      >
        <p className="font-semibold text-slate-900">
          Questions about these terms?
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Ask {companyName} before you book.
        </p>
        <div className="mt-4 grid gap-2">
          {email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              <Mail className="h-4 w-4 shrink-0" />
              Email {companyName}
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Phone className="h-4 w-4 shrink-0" />
              Call {companyName}
            </a>
          )}
        </div>
        <p className="mt-3 break-words text-xs leading-5 text-slate-500">
          {[email, phone].filter(Boolean).join(" · ")}
        </p>
      </div>
    ) : null;

  return (
    <>
      <Head>
        <title>{`Terms & Conditions - ${companyName}`}</title>
        <meta
          name="description"
          content={`Terms and conditions for catering services provided by ${companyName}.`}
        />
        <meta name="robots" content="index, follow" />
      </Head>

      <div className="min-h-screen bg-slate-50">
        <header
          className="border-b border-slate-200 bg-white"
          style={{ borderTopWidth: 4, borderTopColor: accent }}
        >
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            {logoUrl ? (
              // Tenant logos live on arbitrary hosts; next/image would need
              // each domain whitelisted, so a plain img is deliberate here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${companyName} logo`}
                className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: accent }}
              >
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">
                {companyName}
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                Terms &amp; Conditions
              </h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          {terms ? (
            <>
              <p className="text-sm leading-6 text-slate-600 sm:text-[15px]">
                These terms apply to every quote, booking and invoice from{" "}
                {companyName}. Please read them before you pay your deposit.
              </p>

              {/* Wide screens: section list in a sidebar that stays in view,
                  terms beside it, so the page uses the full width. */}
              <div
                className={
                  hasSidebar
                    ? "mt-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-8"
                    : "mt-5"
                }
              >
                {hasSidebar && (
                  <aside className="space-y-4 lg:sticky lg:top-6">
                    <nav
                      aria-label="Sections of these terms"
                      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Jump to a section
                      </p>
                      <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
                        {headed.map((section, index) => (
                          <li key={section.id}>
                            <a
                              href={`#${section.id}`}
                              className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                style={{ backgroundColor: accent }}
                              >
                                {index + 1}
                              </span>
                              <span className="min-w-0">{section.heading}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </nav>
                    {contactCard("hidden lg:block")}
                  </aside>
                )}

                <div
                  className={`space-y-4 ${hasSidebar ? "mt-5 lg:mt-0" : ""}`}
                >
                  {sections.map((section) => (
                    <section
                      key={section.id}
                      id={section.id}
                      aria-labelledby={
                        section.heading ? `${section.id}-title` : undefined
                      }
                      className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
                    >
                      {section.heading && (
                        <h2
                          id={`${section.id}-title`}
                          className="flex items-center gap-3 text-lg font-semibold text-slate-900"
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                            style={{ backgroundColor: accent }}
                          >
                            {headed.indexOf(section) + 1}
                          </span>
                          {section.heading}
                        </h2>
                      )}
                      <div
                        className={`space-y-3 text-[15px] leading-7 text-slate-700 [&_strong]:font-semibold [&_strong]:text-slate-900 ${section.heading ? "mt-4" : ""}`}
                      >
                        {section.blocks.map((lines, blockIndex) =>
                          lines.length > 1 ? (
                            <ul key={blockIndex} className="space-y-3">
                              {lines.map((line, lineIndex) => (
                                <li key={lineIndex} className="flex gap-3">
                                  <span
                                    aria-hidden="true"
                                    className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: accent }}
                                  />
                                  <span
                                    className="min-w-0 break-words"
                                    dangerouslySetInnerHTML={{ __html: line }}
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p
                              key={blockIndex}
                              className="break-words"
                              dangerouslySetInnerHTML={{ __html: lines[0] }}
                            />
                          ),
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-slate-700">
                {companyName} has not published detailed terms and conditions
                here yet.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Please contact them directly for the terms that apply to your
                booking.
              </p>
            </div>
          )}

          {contactCard(hasSidebar ? "mt-6 lg:hidden" : "mt-6")}

          <p className="mt-10 text-center text-xs text-slate-400">
            Powered by CateringMS
          </p>
        </main>
      </div>
    </>
  );
}
