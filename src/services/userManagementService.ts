import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { UserRole } from "@/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

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
   * Check if a user profile exists
   */
  async userExists(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error checking if user exists:", error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error("Error in userExists:", error);
      return false;
    }
  },

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

      if (profileError) {
        if (profileError.code === "PGRST116") {
          // No rows returned
          return null;
        }
        throw profileError;
      }
      
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
      // CRITICAL: Verify the user exists before attempting to assign departments
      const exists = await this.userExists(userId);
      if (!exists) {
        throw new Error(`User with ID ${userId} does not exist in the profiles table. Cannot assign departments.`);
      }

      // Verify the assignedBy user also exists
      const assignerExists = await this.userExists(assignedBy);
      if (!assignerExists) {
        console.warn(`Assigner user ${assignedBy} does not exist, but proceeding with assignment`);
        // Don't throw here, just log - the assignment might still be valid
      }

      // Delete existing departments for the user
      const { error: deleteError } = await supabase
        .from("user_departments")
        .delete()
        .eq("user_id", userId);

      if (deleteError) {
        console.error("Error deleting existing departments:", deleteError);
        throw new Error(`Failed to remove existing department assignments: ${deleteError.message}`);
      }
      
      // Insert new department assignments
      if (departments.length > 0) {
        const newDepartmentsData = departments.map(dept => ({
          user_id: userId,
          department: dept.department,
          is_primary: dept.is_primary,
          assigned_by: assignedBy,
        }));
        
        const { error: insertError } = await supabase
          .from("user_departments")
          .insert(newDepartmentsData);

        if (insertError) {
          console.error("Error inserting new departments:", insertError);
          
          // Provide more specific error messages
          if (insertError.code === "23503") {
            throw new Error("Foreign key constraint violation: User profile does not exist");
          } else if (insertError.code === "23505") {
            throw new Error("Duplicate department assignment detected");
          }
          
          throw new Error(`Failed to assign departments: ${insertError.message}`);
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
      // Verify user exists first
      const exists = await this.userExists(userId);
      if (!exists) {
        throw new Error(`User with ID ${userId} does not exist`);
      }

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
