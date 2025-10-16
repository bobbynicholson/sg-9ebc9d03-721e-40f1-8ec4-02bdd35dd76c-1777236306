import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { UserRole } from "@/types"; // FIX: Import manual UserRole type

type UserDepartment = Database["public"]["Tables"]["user_departments"]["Row"];
type UserDepartmentInsert = Database["public"]["Tables"]["user_departments"]["Insert"];

export interface RoleAssignment {
  id: string;
  userId: string;
  department: UserRole;
  isPrimary: boolean;
  assignedAt: string;
  assignedBy: string | null;
}

export const roleService = {
  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: string): Promise<RoleAssignment[]> {
    try {
      const { data, error } = await supabase
        .from("user_departments")
        .select("*")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false });

      if (error) {
        console.error("Error fetching user roles:", error);
        return [];
      }

      return (data || []).map((dept) => ({
        id: dept.id,
        userId: dept.user_id,
        department: dept.department as UserRole,
        isPrimary: dept.is_primary || false,
        assignedAt: dept.assigned_at || new Date().toISOString(),
        assignedBy: dept.assigned_by,
      }));
    } catch (error) {
      console.error("Fatal error in getUserRoles:", error);
      return [];
    }
  },

  /**
   * Get user's active role from profile
   */
  async getActiveRole(userId: string): Promise<UserRole> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("active_role")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching active role:", error);
        return "client" as UserRole;
      }

      return (data?.active_role || "client") as UserRole;
    } catch (error) {
      console.error("Fatal error in getActiveRole:", error);
      return "client" as UserRole;
    }
  },

  /**
   * Switch user's active role
   */
  async switchRole(userId: string, newRole: UserRole): Promise<void> {
    // First verify user has this role assigned
    const roles = await this.getUserRoles(userId);
    const hasRole = roles.some((r) => r.department === newRole);

    if (!hasRole) {
      throw new Error(`User does not have ${newRole} role assigned`);
    }

    // Update active role in profile
    const { error } = await supabase
      .from("profiles")
      .update({ active_role: newRole })
      .eq("id", userId);

    if (error) {
      console.error("Error switching role:", error);
      throw error;
    }
  },

  /**
   * Assign a new role to a user (Admin only)
   */
  async assignRole(
    userId: string,
    department: UserRole,
    assignedBy: string,
    isPrimary: boolean = false
  ): Promise<void> {
    // If setting as primary, unset other primary roles first
    if (isPrimary) {
      await supabase
        .from("user_departments")
        .update({ is_primary: false })
        .eq("user_id", userId);
    }

    const insert: UserDepartmentInsert = {
      user_id: userId,
      department,
      is_primary: isPrimary,
      assigned_by: assignedBy,
    };

    const { error } = await supabase
      .from("user_departments")
      .insert(insert);

    if (error) {
      console.error("Error assigning role:", error);
      throw error;
    }

    // If this is the first role or is primary, set as active role
    if (isPrimary) {
      await supabase
        .from("profiles")
        .update({ active_role: department })
        .eq("id", userId);
    }
  },

  /**
   * Remove a role from a user (Admin only)
   */
  async removeRole(userId: string, department: UserRole): Promise<void> {
    const { error } = await supabase
      .from("user_departments")
      .delete()
      .eq("user_id", userId)
      .eq("department", department);

    if (error) {
      console.error("Error removing role:", error);
      throw error;
    }

    // If removed role was active, switch to primary role or first available
    const activeRole = await this.getActiveRole(userId);
    if (activeRole === department) {
      const roles = await this.getUserRoles(userId);
      const newActiveRole = roles.find((r) => r.isPrimary) || roles[0];
      if (newActiveRole) {
        await this.switchRole(userId, newActiveRole.department);
      }
    }
  },

  /**
   * Set a role as primary for a user
   */
  async setPrimaryRole(userId: string, department: UserRole): Promise<void> {
    // Verify user has this role
    const roles = await this.getUserRoles(userId);
    const hasRole = roles.some((r) => r.department === department);

    if (!hasRole) {
      throw new Error(`User does not have ${department} role assigned`);
    }

    // Unset all primary flags
    await supabase
      .from("user_departments")
      .update({ is_primary: false })
      .eq("user_id", userId);

    // Set new primary role
    const { error } = await supabase
      .from("user_departments")
      .update({ is_primary: true })
      .eq("user_id", userId)
      .eq("department", department);

    if (error) {
      console.error("Error setting primary role:", error);
      throw error;
    }

    // Also update active role
    await this.switchRole(userId, department);
  },

  /**
   * Get role-specific dashboard URL
   */
  getRoleDashboardUrl(role: UserRole, companySlug?: string): string {
    const slug = companySlug || "my-company";
    
    const roleUrls: Record<UserRole, string> = {
      admin: `/${slug}/admin/dashboard`,
      driver: `/${slug}/driver/dashboard`,
      client: "/client-portal",
      cleaning: `/${slug}/cleaning/dashboard`,
      shopping: `/${slug}/shopping/dashboard`,
      kitchen: `/${slug}/kitchen/dashboard`,
      owner: `/${slug}/admin/dashboard`,
      super_admin: "/platform/dashboard",
      shopping_staff: `/${slug}/shopping/dashboard`,
      cleaning_staff: `/${slug}/cleaning/dashboard`,
      kitchen_staff: `/${slug}/kitchen/dashboard`,
    };

    return roleUrls[role] || "/";
  },

  /**
   * Get role display name
   */
  getRoleDisplayName(role: UserRole): string {
    const roleNames: Record<UserRole, string> = {
      admin: "Admin",
      driver: "Driver",
      client: "Client",
      cleaning: "Cleaning Manager",
      shopping: "Shopping Manager",
      kitchen: "Kitchen Manager",
      owner: "Owner",
      super_admin: "Platform Admin",
      shopping_staff: "Shopping Staff",
      cleaning_staff: "Cleaning Staff",
      kitchen_staff: "Kitchen Staff",
    };

    return roleNames[role] || role;
  },
};
