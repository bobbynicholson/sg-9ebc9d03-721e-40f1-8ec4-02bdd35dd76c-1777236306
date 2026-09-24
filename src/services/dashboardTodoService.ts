import { supabase } from "@/integrations/supabase/client";

export interface DashboardTodoCompletion {
  task_id: string;
  completed: boolean;
}

export const dashboardTodoService = {
  async getForCompany(companyId: string): Promise<DashboardTodoCompletion[]> {
    const { data, error } = await (supabase as any)
      .from("dashboard_setup_tasks")
      .select("task_id, completed")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []) as DashboardTodoCompletion[];
  },

  async setCompleted(companyId: string, taskId: string, completed: boolean): Promise<void> {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError || new Error("Your session has expired. Please sign in again.");

    const { error } = await (supabase as any)
      .from("dashboard_setup_tasks")
      .upsert(
        {
          company_id: companyId,
          task_id: taskId,
          completed,
          completed_by: authData.user.id,
          completed_at: completed ? new Date().toISOString() : null,
        },
        { onConflict: "company_id,task_id" },
      );
    if (error) throw error;
  },
};
