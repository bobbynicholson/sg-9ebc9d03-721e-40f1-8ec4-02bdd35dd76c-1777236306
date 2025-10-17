import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { UserRole } from "@/types";
import { getRoleLandingPage } from "@/lib/authGuards";

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

  async getActiveRole(userId: string): Promise<UserRole> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("active_role")
        .eq("id", userId)
        .limit(1)
        .single();

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

  async switchRole(userId: string, newRole: UserRole): Promise<void> {
    const roles = await this.getUserRoles(userId);
    const hasRole = roles.some((r) => r.department === newRole);

    if (!hasRole) {
      throw new Error(`User does not have ${newRole} role assigned`);
    }

    const { error } = await supabase
      .from("profiles")
      .update({ active_role: newRole })
      .eq("id", userId);

    if (error) {
      console.error("Error switching role:", error);
      throw error;
    }
  },

  async assignRole(
    userId: string,
    department: UserRole,
    assignedBy: string,
    isPrimary: boolean = false
  ): Promise<void> {
    const { data: profileExists, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profileExists) {
      console.error("User profile not found:", userId, profileError);
      throw new Error("User profile must exist before assigning roles");
    }

    const { data: existingRole, error: checkError } = await supabase
      .from("user_departments")
      .select("id, is_primary")
      .eq("user_id", userId)
      .eq("department", department)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing role:", checkError);
      throw checkError;
    }

    if (existingRole) {
      console.log(`Role ${department} already exists for user ${userId}, updating instead`);
      
      if (isPrimary) {
        await supabase
          .from("user_departments")
          .update({ is_primary: false })
          .eq("user_id", userId);
      }

      const { error: updateError } = await supabase
        .from("user_departments")
        .update({ is_primary: isPrimary })
        .eq("id", existingRole.id);

      if (updateError) {
        console.error("Error updating role:", updateError);
        throw updateError;
      }

      if (isPrimary) {
        await supabase
          .from("profiles")
          .update({ active_role: department })
          .eq("id", userId);
      }

      return;
    }

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

    if (isPrimary) {
      await supabase
        .from("profiles")
        .update({ active_role: department })
        .eq("id", userId);
    }
  },

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

    const activeRole = await this.getActiveRole(userId);
    if (activeRole === department) {
      const roles = await this.getUserRoles(userId);
      const newActiveRole = roles.find((r) => r.isPrimary) || roles[0];
      if (newActiveRole) {
        await this.switchRole(userId, newActiveRole.department);
      }
    }
  },

  async setPrimaryRole(userId: string, department: UserRole): Promise<void> {
    const roles = await this.getUserRoles(userId);
    const hasRole = roles.some((r) => r.department === department);

    if (!hasRole) {
      throw new Error(`User does not have ${department} role assigned`);
    }

    await supabase
      .from("user_departments")
      .update({ is_primary: false })
      .eq("user_id", userId);

    const { error } = await supabase
      .from("user_departments")
      .update({ is_primary: true })
      .eq("user_id", userId)
      .eq("department", department);

    if (error) {
      console.error("Error setting primary role:", error);
      throw error;
    }

    await this.switchRole(userId, department);
  },

  getRoleDashboardUrl(role: UserRole, companySlug?: string): string {
    return getRoleLandingPage(role, companySlug);
  },

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

export const getRedirectUrl = (role: string, companySlug?: string): string => {
  return roleService.getRoleDashboardUrl(role as UserRole, companySlug);
};
