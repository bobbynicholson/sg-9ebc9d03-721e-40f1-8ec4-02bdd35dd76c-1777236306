import { createServerClient, serializeCookieHeader } from "@supabase/ssr";
import type { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from "next";
import type { Database } from "@/integrations/supabase/types";

export function createPagesServerClient(
  ctx: GetServerSidePropsContext | { req: NextApiRequest; res: NextApiResponse }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return Object.keys(ctx.req.cookies).map((name) => ({
            name,
            value: ctx.req.cookies[name] || "",
          }));
        },
        setAll(cookiesToSet) {
          try {
            const headers = cookiesToSet.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options)
            );
            ctx.res.setHeader("Set-Cookie", headers);
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}