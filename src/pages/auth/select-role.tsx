import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Building2,
  ChefHat,
  Crown,
  Loader2,
  LogOut,
  Shield,
  ShoppingCart,
  Sparkles,
  Truck,
  UserCircle,
  UserCog,
  Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthShell } from "@/components/auth/AuthShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleLandingPage, ROLE_NAMES } from "@/lib/authGuards";
import { UserRole } from "@/types/app";

const ROLE_OPTIONS: Array<{
  role: UserRole;
  icon: LucideIcon;
  description: string;
  tone: string;
}> = [
  { role: UserRole.SUPER_ADMIN, icon: Shield, description: "Platform-wide administration and company support.", tone: "bg-slate-100 text-slate-700" },
  { role: UserRole.OWNER, icon: Crown, description: "Full company control, finance, settings and operations.", tone: "bg-amber-100 text-amber-800" },
  { role: UserRole.COMPANY_ADMIN, icon: UserCog, description: "Company administration, orders, reports and team access.", tone: "bg-blue-100 text-blue-700" },
  { role: UserRole.REGION_ADMIN, icon: Shield, description: "Manage the regions and operational work assigned to you.", tone: "bg-rose-100 text-rose-700" },
  { role: UserRole.SALES_ADMIN, icon: UserCircle, description: "Leads, quotes, client communication and sales work.", tone: "bg-rose-100 text-rose-700" },
  { role: UserRole.ADMIN, icon: Shield, description: "Day-to-day admin, orders, calendar, dispatch and staff.", tone: "bg-slate-100 text-slate-700" },
  { role: UserRole.KITCHEN_MANAGER, icon: ChefHat, description: "Kitchen team, prep control, handovers and cleaning visibility.", tone: "bg-amber-100 text-amber-800" },
  { role: UserRole.KITCHEN_STAFF, icon: ChefHat, description: "Today’s prep tasks, kitchen clock-in and handover notes.", tone: "bg-orange-100 text-orange-700" },
  { role: UserRole.DRIVER, icon: Truck, description: "Assigned routes, deliveries and proof of delivery.", tone: "bg-blue-100 text-blue-700" },
  { role: UserRole.WAITER, icon: Users, description: "Event service tasks, attendance and service handover.", tone: "bg-cyan-100 text-cyan-700" },
  { role: UserRole.SHOPPING_STAFF, icon: ShoppingCart, description: "Buy-now lists, receipts and supplier work.", tone: "bg-emerald-100 text-emerald-700" },
  { role: UserRole.CLEANING_MANAGER, icon: Sparkles, description: "Cleaning queue, team availability and handovers.", tone: "bg-violet-100 text-violet-700" },
  { role: UserRole.CLEANING_STAFF, icon: Sparkles, description: "Post-event cleaning tasks, damages and supplies.", tone: "bg-violet-100 text-violet-700" },
  { role: UserRole.CLIENT, icon: Building2, description: "Your company bookings, quotes, payments and updates.", tone: "bg-slate-100 text-slate-700" },
];

function RoleSelectionContent() {
  const router = useRouter();
  const { user, userRoles, activeRole, companySlug, loading, signOut, switchRole } = useAuth();
  const [selecting, setSelecting] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableRoles = ROLE_OPTIONS.filter((option) => userRoles.includes(option.role));

  const handleRoleSelect = async (role: UserRole) => {
    if (selecting) return;
    setSelecting(role);
    setError(null);
    try {
      await switchRole(role);
      const destination = getRoleLandingPage(role, companySlug || user?.company_slug || undefined);
      window.location.assign(destination);
    } catch (selectionError) {
      console.error("Role selection failed:", selectionError);
      setSelecting(null);
      setError(selectionError instanceof Error
        ? selectionError.message
        : "We could not save your portal choice. Please try again.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    await router.replace("/auth/login");
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-center text-slate-600">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-amber-600" />
          <p className="text-sm">Loading your assigned portals...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Choose your portal | CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="w-full max-w-4xl">
        <Card className="overflow-hidden rounded-2xl border border-stone-200/70 shadow-2xl shadow-stone-200/60">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-7 text-white sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white/80">Welcome back, {user.full_name || "there"}</p>
                <p className="mt-1 text-xs text-white/75">Signed in as {user.email}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Choose where you want to go</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">
                  This email has access to {availableRoles.length} portal{availableRoles.length === 1 ? "" : "s"}. Choose a workspace below; you can switch portals later from the role menu.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleSignOut}
                className="shrink-0 gap-2 text-white hover:bg-white/15 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
            {user.company_name && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/90">
                <Building2 className="h-3.5 w-3.5" />
                {user.company_name}
              </div>
            )}
          </div>

          <CardContent className="p-5 sm:p-8">
            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {availableRoles.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <h2 className="text-base font-semibold text-amber-950">No portal access has been assigned yet</h2>
                <p className="mt-2 text-sm leading-6 text-amber-900/80">
                  Your sign-in worked, but an administrator still needs to assign you a portal role. Ask them to open Users &amp; roles and add the correct role to your account.
                </p>
                <Button type="button" variant="outline" onClick={handleSignOut} className="mt-4">
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {availableRoles.map((option) => {
                  const Icon = option.icon;
                  const isCurrent = option.role === activeRole;
                  const isSelecting = option.role === selecting;
                  return (
                    <div
                      key={option.role}
                      className={`flex min-h-[190px] flex-col rounded-xl border p-4 transition-shadow ${isCurrent ? "border-amber-400 bg-amber-50/60 shadow-sm" : "border-slate-200 bg-white hover:shadow-md"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${option.tone}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        {isCurrent && <Badge className="border-amber-200 bg-amber-100 text-amber-800">Current</Badge>}
                      </div>
                      <h2 className="mt-4 text-base font-semibold text-slate-950">{ROLE_NAMES[option.role]}</h2>
                      <p className="mt-1 flex-1 text-sm leading-5 text-slate-600">{option.description}</p>
                      <Button
                        type="button"
                        onClick={() => void handleRoleSelect(option.role)}
                        disabled={Boolean(selecting)}
                        className="mt-4 w-full bg-brand-primary hover:bg-brand-primary/90"
                      >
                        {isSelecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isSelecting ? "Opening..." : isCurrent ? "Continue here" : `Open ${ROLE_NAMES[option.role]}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              Only portals assigned to this email are shown. If something is missing, contact your company administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function SelectRolePage() {
  return (
    <AuthShell>
      <ProtectedRoute>
        <RoleSelectionContent />
      </ProtectedRoute>
    </AuthShell>
  );
}
