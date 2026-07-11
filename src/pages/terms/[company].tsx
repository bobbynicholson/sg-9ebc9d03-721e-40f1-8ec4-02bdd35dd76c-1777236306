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
import { FileText } from "lucide-react";
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
          <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-6 sm:px-6">
            {logoUrl ? (
              // Tenant logos live on arbitrary hosts; next/image would need
              // each domain whitelisted, so a plain img is deliberate here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${companyName} logo`}
                className="h-12 w-12 rounded-lg border border-slate-200 bg-white object-contain p-1"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: accent }}
              >
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-slate-500">{companyName}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Terms &amp; Conditions
              </h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          {terms ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
                {terms}
              </p>
            </div>
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

          {(email || phone) && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">
                Questions about these terms?
              </p>
              <p className="mt-1">
                Contact {companyName}
                {email ? (
                  <>
                    {" "}at{" "}
                    <a
                      className="font-medium underline"
                      style={{ color: accent }}
                      href={`mailto:${email}`}
                    >
                      {email}
                    </a>
                  </>
                ) : null}
                {email && phone ? " or " : phone ? " on " : ""}
                {phone ? (
                  <a
                    className="font-medium underline"
                    style={{ color: accent }}
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                  >
                    {phone}
                  </a>
                ) : null}
                .
              </p>
            </div>
          )}

          <p className="mt-10 text-center text-xs text-slate-400">
            Powered by CateringMS
          </p>
        </main>
      </div>
    </>
  );
}
