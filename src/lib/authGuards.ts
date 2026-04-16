import { UserRole } from "@/types/app";
import { roleService } from "@/services/roleService";
import { companyService } from "@/services/companyService";
import type { Profile } from "@/services/profileService";

// AUTHENTICATION DISABLED - ALL ROUTES ACCESSIBLE
// Role-based route permissions - DISABLED FOR PREVIEW
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  owner: ["*"],
  kitchen: ["*"],
  kitchen_staff: ["*"],
  shopping: ["*"],
  shopping_staff: ["*"],
  driver: ["*"],
  cleaning: ["*"],
  cleaning_staff: ["*"],
  client: ["*"],
};

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
  kitchen: () => "/kitchen",
  kitchen_staff: () => "/kitchen",
  shopping: () => "/shopping",
  shopping_staff: () => "/shopping",
  driver: () => "/drivers",
  cleaning: () => "/cleaning",
  cleaning_staff: () => "/cleaning",
  client: () => "/client-portal",
};

/**
 * Check if a user with a specific role can access a route
 * AUTHENTICATION DISABLED - ALWAYS RETURNS TRUE
 */
export function canAccessRoute(userRole: UserRole, pathname: string): boolean {
  return true; // All routes accessible
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
 * AUTHENTICATION DISABLED - ALWAYS RETURNS TRUE
 */
export function hasRole(profile: Profile | null, ...requiredRoles: UserRole[]): boolean {
  return true; // All roles granted
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
  return true; // All users have admin access for preview
}

/**
 * Check if role is a company admin role
 */
export function isCompanyAdmin(userRole: UserRole): boolean {
  return true; // All users have admin access for preview
}

/**
 * Check if role is a staff role (non-admin, non-client)
 */
export function isStaffRole(userRole: UserRole): boolean {
  return true; // All users have staff access for preview
}