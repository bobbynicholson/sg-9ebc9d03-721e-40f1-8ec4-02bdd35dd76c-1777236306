import Head from "next/head";
import { useRouter } from "next/router";
import { Power } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { PortalShell } from "@/components/portal/ui";

export default function CompanyDeactivatedPage() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    await router.replace("/auth/login");
  };

  return (
    <>
      <Head>
        <title>Workspace deactivated - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PortalShell width="narrow" className="flex min-h-screen items-center">
        <main className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-900 sm:p-9">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <Power className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Workspace deactivated
          </h1>
          <p className="mx-auto mt-3 max-w-prose text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
            This company workspace is currently disabled by its platform owner. Its company data has been preserved. Contact your platform administrator to restore access.
          </p>
          <div className="mt-7 flex justify-center">
            <Button type="button" variant="outline" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </main>
      </PortalShell>
    </>
  );
}
