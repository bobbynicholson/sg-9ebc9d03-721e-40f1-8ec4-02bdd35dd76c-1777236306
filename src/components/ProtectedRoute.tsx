import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, getRoleLandingPage, getUnauthorizedMessage, isAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PwaLoadingScreen } from "@/components/pwa/PwaLoadingScreen";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { normalizeRoleValue, uniqueRoles } from "@/lib/roleDerivation";
import { isLocalAuthBypassEnabled } from "@/lib/localAuthBypass";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  /**
   * Roles that are BLOCKED from this surface even if they would
   * otherwise be authorised - including super_admin. Enforced before
   * the super-admin god-mode bypass, so it is the only way to fence
   * the platform operator out of a tenant-private surface (e.g. a
   * company's staff payroll, which the platform has no need to see).
   */
  denyRoles?: UserRole[];
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

/**
 * ProtectedRoute Component - Enforces authentication and role-based access control
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  denyRoles,
  requireAuth = true,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, profile, loading, userRoles, activeRole } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // 🔧 DEV MODE: Skip all auth checks on localhost only.
      //
      // CRITICAL: never bypass in production. The middleware version of
      // this guard checks NODE_ENV (middleware.ts:129-137) but the
      // client-side copy used to allow ?dev=true in any environment,
      // which let anyone open a tenant URL with that query param and
      // skip auth entirely on the client. NODE_ENV check closes that.
      // Keep the opt-in fixture shortcut consistent with the middleware.
      const isDevEnvironment = typeof window !== "undefined"
        && isLocalAuthBypassEnabled(window.location.hostname);

      if (isDevEnvironment) {
        console.log("🔧 DEV MODE: Bypassing ProtectedRoute auth check");
        setAuthorized(true);
        setIsChecking(false);
        return;
      }

      if (!user) {
        setIsChecking(false);
        return;
      }

      if (!profile) {
        setIsChecking(false);
        setAuthorized(false);
        return;
      }

      try {
        const roleSet = uniqueRoles([
          ...(userRoles || []),
          normalizeRoleValue(user?.role),
          normalizeRoleValue(user?.active_role),
          normalizeRoleValue(profile.role),
          normalizeRoleValue(profile.active_role),
          normalizeRoleValue(activeRole),
        ]);

        // DENY LIST: enforced BEFORE the super-admin god-mode bypass
        // below, so it is the one gate god mode cannot walk through.
        // Used to fence tenant-private surfaces (e.g. staff payroll)
        // off from the platform operator, who has no need to see them.
        if (denyRoles && denyRoles.length > 0 && denyRoles.some((r) => roleSet.includes(r))) {
          setAuthorized(false);
          setIsChecking(false);
          return;
        }

        // Check if user has required role
        if (allowedRoles && allowedRoles.length > 0) {
          // GOD MODE: Super Admins bypass all role restrictions
          if (roleSet.includes(UserRole.SUPER_ADMIN)) {
            setAuthorized(true);
            setIsChecking(false);
            return;
          }

          const hasAccess = allowedRoles.some(role => {
            if (role === UserRole.ADMIN) {
              return roleSet.some((candidate) => isAdmin(candidate));
            }
            return roleSet.includes(role);
          });

          if (!hasAccess) {
            setAuthorized(false);
            setIsChecking(false);
            return;
          }
        }

        setAuthorized(true);
      } catch (error) {
        console.error("Auth check error:", error);
        setAuthorized(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [user, profile, allowedRoles, denyRoles, userRoles, activeRole]);

  // Platform pages are global and belong only to the platform operator.
  // If a tenant user follows an old bookmark or a stale platform link,
  // redirect immediately instead of rendering a large Access Denied page.
  // Middleware still enforces the server-side boundary; this handles the
  // client-side role/profile mismatch without exposing the platform shell.
  useEffect(() => {
    if (
      loading || isChecking || !requireAuth || !user || authorized ||
      !router.pathname.startsWith("/admin/platform")
    ) return;

    const landingRole = normalizeRoleValue(activeRole) || normalizeRoleValue(user.active_role) || user.role;
    const landingPage = getRoleLandingPage(landingRole, user.company_slug);
    if (landingPage && landingPage !== router.asPath) {
      void router.replace(landingPage);
    }
  }, [loading, isChecking, requireAuth, user, authorized, router, activeRole]);

  // Show loading state
  if (loading || isChecking) {
    return <PwaLoadingScreen />;
  }

  // Show unauthorized message
  if (requireAuth && user && !authorized) {
    // Never show the platform permission screen to tenant users. The
    // redirect effect above is intentionally paired with this fast shell so
    // there is no flash of a confusing global-admin error page.
    if (router.pathname.startsWith("/admin/platform")) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" aria-label="Redirecting" />
        </div>
      );
    }

    const redirectToHome = () => {
      const landingRole = normalizeRoleValue(activeRole) || normalizeRoleValue(user.active_role) || user.role;
      const landingPage = getRoleLandingPage(landingRole, user.company_slug);
      router.replace(landingPage);
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-orange-50 p-4">
        <Card className="w-full max-w-2xl border-0 shadow-xl">
          <CardContent className="p-8 lg:p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-rose-100 flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 bg-rose-100" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Access Denied</h2>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                <p className="text-left text-slate-700">
                  {getUnauthorizedMessage(user.role, router.pathname)}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <Button
                onClick={redirectToHome}
                size="lg"
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Go to Dashboard
              </Button>
              <Button
                onClick={() => router.back()}
                variant="outline"
                size="lg"
                className="w-full"
              >
                Go Back
              </Button>
            </div>
            <p className="mt-6 text-sm text-slate-500">
              If you believe this is an error, please contact your system administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render children if authorized
  return authorized ? <>{children}</> : null;
}
