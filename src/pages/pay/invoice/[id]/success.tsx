/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Legacy /pay/invoice/[id]/success redirect to the token-form
 * /pay/i/[token]/success. Same id->token resolution as the parent
 * route. Old PayFast return_urls baked into earlier transactions
 * keep landing the customer on a valid page.
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
        destination: `/pay/i/${data.public_token}/success`,
        permanent: true,
      },
    };
  } catch {
    return { notFound: true };
  }
};

export default function InvoiceLegacySuccessRedirect() {
  return null;
}
