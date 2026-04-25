import { UserRole } from "@/types/app";
import { roleService } from "@/services/roleService";
import { companyService } from "@/services/companyService";
import type { Profile } from "@/services/profileService";

// Role-based route permissions
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin: [
    "/cateringms-platform/*",
    "/admin/*",
    "/team-portal/*",
    "/client-portal/*",
    "*",
  ],
  admin: [
    "/admin/*",
    "/team-portal/*",
  ],
  owner: [
    "/admin/*",
    "/team-portal/*",
  ],
  kitchen: [
    "/team-portal/kitchen/*",
    "/team-portal/general/*",
  ],
  kitchen_staff: [
    "/team-portal/kitchen/*",
    "/team-portal/general/*",
  ],
  shopping: [
    "/team-portal/shopping/*",
    "/team-portal/general/*",
  ],
  shopping_staff: [
    "/team-portal/shopping/*",
    "/team-portal/general/*",
  ],
  driver: [
    "/team-portal/driver/*",
    "/team-portal/general/*",
  ],
  cleaning: [
    "/team-portal/cleaning/*",
    "/team-portal/general/*",
  ],
  cleaning_staff: [
    "/team-portal/cleaning/*",
    "/team-portal/general/*",
  ],
  client: [
    "/client-portal/*",
  ],
};

// Admin roles that can access admin dashboard
export const ADMIN_ROLES: UserRole[] = ["super_admin", "admin", "owner"];

// Role display names
export const ROLE_NAMES: Record<UserRole, string> = {
  admin: "Administrator",
  owner: "Owner",
  super_admin: "Platform Administrator",
  kitchen: "Kitchen Manager",
  kitchen_staff: "Kitchen Staff",
  shopping: "Shopping Manager",
  shopping_staff: "Shopping Staff",
  driver: "Driver/Waiter",
  cleaning: "Cleaning Manager",
  cleaning_staff: "Cleaning Staff",
  client: "Client",
};

// Default landing pages for each role
export const ROLE_LANDING_PAGES: Record<UserRole, (companySlug?: string) => string> = {
  super_admin: () => "/cateringms-platform/dashboard",
  admin: (slug) => "/admin/dashboard",
  owner: (slug) => "/admin/dashboard",
  kitchen: () => "/team-portal/kitchen/dashboard",
  kitchen_staff: () => "/team-portal/kitchen/dashboard",
  shopping: () => "/team-portal/shopping/dashboard",
  shopping_staff: () => "/team-portal/shopping/dashboard",
  driver: () => "/team-portal/driver/dashboard",
  cleaning: () => "/team-portal/cleaning/dashboard",
  cleaning_staff: () => "/team-portal/cleaning/dashboard",
  client: () => "/client-portal/dashboard",
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
  return userRole === "super_admin";
}

/**
 * Check if role is a company admin role
 */
export function isCompanyAdmin(userRole: UserRole): boolean {
  return userRole === "admin" || userRole === "owner" || userRole === "super_admin";
}

/**
 * Check if role is a staff role (non-admin, non-client)
 */
export function isStaffRole(userRole: UserRole): boolean {
  const staffRoles: UserRole[] = [
    "kitchen",
    "kitchen_staff",
    "shopping",
    "shopping_staff",
    "driver",
    "cleaning",
    "cleaning_staff",
  ];
  return staffRoles.includes(userRole);
}