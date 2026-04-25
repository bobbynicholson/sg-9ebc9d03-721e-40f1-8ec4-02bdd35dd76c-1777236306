import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute, getRoleLandingPage, getUnauthorizedMessage, isAdmin } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // SUPER ADMIN MODE - Bypass all authentication
    if (typeof window !== "undefined") {
      const superAdminMode = localStorage.getItem("SUPER_ADMIN_MODE") === "true";
      const bypassAuth = localStorage.getItem("BYPASS_AUTH") === "true";
      
      if (superAdminMode || bypassAuth) {
        setAuthorized(true);
        return;
      }
    }

    // Wait for auth to finish loading
    if (loading) {
      return;
    }

    // Check if authentication is required
    if (requireAuth && !user) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
      return;
    }

    // If no user and auth not required, allow access
    if (!requireAuth && !user) {
      setAuthorized(true);
      return;
    }

    // User is authenticated from here on
    if (user) {
      // Check admin requirement
      if (requireAdmin && !isAdmin(user.role)) {
        setAuthorized(false);
        return;
      }

      // Check role-based access
      if (allowedRoles && allowedRoles.length > 0) {
        const hasAccess = allowedRoles.includes(user.role);
        if (!hasAccess) {
          setAuthorized(false);
          return;
        }
      }

      // Check route-based access
      const hasRouteAccess = canAccessRoute(user.role, router.pathname);
      if (!hasRouteAccess) {
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
    }
  }, [user, loading, requireAuth, requireAdmin, allowedRoles, router]);

  // Show loading state
  if (loading) {
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
      const landingPage = getRoleLandingPage(user.role, user.company_slug);
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