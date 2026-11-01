import Head from "next/head";
import Link from "next/link";
import { ArrowRight, Building2, Users } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompanySignupPage() {
  return (
    <AuthShell
      headline="Your team, connected from day one."
      subcopy="CateringMS workspaces are set up with the platform team, then managed by your company inside its own tenant."
      pills={["Platform-managed setup", "Company-owned staff access", "Separate tenant data"]}
    >
      <Head>
        <title>Company workspace setup | CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Card className="w-full max-w-lg rounded-2xl border border-stone-200 shadow-xl shadow-stone-200/50">
        <CardHeader className="space-y-3 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-stone-950">
            Company setup is managed by CateringMS
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-stone-600">
            A platform administrator creates each company workspace and sends the initial account invitations. Your company owner can then add and manage staff within that workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-7 sm:px-8 sm:pb-8">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
              <p className="text-sm leading-6 text-stone-700">
                Need access as a staff member? Ask your company owner or administrator to invite you. New employees do not create accounts from this page.
              </p>
            </div>
          </div>
          <Button asChild className="h-12 w-full rounded-xl bg-amber-700 text-base font-semibold text-white hover:bg-amber-800">
            <Link href="/contact">
              Contact the platform team
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <p className="text-center text-sm text-stone-600">
            Already invited? <Link href="/auth/login" className="font-semibold text-amber-800 underline-offset-4 hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
