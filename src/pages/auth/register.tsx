import Head from "next/head";
import Link from "next/link";
import { ArrowRight, MailCheck, Users } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <AuthShell
      headline="Access for the people on your team."
      subcopy="CateringMS accounts are created through a company invitation so every person starts with the right workspace and role."
      pills={["Invited access", "Company-assigned roles", "Tenant-scoped workspace"]}
    >
      <Head>
        <title>Request workspace access | CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Card className="w-full max-w-lg rounded-2xl border border-stone-200 shadow-xl shadow-stone-200/50">
        <CardHeader className="space-y-3 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-stone-950">
            Account access is invitation-only
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-stone-600">
            Staff accounts are created by a company owner or administrator. Ask them to invite your work email, then use the secure setup link they send you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-7 sm:px-8 sm:pb-8">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
              <p className="text-sm leading-6 text-stone-700">
                Client portal users should open the secure sign-in link from their catering company. If you need a new staff invitation, contact your company administrator.
              </p>
            </div>
          </div>
          <Button asChild className="h-12 w-full rounded-xl bg-amber-700 text-base font-semibold text-white hover:bg-amber-800">
            <Link href="/auth/login">
              Go to sign in
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <p className="text-center text-sm text-stone-600">
            Setting up a company? <Link href="/contact" className="font-semibold text-amber-800 underline-offset-4 hover:underline">Contact the platform team</Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
