/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /pay/invoice/[id] -- LEGACY redirect.
 *
 * Old emails / SMS / saved links pointed at this enumerable-UUID URL.
 * The route used to load the invoice via the anon Supabase client,
 * which doesn't have the right RLS to read invoices anymore (we only
 * grant anon SELECT-by-public_token now).
 *
 * Server-side resolves the id -> public_token via the service role,
 * then 308 redirects to /pay/i/[token]. Old links keep working without
 * exposing raw invoice ids in the browser URL.
 */
import type { GetServerSideProps } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = typeof ctx.params?.id === "string" ? ctx.params.id : null;
  if (!id) return { notFound: true };

  try {
    const supabase = getServiceSupabase();
    const { data } = await (supabase as any)
      .from("invoices")
      .select("public_token, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.deleted_at) return { notFound: true };
    return {
      redirect: {
        destination: `/pay/i/${data.public_token}`,
        permanent: true,
      },
    };
  } catch {
    return { notFound: true };
  }
};

export default function InvoiceLegacyRedirect() {
  return null;
}
