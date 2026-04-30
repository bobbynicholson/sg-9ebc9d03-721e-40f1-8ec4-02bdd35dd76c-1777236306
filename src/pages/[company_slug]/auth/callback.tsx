/**
 * Magic-link auth callback for tenant-scoped client login.
 *
 * URL: /{company_slug}/auth/callback#access_token=...&refresh_token=...
 *      (Supabase appends the tokens as a URL hash on success, or as
 *       ?error=... query params on failure)
 *
 * Flow:
 *   1. Page loads. If Supabase already exchanged the code into a
 *      session (default behaviour for hash-style links), great. If not,
 *      we manually call exchangeCodeForSession.
 *   2. We read the resulting session, look up the company by slug, and
 *      auto-provision a `profiles` row with role=client, company_id
 *      from the slug, and email + name from the user. If a row already
 *      exists, we leave it alone (the user might already be a client of
 *      a different catering company too).
 *   3. We try to link this auth user to any existing `clients` row that
 *      shares the email -- this is the bridge that lets the new login
 *      see all their existing orders without needing each row to be
 *      pre-created with a user_id.
 *   4. We stamp `client_session_started_at` in user_metadata so the
 *      48-hour session cap can be enforced page-side later.
 *   5. Redirect to ?next=... (default /client-portal/dashboard).
 *
 * Why the client must hit this page (not /auth/callback at the root):
 *   - The slug in the URL pins them to the right tenant. Without it, a
 *     client who has orders with two catering companies would land on
 *     whichever one their first profile happened to be created against.
 *   - Each catering company should feel like its own product -- the
 *     URL bar reading /spit-braai-delivery/auth/callback is part of
 *     that white-label feel.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Status = "working" | "ok" | "error";

export default function ClientAuthCallbackPage() {
  const router = useRouter();
  const { company_slug, next } = router.query;

  const [status, setStatus] = useState<Status>("working");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof company_slug !== "string") return;

    let cancelled = false;

    const finish = (s: Status, err = "") => {
      if (cancelled) return;
      setStatus(s);
      setErrorMsg(err);
    };

    (async () => {
      try {
        // Detect Supabase error in URL params first (e.g. expired link).
        // Supabase puts errors in the hash on the magic-link redirect.
        if (typeof window !== "undefined") {
          const hash = window.location.hash || "";
          if (hash.includes("error=")) {
            const params = new URLSearchParams(hash.slice(1));
            const desc = params.get("error_description") || params.get("error") || "Sign-in link could not be used.";
            return finish("error", decodeURIComponent(desc.replace(/\+/g, " ")));
          }

          // Some Supabase configs use ?code=... query param instead of
          // hash tokens. If we see one, we have to manually exchange it.
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              return finish("error", error.message || "Sign-in link could not be used.");
            }
          }
        }

        // By now Supabase should have a session. Wait a tick for the
        // client to settle if we just exchanged a code.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          return finish("error", "No active session was created. The link may have expired -- request a fresh one.");
        }

        const user = session.user;

        // Look up the company by the slug in the URL. We cross-check
        // here rather than trust the URL blindly -- if the slug doesn't
        // exist, we abort and show an error.
        const { data: company } = await supabase
          .from("companies")
          .select("id, slug, company_name")
          .eq("slug", company_slug)
          .maybeSingle();

        if (!company) {
          return finish("error", "We couldn't match this sign-in to a company. Please use the link from your latest email.");
        }

        // Auto-provision the profiles row server-side -- the profiles
        // RLS doesn't permit a user to self-insert, so the browser
        // can't do this. The endpoint uses the service role and has
        // the necessary safety rails (role hard-coded to client, slug
        // resolved to UUID server-side, existing profiles never
        // overwritten).
        try {
          await fetch("/api/auth/client-provision-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ company_slug: company.slug }),
          });
        } catch (provisionErr: any) {
          // Non-fatal -- if the user already has a profile or the
          // provision endpoint hiccups, the dashboard will surface a
          // clearer error than this callback could.
          console.warn("Auto-provision call failed:", provisionErr?.message);
        }

        // Stamp the session start time in user_metadata so we can
        // enforce a 48-hour cap from page-level later. This is a
        // best-effort write -- we don't block on it.
        try {
          const startedAt = new Date().toISOString();
          await supabase.auth.updateUser({
            data: {
              client_session_started_at: startedAt,
              last_company_slug: company.slug,
            },
          });
        } catch {
          /* non-fatal */
        }

        // Off to the portal. Default destination is the client dashboard
        // at the global /client-portal/* path -- in Phase 2 we'll move
        // this under /{slug}/client-portal/* for a fully white-label URL.
        const safeNext =
          typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/client-portal/dashboard";

        finish("ok");
        // Tiny pause so the success state is visible -- avoids a jarring
        // "blink" when the redirect is instant.
        setTimeout(() => {
          if (!cancelled) router.replace(safeNext);
        }, 400);
      } catch (e: any) {
        finish("error", e?.message || "Something went wrong. Please try the link again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, company_slug, next, router]);

  return (
    <>
      <Head>
        <title>Signing you in...</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="p-10 text-center space-y-4">
            {status === "working" && (
              <>
                <Loader2 className="w-10 h-10 mx-auto text-slate-400 animate-spin" />
                <h1 className="text-lg font-semibold text-slate-900">Signing you in</h1>
                <p className="text-sm text-slate-600">One moment...</p>
              </>
            )}
            {status === "ok" && (
              <>
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
                <h1 className="text-lg font-semibold text-slate-900">Welcome back</h1>
                <p className="text-sm text-slate-600">Loading your dashboard...</p>
              </>
            )}
            {status === "error" && (
              <>
                <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
                <h1 className="text-lg font-semibold text-slate-900">We couldn't sign you in</h1>
                <p className="text-sm text-slate-600 leading-relaxed">{errorMsg}</p>
                <div className="pt-2">
                  <Button
                    onClick={() =>
                      router.replace(
                        `/${typeof company_slug === "string" ? company_slug : ""}/login`,
                      )
                    }
                    className="w-full"
                  >
                    Request a new link
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
