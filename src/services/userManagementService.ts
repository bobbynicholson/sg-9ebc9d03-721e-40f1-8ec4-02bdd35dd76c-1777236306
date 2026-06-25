/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { UserRole } from "@/types/app";

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
   * Invite a staff member to join the company
   * CRITICAL: This function was missing and is essential for staff onboarding
   */
  async inviteStaffMember(
    companyId: string,
    email: string,
    role: UserRole,
    fullName: string,
    invitedBy: string
  ): Promise<{ success: boolean; error?: string; invitationId?: string }> {
    try {
      // 1. Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { success: false, error: "Invalid email format" };
      }

      // 2. Check if user already exists in the company
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id, email, company_id")
        .eq("email", email)
        .eq("company_id", companyId)
        .maybeSingle();

      if (checkError) {
        console.error("Error checking existing user:", checkError);
        return { success: false, error: "Failed to check existing user" };
      }

      if (existingUser) {
        return { success: false, error: "User already exists in this company" };
      }

      // 3. Create invitation record
      const invitationToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const { data: invitation, error: invitationError } = await supabase
        .from("staff_invitations")
        .insert({
          company_id: companyId,
          email: email,
          role: role,
          full_name: fullName,
          invitation_token: invitationToken,
          invited_by: invitedBy,
          expires_at: expiresAt.toISOString(),
          status: "pending",
        } as any)
        .select()
        .single();

      if (invitationError) {
        console.error("Error creating invitation:", invitationError);
        return { success: false, error: "Failed to create invitation" };
      }

      // 4. Get company details for the invitation email
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", companyId)
        .single();

      if (companyError || !company) {
        console.error("Error fetching company:", companyError);
        // Still try to send email even if company fetch fails
      }

      // 5. Generate invitation URL
      const baseUrl = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com");
      const invitationUrl = `${baseUrl}/auth/register?invitation=${invitationToken}&email=${encodeURIComponent(email)}`;

      // 6. Send invitation email
      const { billingEmailService } = await import("./billingEmailService");
      // FIX: Check if email was sent successfully
      let emailError = null;
      try {
        await billingEmailService.sendStaffInvitationEmail(
            email,
            invitedBy,
            company?.company_name || "the company",
            invitationUrl,
            companyId
        );
      } catch (e: any) {
        emailError = e.message;
        console.error("Failed to send staff invitation email:", e);
      }

      return { 
        success: true, 
        invitationId: invitation.id,
        error: emailError ? `Invitation created but email failed to send: ${emailError}` : undefined
      };

    } catch (error) {
      console.error("Error in inviteStaffMember:", error);
      return { success: false, error: "An unexpected error occurred" };
    }
  },

  /**
   * Get all pending invitations for a company
   */
  async getPendingInvitations(companyId: string) {
    try {
      const { data, error } = await supabase
        .from("staff_invitations")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching pending invitations:", error);
      throw error;
    }
  },

  /**
   * Validate and accept an invitation
   */
  async acceptInvitation(invitationToken: string, userId: string): Promise<{ success: boolean; error?: string; companyId?: string; role?: UserRole }> {
    try {
      // 1. Get invitation details
      const { data: invitation, error: invitationError } = await supabase
        .from("staff_invitations")
        .select("*")
        .eq("invitation_token", invitationToken)
        .eq("status", "pending")
        .single();

      if (invitationError || !invitation) {
        return { success: false, error: "Invalid or expired invitation" };
      }

      // 2. Check if invitation has expired
      const expiresAt = new Date(invitation.expires_at);
      if (expiresAt < new Date()) {
        await supabase
          .from("staff_invitations")
          .update({ status: "expired" })
          .eq("id", invitation.id);
        
        return { success: false, error: "Invitation has expired" };
      }

      // 3. Update user's company_id and role
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          company_id: invitation.company_id,
          role: invitation.role as any,
        })
        .eq("id", userId);

      if (profileError) {
        console.error("Error updating profile:", profileError);
        return { success: false, error: "Failed to update user profile" };
      }

      // 4. Assign department to user
      await this.assignDepartments(
        userId,
        [{ department: invitation.role as UserRole, is_primary: true }],
        invitation.invited_by
      );

      // 5. Mark invitation as accepted
      await supabase
        .from("staff_invitations")
        .update({ 
          status: "accepted",
          accepted_at: new Date().toISOString(),
          accepted_by: userId 
        } as any)
        .eq("id", invitation.id);

      return { 
        success: true, 
        companyId: invitation.company_id,
        role: invitation.role as UserRole 
      };

    } catch (error) {
      console.error("Error in acceptInvitation:", error);
      return { success: false, error: "An unexpected error occurred" };
    }
  },

  /**
   * Cancel/revoke an invitation
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("staff_invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId);

      if (error) throw error;
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      throw error;
    }
  },

  /**
   * Get all users with their assigned departments
   */
  async getAllUsers(companyId?: string, opts?: { excludeRoles?: string[] }): Promise<UserWithDepartments[]> {
    try {
      let profilesQuery = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (companyId) {
        profilesQuery = profilesQuery.eq("company_id", companyId);
      }

      if (opts?.excludeRoles && opts.excludeRoles.length > 0) {
        profilesQuery = profilesQuery.not("role", "in", `(${opts.excludeRoles.map((r) => `"${r}"`).join(",")})`);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;

      if (profilesError) throw profilesError;

      // USR-A (task #207 must-fix, 2026-05-24): scope the
      // user_departments fetch by the profile ids we just resolved.
      // Pre-fix this was a bare `.select("*")` with no filter, relying
      // entirely on RLS. If RLS ever loosens on user_departments
      // (a future tooling regression on a multi-tenant service-role
      // path) this leaks cross-tenant department assignments. The
      // `.in("user_id", ...)` adds belt-and-braces tenant scope.
      const profileIds = (profiles || []).map((p) => p.id);
      const { data: departments, error: deptError } = profileIds.length === 0
        ? { data: [], error: null as null | { message: string } }
        : await supabase
            .from("user_departments")
            .select("*")
            .in("user_id", profileIds);

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

      // USR-C (task #208, 2026-05-24): capture before-state for
      // the audit log. We need company_id + the existing
      // department list so the audit row can show the diff.
      const [{ data: beforeRow }, { data: beforeDepts }] = await Promise.all([
        supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
        supabase.from("user_departments").select("department, is_primary").eq("user_id", userId),
      ]);
      const beforeDeptList = ((beforeDepts || []) as Array<{ department: string; is_primary: boolean | null }>)
        .map((d) => ({ department: d.department, is_primary: !!d.is_primary }));

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
          .insert(newDepartmentsData as any);

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

      // USR-C: audit log write. Best-effort so a Sentry blip on the
      // audit insert doesn't roll back the actual department change.
      if (beforeRow?.company_id) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("user_access_audit").insert({
            company_id: beforeRow.company_id,
            target_user_id: userId,
            actor_user_id: assignedBy,
            action: "departments_changed",
            details: {
              before: { departments: beforeDeptList },
              after: { departments: departments.map((d) => ({ department: d.department, is_primary: d.is_primary })) },
            },
          });
        } catch (auditErr) {
          console.warn("[user_access_audit] departments_changed write failed:", auditErr);
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
   *
   * USR-C (task #208, 2026-05-24): now takes `actorUserId` so we
   * can write the audit row alongside the profiles update.
   */
  async updateUserStatus(userId: string, isActive: boolean, actorUserId?: string): Promise<void> {
    try {
      // Verify user exists first
      const exists = await this.userExists(userId);
      if (!exists) {
        throw new Error(`User with ID ${userId} does not exist`);
      }

      // Pull the company_id + before-state so the audit row is
      // complete. If the lookup fails we still update; audit is
      // best-effort to avoid blocking the operator on a Sentry blip.
      const { data: priorRow } = await supabase
        .from("profiles")
        .select("company_id, is_active")
        .eq("id", userId)
        .maybeSingle();

      const { error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (error) throw error;

      // Audit log write. Skipped on no priorRow (can't determine
      // company_id) or matching state (no-op update).
      if (priorRow?.company_id && priorRow.is_active !== isActive) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("user_access_audit").insert({
            company_id: priorRow.company_id,
            target_user_id: userId,
            actor_user_id: actorUserId || null,
            action: "status_changed",
            details: {
              before: { is_active: priorRow.is_active },
              after: { is_active: isActive },
            },
          });
        } catch (auditErr) {
          console.warn("[user_access_audit] status_changed write failed:", auditErr);
        }
      }
    } catch (error) {
      console.error("Error updating user status:", error);
      throw error;
    }
  },

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string, companyId?: string): Promise<UserWithDepartments[]> {
    try {
      let profilesQuery = supabase
        .from("profiles")
        .select("*")
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .order("created_at", { ascending: false });

      if (companyId) {
        profilesQuery = profilesQuery.eq("company_id", companyId);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;

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
   * Get department / role statistics for a company.
   * Counts profiles by their role + active_role, mapping legacy aliases
   * (kitchen_staff -> kitchen, shopping_staff -> shopping, etc).
   */
  async getDepartmentStats(companyId?: string, opts?: { excludeRoles?: string[] }) {
    try {
      let query = supabase.from("profiles").select("role, active_role, is_active");
      if (companyId) query = query.eq("company_id", companyId);
      if (opts?.excludeRoles && opts.excludeRoles.length > 0) {
        query = query.not("role", "in", `(${opts.excludeRoles.map((r) => `"${r}"`).join(",")})`);
      }
      const { data: profiles, error } = await query;
      if (error) throw error;

      const stats: Partial<Record<string, number>> = {};
      const normalise = (r: string) => {
        if (r === "kitchen_manager") return "kitchen";
        if (r === "kitchen_staff") return "kitchen";
        if (r === "shopping_staff") return "shopping";
        if (r === "cleaning_manager") return "cleaning";
        if (r === "cleaning_staff") return "cleaning";
        return r;
      };

      profiles?.forEach((p: any) => {
        const role = normalise(p.active_role || p.role || "");
        if (!role) return;
        stats[role] = (stats[role] || 0) + 1;
      });

      return stats as Partial<Record<UserRole, number>>;
    } catch (error) {
      console.error("Error fetching department stats:", error);
      throw error;
    }
  },

  /**
   * Create a new user (staff or driver) for a company
   */
  async createUser(payload: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    role: UserRole;
    company_id: string;
    vehicle_details?: string;
    drive_time_to_kitchen_minutes?: number;
  }): Promise<any> {
    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      return data;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  },
};
