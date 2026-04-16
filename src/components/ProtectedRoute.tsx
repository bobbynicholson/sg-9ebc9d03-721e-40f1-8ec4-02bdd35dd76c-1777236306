import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  requireAuth?: boolean;
}

/**
 * ProtectedRoute Component - AUTHENTICATION DISABLED FOR PREVIEW
 * All pages are now accessible without login
 */
export function ProtectedRoute({ 
  children, 
  allowedRoles, 
  requireAuth = true 
}: ProtectedRouteProps) {
  // Authentication disabled - render children directly
  return <>{children}</>;
}