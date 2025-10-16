import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { UserRole } from "@/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type UserDepartment = Database["public"]["Tables"]["user_departments"]["Row"];

export interface UserWithDepartments extends Profile {
  departments: UserRole[];
  primary_department?: UserRole;
}

export interface DepartmentAssignment {
  department: UserRole;
  is_primary: boolean;
}

export const userManagementService = {
  /**
   * Get all users with their assigned departments
   */
  async getAllUsers(): Promise<UserWithDepartments[]> {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: departments, error: deptError } = await supabase
        .from("user_departments")
        .select("*");

      if (deptError) throw deptError;

      const usersWithDepts: UserWithDepartments[] = profiles.map((profile) => {
        const userDepts = departments?.filter((d) => d.user_id === profile.id) || [];
        const deptList = userDepts.map((d) => d.department as UserRole);
        const primaryDept = userDepts.find((d) => d.is_primary)?.department as UserRole | undefined;

        return {
          ...profile,
          departments: deptList,
          primary_department: primaryDept || deptList[0],
        };
      });

      return usersWithDepts;
    } catch (error) {
      console.error("Error fetching users:", error);
      throw error;
    }
  },

  /**
   * Get a single user with departments
   */
  async getUserById(userId: string): Promise<UserWithDepartments | null> {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) throw profileError;
      if (!profile) return null;

      const { data: departments, error: deptError } = await supabase
        .from("user_departments")
        .select("*")
        .eq("user_id", userId);

      if (deptError) throw deptError;

      const deptList = departments?.map((d) => d.department as UserRole) || [];
      const primaryDept = departments?.find((d) => d.is_primary)?.department as UserRole | undefined;

      return {
        ...profile,
        departments: deptList,
        primary_department: primaryDept || deptList[0],
      };
    } catch (error) {
      console.error("Error fetching user:", error);
      throw error;
    }
  },

  /**
   * Assign departments to a user
   */
  async assignDepartments(
    userId: string,
    departments: DepartmentAssignment[],
    assignedBy: string
  ): Promise<void> {
    try {
      // First, fetch existing departments to know what to delete
      const { data: existingDepts, error: fetchError } = await supabase
        .from("user_departments")
        .select("id, department")
        .eq("user_id", userId);

      if (fetchError) {
        console.error("Error fetching existing departments:", fetchError);
        throw fetchError;
      }

      const existingDeptTypes = existingDepts?.map(d => d.department) || [];
      const newDeptTypes = departments.map(d => d.department);

      // Delete departments that are no longer assigned
      const deptsToDelete = existingDeptTypes.filter(dept => !newDeptTypes.includes(dept));
      
      if (deptsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("user_departments")
          .delete()
          .eq("user_id", userId)
          .in("department", deptsToDelete);

        if (deleteError) {
          console.error("Error deleting departments:", deleteError);
          throw deleteError;
        }
      }

      // Update existing or insert new departments
      for (const dept of departments) {
        const existingDept = existingDepts?.find(d => d.department === dept.department);
        
        if (existingDept) {
          // Update existing department
          const { error: updateError } = await supabase
            .from("user_departments")
            .update({
              is_primary: dept.is_primary,
              assigned_by: assignedBy,
              assigned_at: new Date().toISOString(),
            })
            .eq("id", existingDept.id);

          if (updateError) {
            console.error("Error updating department:", updateError);
            throw updateError;
          }
        } else {
          // Insert new department
          const { error: insertError } = await supabase
            .from("user_departments")
            .insert({
              user_id: userId,
              department: dept.department,
              is_primary: dept.is_primary,
              assigned_by: assignedBy,
            });

          if (insertError) {
            console.error("Error inserting department:", insertError);
            throw insertError;
          }
        }
      }

      // Update user's primary role in profiles
      const primaryDept = departments.find((d) => d.is_primary)?.department || departments[0]?.department;
      
      if (primaryDept) {
        // Convert UserRole to string for database update
        const roleString: string = primaryDept;
        
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ role: roleString })
          .eq("id", userId);

        if (updateError) {
          console.error("Error updating profile role:", updateError);
          throw updateError;
        }
      }
    } catch (error) {
      console.error("Error assigning departments:", error);
      throw error;
    }
  },

  /**
   * Get users by department
   */
  async getUsersByDepartment(department: UserRole): Promise<UserWithDepartments[]> {
    try {
      const { data: deptAssignments, error: deptError } = await supabase
        .from("user_departments")
        .select("user_id")
        .eq("department", department);

      if (deptError) throw deptError;

      const userIds = deptAssignments?.map((d) => d.user_id) || [];

      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const { data: allDepartments, error: allDeptError } = await supabase
        .from("user_departments")
        .select("*")
        .in("user_id", userIds);

      if (allDeptError) throw allDeptError;

      const usersWithDepts: UserWithDepartments[] = profiles.map((profile) => {
        const userDepts = allDepartments?.filter((d) => d.user_id === profile.id) || [];
        const deptList = userDepts.map((d) => d.department as UserRole);
        const primaryDept = userDepts.find((d) => d.is_primary)?.department as UserRole | undefined;

        return {
          ...profile,
          departments: deptList,
          primary_department: primaryDept || deptList[0],
        };
      });

      return usersWithDepts;
    } catch (error) {
      console.error("Error fetching users by department:", error);
      throw error;
    }
  },

  /**
   * Update user's active status
   */
  async updateUserStatus(userId: string, isActive: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating user status:", error);
      throw error;
    }
  },

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string): Promise<UserWithDepartments[]> {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const userIds = profiles?.map((p) => p.id) || [];

      if (userIds.length === 0) return [];

      const { data: departments, error: deptError } = await supabase
        .from("user_departments")
        .select("*")
        .in("user_id", userIds);

      if (deptError) throw deptError;

      const usersWithDepts: UserWithDepartments[] = profiles.map((profile) => {
        const userDepts = departments?.filter((d) => d.user_id === profile.id) || [];
        const deptList = userDepts.map((d) => d.department as UserRole);
        const primaryDept = userDepts.find((d) => d.is_primary)?.department as UserRole | undefined;

        return {
          ...profile,
          departments: deptList,
          primary_department: primaryDept || deptList[0],
        };
      });

      return usersWithDepts;
    } catch (error) {
      console.error("Error searching users:", error);
      throw error;
    }
  },

  /**
   * Get department statistics
   */
  async getDepartmentStats() {
    try {
      const { data: departments, error } = await supabase
        .from("user_departments")
        .select("department");

      if (error) throw error;

      const stats: Partial<Record<UserRole, number>> = {};

      departments?.forEach((dept) => {
        const deptType = dept.department as UserRole;
        stats[deptType] = (stats[deptType] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error("Error fetching department stats:", error);
      throw error;
    }
  },
};
