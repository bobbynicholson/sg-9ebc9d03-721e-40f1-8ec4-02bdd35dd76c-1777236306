import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, getRoleLandingPage, getUnauthorizedMessage, isAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { normalizeRoleValue, uniqueRoles } from "@/lib/roleDerivation";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

/**
 * ProtectedRoute Component - Enforces authentication and role-based access control
 */
export function ProtectedRoute({ 
  children, 
  allowedRoles, 
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
      const isProd = process.env.NODE_ENV === "production";
      const isLocalhostHost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
         window.location.hostname === "127.0.0.1");
      const hasDevQueryFlag =
        typeof window !== "undefined" &&
        window.location.search.includes("dev=true");

      const isDevEnvironment = !isProd && (isLocalhostHost || hasDevQueryFlag);

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
        // Check if user has required role
        if (allowedRoles && allowedRoles.length > 0) {
          const roleSet = uniqueRoles([
            ...(userRoles || []),
            normalizeRoleValue(user?.role),
            normalizeRoleValue(user?.active_role),
            normalizeRoleValue(profile.role),
            normalizeRoleValue(profile.active_role),
            normalizeRoleValue(activeRole),
          ]);

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
  }, [user, profile, allowedRoles, userRoles, activeRole]);

  // Show loading state
  if (loading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Loading...</h3>
            <p className="text-slate-600">Verifying your credentials</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show unauthorized message
  if (requireAuth && user && !authorized) {
    const redirectToHome = () => {
      const landingRole = normalizeRoleValue(activeRole) || normalizeRoleValue(user.active_role) || user.role;
      const landingPage = getRoleLandingPage(landingRole, user.company_slug);
      router.replace(landingPage);
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <Card className="w-full max-w-2xl border-0 shadow-xl">
          <CardContent className="p-8 lg:p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Access Denied</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
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
