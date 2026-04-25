import { UserRole } from "@/types/app";
import { roleService } from "@/services/roleService";
import { companyService } from "@/services/companyService";
import type { Profile } from "@/services/profileService";

// Role-based route permissions
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  [UserRole.SUPER_ADMIN]: [
    "/cateringms-platform/*",
    "/admin/*",
    "/team-portal/*",
    "/client-portal/*",
    "*",
  ],
  [UserRole.ADMIN]: [
    "/admin/*",
    "/team-portal/*",
  ],
  [UserRole.OWNER]: [
    "/admin/*",
    "/team-portal/*",
  ],
  [UserRole.KITCHEN]: [
    "/team-portal/kitchen/*",
    "/team-portal/general/*",
  ],
  [UserRole.KITCHEN_STAFF]: [
    "/team-portal/kitchen/*",
    "/team-portal/general/*",
  ],
  [UserRole.SHOPPING]: [
    "/team-portal/shopping/*",
    "/team-portal/general/*",
  ],
  [UserRole.SHOPPING_STAFF]: [
    "/team-portal/shopping/*",
    "/team-portal/general/*",
  ],
  [UserRole.DRIVER]: [
    "/team-portal/driver/*",
    "/team-portal/general/*",
  ],
  [UserRole.CLEANING]: [
    "/team-portal/cleaning/*",
    "/team-portal/general/*",
  ],
  [UserRole.CLEANING_STAFF]: [
    "/team-portal/cleaning/*",
    "/team-portal/general/*",
  ],
  [UserRole.CLIENT]: [
    "/client-portal/*",
  ],
};

// Admin roles that can access admin dashboard
export const ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.OWNER];

// Role display names
export const ROLE_NAMES: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrator",
  [UserRole.OWNER]: "Owner",
  [UserRole.SUPER_ADMIN]: "Platform Administrator",
  [UserRole.KITCHEN]: "Kitchen Manager",
  [UserRole.KITCHEN_STAFF]: "Kitchen Staff",
  [UserRole.SHOPPING]: "Shopping Manager",
  [UserRole.SHOPPING_STAFF]: "Shopping Staff",
  [UserRole.DRIVER]: "Driver/Waiter",
  [UserRole.CLEANING]: "Cleaning Manager",
  [UserRole.CLEANING_STAFF]: "Cleaning Staff",
  [UserRole.CLIENT]: "Client",
};

// Default landing pages for each role
export const ROLE_LANDING_PAGES: Record<UserRole, (companySlug?: string) => string> = {
  [UserRole.SUPER_ADMIN]: () => "/cateringms-platform/dashboard",
  [UserRole.ADMIN]: (slug) => "/admin/dashboard",
  [UserRole.OWNER]: (slug) => "/admin/dashboard",
  [UserRole.KITCHEN]: () => "/team-portal/kitchen/dashboard",
  [UserRole.KITCHEN_STAFF]: () => "/team-portal/kitchen/dashboard",
  [UserRole.SHOPPING]: () => "/team-portal/shopping/dashboard",
  [UserRole.SHOPPING_STAFF]: () => "/team-portal/shopping/dashboard",
  [UserRole.DRIVER]: () => "/team-portal/driver/dashboard",
  [UserRole.CLEANING]: () => "/team-portal/cleaning/dashboard",
  [UserRole.CLEANING_STAFF]: () => "/team-portal/cleaning/dashboard",
  [UserRole.CLIENT]: () => "/client-portal/dashboard",
};

/**
 * Check if a user with a specific role can access a route
 */
export function canAccessRoute(userRole: UserRole, pathname: string): boolean {
  const allowedRoutes = ROLE_ROUTES[userRole];
  
  if (!allowedRoutes) {
    return false;
  }

  // Check if user has wildcard access
  if (allowedRoutes.includes("*")) {
    return true;
  }

  // Check if pathname matches any allowed route pattern
  return allowedRoutes.some((route) => {
    if (route.endsWith("/*")) {
      const baseRoute = route.slice(0, -2);
      return pathname.startsWith(baseRoute);
    }
    return pathname === route || pathname.startsWith(route + "/");
  });
}

/**
 * Check if user is an admin (super_admin, admin, or owner)
 */
export function isAdmin(userRole: UserRole): boolean {
  return ADMIN_ROLES.includes(userRole);
}

/**
 * Check if user can access admin dashboard
 */
export function canAccessAdminDashboard(userRole: UserRole): boolean {
  return isAdmin(userRole);
}

/**
 * Get the default landing page for a user role
 */
export function getRoleLandingPage(userRole: UserRole, companySlug?: string): string {
  const landingPageFn = ROLE_LANDING_PAGES[userRole];
  return landingPageFn(companySlug);
}

/**
 * Get role display name
 */
export function getRoleName(userRole: UserRole): string {
  return ROLE_NAMES[userRole];
}

/**
 * Check if user has required role(s)
 */
export function hasRole(profile: Profile | null, ...requiredRoles: UserRole[]): boolean {
  if (!profile || !profile.role) {
    return false;
  }

  return requiredRoles.includes(profile.role as UserRole);
}

/**
 * Get unauthorized message based on role
 */
export function getUnauthorizedMessage(userRole: UserRole, attemptedRoute: string): string {
  return `Access Denied: Your ${getRoleName(userRole)} account does not have permission to access ${attemptedRoute}. Please contact your administrator if you believe this is an error.`;
}

/**
 * Check if role is a CateringMS platform admin role
 */
export function isPlatformAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.SUPER_ADMIN;
}

/**
 * Check if role is a company admin role
 */
export function isCompanyAdmin(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN || userRole === UserRole.OWNER || userRole === UserRole.SUPER_ADMIN;
}

/**
 * Check if role is a staff role (non-admin, non-client)
 */
export function isStaffRole(userRole: UserRole): boolean {
  const staffRoles: UserRole[] = [
    UserRole.KITCHEN,
    UserRole.KITCHEN_STAFF,
    UserRole.SHOPPING,
    UserRole.SHOPPING_STAFF,
    UserRole.DRIVER,
    UserRole.CLEANING,
    UserRole.CLEANING_STAFF,
  ];
  return staffRoles.includes(userRole);
}