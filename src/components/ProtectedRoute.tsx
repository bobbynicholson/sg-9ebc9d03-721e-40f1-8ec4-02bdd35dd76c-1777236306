import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";
import { canAccessRoute, getRoleLandingPage, getUnauthorizedMessage } from "@/lib/authGuards";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireAuth?: boolean;
}

/**
 * ProtectedRoute Component
 * Wraps pages that require authentication and/or specific roles
 * 
 * @param allowedRoles - Array of roles that can access this route (optional)
 * @param requireAuth - Whether the route requires authentication (default: true)
 */
export function ProtectedRoute({ 
  children, 
  allowedRoles, 
  requireAuth = true 
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) {
      return;
    }

    // Check if authentication is required
    if (requireAuth && !user) {
      router.push("/auth/login");
      return;
    }

    // Check if profile exists
    if (requireAuth && user && !profile) {
      console.error("User authenticated but no profile found");
      router.push("/auth/login");
      return;
    }

    // Check role-based access
    if (allowedRoles && profile) {
      const userRole = profile.role as UserRole;
      
      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(userRole)) {
        // Redirect to their role's landing page
        const landingPage = getRoleLandingPage(userRole);
        router.push(landingPage);
        return;
      }

      // Check if user can access the current route
      if (!canAccessRoute(userRole, router.pathname)) {
        const landingPage = getRoleLandingPage(userRole);
        router.push(landingPage);
        return;
      }
    }

    setChecking(false);
  }, [user, profile, loading, router, requireAuth, allowedRoles]);

  // Show loading state
  if (loading || checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-16 h-16 text-purple-600 animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Loading...</h2>
            <p className="text-slate-600">Verifying your access</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show unauthorized if requirements not met
  if (requireAuth && (!user || !profile)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <Shield className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Authentication Required</h2>
            <p className="text-slate-600 mb-6">You must be signed in to access this page.</p>
            <Link href="/auth/login">
              <Button className="bg-gradient-to-r from-purple-500 to-pink-500">
                Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if role not allowed
  if (allowedRoles && profile) {
    const userRole = profile.role as UserRole;
    if (!allowedRoles.includes(userRole)) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-0 shadow-2xl">
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 text-orange-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Access Denied</h2>
              <p className="text-slate-600 mb-6">
                {getUnauthorizedMessage(userRole, router.pathname)}
              </p>
              <Link href={getRoleLandingPage(userRole)}>
                <Button className="bg-gradient-to-r from-purple-500 to-pink-500">
                  Go to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  // All checks passed, render children
  return <>{children}</>;
}
